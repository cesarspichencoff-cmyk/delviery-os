/**
 * M1B — MUTAÇÕES PERCEPTIVAS, medidas no navegador.
 * ============================================================================
 * Estas mutações existem para responder uma pergunta que gate de texto não
 * responde: **a medição que sustenta B1–B5 consegue enxergar a regressão?**
 *
 * Uma prova visual que não morre quando o defeito volta não é prova — é uma
 * captura bonita. Cada mutação aqui devolve a superfície ao defeito exato que
 * M1B-R2 corrigiu, e exige que a GEOMETRIA REAL acuse. Se a medida não mudar,
 * a mutação está cega e o número que eu reportei não valia nada.
 *
 * O QUE ESTA SUÍTE NÃO AFIRMA. Ela não mede beleza, presença, identidade nem
 * North Star — nenhuma dessas é mensurável por retângulo, e fingir que é seria
 * a mentira que a §19 proíbe. Ela mede território, tipografia, colisão e
 * variedade de corpo: as propriedades cujo método consegue medir.
 *
 * PROCEDÊNCIA. Exige o servidor M1 na 5292 com procedência já provada. A suíte
 * confere o marcador de runtime antes de medir qualquer coisa — captura de
 * origem não provada não é evidência.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";

const raiz = process.cwd();
const BASE = process.env["M1B_URL"] ?? "http://localhost:5292";
const falhas: string[] = [];
let passaram = 0;

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

interface Medida {
  readonly massaShare: number;
  readonly menorFonte: number;
  readonly alturaCausadora: number;
  readonly corposDistintos: number;
  readonly colisoes: number;
}

let navegador: Browser;

async function medir(cena: string, w: number, h: number): Promise<Medida> {
  const ctx = await navegador.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?cena=${cena}#/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".org");
  const m = await page.evaluate(() => {
    const palco = document.querySelector(".org-palco");
    const massa = document.querySelector(".org-massa");
    const share =
      palco && massa
        ? massa.getBoundingClientRect().width / palco.getBoundingClientRect().width
        : 0;

    const causadora = document.querySelector('.org-sub[data-causadora="sim"]');
    const alturaCausadora = causadora ? causadora.getBoundingClientRect().height : 0;

    const tamanhos = new Set<string>();
    for (const c of Array.from(document.querySelectorAll(".org-area__corpo"))) {
      const r = c.getBoundingClientRect();
      tamanhos.add(`${Math.round(r.width)}x${Math.round(r.height)}`);
    }

    // Folhas de texto visíveis, fora de barra fixa (barra fixa cobre conteúdo
    // por definição, e contá-la mediria o comportamento dela, não um defeito).
    const folhas: { el: Element; r: DOMRect }[] = [];
    let menor = Infinity;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const proprio = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0,
      );
      const visivel =
        cs.display !== "none" &&
        cs.visibility !== "hidden" &&
        parseFloat(cs.opacity) > 0.05 &&
        r.width > 4 &&
        r.height > 4 &&
        cs.clip === "auto" &&
        cs.clipPath === "none";
      if (!proprio || !visivel) continue;

      // A EXCLUSÃO DE BARRA FIXA VALE PARA COLISÃO, NUNCA PARA TIPOGRAFIA.
      //
      // Medido em M1B-R2 §C: a exclusão de `fixed`/`sticky` foi criada para a
      // colisão (uma barra fixa cobre o conteúdo que rola por baixo — é o
      // comportamento dela, não defeito). Mas ela estava aplicada ANTES do
      // cálculo da menor fonte, e a única microtipografia da superfície morava
      // exatamente numa barra fixa: a navegação inferior do celular. O
      // instrumento ficou cego justamente onde o defeito vivia.
      //
      // Tamanho de letra não depende de posicionamento: 10px numa barra fixa é
      // 10px na cara de quem opera. A medida da fonte passa por TODAS as folhas.
      const px = parseFloat(cs.fontSize);
      if (Number.isFinite(px) && px > 0 && px < menor) menor = px;

      let fixo = false;
      for (let p: Element | null = el; p !== null; p = p.parentElement) {
        const pos = getComputedStyle(p).position;
        if (pos === "fixed" || pos === "sticky") {
          fixo = true;
          break;
        }
      }
      if (fixo) continue;
      folhas.push({ el, r });
    }

    let colisoes = 0;
    for (let i = 0; i < folhas.length; i += 1) {
      for (let j = i + 1; j < folhas.length; j += 1) {
        const A = folhas[i]!;
        const B = folhas[j]!;
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
        const x = Math.max(0, Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left));
        const y = Math.max(0, Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top));
        if (x * y <= 4) continue;
        const alvo = document.elementFromPoint(
          Math.max(A.r.left, B.r.left) + x / 2,
          Math.max(A.r.top, B.r.top) + y / 2,
        );
        if (alvo && (A.el === alvo || B.el === alvo || A.el.contains(alvo) || B.el.contains(alvo))) {
          colisoes += 1;
        }
      }
    }

    return {
      massaShare: share,
      menorFonte: Number.isFinite(menor) ? Math.round(menor * 10) / 10 : 0,
      alturaCausadora: Math.round(alturaCausadora),
      corposDistintos: tamanhos.size,
      colisoes,
    };
  });
  await ctx.close();
  return m;
}

async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

interface Aplicacao {
  readonly original: string;
  readonly hashAntes: string;
  readonly hashDepois: string;
}

/** Aplica e PROVA no disco. Sem prova de aplicação, o resultado não vale. */
function aplicar(rel: string, de: string, para: string): Aplicacao {
  const caminho = join(raiz, rel);
  const original = readFileSync(caminho, "utf8");
  const hashAntes = sha(original);
  const usaCRLF = original.includes("\r\n");
  const emLF = original.replace(/\r\n/g, "\n");
  assert.ok(emLF.includes(de), `MUTACAO NAO APLICADA: ancora ausente em ${rel}`);
  const mutado = emLF.replace(de, () => para);
  assert.notEqual(mutado, emLF, "MUTACAO NAO APLICADA: a troca nao mudou nada");
  writeFileSync(caminho, usaCRLF ? mutado.replace(/\n/g, "\r\n") : mutado);
  const noDisco = readFileSync(caminho, "utf8");
  const hashDepois = sha(noDisco);
  assert.notEqual(hashDepois, hashAntes, "MUTACAO NAO APLICADA: disco nao mudou");
  assert.ok(
    noDisco.replace(/\r\n/g, "\n").includes(para),
    "MUTACAO NAO APLICADA: disco nao contem o texto mutado",
  );
  console.log(`        aplicada · ${rel} · ${hashAntes.slice(0, 10)} -> ${hashDepois.slice(0, 10)}`);
  return { original, hashAntes, hashDepois };
}

