/**
 * A suíte de recriação de persistência NÃO depende da data civil.
 *
 * Ela venceu sozinha por volta de 2026-08-25: pontos com data fixa
 * (2026-07-26) ficaram mais velhos que a janela de 30 dias do validador. A
 * correção deriva todo carimbo de um "agora" lido uma vez; este gate prova
 * que isso fecha a CLASSE do defeito, não só a data.
 *
 * Como mede: roda a suíte COMPILADA com a data civil deslocada por
 * `tools/relogio_deslocado.cjs` (via NODE_OPTIONS). O teste e o servidor que
 * ele sobe herdam o mesmo deslocamento — vivem na mesma outra data.
 *
 * Controles, porque verde vazio não conta:
 *  - C0: o deslocamento chega a um processo filho (senão tudo rodaria "hoje");
 *  - M1: a suíte com o "agora" trocado de volta por data fixa (a de antes)
 *    REPROVA hoje, por `impossible_timestamp`, e PASSA em 2026-07-26 — o
 *    gate enxerga dependência de data civil quando ela existe.
 *
 * Exige `dist/` compilado (`npx tsc`). Termina com RELOGIO_CIVIL_GREEN ou
 * RELOGIO_CIVIL_RED e exit 1.
 */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RAIZ = process.cwd();
const SUITE = join(RAIZ, "dist", "src", "entregas", "pilot", "run-persistence-recreate-tests.js");
const PRELOAD = join(RAIZ, "tools", "relogio_deslocado.cjs");
const DIA = 86_400_000;

let passou = 0;
const falhas: string[] = [];
function teste(nome: string, corpo: () => void): void {
  try {
    corpo();
    passou += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

function ambiente(deslocamentoMs: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_OPTIONS: `--require ${PRELOAD}`,
    RELOGIO_DESLOCAMENTO_MS: String(deslocamentoMs),
  };
}

function rodarSuite(arquivo: string, deslocamentoMs: number): { ok: boolean; saida: string } {
  const r = spawnSync(process.execPath, [arquivo], {
    cwd: RAIZ,
    env: ambiente(deslocamentoMs),
    encoding: "utf8",
    timeout: 180_000,
  });
  return { ok: r.status === 0, saida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const dataCivil = (deslocamentoMs: number) => new Date(Date.now() + deslocamentoMs).toISOString().slice(0, 10);
const resumo = (saida: string) =>
  (saida.match(/=== \d+ persistence-recreate tests OK ===|=== \d+ FALHA\(S\) ===/) ?? ["(sem resumo)"])[0];

console.log("\n=== A suíte de persistência não depende da data civil ===\n");
assert.ok(existsSync(SUITE), `suíte compilada ausente: ${SUITE} — rode npx tsc`);

/**
 * O "agora" que a data fixa de antes representa: 10:10Z, dez minutos depois do
 * AT1 antigo (10:00:00Z). O M1 roda o mutante exatamente nessa data civil — em
 * qualquer outra hora do mesmo dia os controles de janela dele já não batem
 * com o relógio do validador (medido: às 12:00Z o ponto "+25 h" do mutante
 * cai a 23 h 10 min do agora e entra).
 */
const DATA_FIXA_ANTIGA = Date.parse("2026-07-26T10:10:00.000Z");
/** Datas civis de prova: bem antes, a data antiga, hoje, depois, dez anos depois. */
const EM_2026_07_26 = DATA_FIXA_ANTIGA - Date.now();
const DESLOCAMENTOS = [-400 * DIA, EM_2026_07_26, 0, 45 * DIA, 3650 * DIA];

console.log("C0. o deslocamento chega ao processo filho");
for (const d of DESLOCAMENTOS) {
  teste(`C0 ${dataCivil(d)}: o filho vive nessa data`, () => {
    const visto = Number(
      execFileSync(process.execPath, ["-e", "process.stdout.write(String(Date.now()))"], {
        env: ambiente(d),
        encoding: "utf8",
      }),
    );
    const erro = Math.abs(visto - (Date.now() + d));
    assert.ok(erro < 60_000, `o filho não viu o deslocamento: erro de ${erro} ms`);
  });
}

console.log("\nS. a suíte, em cada data civil");
for (const d of DESLOCAMENTOS) {
  teste(`S ${dataCivil(d)}: suíte verde`, () => {
    const r = rodarSuite(SUITE, d);
    assert.ok(r.ok, `reprovou em ${dataCivil(d)}: ${resumo(r.saida)}\n${r.saida.slice(-500)}`);
    console.log(`        ${resumo(r.saida)}`);
  });
}

console.log("\nM1. a data fixa de antes, devolvida — o gate precisa enxergar");
{
  const ANCORA = "const AGORA = Date.now();";
  const original = readFileSync(SUITE, "utf8");
  assert.equal(original.split(ANCORA).length - 1, 1, `MUTACAO NAO APLICADA: âncora ausente ou repetida em ${SUITE}`);
  // 10:10 menos 10 min = 10:00:00Z e 10:00:30Z: exatamente os carimbos antigos.
  const mutante = original.replace(ANCORA, `const AGORA = ${DATA_FIXA_ANTIGA};`);
  const dir = mkdtempSync(join(tmpdir(), "relogio-civil-"));
  const arquivo = join(dir, "persistencia-com-data-fixa.js");
  writeFileSync(arquivo, mutante);
  try {
    teste("M1 hoje: a data fixa REPROVA, por impossible_timestamp", () => {
      const r = rodarSuite(arquivo, 0);
      assert.equal(r.ok, false, "a data fixa passou hoje — o gate não enxerga dependência de data civil");
      assert.match(r.saida, /impossible_timestamp/, `reprovou por outro motivo:\n${r.saida.slice(-500)}`);
      console.log(`        ${resumo(r.saida)}`);
    });
    teste("M1 em 2026-07-26: a mesma data fixa PASSA — a dependência é da data civil", () => {
      const r = rodarSuite(arquivo, EM_2026_07_26);
      assert.ok(r.ok, `nem na data dela a suíte passou: ${resumo(r.saida)}`);
      console.log(`        ${resumo(r.saida)}`);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const total = passou + falhas.length;
console.log(`\n${passou}/${total}`);
if (falhas.length) {
  for (const f of falhas) console.log(`  FALHA ${f}`);
  console.log("\nRELOGIO_CIVIL_RED");
  process.exit(1);
}
console.log("\nRELOGIO_CIVIL_GREEN");
