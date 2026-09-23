/**
 * APPEND-ONLY — SUÍTE ADVERSARIAL.
 * ============================================================================
 * Cada mutação devolve ao código um jeito de o event log perder fato — pela
 * migration, pela função da trava, pelo gate de backup ou pelo banco isolado
 * — e exige que um gate acuse, pela ASSINATURA do teste que defende aquela
 * propriedade. Zero mutações cegas.
 *
 * Os cuidados de sempre (PB19, Q-016, Q-017): âncora com ocorrência ÚNICA,
 * disco relido, gate que PULA não conta como verde, reprovar por outro motivo
 * não conta, restauração byte a byte por SHA-256.
 *
 * Nenhum detector procura palavra. Todos executam: SQL contra PostgreSQL
 * real (`append-only`), dump e restore reais (`backup`), e o gate de backup
 * rodado como processo contra um banco de referência trancado e aberto
 * (`patrimonio`). Os três rodam do código-fonte — nada aqui depende de
 * `dist/`.
 *
 * Exige `DELIVERYOS_PG_URL`.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const falhas: string[] = [];
let passaram = 0;
let cegas = 0;

console.log("\n=== APPEND-ONLY — SUITE ADVERSARIAL ===\n");

if (!(process.env.DELIVERYOS_PG_URL ?? "").trim()) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — os gates atacados precisam de PostgreSQL real.");
  process.exit(0);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function teste(nome: string, fn: () => void): void {
  try {
    fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

type Gate = "append-only" | "backup" | "patrimonio";
const SCRIPT: Record<Gate, string> = {
  "append-only": "src/platform/run-append-only-tests.ts",
  backup: "src/platform/run-backup-restore-tests.ts",
  patrimonio: "src/platform/run-backup-patrimonio-tests.ts",
};

function rodar(gate: Gate): { ok: boolean; saida: string } {
  try {
    const saida = execFileSync("npx", ["tsx", SCRIPT[gate]], {
      cwd: raiz,
      encoding: "utf8",
      timeout: 900_000,
      env: { ...process.env },
    });
    if (/PULADO/.test(saida)) return { ok: false, saida: `__PULADO__${saida}` };
    return { ok: true, saida };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: string };
    const saida = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    if (saida.trim() === "") return { ok: false, saida: `__SPAWN_FALHOU__ ${err.code ?? "?"}` };
    return { ok: false, saida };
  }
}

interface Edicao {
  arquivo: string;
  de: string;
  para: string;
}

interface Aplicada {
  arquivo: string;
  original: string;
  hash: string;
}

function aplicar(edicoes: readonly Edicao[]): Aplicada[] {
  const feitas: Aplicada[] = [];
  const porArquivo = new Map<string, string>();
  try {
    for (const e of edicoes) {
      const caminho = join(raiz, e.arquivo);
      if (!porArquivo.has(e.arquivo)) {
        const original = readFileSync(caminho, "utf8");
        porArquivo.set(e.arquivo, original);
        feitas.push({ arquivo: e.arquivo, original, hash: sha(original) });
      }
      const atual = readFileSync(caminho, "utf8");
      const ocorrencias = atual.split(e.de).length - 1;
      assert.equal(ocorrencias, 1, `MUTACAO NAO APLICADA: âncora com ${ocorrencias} ocorrência(s) em ${e.arquivo}: ${e.de.slice(0, 70)}`);
      const novo = atual.replace(e.de, () => e.para);
      assert.notEqual(novo, atual, `MUTACAO NAO APLICADA: a troca não mudou ${e.arquivo}`);
      writeFileSync(caminho, novo);
      assert.equal(readFileSync(caminho, "utf8"), novo, `MUTACAO NAO APLICADA: o disco não confirmou ${e.arquivo}`);
    }
  } catch (err) {
    restaurar(feitas);
    throw err;
  }
  return feitas;
}

function restaurar(feitas: readonly Aplicada[]): void {
  for (const f of feitas) {
    writeFileSync(join(raiz, f.arquivo), f.original);
    assert.equal(sha(readFileSync(join(raiz, f.arquivo), "utf8")), f.hash, `RESTAURACAO FALHOU em ${f.arquivo}`);
  }
}

function mutacao(o: { id: string; propriedade: string; gate: Gate; edicoes: Edicao[]; assinatura: RegExp }): void {
  teste(`${o.id} — ${o.propriedade}`, () => {
    const feitas = aplicar(o.edicoes);
    console.log(`        aplicada · ${feitas.map((f) => `${f.arquivo.split("/").pop()} ${f.hash.slice(0, 8)}`).join(" · ")}`);
    try {
      const r = rodar(o.gate);
      assert.doesNotMatch(r.saida, /__SPAWN_FALHOU__|__PULADO__/, `o gate não mediu:\n${r.saida.slice(0, 600)}`);
      if (r.ok) {
        cegas += 1;
        assert.fail(`o gate ${o.gate} ficou VERDE com o defeito restaurado — MUTACAO CEGA`);
      }
      assert.match(r.saida, o.assinatura, `reprovou, mas NÃO pela assinatura esperada:\n${r.saida.slice(-900)}`);
      const perdas = r.saida
        .split("\n")
        .filter((l) => /^ {2}XX {2}\S/.test(l))
        .map((l) => l.trim().slice(4).split(" ")[0]);
      console.log(`        acusaram · ${perdas.join(" ")}`);
    } finally {
      restaurar(feitas);
      console.log(`        restaurado · ${feitas.length} arquivo(s) == origem`);
    }
  });
}

/* ---- controle positivo: os três gates verdes ANTES de mutar ---- */
console.log("0. CONTROLE POSITIVO");
for (const g of ["append-only", "backup", "patrimonio"] as const) {
  teste(`o gate ${g} está verde ANTES de qualquer mutação`, () => {
    const r = rodar(g);
    assert.ok(r.ok, `gate ${g} já vermelho antes de mutar:\n${r.saida.slice(-900)}`);
  });
}
if (falhas.length) {
  console.error("\nOs gates precisam estar verdes ANTES das mutacoes. Abortado.");
  for (const f of falhas) console.error(`  ${f}`);
  process.exit(1);
}

