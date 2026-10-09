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

// 1. m1-bridge
{
  const r = rodar("src/platform/run-m1-bridge-tests.ts");
  const falharam = [...r.saida.matchAll(/^ {2}- (C\d+[a-z]?|[A-Z]+\d*[a-z]?) /gm)].map((m) => m[1]!);
  const bloco = /C6 a metade do FUTURO[\s\S]*?AUTORIZADO:\n([\s\S]*?)\n\+ actual/.exec(r.saida);
  const caminhos = bloco ? bloco[1]!.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("src/") || l.startsWith("docs/")) : [];
  const passaram = /(\d+) passaram/.exec(r.saida)?.[1] ?? "?";
  const igual = JSON.stringify(caminhos) === JSON.stringify(Q019_CAMINHOS);
  if (r.status === 0) {
    linhas.push(`m1-bridge            PASS (${passaram}) — a Q-019 deixou de reprovar: atualize Q019_CAMINHOS de proposito`);
    novos += 1;
  } else if (falharam.length === 1 && falharam[0] === "C6" && igual) {
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
