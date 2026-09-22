/**
 * PB19 — a composição oficial não pode dizer "estou pronta" mentindo.
 *
 * Esta suíte defende UMA propriedade, em várias formas: **capacidade
 * operacional estruturalmente incapaz de funcionar não pode conviver com
 * prontidão declarada.**
 *
 * Os três defeitos que a motivaram foram medidos, não supostos:
 *
 *  - **D3b** — `contracts/event-schema.ts` lia `docs/contracts/eventos.schema.json`
 *    a partir de `process.cwd()`. A imagem oficial leva `/app` com `dist/`,
 *    `node_modules/` e `package.json`; `docs/` não entra. Resultado medido:
 *    `/ready` 200, **todo** lote de GPS 503, log com duas linhas e nenhuma
 *    sobre o 503;
 *  - **D2** — o compose não passava `DELIVERYOS_DEVICE_TOKEN_SECRET`, e o
 *    crítico sai 78 sem ele;
 *  - **D1** — o compose aponta o banco por `deliveryos-postgres` com
 *    `DELIVERYOS_DATABASE_SSL=false`, e a política recusava qualquer host não
 *    `localhost` sem TLS.
 *
 * O método é o mesmo do `run-spine-process-tests`: **não importar nada do
 * runtime**. A suíte monta uma raiz FIEL À IMAGEM — só `dist/`,
 * `node_modules/` e `package.json` — e sobe `node dist/…` ali dentro. Nada é
 * escondido ou movido dentro do repositório: o incidente do C3, em que um
 * `mv` não voltou porque o shell morreu antes, não pode se repetir se o
 * repositório nunca é tocado.
 *
 * Exige `DELIVERYOS_PG_URL`. Sem banco, PULA EM VOZ ALTA (CLAUDE.md §10).
 */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const raiz = process.cwd();
const URL_PG = (process.env.DELIVERYOS_PG_URL ?? "").trim();

console.log("=== PB19 — prontidão honesta na composição oficial ===\n");

if (!URL_PG) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — nenhum processo real foi exercitado.");
  console.log("Para rodar:  DELIVERYOS_PG_URL=postgres://user@host:porta/base");
  process.exit(0);
}

let passaram = 0;
const falhas: string[] = [];
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

const SEGREDO_FIXTURE = "s".repeat(48);

/**
 * Raiz que imita a imagem: exatamente o que `Dockerfile.platform` copia para
 * `/app`. `node_modules` entra como symlink — ele não muda o que o teste mede
 * e copiar centenas de megabytes por caso tornaria a suíte inutilizável.
 */
function raizDaImagem(): string {
  const dir = mkdtempSync(join(tmpdir(), "pb19-"));
  cpSync(join(raiz, "dist"), join(dir, "dist"), { recursive: true });
  cpSync(join(raiz, "package.json"), join(dir, "package.json"));
  symlinkSync(join(raiz, "node_modules"), join(dir, "node_modules"));
  return dir;
}

const CONTRATO_NA_IMAGEM = join("dist", "docs", "contracts", "eventos.schema.json");

interface Resultado {
  code: number | null;
  saida: string;
}

