#!/usr/bin/env node
/**
 * Copia os assets não-TypeScript do Product System para dist/.
 *
 * O servidor compilado roda dentro da imagem oficial, onde o repositório fonte
 * não existe. Sem esta cópia o binário sobe, mas index.html/CSS/JS/tokens somem.
 */
const {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
} = require("node:fs");
const { dirname, join, relative } = require("node:path");

const raiz = join(__dirname, "..");
const itens = [
  {
    origem: join(raiz, "src", "product", "ui"),
    destino: join(raiz, "dist", "src", "product", "ui"),
    diretorio: true,
  },
  {
    origem: join(raiz, "src", "entregas", "ui", "shared"),
    destino: join(raiz, "dist", "src", "entregas", "ui", "shared"),
    diretorio: true,
  },
  {
    origem: join(raiz, "docs", "figma", "DESIGN_TOKENS.json"),
    destino: join(raiz, "dist", "docs", "figma", "DESIGN_TOKENS.json"),
    diretorio: false,
  },
  {
    origem: join(raiz, "data", "cardapio_knowledge_seed.json"),
    destino: join(raiz, "dist", "data", "cardapio_knowledge_seed.json"),
    diretorio: false,
  },
  {
    origem: join(raiz, "src", "perfil-delivery"),
    destino: join(raiz, "dist", "src", "perfil-delivery"),
    diretorio: true,
  },
];

for (const item of itens) {
  if (!existsSync(item.origem)) {
    console.error(`copiar_product_system_assets: origem inexistente: ${item.origem}`);
    process.exit(1);
  }
  mkdirSync(dirname(item.destino), { recursive: true });
  if (item.diretorio) {
    cpSync(item.origem, item.destino, { recursive: true, force: true });
  } else {
    copyFileSync(item.origem, item.destino);
  }
  console.log(
    `copiar_product_system_assets: ${relative(raiz, item.origem)} -> ${relative(raiz, item.destino)}`,
  );
}
