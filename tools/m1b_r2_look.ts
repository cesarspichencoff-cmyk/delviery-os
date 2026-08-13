/**
 * OLHAR — instrumento de MISSÃO do laço por blocker (M1B-R2 §15).
 * ============================================================================
 * `m1b_shots.ts` é o pacote de evidência: 36 capturas, 2x de densidade, página
 * inteira. É caro e lento, e serve para FECHAR. Este aqui serve para TRABALHAR:
 * um blocker por vez, poucas capturas, e — a diferença que importa — ele MEDE o
 * defeito em vez de só fotografá-lo.
 *
 * Ele NÃO faz parte do produto: nada em `src/` o importa, nenhum gate o roda, e
 * removê-lo não muda uma linha do que o operador vê.
 *
 * A medida que justifica o arquivo é `colisoes`: pares de folhas de TEXTO cujos
 * retângulos se sobrepõem. B2 é um defeito objetivo, e um defeito objetivo tem
 * que ter um número — olhar a captura e achar que está torto não é prova, e
 * "compilou" muito menos.
 *
 * Uso:
 *   npx tsx tools/m1b_r2_look.ts <rotulo> [cenas] [larguras] [--full] [--reduced]
 *   npx tsx tools/m1b_r2_look.ts b2 ambiente 1440,375
 *
 * Saída: $M1B_OUT/<rotulo>/  (padrão: fora do repositório, no scratchpad)
 */

import { chromium, type Browser, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env["M1B_URL"] ?? "http://localhost:5292";
const ROTULO = process.argv[2] ?? "sem-rotulo";
const CENAS = (process.argv[3] ?? "calmo,ambiente,foco,degradado").split(",");
const LARGURAS = (process.argv[4] ?? "1440,1024,768,414,375,320")
  .split(",")
  .map((n) => Number(n));
const PAGINA_INTEIRA = process.argv.includes("--full");
const REDUZIDO = process.argv.includes("--reduced");
const DESTINO = join(
  process.env["M1B_OUT"] ??
    "C:/Users/italo/AppData/Local/Temp/claude/C--Users-italo-Desktop-Claude/a0a3e9fe-89e0-4362-b8b8-7073cbdfd60c/scratchpad/olhar",
  ROTULO,
);

/** Altura de viewport por largura — um telefone não tem 900px de altura. */
function alturaDe(w: number): number {
  if (w >= 1440) return 900;
  if (w >= 1024) return 900;
  if (w >= 768) return 1024;
  if (w >= 414) return 896;
  if (w >= 375) return 812;
  return 640;
}

interface Colisao {
  readonly a: string;
  readonly b: string;
  readonly area: number;
  readonly texto_a: string;
  readonly texto_b: string;
}

interface Medida {
  readonly overflow: boolean;
  readonly docWidth: number;
  readonly docHeight: number;
  readonly menorFonte: number;
  readonly menorAlvo: string;
  readonly animando: number;
  readonly colisoes: readonly Colisao[];
  readonly alvosPequenos: readonly string[];
  readonly repetidos: readonly string[];
}

async function medir(page: Page): Promise<Medida> {
  return page.evaluate(() => {
    const doc = document.documentElement;

    // NADA de função nomeada aqui dentro. O `tsx` compila com `keepNames`, que
    // injeta um auxiliar `__name` inexistente no contexto da página — a primeira
    // versão deste arquivo morreu exatamente assim. Callback inline não sofre.
    //
    // Folha de texto: elemento com texto próprio, visível ao olho.
    const folhas: { el: HTMLElement; r: DOMRect; txt: string; nome: string }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const visivel =
        cs.display !== "none" &&
        cs.visibility !== "hidden" &&
        parseFloat(cs.opacity) > 0.05 &&
        r.width > 4 &&
        r.height > 4 &&
        cs.clip === "auto" &&
        cs.clipPath === "none";
      const proprio = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0,
      );
      // BARRA FIXA NAO E COLISAO. Uma barra `position: fixed` fica POR CIMA do
      // conteudo que rola por baixo dela — e isso e o comportamento dela, nao um
      // defeito. Sem esta exclusao a medida acusava a navegacao inferior do
      // celular contra tudo que estivesse atras dela naquele instante de rolagem,
      // e trocava um numero util por ruido.
      let fixo = false;
      for (let p: HTMLElement | null = el; p !== null; p = p.parentElement) {
        const pos = getComputedStyle(p).position;
        if (pos === "fixed" || pos === "sticky") {
          fixo = true;
          break;
        }
      }
      if (visivel && proprio && !fixo) {
        folhas.push({
          el,
          r,
          txt: (el.textContent ?? "").trim(),
          nome: `${el.tagName.toLowerCase()}.${(el.className || "(sem-classe)").toString().split(" ").join(".")}`,
        });
      }
    }

    // COLISÃO. Só entre folhas que não são ancestrais uma da outra — um filho
    // dentro do pai se "sobrepõe" por definição e não é defeito.
    const colisoes: Colisao[] = [];
    for (let i = 0; i < folhas.length; i += 1) {
      for (let j = i + 1; j < folhas.length; j += 1) {
        const A = folhas[i]!;
        const B = folhas[j]!;
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
        const x = Math.max(0, Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left));
        const y = Math.max(0, Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top));
        const area = x * y;
        // CLIPADO NÃO É COLIDIDO. `getBoundingClientRect` devolve o retângulo
        // do layout mesmo quando um ancestral com `overflow:hidden` está
        // recortando o elemento — e a primeira versão desta medida acusou 25
        // colisões que ninguém enxerga, todas dentro de acordeões FECHADOS.
        // Um teste que não consegue medir a propriedade não vale como prova
        // automática, então aqui a pergunta passou a ser perceptiva: no centro
        // da interseção, o que o navegador entrega ao clique é um dos dois?
        const cx = Math.max(A.r.left, B.r.left) + x / 2;
        const cy = Math.max(A.r.top, B.r.top) + y / 2;
        const alvo = document.elementFromPoint(cx, cy);
        const visivelDeVerdade =
          alvo !== null &&
          (A.el === alvo || B.el === alvo || A.el.contains(alvo) || B.el.contains(alvo));
        if (area > 4 && visivelDeVerdade) {
          colisoes.push({
            a: A.nome,
            b: B.nome,
            area: Math.round(area),
            texto_a: A.txt.slice(0, 60),
            texto_b: B.txt.slice(0, 60),
          });
        }
      }
    }

    // REPETIÇÃO. A mesma frase inteira desenhada em dois lugares é o outro
    // sintoma de B2, e não aparece como sobreposição geométrica nenhuma.
    const contagem = new Map<string, number>();
    for (const f of folhas) {
      const t = f.txt;
      if (t.length > 25) contagem.set(t, (contagem.get(t) ?? 0) + 1);
    }
    const repetidos = [...contagem.entries()]
      .filter(([, n]) => n > 1)
      .map(([t, n]) => `${n}x · ${t.slice(0, 80)}`);

    let menor = Infinity;
    let menorAlvo = "";
    let animando = 0;
    for (const f of folhas) {
      const px = parseFloat(getComputedStyle(f.el).fontSize);
      if (Number.isFinite(px) && px > 0 && px < menor) {
        menor = px;
        menorAlvo = f.nome;
      }
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const cs = getComputedStyle(el);
      if (cs.animationName !== "none" || parseFloat(cs.transitionDuration) > 0) animando += 1;
    }

    // ALVO DE TOQUE. Só o que é de fato acionável.
    const alvosPequenos: string[] = [];
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>("a,button,select,input,[role=button],summary"),
    )) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display === "none" || cs.visibility === "hidden" || r.width < 1) continue;
      if (r.height < 44 || r.width < 44) {
        alvosPequenos.push(
          `${el.tagName.toLowerCase()}.${(el.className || "(sem-classe)").toString().split(" ").join(".")} ${Math.round(r.width)}x${Math.round(r.height)}`,
        );
      }
    }

    return {
      overflow: doc.scrollWidth > doc.clientWidth + 1,
      docWidth: doc.scrollWidth,
      docHeight: doc.scrollHeight,
      menorFonte: Number.isFinite(menor) ? Math.round(menor * 10) / 10 : 0,
      menorAlvo,
      animando,
      colisoes: colisoes.slice(0, 25),
      alvosPequenos: alvosPequenos.slice(0, 25),
      repetidos: repetidos.slice(0, 15),
    };
  });
}

