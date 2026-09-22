#!/usr/bin/env node
/**
 * Carimba `dist/` com a identidade do que o produziu.
 *
 * Nasceu de um falso vermelho medido nesta sessão: o gate do PB19 lê
 * `dist/src/platform/config/platform-config.js`, eu corrigi a regra de TLS em
 * `src/` e rodei o gate **sem reconstruir**. O gate reprovou uma propriedade
 * que já estava certa — estava medindo um artefato velho. O inverso é o perigo
 * de verdade: artefato velho que ainda passa, e vira verde sobre código que
 * ninguém está mais rodando.
 *
 * Por isso o carimbo guarda o SHA-256 do conteúdo de tudo que produz `dist/`,
 * e não a data: data diz quando alguém rodou o build, hash diz o que entrou
 * nele. `npm run test:platform:pb19` recalcula e compara.
 *
 * Também é onde a imagem ganha **identidade de commit**. O `Dockerfile` não
 * copia `.git`, então o commit chega por `ARG DELIVERYOS_COMMIT`; fora do
 * container ele vem do próprio git. Ausente, fica `null` — declarado, nunca
 * inventado.
 */

const { createHash } = require("node:crypto");
const { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync } = require("node:fs");
const { join, relative, sep } = require("node:path");
const { execFileSync } = require("node:child_process");

const raiz = join(__dirname, "..");
const destino = join(raiz, "dist");

/**
 * O que determina o ARTEFATO DE RUNTIME.
 *
 * Primeira versão hasheava `src/**` inteiro, e o carimbo virou barulho: editar
 * um runner de teste invalidava o build, embora nenhum runner seja executado a
 * partir de `dist/`. Excluir por NOME (`run-*.ts`) seria a mesma classe de erro
 * que o PB19 corrigiu nas guardas do C3 — regra que olha vocabulário.
 *
 * Então a fronteira é medida: o fecho transitivo de imports a partir dos TRÊS
 * binários que a composição roda, mais os assets que o build copia. Um arquivo
 * que nenhum binário alcança não muda o que sobe, e não deveria invalidar
 * nada.
 */
const BINARIOS = [
  "src/platform/bin/critical.ts",
  "src/platform/bin/async-runtime.ts",
  "src/platform/bin/migrate.ts",
];
const ASSETS = [
  { dir: join("src", "platform", "migrations"), extensoes: [".sql"] },
  { dir: join("docs", "contracts"), extensoes: [".json"] },
];
const ARQUIVOS_SOLTOS = ["package.json", "tsconfig.json"];

function percorrer(dir, extensoes, saida) {
  const absoluto = join(raiz, dir);
  if (!existsSync(absoluto)) return;
  for (const nome of readdirSync(absoluto)) {
    const rel = join(dir, nome);
    const abs = join(raiz, rel);
    if (statSync(abs).isDirectory()) percorrer(rel, extensoes, saida);
    else if (extensoes.some((e) => nome.endsWith(e))) saida.push(rel);
  }
}

/**
 * O grafo vem de `dist/`, compilado pelo `tsc` que acabou de rodar. Usar a
 * MESMA implementação que as guardas usam é o ponto: duas noções de "o que o
 * runtime alcança" divergem, e a permissiva é a que ninguém percebe.
 */
function alcancadosPelosBinarios() {
  const grafo = require(join(raiz, "dist", "src", "platform", "grafo-de-imports.js"));
  const vistos = new Set();
  for (const bin of BINARIOS) {
    for (const abs of grafo.alcancaveis(bin)) {
      if (abs.startsWith(raiz)) vistos.add(relative(raiz, abs));
    }
  }
  return [...vistos];
}

function hashDasFontes() {
  const arquivos = alcancadosPelosBinarios();
  for (const { dir, extensoes } of ASSETS) percorrer(dir, extensoes, arquivos);
  for (const f of ARQUIVOS_SOLTOS) if (existsSync(join(raiz, f))) arquivos.push(f);

  // Ordem estável e separador normalizado: o mesmo conteúdo precisa dar o
  // mesmo hash em qualquer máquina, ou o carimbo vira ruído.
  const unicos = [...new Set(arquivos)].sort();
  const h = createHash("sha256");
  for (const rel of unicos) {
    h.update(rel.split(sep).join("/"));
    h.update("\0");
    h.update(readFileSync(join(raiz, rel)));
    h.update("\0");
  }
  return { sha256: h.digest("hex"), arquivos: unicos.length };
}

function commit() {
  const doAmbiente = (process.env.DELIVERYOS_COMMIT || "").trim();
  if (doAmbiente) return doAmbiente;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: raiz, encoding: "utf8" }).trim();
  } catch {
    // Build sem git e sem ARG: o commit fica declaradamente desconhecido.
    return null;
  }
}

/**
 * O corpo só roda quando o script é EXECUTADO, nunca quando é importado.
 *
 * Sem esta guarda, o gate que faz `require('tools/carimbar_build.js')` para
 * recalcular o hash REESCREVERIA `dist/build-stamp.json` antes de compará-lo
 * — e a comparação passaria sempre, medindo nada. Foi o que a primeira versão
 * fazia.
 */
function principal() {
  if (!existsSync(destino)) {
    console.error("carimbar_build: dist/ não existe — rode o tsc antes");
    process.exit(1);
  }

  const fontes = hashDasFontes();
  if (fontes.arquivos === 0) {
    console.error("carimbar_build: nenhuma fonte encontrada — build interrompido");
    process.exit(1);
  }

  mkdirSync(destino, { recursive: true });
  const carimbo = {
    carimbo_versao: 1,
    fontes_sha256: fontes.sha256,
    fontes_arquivos: fontes.arquivos,
    commit: commit(),
    carimbado_em: new Date().toISOString(),
  };
  writeFileSync(join(destino, "build-stamp.json"), `${JSON.stringify(carimbo, null, 2)}\n`);

  console.log(
    `carimbar_build: ${fontes.arquivos} fonte(s) · ${fontes.sha256.slice(0, 12)} · commit ${
      carimbo.commit ? carimbo.commit.slice(0, 10) : "desconhecido"
    } → ${relative(raiz, join(destino, "build-stamp.json"))}`,
  );
}

if (require.main === module) principal();

module.exports = { hashDasFontes };
