/**
 * Guardas de GOVERNANCA desta branch, classificadas sem pintar verde.
 *
 * `test:platform:m1-bridge` esta vermelho desde 2026-09-30 por uma divida que
 * NAO e desta missao: os doze caminhos da `Q-019`, registrados por medicao no
 * handback de 2026-10-07. Rodar a guarda e aceitar "vermelho" esconderia uma
 * falha nova atras da velha; ignorar a guarda esconderia tudo.
 *
 * Este runner exige IGUALDADE: a unica falha aceita e o C6 com exatamente os
 * doze caminhos da Q-019. Qualquer outra falha, um caminho a mais OU a menos,
 * e FAIL_NOVO — se o Cesar responder a Q-019, esta lista tem de mudar junto,
 * de proposito. A governanca (VERTICE) tem de estar verde.
 *
 * Uso: npx tsx tests/product/run-sem-fail-novo.ts   (saida 0 so sem FAIL_NOVO)
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Medidos em `git log f87a36d..HEAD` nos caminhos do C6 — `PERGUNTAS.jsonl`, Q-019. */
const Q019_CAMINHOS = [
  "src/perfil-delivery/decisao.js",
  "src/platform/copiloto/attention-authority.ts",
  "src/platform/copiloto/causal-attention-orchestrator.ts",
  "src/platform/copiloto/causal-identity-bridge.ts",
  "src/platform/copiloto/conference-bridge.ts",
  "src/platform/copiloto/shadow.ts",
  "src/product/ui/surfaces/copiloto.js",
  "src/product/ui/surfaces/operacao-viva.js",
  "src/product/viewmodels/copiloto-vm.ts",
  "src/product/viewmodels/historico-vm.ts",
  "src/product/viewmodels/operacao-viva-vm.ts",
  "src/product/viewmodels/tata-comanda-vm.ts",
];

function rodar(arquivo: string): { status: number | null; saida: string } {
  const r = spawnSync("npx", ["tsx", arquivo], { encoding: "utf8", timeout: 300_000 });
  return { status: r.status, saida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const linhas: string[] = [];
let novos = 0;

// Q-019 foi respondida pelo Cesar em 13/10, para os 12 caminhos historicos
// identificados por classe+blob SHA, nao para mudancas futuras. Fail-closed.
function q019Autorizada(): boolean {
  try {
    const linhas = readFileSync("docs/execution/PERGUNTAS.jsonl", "utf8").split(/\r?\n/).filter(Boolean);
    const q = linhas.map((l) => JSON.parse(l)).find((item) => item.id === "Q-019");
    return q?.estado === "answered"
      && q?.autorizado_por === "cesar"
      && q?.respondida_em === "2026-10-13"
      && String(q?.autorizacao_ref ?? "").includes("fa88b0a923bd6e7414081cfa014d32a29596dfa9")
      && String(q?.resposta ?? "").includes("12 caminhos")
      && String(q?.resposta ?? "").includes("classe + Git blob SHA exatos")
      && String(q?.resposta ?? "").includes("C6/C6g/C6h")
      && String(q?.resposta ?? "").includes("40/40")
      && Q019_CAMINHOS.length === 12;
  } catch {
    return false;
  }
}

// 1. m1-bridge
{
  const r = rodar("src/platform/run-m1-bridge-tests.ts");
  const falharam = [...r.saida.matchAll(/^ {2}- (C\d+[a-z]?|[A-Z]+\d*[a-z]?) /gm)].map((m) => m[1]!);
  const bloco = /C6 a metade do FUTURO[\s\S]*?AUTORIZADO:\n([\s\S]*?)\n\+ actual/.exec(r.saida);
  const caminhos = bloco ? bloco[1]!.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("src/") || l.startsWith("docs/")) : [];
  const passaram = /(\d+) passaram/.exec(r.saida)?.[1] ?? "?";
  const igual = JSON.stringify(caminhos) === JSON.stringify(Q019_CAMINHOS);
  const autorizada = q019Autorizada();
  if (r.status === 0 && passaram === "40" && autorizada) {
    linhas.push("m1-bridge            PASS (40) — Q-019 historica autorizada, C6/C6g/C6h preservados");
  } else if (r.status === 0) {
    novos += 1;
    linhas.push(`m1-bridge            FAIL_NOVO — PASS (${passaram}) sem prova completa de 40 controles e autorizacao Q-019`);
  } else if (!autorizada && falharam.length === 1 && falharam[0] === "C6" && igual) {
    linhas.push(`m1-bridge            FAIL_PREEXISTENTE (${passaram} passaram) — so o C6, com os 12 caminhos da Q-019, identicos`);
  } else {
    novos += 1;
    linhas.push(`m1-bridge            FAIL_NOVO — falharam [${falharam.join(", ")}]`);
    const a_mais = caminhos.filter((c) => !Q019_CAMINHOS.includes(c));
    const a_menos = Q019_CAMINHOS.filter((c) => !caminhos.includes(c));
    if (a_mais.length) linhas.push(`  caminho NOVO fora do envelope: ${a_mais.join(", ")}`);
    if (a_menos.length) linhas.push(`  caminho da Q-019 que sumiu da lista: ${a_menos.join(", ")}`);
  }
}

// 2. governanca
{
  const r = rodar("src/platform/run-governance-tests.ts");
  if (r.status === 0) linhas.push("governanca           PASS");
  else {
    novos += 1;
    linhas.push(`governanca           FAIL_NOVO\n${r.saida.split("\n").filter((l) => /FALHOU|^\s+- /.test(l)).slice(0, 12).join("\n")}`);
  }
}

console.log("\nGUARDAS DE GOVERNANCA — classificacao\n");
for (const l of linhas) console.log(`  ${l}`);
if (novos > 0) {
  console.error(`\nSEM_FAIL_NOVO: REPROVADO (${novos})`);
  process.exit(1);
}
console.log("\nSEM_FAIL_NOVO: OK");
