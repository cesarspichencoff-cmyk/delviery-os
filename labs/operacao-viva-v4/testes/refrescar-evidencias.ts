/**
 * REFRESH DELIBERADO DAS EVIDÊNCIAS VERSIONADAS · LAB OPERAÇÃO VIVA V4
 * ============================================================================
 * O **único** caminho que substitui `labs/operacao-viva-v4/evidencias/`.
 *
 * Existe porque rodar um teste e regenerar patrimônio eram a mesma ação, e
 * isso custou os 13 arquivos três vezes numa sessão só (D4). Agora são duas
 * superfícies com responsabilidades diferentes:
 *
 *   npm run test:lab:v4:browser        prova comportamento · grava em temporário
 *   npm run evidence:lab:v4:refresh    publica evidência   · ato explícito
 *
 * A regra desta: **substitui o conjunto inteiro ou não substitui nada.** Meia
 * evidência nova e meia velha é pior que evidência velha, porque parece
 * coerente e não é.
 *
 * COMO A TROCA É ATÔMICA
 * ----------------------
 * A geração acontece num diretório de estágio ADJACENTE ao alvo — adjacente
 * porque `rename` só é atômico dentro do mesmo sistema de arquivos, e um
 * `/tmp` em outro dispositivo forçaria cópia arquivo a arquivo, que é
 * exatamente o estado "metade e metade" que esta ferramenta existe para
 * impedir. O estágio é ignorado pelo Git, então uma execução morta no meio
 * não suja `git status`.
 *
 * Só depois de o gate INTEIRO passar e o conjunto estar completo é que
 * acontecem dois `rename`: o velho sai, o novo entra. Se algo falhar entre os
 * dois, o velho volta.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const ALVO = join(raiz, "labs", "operacao-viva-v4", "evidencias");
const BASE_LAB = join(raiz, "labs", "operacao-viva-v4");
const ESTAGIO = join(BASE_LAB, `.evidencias-staging-${process.pid}`);
const VELHO = join(BASE_LAB, `.evidencias-velho-${process.pid}`);
const GATE = "labs/operacao-viva-v4/testes/run-lab-v4-browser.ts";

function morrer(motivo: string): never {
  console.error(`\nREFRESH RECUSADO — o conjunto versionado NÃO foi tocado.`);
  console.error(`  ${motivo}`);
  rmSync(ESTAGIO, { recursive: true, force: true });
  process.exit(1);
}

function sha256(caminho: string): string {
  return createHash("sha256").update(readFileSync(caminho)).digest("hex");
}

/**
 * Largura e altura lidas do cabeçalho IHDR do PNG.
 *
 * Serve a dois propósitos: confirma que o arquivo é PNG de verdade (assinatura
 * de 8 bytes), e grava no manifesto o que a imagem É — medida, não a viewport
 * que alguém pediu. Captura `fullPage` tem altura maior que a viewport, e o
 * manifesto registra o fato, não a intenção.
 */
function dimensoesPng(caminho: string): { largura: number; altura: number } {
  const b = readFileSync(caminho);
  const assinatura = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (b.length < 24 || !b.subarray(0, 8).equals(assinatura)) {
    morrer(`${caminho} não é um PNG — assinatura inválida`);
  }
  return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) };
}

console.log("=== REFRESH DELIBERADO DAS EVIDÊNCIAS · LAB V4 ===\n");

/* ---- 0. estágio limpo, adjacente ao alvo ---- */
rmSync(ESTAGIO, { recursive: true, force: true });
mkdirSync(ESTAGIO, { recursive: true });
console.log(`[refresh] staging: ${ESTAGIO}`);

/* ---- 1. gerar: o gate INTEIRO, não só as capturas ---- */
// Publicar evidência de uma execução que só tirou foto e não provou nada seria
// publicar uma imagem bonita de um estado possivelmente quebrado. O gate
// inteiro verde é a precondição: navegador abriu, servidor respondeu, as 28
// provas passaram.
console.log("[refresh] rodando o gate de navegador inteiro...\n");
const r = spawnSync("npx", ["tsx", GATE], {
  cwd: raiz,
  stdio: "inherit",
  env: { ...process.env, LAB_V4_EVIDENCIAS: ESTAGIO },
  timeout: 1_800_000,
});

