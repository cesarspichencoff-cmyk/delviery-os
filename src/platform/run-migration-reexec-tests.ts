/**
 * Migrations reexecutáveis — e a troca de texto que isso exigiu, sem STOP falso.
 *
 * O DEFEITO (2026-10-06, B5): a 0009 fazia `ADD CONSTRAINT` sem guarda. A
 * primeira aplicação passa; a segunda falha com "constraint already exists".
 * Isso derrubou `test:platform:pg` ("reaplicar a migration não quebra —
 * redeploy é seguro") desde o commit 8fe27a0, e quebrava a regra que a 0003 já
 * seguia: aditiva e REEXECUTÁVEL.
 *
 * A CORREÇÃO muda o texto da 0009 — e o runner PARA quando o texto de uma
 * migration aplicada muda (checksum). Um banco que aplicou o texto de
 * 2026-10-06 tem exatamente o mesmo schema; parar a plataforma por isso seria
 * um STOP falso. A própria migration declara o checksum ANTERIOR equivalente
 * (padrão `validCheckSum` do Liquibase), e só ele; qualquer outro texto
 * registrado continua parando.
 *
 * M1 e M2 rodam sem banco. M3–M5 exigem DELIVERYOS_PG_URL e se declaram
 * PULADAS em voz alta sem ele.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bancoVazio } from "./banco-isolado";
import { checksumsEquivalentes, loadMigrations, runMigrations, sha256 } from "./migrations/runner";

const DIR = "src/platform/migrations";
const TEXTO_ANTIGO_0009 = "tests/migrations/0009_device_offline_queue_depth.texto-2026-10-06.sql";
const CHECKSUM_ANTIGO_0009 = "5b639bf835be0e16";
const PG_URL = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const PSQL = process.env.DELIVERYOS_PSQL || "psql";

let passou = 0;
let pulado = 0;
const falhas: string[] = [];
async function teste(nome: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passou += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  ${nome}\n      ${e instanceof Error ? e.message.split("\n").join("\n      ") : String(e)}`);
  }
}

function migrationsCom0009(texto: string): string {
  const d = mkdtempSync(join(tmpdir(), "migr-0009-"));
  for (const f of readdirSync(DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n))) {
    if (f.startsWith("0009_")) writeFileSync(join(d, f), texto);
    else copyFileSync(join(DIR, f), join(d, f));
  }
  return d;
}

async function main(): Promise<void> {
  console.log("\n=== MIGRATIONS REEXECUTAVEIS — sem STOP falso pela troca de texto ===\n");

  await teste("M1 toda ADD CONSTRAINT de toda migration e guardada por pg_constraint (reexecutavel por construcao)", () => {
    const sem: string[] = [];
    for (const f of readdirSync(DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort()) {
      const sql = readFileSync(join(DIR, f), "utf8").replace(/--[^\n]*/g, "");
      for (const m of sql.matchAll(/ADD\s+CONSTRAINT\s+(\w+)/gi)) {
        if (!new RegExp(`conname\\s*=\\s*'${m[1]}'`, "i").test(sql)) sem.push(`${f}: ${m[1]}`);
      }
    }
    assert.deepEqual(sem, [], `constraint sem guarda:\n${sem.join("\n")}`);
  });

  await teste("M2 a 0009 declara SO o checksum do texto de 2026-10-06 como equivalente; as demais nao declaram nada", () => {
    const antigo = readFileSync(TEXTO_ANTIGO_0009, "utf8").replace(/\r\n/g, "\n");
    assert.equal(sha256(antigo), CHECKSUM_ANTIGO_0009, "o fixture nao e o texto antigo");
    for (const m of loadMigrations(DIR)) {
      const eq = checksumsEquivalentes(m.sql);
      if (m.version === "0009_device_offline_queue_depth") {
        assert.deepEqual(eq, [CHECKSUM_ANTIGO_0009]);
        assert.notEqual(m.checksum, CHECKSUM_ANTIGO_0009, "o texto da 0009 nao mudou");
      } else {
        assert.deepEqual(eq, [], `${m.version} declara equivalencia`);
      }
    }
    // Declaracao malformada nao vale.
    assert.deepEqual(checksumsEquivalentes("-- checksum-anterior-equivalente: 123\n-- checksum-anterior-equivalente: zzzzzzzzzzzzzzzz\n"), []);
  });

  if (!PG_URL) {
    pulado += 3;
    console.log("  PULADO  M3-M5: DELIVERYOS_PG_URL nao definida — nenhum banco foi testado");
  } else {
    await teste("M3 banco que aplicou o texto ANTIGO da 0009 sobe com o texto novo: pulada como equivalente, sem STOP", async () => {
      const b = await bancoVazio(PG_URL, "migreq");
      const antigo = migrationsCom0009(readFileSync(TEXTO_ANTIGO_0009, "utf8"));
      try {
        const r1 = await runMigrations(b.cliente, antigo);
        assert.equal(r1.mismatch, undefined);
        const reg = await b.cliente.query<{ checksum: string }>(
          `SELECT checksum FROM platform.schema_migration WHERE version='0009_device_offline_queue_depth'`,
        );
        assert.equal(reg[0]?.checksum, CHECKSUM_ANTIGO_0009);
        const r2 = await runMigrations(b.cliente, DIR);
        assert.equal(r2.mismatch, undefined, `STOP falso: ${JSON.stringify(r2.mismatch)}`);
        assert.ok(r2.skipped.includes("0009_device_offline_queue_depth"));
        assert.deepEqual(r2.equivalentes, [{ version: "0009_device_offline_queue_depth", registrado: CHECKSUM_ANTIGO_0009 }]);
      } finally {
        rmSync(antigo, { recursive: true, force: true });
        await b.descartar();
      }
    });

    await teste("M4 texto registrado DESCONHECIDO continua parando (o controle de drift nao afrouxou)", async () => {
      const b = await bancoVazio(PG_URL, "migreq");
      try {
        await runMigrations(b.cliente, DIR);
        await b.cliente.query(`UPDATE platform.schema_migration SET checksum='0000000000000000' WHERE version='0009_device_offline_queue_depth'`);
        const r = await runMigrations(b.cliente, DIR);
        assert.equal(r.mismatch?.version, "0009_device_offline_queue_depth");
        assert.equal(r.mismatch?.esperado, "0000000000000000");
      } finally {
        await b.descartar();
      }
    });

    await teste("M5 aplicar TODAS as migrations duas vezes por psql (redeploy) nao quebra e o schema da 0009 e o mesmo", async () => {
      const b = await bancoVazio(PG_URL, "migreq");
      try {
        const aplicar = () => {
          for (const f of readdirSync(DIR).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort()) {
            execFileSync(PSQL, ["-X", "-q", "-d", b.url, "-v", "ON_ERROR_STOP=1", "-f", join(DIR, f)], { stdio: ["ignore", "pipe", "pipe"] });
          }
        };
        aplicar();
        aplicar();
        const c = await b.cliente.query<{ conname: string }>(
          `SELECT conname FROM pg_constraint WHERE conrelid='identity.device'::regclass AND conname LIKE 'device_queue_%' ORDER BY conname`,
        );
        assert.deepEqual(c.map((x) => x.conname), ["device_queue_pending_events_valido", "device_queue_pending_points_valido"]);
      } finally {
        await b.descartar();
      }
    });
  }

  console.log(`\nMIGRATION_REEXEC: ${passou}/${passou + falhas.length} PASS${pulado ? `, ${pulado} PULADO` : ""}`);
  if (falhas.length) {
    console.log("MIGRATION_REEXEC_RED");
    process.exit(1);
  }
  console.log(pulado ? "MIGRATION_REEXEC_SKIPPED_LOUDLY" : "MIGRATION_REEXEC_GREEN");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
