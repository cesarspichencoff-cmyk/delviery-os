#!/usr/bin/env node
/**
 * Copia as migrations `.sql` para `dist/`.
 *
 * O `tsc` compila TypeScript e ignora tudo o mais — então uma imagem
 * construída a partir de `dist/` sobe sem os arquivos de schema e falha no
 * boot, ou pior: sobe achando que não há migration pendente.
 *
 * Roda no build, é idempotente, e falha alto se não achar nada para copiar —
 * copiar zero arquivo em silêncio é o defeito que este script existe para
 * impedir.
 */

const { readdirSync, mkdirSync, copyFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const origem = join(__dirname, "..", "src", "platform", "migrations");
const destino = join(__dirname, "..", "dist", "src", "platform", "migrations");

if (!existsSync(origem)) {
  console.error(`copiar_migrations: origem inexistente: ${origem}`);
  process.exit(1);
}

mkdirSync(destino, { recursive: true });

const arquivos = readdirSync(origem).filter((f) => f.endsWith(".sql"));
if (arquivos.length === 0) {
  console.error("copiar_migrations: nenhuma migration encontrada — build interrompido");
  process.exit(1);
}

for (const f of arquivos) copyFileSync(join(origem, f), join(destino, f));
console.log(`copiar_migrations: ${arquivos.length} migration(s) para dist/`);
