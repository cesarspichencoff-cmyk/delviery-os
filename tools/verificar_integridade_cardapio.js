/* ============================================================================
 * TRAVA PERMANENTE DE INTEGRIDADE — data/cardapio_knowledge_seed.json
 * ----------------------------------------------------------------------------
 * Garante que tools/build_cardapio_knowledge.js consegue regenerar o seed
 * commitado SEM DRIFT SILENCIOSO. Nasce do bug corrigido em jul/2026 (ver
 * docs/Auditoria_Builder_Cardapio_PreCorrecao.md e docs/Correcao_Builder_Cardapio.md):
 * 36% do cardápio perdia afiliação de praça sem nenhum erro, sem nenhum log.
 *
 * O que este script faz (nada mais):
 *   1. roda o builder num diretório temporário isolado (nunca escreve no repo);
 *   2. compara byte a byte com o seed commitado (ignorando só _meta.gerado_em,
 *      timestamp de execução, não dado de cardápio);
 *   3. valida que toda praça gerada está no vocabulário oficial de motor.js;
 *   4. valida que nenhum item que tinha praça no seed commitado ficou sem praça;
 *   5. valida que as 3 exceções históricas de revisão manual continuam exatas.
 *
 * Não altera seed, motor, baseline, camada de decisão ou classificação de item.
 * Saída: "OK: seed reproduzível sem drift" (exit 0) ou lista objetiva de
 * problemas (exit 1) — nunca "quase certo".
 * ==========================================================================*/
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.join(__dirname, "..");
const SEED_COMMITADO = path.join(REPO, "data", "cardapio_knowledge_seed.json");
const BUILDER = path.join(REPO, "tools", "build_cardapio_knowledge.js");

const PRACAS_OFICIAIS = ["combinados", "duplas", "enrolados", "enrolados_quentes", "cozinha_quentes", "sobremesa", "bar_bebidas", "montagem_outros"];
const EXCECOES_REVISAO_MANUAL = {
  "Ceviche": { confianca: "media", revisao: true },
  "Tartar de Salmão": { confianca: "media", revisao: true },
  "Tuna Shisô Tartar": { confianca: "media", revisao: true },
};

const problemas = [];
const p = (s) => console.log(s);

// ---------- 1) rodar o builder num diretório temporário (nunca no repo) ----------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deliveryos_cardapio_check_"));
fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });

let builderSrc = fs.readFileSync(BUILDER, "utf8");
const marcaRepo = 'const REPO = path.join(__dirname, "..");';
const marcaSrc = 'const SRC  = REPO + "/data/cardapio_fonte.txt";';
if (!builderSrc.includes(marcaRepo) || !builderSrc.includes(marcaSrc)) {
  p("ERRO: build_cardapio_knowledge.js mudou de forma que este verificador não reconhece mais (âncoras de REPO/SRC ausentes). Atualize este script junto.");
  process.exit(1);
}
builderSrc = builderSrc
  .replace(marcaRepo, `const REPO = ${JSON.stringify(tmpDir)}; const SRC_REAL = ${JSON.stringify(path.join(REPO, "data", "cardapio_fonte.txt"))};`)
  .replace(marcaSrc, "const SRC  = SRC_REAL;");
const builderIsolado = path.join(tmpDir, "build_teste.js");
fs.writeFileSync(builderIsolado, builderSrc, "utf8");

let gerado = null;
try {
  execFileSync(process.execPath, [builderIsolado], { stdio: "pipe" });
  gerado = JSON.parse(fs.readFileSync(path.join(tmpDir, "data", "cardapio_knowledge_seed.json"), "utf8"));
} catch (e) {
  problemas.push("O builder falhou ao rodar em ambiente isolado: " + (e.stderr ? e.stderr.toString() : e.message));
}
fs.rmSync(tmpDir, { recursive: true, force: true });

const commitado = JSON.parse(fs.readFileSync(SEED_COMMITADO, "utf8"));

if (gerado) {
  // ---------- 2) diff byte a byte, ignorando só _meta.gerado_em ----------
  const semTimestamp = (obj) => { const c = JSON.parse(JSON.stringify(obj)); delete c._meta.gerado_em; return c; };
  const jGerado = JSON.stringify(semTimestamp(gerado), null, 2);
  const jCommitado = JSON.stringify(semTimestamp(commitado), null, 2);
  if (jGerado !== jCommitado) {
    problemas.push("O seed regenerado DIVERGE do commitado (drift real, não é só timestamp). Rode o builder manualmente e compare com `git diff` para ver exatamente o que mudou — não prossiga sem entender a causa.");
  }

  // ---------- 3) toda praça gerada está no vocabulário oficial? ----------
  for (const it of gerado.itens) {
    if (it.praca_principal != null && !PRACAS_OFICIAIS.includes(it.praca_principal)) {
      problemas.push(`Item "${it.nome}" gerado com praça fora do vocabulário oficial: "${it.praca_principal}".`);
    }
  }

  // ---------- 4) nenhum item que tinha praça no seed commitado ficou sem praça ----------
  const gerpor_id = new Map(gerado.itens.map(i => [i.id, i]));
  for (const itCommitado of commitado.itens) {
    if (itCommitado.praca_principal == null) continue; // itens sem praça no commitado são legítimos (não-produção)
    const itGerado = gerpor_id.get(itCommitado.id);
    if (!itGerado) { problemas.push(`Item "${itCommitado.nome}" (id ${itCommitado.id}) do seed commitado não apareceu na regeneração.`); continue; }
    if (itGerado.praca_principal !== itCommitado.praca_principal) {
      problemas.push(`Item "${itCommitado.nome}" perdeu a praça: era "${itCommitado.praca_principal}", regenerou como "${itGerado.praca_principal}".`);
    }
  }
  if (commitado.itens.length !== gerado.itens.length) {
    problemas.push(`Total de itens divergiu: commitado ${commitado.itens.length}, regenerado ${gerado.itens.length}.`);
  }

  // ---------- 5) exceções históricas de revisão manual continuam exatas ----------
  for (const [nome, esperado] of Object.entries(EXCECOES_REVISAO_MANUAL)) {
    const it = gerado.itens.find(i => i.nome === nome);
    if (!it) { problemas.push(`Item de exceção histórica "${nome}" não encontrado na regeneração.`); continue; }
    if (it.confianca_classificacao !== esperado.confianca) problemas.push(`"${nome}" deveria regenerar com confianca_classificacao="${esperado.confianca}", veio "${it.confianca_classificacao}".`);
    if (it.revisao_manual !== esperado.revisao) problemas.push(`"${nome}" deveria regenerar com revisao_manual=${esperado.revisao}, veio ${it.revisao_manual}.`);
  }
}

// ---------- resultado ----------
if (problemas.length === 0) {
  p("OK: seed reproduzível sem drift");
  p(`  vocabulário oficial respeitado (${PRACAS_OFICIAIS.length} praças) · ${commitado.itens.length} itens conferidos · 3 exceções históricas de revisão manual intactas.`);
  process.exit(0);
} else {
  p(`FALHOU: ${problemas.length} problema(s) encontrado(s)`);
  problemas.forEach((m, i) => p(`  ${i + 1}. ${m}`));
  process.exit(1);
}