async function main(): Promise<void> {
  mkdirSync(DESTINO, { recursive: true });
  let browser: Browser | undefined;
  const tudo: Record<string, Medida> = {};
  try {
    browser = await chromium.launch();
    for (const cena of CENAS) {
      for (const w of LARGURAS) {
        const ctx = await browser.newContext({
          viewport: { width: w, height: alturaDe(w) },
          deviceScaleFactor: 1,
          reducedMotion: REDUZIDO ? "reduce" : "no-preference",
        });
        const page = await ctx.newPage();
        const url = cena.includes("=") ? `/?${cena}#/` : `/?cena=${cena}#/`;
        await page.goto(BASE + url, { waitUntil: "networkidle" });
        await page.waitForSelector(".org", { timeout: 10_000 });
        const m = await medir(page);
        const chave = `${cena.replace(/[^a-z0-9]/gi, "_")}-${w}`;
        await page.screenshot({
          path: join(DESTINO, `${chave}.png`),
          fullPage: PAGINA_INTEIRA,
        });
        tudo[chave] = m;
        const flag = [
          m.overflow ? "OVERFLOW" : "",
          m.colisoes.length > 0 ? `COLISOES:${m.colisoes.length}` : "",
          m.repetidos.length > 0 ? `REPETIDOS:${m.repetidos.length}` : "",
          m.menorFonte > 0 && m.menorFonte < 11 ? `MICRO:${m.menorFonte}px` : "",
          m.alvosPequenos.length > 0 ? `ALVO<44:${m.alvosPequenos.length}` : "",
        ]
          .filter((s) => s !== "")
          .join(" · ");
        console.log(
          `${chave.padEnd(26)} doc ${String(m.docWidth).padStart(5)}x${String(m.docHeight).padStart(6)}  ${flag || "limpo"}`,
        );
        await ctx.close();
      }
    }
  } finally {
    await browser?.close();
  }
  writeFileSync(join(DESTINO, "medidas.json"), JSON.stringify(tudo, null, 2) + "\n");
  console.log(`\n-> ${DESTINO}`);
}

void main();