const M0001 = "src/platform/migrations/0001_platform_foundation.sql";
const M0004 = "src/platform/migrations/0004_event_log_sem_truncate.sql";
const GATE = "src/platform/run-backup-restore-tests.ts";
const ISOLADO = "src/platform/banco-isolado.ts";

const TRAVA = `CREATE TRIGGER event_log_sem_truncate
    BEFORE TRUNCATE ON platform.event_log
    FOR EACH STATEMENT EXECUTE FUNCTION platform.impedir_mutacao_event_log();
`;
const FONTE = `    const fonte = await bancoIsolado(URL_SERVIDOR, ANTES_DO_MODO, "bkpfonte");\n`;
const IMPORT_ISOLADO = `import { bancoIsolado, bancoVazio, type BancoIsolado } from "./banco-isolado";\n`;
const COM_CLIENTE = IMPORT_ISOLADO + `import { createPgClient } from "./persistence/sql-client";\n`;

/** O gate de backup mexendo no banco da URL antes de montar o próprio fixture. */
function noCompartilhado(...comandos: string[]): Edicao[] {
  return [
    { arquivo: GATE, de: IMPORT_ISOLADO, para: COM_CLIENTE },
    {
      arquivo: GATE,
      de: FONTE,
      para:
        "    {\n" +
        "      const compartilhado = await createPgClient({ url: URL_SERVIDOR, max: 1 });\n" +
        "      try {\n" +
        comandos.map((c) => `        await compartilhado.query(${JSON.stringify(c)});\n`).join("") +
        "      } finally {\n" +
        "        await compartilhado.close();\n" +
        "      }\n" +
        "    }\n" +
        FONTE,
    },
  ];
}

/* ================================================================== */
console.log("\n1. A TRAVA CONTRA TRUNCATE");

mutacao({
  id: "M1",
  propriedade: "a trava de TRUNCATE some da 0004",
  gate: "append-only",
  edicoes: [{ arquivo: M0004, de: TRAVA, para: "" }],
  assinatura: /XX {2}D4 /,
});

mutacao({
  id: "M2",
  propriedade: "a trava vira de COMANDO para DELETE — parece proteção, e TRUNCATE passa",
  gate: "append-only",
  edicoes: [{ arquivo: M0004, de: "    BEFORE TRUNCATE ON platform.event_log\n", para: "    BEFORE DELETE ON platform.event_log\n" }],
  assinatura: /XX {2}D4 /,
});

mutacao({
  id: "M3",
  propriedade: "a função da trava deixa TRUNCATE passar",
  gate: "append-only",
  edicoes: [
    {
      arquivo: M0001,
      de: "BEGIN\n    RAISE EXCEPTION 'event_log e append-only: % nao e permitido', TG_OP;\n",
      para: "BEGIN\n    IF TG_OP = 'TRUNCATE' THEN RETURN NULL; END IF;\n    RAISE EXCEPTION 'event_log e append-only: % nao e permitido', TG_OP;\n",
    },
  ],
  assinatura: /XX {2}D4 /,
});

mutacao({
  id: "M10",
  propriedade: "a trava de TRUNCATE bloqueia também INSERT, por engano",
  gate: "append-only",
  edicoes: [{ arquivo: M0004, de: "    BEFORE TRUNCATE ON platform.event_log\n", para: "    BEFORE INSERT OR TRUNCATE ON platform.event_log\n" }],
  assinatura: /XX {2}D1 /,
});

/* ================================================================== */
console.log("\n2. O GATE DE BACKUP NAO FABRICA FIXTURE COM O PATRIMONIO ALHEIO");