if (r.error) morrer(`o gate nem rodou: ${r.error.message}`);
if (r.status !== 0) {
  morrer(`o gate de navegador terminou em ${r.status} — geração incompleta ou prova vermelha`);
}

/* ---- 2. o que o gerador DECLAROU ter feito ---- */
const manifestoPath = join(ESTAGIO, "procedencia.json");
if (!existsSync(manifestoPath)) morrer("o gate não escreveu procedencia.json — sem procedência, sem publicação");

const manifesto = JSON.parse(readFileSync(manifestoPath, "utf8")) as {
  cenas?: string[];
  viewports?: { nome: string }[];
  chromium?: { versao_reportada?: string; build_diretorio?: string };
};
const cenas = manifesto.cenas ?? [];
const viewports = (manifesto.viewports ?? []).map((v) => v.nome);
if (cenas.length === 0 || viewports.length === 0) morrer("procedencia.json não declara cenas e viewports");

/* ---- 3. o conjunto precisa estar COMPLETO, nome a nome ---- */
// Contar arquivos não basta: 12 arquivos com um nome errado passariam. A
// conferência é pelo nome exato que cada par cena×viewport tem que produzir.
const esperados = cenas.flatMap((c) => viewports.map((v) => `${c}--${v}.png`)).sort();
const presentes = readdirSync(ESTAGIO).filter((f) => f.endsWith(".png")).sort();

const faltando = esperados.filter((e) => !presentes.includes(e));
const sobrando = presentes.filter((p) => !esperados.includes(p));
if (faltando.length > 0) morrer(`faltam ${faltando.length} captura(s): ${faltando.join(", ")}`);
if (sobrando.length > 0) morrer(`capturas inesperadas: ${sobrando.join(", ")}`);
if (!existsSync(join(ESTAGIO, "README.md"))) morrer("o conjunto novo não tem README.md");

const arquivos: Record<string, { sha256: string; bytes: number; largura: number; altura: number }> = {};
for (const nome of esperados) {
  const caminho = join(ESTAGIO, nome);
  const bytes = statSync(caminho).size;
  if (bytes === 0) morrer(`${nome} saiu com 0 byte — geração incompleta`);
  const { largura, altura } = dimensoesPng(caminho);
  arquivos[nome] = { sha256: sha256(caminho), bytes, largura, altura };
}

/* ---- 4. fechar o manifesto com o ato de publicação ---- */
writeFileSync(
  manifestoPath,
  `${JSON.stringify(
    {
      ...manifesto,
      publicado_por: "npm run evidence:lab:v4:refresh",
      publicado_em: new Date().toISOString(),
      arquivos,
    },
    null,
    2,
  )}\n`,
);

/* ---- 5. troca atômica: dois renames, e volta atrás se falhar ---- */
rmSync(VELHO, { recursive: true, force: true });
const tinhaAlvo = existsSync(ALVO);
if (tinhaAlvo) renameSync(ALVO, VELHO);
try {
  renameSync(ESTAGIO, ALVO);
} catch (e) {
  // A única janela em que o alvo não existe. Se o segundo rename falhar, o
  // conjunto velho volta INTEIRO — nunca metade.
  if (tinhaAlvo) renameSync(VELHO, ALVO);
  morrer(`a troca falhou e o conjunto velho foi restaurado: ${e instanceof Error ? e.message : String(e)}`);
}
rmSync(VELHO, { recursive: true, force: true });

console.log(`\n[refresh] ${esperados.length} captura(s) publicadas em ${ALVO}`);
console.log(
  `[refresh] procedência: chromium ${manifesto.chromium?.versao_reportada ?? "?"} · build ${
    manifesto.chromium?.build_diretorio ?? "?"
  }`,
);
console.log("\nEVIDENCIAS_REFRESCADAS");