/** Sobe o crítico e ESPERA que ele termine. Para os casos de falha fechada. */
function bootQueDeveMorrer(dir: string, env: Record<string, string> = {}): Resultado {
  const r = spawnSync(process.execPath, ["dist/src/platform/bin/critical.js"], {
    cwd: dir,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      ...process.env,
      DELIVERYOS_ENV: "local",
      DELIVERYOS_DATABASE_URL: URL_PG,
      DELIVERYOS_MIGRATE_ON_BOOT: "false",
      DELIVERYOS_DEVICE_TOKEN_SECRET: SEGREDO_FIXTURE,
      // Porta VÁLIDA de propósito: `0` é recusado pela configuração, e o
      // processo sairia 78 pelo motivo errado. Um teste que aceita o código
      // de saída sem conferir o motivo já teria passado ali — foi o que
      // aconteceu na primeira versão desta suíte.
      DELIVERYOS_PORT: String(8700 + Math.floor(Math.random() * 200)),
      ...env,
    },
  });
  return { code: r.status, saida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/* ================================================================== *
 * D3b — asset obrigatório de runtime
 * ================================================================== */
console.log("D3b — CONTRATO DE EVENTOS");

teste("D3b-1 o contrato está no artefato de build, deterministicamente", () => {
  assert.ok(
    existsSync(join(raiz, CONTRATO_NA_IMAGEM)),
    `${CONTRATO_NA_IMAGEM} ausente — rode npm run build:platform; sem ele a imagem recusa todo GPS`,
  );
});

teste("D3b-2 a raiz fiel à imagem NÃO tem docs/ nem src/ — e ainda assim resolve o contrato", () => {
  const dir = raizDaImagem();
  try {
    assert.ok(!existsSync(join(dir, "docs")), "a raiz de teste não está fiel: docs/ presente");
    assert.ok(!existsSync(join(dir, "src")), "a raiz de teste não está fiel: src/ presente");
    // A resolução acontece DENTRO do processo filho, a partir do módulo.
    const r = spawnSync(
      process.execPath,
      ["-e", "const s=require('./dist/src/platform/contracts/event-schema.js');const c=s.carregarCatalogo();console.log('OK',c.version)"],
      { cwd: dir, encoding: "utf8", timeout: 30_000 },
    );
    assert.match(
      `${r.stdout ?? ""}${r.stderr ?? ""}`,
      /OK event-catalog@/,
      `o contrato não resolveu a partir do módulo:\n${r.stdout}${r.stderr}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

teste("D3b-3 CONTROLE POSITIVO: imagem íntegra sobe e ACEITA lote de GPS", () => {
  const dir = raizDaImagem();
  try {
    const r = spawnSync(process.execPath, [join(raiz, "tools", "pb19_ingestao_real.js")], {
      cwd: dir,
      encoding: "utf8",
      timeout: 90_000,
      env: { ...process.env, DELIVERYOS_PG_URL: URL_PG, PB19_SEGREDO: SEGREDO_FIXTURE },
    });
    const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    assert.match(saida, /READY=200/, `/ready não respondeu 200:\n${saida}`);
    assert.match(saida, /GPS=200/, `o lote de GPS não foi aceito:\n${saida}`);
    assert.match(saida, /ACEITOS=1/, `o lote não foi persistido:\n${saida}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const [nome, quebrar, motivo] of [
  ["ausente", (c: string) => rmSync(c), /contrato de eventos ausente/],
  ["corrompido", (c: string) => writeFileSync(c, '{"version":"event-catalog@1.0.0","propert'), /ileg[íi]vel/],
  [
    "incompatível",
    (c: string) => {
      const d = JSON.parse(readFileSync(c, "utf8")) as Record<string, unknown>;
      d.version = "event-catalog@2.0.0";
      writeFileSync(c, JSON.stringify(d));
    },
    /incompat/,
  ],
] as [string, (c: string) => void, RegExp][]) {
  teste(`D3b-4 contrato ${nome}: o crítico FALHA FECHADO no boot, não fica pronto`, () => {
    const dir = raizDaImagem();
    try {
      quebrar(join(dir, CONTRATO_NA_IMAGEM));
      const r = bootQueDeveMorrer(dir);
      assert.equal(r.code, 78, `o crítico subiu com contrato ${nome} (exit ${String(r.code)})`);
      assert.match(r.saida, motivo, `o motivo não ficou no log:\n${r.saida}`);
      assert.doesNotMatch(r.saida, /ouvindo em/, "o crítico chegou a escutar — /ready poderia responder 200");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

teste("D3b-5 a imagem NÃO carrega docs/ inteiro — só os contratos", () => {
  // Resolver o asset levando documentação inteira para produção esconderia,
  // no volume, quais arquivos são realmente exigidos em runtime.
  const dockerfile = readFileSync(join(raiz, "deploy/Dockerfile.platform"), "utf8")
    .replace(/#[^\n]*/g, "");
  assert.doesNotMatch(dockerfile, /COPY\s+docs\s/, "o Dockerfile passou a copiar docs/ inteiro");
  assert.match(dockerfile, /COPY\s+docs\/contracts/, "o Dockerfile não copia docs/contracts");
});

console.log(`\n${passaram}/${passaram + falhas.length} de PB19`);
for (const f of falhas) console.log(`  XX ${f}`);
if (falhas.length) {
  console.error("\nPB19_RED");
  process.exit(1);
}
console.log("\nPB19_GREEN");

void execFileSync;
