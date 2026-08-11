/**
 * CAPTURA DE ESTADOS DA HOME — ferramenta de MISSÃO, não runtime de produto.
 * ============================================================================
 * M1B §20-22: inspeção de código não é prova visual. Esta ferramenta dirige o
 * Chromium real pelo Playwright que já é dependência declarada do projeto
 * (`playwright ^1.61.1`), o mesmo caminho que R5 usou para provar reduced motion
 * em 2026-08-03.
 *
 * Ela NÃO faz parte do produto: não é importada por nada em `src/`, não roda em
 * nenhum gate, e existir ou não existir não muda uma linha do que o operador vê.
 *
 * Uso:
 *   npm run ui:product                 # servidor na 5290, noutro terminal
 *   npx tsx tools/m1b_shots.ts <rotulo>
 *
 * Saída: `docs/design/m1b-evidencia/<rotulo>/<cena>-<viewport>.png`
 * mais um `manifest.json` com o que foi capturado e com que limitação.
 */

import { chromium, type Browser, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env["M1B_URL"] ?? "http://localhost:5290";
const ROTULO = process.argv[2] ?? "sem-rotulo";
const DESTINO = join(process.cwd(), "docs/design/m1b-evidencia", ROTULO);

interface Alvo {
  readonly nome: string;
  readonly url: string;
  /** O que a captura precisa deixar perceptível. Sem isto ela é só um PNG. */
  readonly perceber: string;
  readonly reducedMotion?: boolean;
}

const CENAS: readonly Alvo[] = [
  { nome: "calmo", url: "/?cena=calmo#/", perceber: "silêncio com presença; nada exige atenção" },
  { nome: "ambiente", url: "/?cena=ambiente#/", perceber: "duas pressões simultâneas, nenhuma interrompe" },
  { nome: "foco", url: "/?cena=foco#/", perceber: "uma situação soberana; o resto recua sem sumir" },
  { nome: "degradado", url: "/?cena=degradado#/", perceber: "falha técnica cinza, jamais confundida com pressão" },
  { nome: "aproximacao", url: "/?cena=foco&area=sushi#/", perceber: "área ampliada; o resto da operação continua no minimapa" },
  {
    nome: "foco-reduced",
    url: "/?cena=foco#/",
    perceber: "mesma informação sem interpolação",
    reducedMotion: true,
  },
];

const VIEWPORTS: readonly { readonly w: number; readonly h: number }[] = [
  { w: 1440, h: 900 },
  { w: 1024, h: 900 },
  { w: 768, h: 1024 },
  { w: 414, h: 896 },
  { w: 375, h: 812 },
  { w: 320, h: 640 },
];

interface Registro {
  readonly cena: string;
  readonly viewport: string;
  readonly arquivo: string;
  readonly perceber: string;
  readonly reduced_motion: boolean;
  readonly overflow_horizontal: boolean;
  readonly largura_documento: number;
  readonly menor_fonte_px: number;
  readonly menor_fonte_alvo: string;
  readonly altura_documento: number;
  readonly animando: number;
}

/** Medições que uma captura estática não prova sozinha. */
async function medir(page: Page): Promise<{
  overflow: boolean;
  docWidth: number;
  menorFonte: number;
  animando: number;
}> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth > doc.clientWidth + 1;
    let menor = Infinity;
    let menorAlvo = "";
    let animando = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      // Texto que a PESSOA le. Conteudo so para leitor de tela nao tem tamanho
      // percebido, e conta-lo mediria a propriedade errada: a primeira versao
      // desta medida acusava 9.3px em 36 de 36 capturas por causa de `.sr-only`.
      const visivelAoOlho =
        cs.display !== "none" &&
        cs.visibility !== "hidden" &&
        parseFloat(cs.opacity) > 0.05 &&
        r.width > 4 &&
        r.height > 4 &&
        cs.clip === "auto" &&
        cs.clipPath === "none";
      // Só folhas: um container herda o tamanho do filho e duplicaria a conta.
      const folha = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0,
      );
      if (visivelAoOlho && folha) {
        const px = parseFloat(cs.fontSize);
        if (Number.isFinite(px) && px > 0 && px < menor) {
          menor = px;
          menorAlvo = `${el.tagName.toLowerCase()}.${el.className || "(sem classe)"}`;
        }
      }
      if (cs.animationName !== "none" || parseFloat(cs.transitionDuration) > 0) animando += 1;
    }
    return {
      overflow,
      docWidth: doc.scrollWidth,
      menorFonte: Number.isFinite(menor) ? menor : 0,
      menorAlvo,
      animando,
      alturaDoc: doc.scrollHeight,
    };
  });
}

async function main(): Promise<void> {
  mkdirSync(DESTINO, { recursive: true });
  let browser: Browser | undefined;
  const registros: Registro[] = [];
  try {
    browser = await chromium.launch();
    for (const cena of CENAS) {
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({
          viewport: { width: vp.w, height: vp.h },
          deviceScaleFactor: 2,
          reducedMotion: cena.reducedMotion === true ? "reduce" : "no-preference",
        });
        const page = await ctx.newPage();
        await page.goto(BASE + cena.url, { waitUntil: "networkidle" });
        // A superfície nasce do fetch da API; sem isto a captura pega o esqueleto.
        await page.waitForSelector(".org", { timeout: 10_000 });
        const m = await medir(page);
        const arquivo = `${cena.nome}-${vp.w}.png`;
        await page.screenshot({ path: join(DESTINO, arquivo), fullPage: true });
        registros.push({
          cena: cena.nome,
          viewport: `${vp.w}x${vp.h}`,
          arquivo,
          perceber: cena.perceber,
          reduced_motion: cena.reducedMotion === true,
          overflow_horizontal: m.overflow,
          largura_documento: m.docWidth,
          menor_fonte_px: Math.round(m.menorFonte * 10) / 10,
          menor_fonte_alvo: m.menorAlvo,
          altura_documento: m.alturaDoc,
          animando: m.animando,
        });
        await ctx.close();
      }
    }
  } finally {
    await browser?.close();
  }

  writeFileSync(
    join(DESTINO, "manifest.json"),
    JSON.stringify(
      {
        rotulo: ROTULO,
        capturado_em: new Date().toISOString(),
        base: BASE,
        procedencia: "FIXTURE — cenas de demonstração servidas pelo produto. NUNCA operação real.",
        chromium: "Playwright 1.61.1",
        registros,
      },
      null,
      2,
    ) + "\n",
  );

  const overflow = registros.filter((r) => r.overflow_horizontal);
  const micro = registros.filter((r) => r.menor_fonte_px > 0 && r.menor_fonte_px < 11);
  console.log(`\n${registros.length} capturas em docs/design/m1b-evidencia/${ROTULO}/`);
  console.log(`overflow horizontal: ${overflow.length}`);
  for (const r of overflow) console.log(`  - ${r.cena} @ ${r.viewport}: doc ${r.largura_documento}px`);
  console.log(`microtipografia (<11px): ${micro.length}`);
  for (const r of micro) console.log(`  - ${r.cena} @ ${r.viewport}: ${r.menor_fonte_px}px em ${r.menor_fonte_alvo}`);
  const alturas = registros.filter((r) => r.viewport.startsWith("1440"));
  console.log("altura do documento em 1440:");
  for (const r of alturas) console.log(`  - ${r.cena}: ${r.altura_documento}px`);
  const red = registros.filter((r) => r.reduced_motion);
  console.log(`reduced motion — elementos animando/transicionando: ${red.map((r) => r.animando).join(", ")}`);
}

void main();
