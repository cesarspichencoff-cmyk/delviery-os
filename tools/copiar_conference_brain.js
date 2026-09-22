#!/usr/bin/env node
/**
 * Copia os módulos `.js` do Conference Brain para `dist/`.
 *
 * Mesmo motivo de `copiar_migrations.js`, outro artefato: o `tsc` compila
 * TypeScript e ignora o resto, e `deploy/Dockerfile.platform` leva para a
 * imagem apenas `dist/`, `node_modules/` e `package.json` — `src/` não vai.
 * Sem este passo, `runtime/intelligence-spine` resolve os quatro módulos para
 * um caminho que só existe na máquina de quem desenvolve.
 *
 * O defeito que isso evita é traiçoeiro por ser TARDIO: com a espinha
 * desligada — o padrão — o require nem acontece, a imagem sobe, o `/ready`
 * responde 200 e tudo parece certo. A falta só apareceria no dia em que
 * alguém ligasse a flag em produção.
 *
 * Roda no build, é idempotente, e falha alto se não achar nada para copiar.
 */

const { readdirSync, mkdirSync, copyFileSync, existsSync, statSync } = require("node:fs");
const { join, relative } = require("node:path");

const raiz = join(__dirname, "..");
const origem = join(raiz, "src", "conference-brain");
const destino = join(raiz, "dist", "src", "conference-brain");

if (!existsSync(origem)) {
  console.error(`copiar_conference_brain: origem inexistente: ${origem}`);
  process.exit(1);
}

let copiados = 0;

function percorrer(de, para) {
  mkdirSync(para, { recursive: true });
  for (const entrada of readdirSync(de)) {
    const origemEntrada = join(de, entrada);
    const destinoEntrada = join(para, entrada);
    if (statSync(origemEntrada).isDirectory()) {
      percorrer(origemEntrada, destinoEntrada);
    } else if (entrada.endsWith(".js")) {
      copyFileSync(origemEntrada, destinoEntrada);
      copiados++;
    }
  }
}

percorrer(origem, destino);

if (copiados === 0) {
  console.error("copiar_conference_brain: nenhum módulo encontrado — build interrompido");
  process.exit(1);
}

console.log(
  `copiar_conference_brain: ${copiados} módulo(s) para ${relative(raiz, destino)}/`,
);