function restaurar(rel: string, a: Aplicacao): void {
  writeFileSync(join(raiz, rel), a.original);
  const volta = sha(readFileSync(join(raiz, rel), "utf8"));
  assert.equal(volta, a.hashAntes, `RESTAURACAO FALHOU em ${rel}`);
  console.log(`        restaurado · ${volta.slice(0, 10)} == origem`);
}

const CSS_HOME = "src/product/ui/surfaces/home.css";
const CSS_SHELL = "src/product/ui/shell/shell.css";

async function main(): Promise<void> {
  navegador = await chromium.launch();
  console.log("\n=== M1B — MUTACOES PERCEPTIVAS (geometria real) ===\n");

  // PROCEDÊNCIA antes de qualquer medição.
  const servidoCss = await fetch(`${BASE}/surfaces/home.css`).then((r) => r.text());
  const discoCss = readFileSync(join(raiz, CSS_HOME), "utf8");
  assert.equal(
    sha(servidoCss),
    sha(discoCss),
    "PROCEDENCIA FALHOU: o servidor nao esta servindo este worktree",
  );
  console.log(`procedencia ok · home.css servido == disco · ${sha(discoCss).slice(0, 16)}\n`);

  await teste("MP1 B3 — o Foco toma o territorio da operacao e a medida acusa", async () => {
    // A PRIMEIRA VERSÃO DESTA MUTAÇÃO MEDIU A COISA ERRADA, e o registro fica.
    //
    // Ela reinjetava a regra antiga — três colunas com `.org-foco` em
    // `grid-area: decisao`. Medido: 62% -> 58%, quatro pontos, quando o defeito
    // original custava 56% do território. A mutação não pegou porque o defeito
    // não era só CSS: `.org-foco` hoje mora DENTRO de `.org-voz` e não é mais
    // item da grade, então `grid-area` nela é inerte. B3 ficou estruturalmente
    // irreprodutível por folha de estilo — o que é uma boa notícia sobre a
    // correção, e uma má notícia sobre aquela mutação.
    //
    // O que B3 afirma NÃO é "não existe terceira coluna". É: **a operação não
    // perde seu território quando o Foco chega.** Essa é a propriedade, e é ela
    // que esta mutação ataca — engordando a coluna da decisão até a massa
    // passar fome. Atacar a propriedade em vez da forma antiga é o ponto.
    const antes = await medir("foco", 1440, 900);
    const a = aplicar(
      CSS_HOME,
      '.org[data-modo="foco"] .org-palco {\n    grid-template-columns: minmax(32ch, 40ch) minmax(0, 1fr);\n  }',
      '.org[data-modo="foco"] .org-palco {\n    grid-template-columns: minmax(64ch, 78ch) minmax(0, 1fr);\n  }',
    );
    try {
      const depois = await medir("foco", 1440, 900);
      console.log(
        `        massa/palco  ${(antes.massaShare * 100).toFixed(0)}% -> ${(depois.massaShare * 100).toFixed(0)}%`,
      );
      assert.ok(antes.massaShare >= 0.5, `a base ja estava com fome: ${antes.massaShare.toFixed(2)}`);
      assert.ok(
        depois.massaShare < antes.massaShare - 0.15,
        `a medida NAO enxergou a perda de territorio: ${antes.massaShare.toFixed(2)} -> ${depois.massaShare.toFixed(2)}`,
      );
      assert.ok(depois.massaShare < 0.5, "com a decisao inchada a massa tem que cair abaixo de metade");
    } finally {
      restaurar(CSS_HOME, a);
    }
  });

  await teste("MP2 B5 — sem o ponto de quebra, a operacao perde largura no telefone", async () => {
    const antes = await medir("ambiente", 320, 640);
    const a = aplicar(
      CSS_HOME,
      "@media (min-width: 1200px) {\n  .org-palco {\n    grid-template-columns: minmax(26ch, 30ch) minmax(0, 1fr);\n    grid-template-areas: \"voz massa\";\n  }",
      "@media (min-width: 1px) {\n  .org-palco {\n    grid-template-columns: minmax(26ch, 30ch) minmax(0, 1fr);\n    grid-template-areas: \"voz massa\";\n  }",
    );
    try {
      const depois = await medir("ambiente", 320, 640);
      console.log(
        `        massa/palco @320  ${(antes.massaShare * 100).toFixed(0)}% -> ${(depois.massaShare * 100).toFixed(0)}%`,
      );
      assert.ok(
        depois.massaShare < antes.massaShare - 0.3,
        `a medida NAO enxergou a perda de territorio: ${antes.massaShare.toFixed(2)} -> ${depois.massaShare.toFixed(2)}`,
      );
    } finally {
      restaurar(CSS_HOME, a);
    }
  });

  await teste("MP3 microtipografia — 11px volta a 10px e a medida acusa", async () => {
    const antes = await medir("ambiente", 375, 812);
    const a = aplicar(CSS_SHELL, "  font-size: 11px;\n  font-weight: 600;", "  font-size: 10px;\n  font-weight: 600;");
    try {
      const depois = await medir("ambiente", 375, 812);
      console.log(`        menor fonte  ${antes.menorFonte}px -> ${depois.menorFonte}px`);
      assert.ok(antes.menorFonte >= 11, `a base ja tinha microtipografia: ${antes.menorFonte}px`);
      assert.ok(depois.menorFonte < 11, `a medida NAO enxergou o 10px: ${depois.menorFonte}px`);
    } finally {
      restaurar(CSS_SHELL, a);
    }
  });

  await teste("MP4 B2 — a pilula causadora volta a disputar baseline e cresce", async () => {
    const antes = await medir("ambiente", 1440, 900);
    const a = aplicar(
      CSS_HOME,
      ".org-sub {\n  display: inline-flex;\n  flex-direction: column;\n  align-items: flex-start;",
      ".org-sub {\n  display: inline-flex;\n  flex-direction: row;\n  align-items: baseline;",
    );
    try {
      const depois = await medir("ambiente", 1440, 900);
      console.log(
        `        altura da causadora  ${antes.alturaCausadora}px -> ${depois.alturaCausadora}px`,
      );
      assert.ok(
        depois.alturaCausadora > antes.alturaCausadora,
        `a medida NAO enxergou a volta da disputa de baseline: ${antes.alturaCausadora} -> ${depois.alturaCausadora}`,
      );
    } finally {
      restaurar(CSS_HOME, a);
    }
  });

  await teste("MP5 cartoes iguais — os corpos perdem a variedade de degrau", async () => {
    const antes = await medir("ambiente", 1440, 900);
    const a = aplicar(
      CSS_HOME,
      ".org-area__corpo {\n  position: relative;",
      ".org-area__corpo {\n  width: 160px !important;\n  height: 160px !important;\n  min-width: 160px !important;\n  min-height: 160px !important;\n  position: relative;",
    );
    try {
      const depois = await medir("ambiente", 1440, 900);
      console.log(
        `        tamanhos distintos de corpo  ${antes.corposDistintos} -> ${depois.corposDistintos}`,
      );
      assert.ok(
        antes.corposDistintos >= 3,
        `a base deveria ter variedade de degrau: ${antes.corposDistintos}`,
      );
      assert.equal(
        depois.corposDistintos,
        1,
        "a medida NAO enxergou a grade de cartoes iguais",
      );
    } finally {
      restaurar(CSS_HOME, a);
    }
  });

  await navegador.close();

  console.log(`\nperceptivas: ${passaram} passaram, ${falhas.length} falharam`);
  for (const f of falhas) console.error(`  XX ${f}`);
  if (falhas.length > 0) {
    console.error("\nM1B_PERCEPTUAL_GATE_RED");
    process.exit(1);
  }
  console.log("M1B_PERCEPTUAL_GATE_GREEN");
}

void main();