mutacao({
  id: "M4",
  propriedade: "o gate volta a fazer TRUNCATE no banco compartilhado",
  gate: "patrimonio",
  edicoes: noCompartilhado("TRUNCATE platform.event_log"),
  assinatura: /XX {2}P1 [\s\S]*XX {2}P2 /,
});

mutacao({
  id: "M5",
  propriedade: "o gate troca TRUNCATE por DELETE no banco compartilhado",
  gate: "patrimonio",
  edicoes: noCompartilhado("DELETE FROM platform.event_log"),
  assinatura: /XX {2}P1 [\s\S]*XX {2}P2 /,
});

mutacao({
  id: "M6",
  propriedade: "o gate desliga as travas antes de limpar o banco compartilhado",
  gate: "patrimonio",
  edicoes: noCompartilhado(
    "ALTER TABLE platform.event_log DISABLE TRIGGER ALL",
    "TRUNCATE platform.event_log",
    "ALTER TABLE platform.event_log ENABLE TRIGGER ALL",
  ),
  assinatura: /XX {2}P1 [\s\S]*XX {2}P2 /,
});

mutacao({
  id: "M7",
  propriedade: "o gate usa o banco compartilhado como FONTE e depende do estado anterior",
  gate: "patrimonio",
  edicoes: [
    { arquivo: GATE, de: IMPORT_ISOLADO, para: COM_CLIENTE },
    {
      arquivo: GATE,
      de: FONTE,
      para:
        "    const fonte: BancoIsolado = await (async () => {\n" +
        "      const cliente = await createPgClient({ url: URL_SERVIDOR, max: 4 });\n" +
        "      return { nome: \"compartilhado\", url: URL_SERVIDOR, cliente, migrarTudo: async () => [], descartar: async () => { await cliente.close(); } };\n" +
        "    })();\n",
    },
  ],
  assinatura: /XX {2}P1 [\s\S]*XX {2}P2 /,
});

mutacao({
  id: "M8",
  propriedade: "o banco isolado apaga um banco que já existia para 'criar' o seu",
  gate: "patrimonio",
  edicoes: [
    {
      arquivo: ISOLADO,
      de: "    await admin.query(`CREATE DATABASE ${nome}`);\n",
      para: "    await admin.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);\n    await admin.query(`CREATE DATABASE ${nome}`);\n",
    },
  ],
  assinatura: /XX {2}P7 /,
});

mutacao({
  id: "M8b",
  propriedade: "o gate volta a apagar o <banco>_restaurado de nome fixo, que não criou",
  gate: "patrimonio",
  edicoes: [
    { arquivo: GATE, de: IMPORT_ISOLADO, para: COM_CLIENTE + `import { urlCom } from "./banco-isolado";\n` },
    {
      arquivo: GATE,
      de: "    for (const b of [...criados].reverse()) await b.descartar().catch(() => undefined);\n",
      para:
        "    for (const b of [...criados].reverse()) await b.descartar().catch(() => undefined);\n" +
        "    const admin = await createPgClient({ url: urlCom(URL_SERVIDOR, \"postgres\"), max: 1 });\n" +
        "    await admin.query(`DROP DATABASE IF EXISTS ${new URL(URL_SERVIDOR).pathname.slice(1)}_restaurado WITH (FORCE)`);\n" +
        "    await admin.close();\n",
    },
  ],
  assinatura: /XX {2}P6 /,
});

/* ================================================================== */
console.log("\n3. A TRAVA SOBREVIVE AO RESTORE");

mutacao({
  id: "M9",
  propriedade: "a trava de TRUNCATE não volta no restore",
  gate: "backup",
  edicoes: [
    {
      arquivo: GATE,
      de: `      const r = await rodar("pg_restore", ["-d", destino.url, "--no-owner", "--no-privileges", "--exit-on-error", arquivoDump]);\n`,
      para:
        `      const toc = (await rodar("pg_restore", ["-l", arquivoDump])).stdout.split("\\n").filter((l) => !/TRIGGER .*event_log_sem_truncate/.test(l)).join("\\n");\n` +
        `      const lista = join(trabalho, "lista.toc");\n` +
        `      (await import("node:fs")).writeFileSync(lista, toc);\n` +
        `      const r = await rodar("pg_restore", ["-d", destino.url, "--no-owner", "--no-privileges", "--exit-on-error", "-L", lista, arquivoDump]);\n`,
    },
  ],
  assinatura: /XX {2}B11 [\s\S]*XX {2}B18 /,
});

const total = passaram + falhas.length;
console.log(`\n${passaram}/${total} · ${cegas} mutacao(oes) cega(s)`);
for (const f of falhas) console.log(`  XX ${f}`);
if (cegas > 0) {
  console.error("\nMUTACAO CEGA — o gate nao protege o que diz proteger.");
  process.exit(1);
}
if (falhas.length) {
  console.error("\nAPPEND_ONLY_MUTATIONS_RED");
  process.exit(1);
}
console.log("\nAPPEND_ONLY_MUTATIONS_GREEN");
