#!/usr/bin/env node
/**
 * Copia os contratos de evento para `dist/`.
 *
 * Terceiro irmão de `copiar_migrations.js` e `copiar_conference_brain.js`, e o
 * que fechou o defeito mais caro dos três (PB19-D3b).
 *
 * `src/platform/contracts/event-schema.ts` lê `docs/contracts/eventos.schema.json`
 * em RUNTIME, e `bin/critical.ts` alcança esse módulo pela rota de ingestão.
 * A imagem oficial (`deploy/Dockerfile.platform`) copia para `/app` apenas
 * `dist/`, `node_modules/` e `package.json` — `docs/` **não entra**. Medido: o
 * crítico subia, `/ready` respondia 200, e **todo** lote de GPS voltava 503 sem
 * uma linha de log.
 *
 * O destino é `dist/docs/contracts/` de propósito, e não `dist/contracts/`:
 * assim o caminho relativo ao módulo é IDÊNTICO nos dois mundos —
 *
 *   src/platform/contracts/      + ../../../docs/contracts/  → repositório
 *   dist/src/platform/contracts/ + ../../../docs/contracts/  → imagem
 *
 * Uma expressão só, sem ramo por ambiente. Ramo por ambiente é como um dos
 * lados deixa de ser exercitado e apodrece.
 *
 * Leva SÓ `docs/contracts/*.json`. `docs/` inteiro na imagem seria carregar
 * documentação para dentro do artefato de produção para resolver um problema
 * de asset — e esconderia, no volume, quais arquivos são realmente exigidos em
 * runtime.
 *
 * Falha alto com zero arquivo: copiar nada em silêncio é o defeito que este
 * script existe para impedir.
 */

const { readdirSync, mkdirSync, copyFileSync, existsSync, readFileSync } = require("node:fs");
const { join, relative } = require("node:path");

const raiz = join(__dirname, "..");
const origem = join(raiz, "docs", "contracts");
const destino = join(raiz, "dist", "docs", "contracts");

if (!existsSync(origem)) {
  console.error(`copiar_contratos: origem inexistente: ${origem}`);
  process.exit(1);
}

mkdirSync(destino, { recursive: true });

const arquivos = readdirSync(origem).filter((f) => f.endsWith(".json"));
if (arquivos.length === 0) {
  console.error("copiar_contratos: nenhum contrato encontrado — build interrompido");
  process.exit(1);
}

for (const f of arquivos) {
  const de = join(origem, f);
  // Contrato ilegível na ORIGEM não pode virar contrato ilegível na imagem:
  // o build é o último lugar onde isso ainda é barato de descobrir.
  try {
    JSON.parse(readFileSync(de, "utf8"));
  } catch (e) {
    console.error(`copiar_contratos: ${f} não é JSON válido — build interrompido (${String(e)})`);
    process.exit(1);
  }
  copyFileSync(de, join(destino, f));
}

console.log(`copiar_contratos: ${arquivos.length} contrato(s) para ${relative(raiz, destino)}/`);
