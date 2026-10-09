/**
 * Fontes CANONICAS do Sprint V2 (Spectral, Hanken Grotesk, IBM Plex Mono) no
 * navegador do TESTE, quando a rede nao alcanca o Google Fonts.
 *
 * O produto carrega as tres por `@import` do Google Fonts
 * (`src/entregas/ui/shared/tokens.css`). Num sandbox sem esse acesso, o
 * Chromium cai em fonte substituta: a captura deixa de mostrar o desenho, e
 * metrica de dobra/quebra muda. Com `PRODUCT_UI_FONTES=<dir>` — pacotes
 * `@fontsource/{spectral,hanken-grotesk,ibm-plex-mono}` extraidos em `<dir>` —
 * as duas origens do Google Fonts sao respondidas daqui, pelo Playwright. Nada
 * muda no produto; nenhuma fonte entra no repositorio (licenca OFL, baixada
 * para fora dele).
 *
 * E a captura sempre DIZ com que fonte foi feita (`fontesEmUso`).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Page } from "playwright";

const FAMILIAS: readonly (readonly [string, string])[] = [
  ["Spectral", "spectral"],
  ["Hanken Grotesk", "hanken-grotesk"],
  ["IBM Plex Mono", "ibm-plex-mono"],
];

function arquivosWoff2(dir: string): string[] {
  const achados: string[] = [];
  const andar = (d: string): void => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) andar(p);
      else if (n.endsWith(".woff2")) achados.push(p);
    }
  };
  andar(dir);
  return achados;
}

/** `@font-face` de cada familia/peso/estilo do subconjunto latino encontrado em `dir`. */
export function fontesLocais(dir: string): { css: string; arquivos: Map<string, string> } {
  const arquivos = new Map<string, string>();
  const regras: string[] = [];
  for (const caminho of arquivosWoff2(dir)) {
    const nome = caminho.split("/").pop()!;
    for (const [familia, slug] of FAMILIAS) {
      const m = new RegExp(`^${slug}-latin-(\\d{3})-(normal|italic)\\.woff2$`).exec(nome);
      if (!m) continue;
      arquivos.set(nome, caminho);
      regras.push(
        `@font-face{font-family:'${familia}';font-style:${m[2]};font-weight:${m[1]};font-display:block;src:url(https://fonts.gstatic.com/local/${nome}) format('woff2');}`,
      );
    }
  }
  return { css: regras.join("\n"), arquivos };
}

/**
 * Instala as rotas no contexto. Devolve `locais` quando serviu as fontes daqui,
 * `rede` quando nao havia diretorio (a pagina tenta o Google Fonts de verdade).
 */
export async function servirFontesCanonicas(ctx: BrowserContext, dir: string | undefined): Promise<"locais" | "rede"> {
  if (!dir || !existsSync(dir)) return "rede";
  const { css, arquivos } = fontesLocais(dir);
  if (arquivos.size === 0) return "rede";
  const cors = { "access-control-allow-origin": "*" };
  await ctx.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/css; charset=utf-8", headers: cors, body: css }),
  );
  await ctx.route("https://fonts.gstatic.com/local/**", (r) => {
    const nome = new URL(r.request().url()).pathname.split("/").pop() ?? "";
    const caminho = arquivos.get(nome);
    return caminho
      ? r.fulfill({ status: 200, contentType: "font/woff2", headers: cors, body: readFileSync(caminho) })
      : r.fulfill({ status: 404, headers: cors, body: "" });
  });
  return "locais";
}

/** Quais das tres familias o documento conseguiu carregar — a etiqueta honesta da captura. */
export async function fontesEmUso(page: Page): Promise<string> {
  const r = (await page.evaluate(`(async () => {
    await document.fonts.ready;
    return ${JSON.stringify(FAMILIAS.map(([f]) => f))}.map((f) => [f, document.fonts.check("16px '" + f + "'")]);
  })()`)) as [string, boolean][];
  const faltam = r.filter(([, ok]) => !ok).map(([f]) => f);
  return faltam.length === 0 ? "canonicas (Spectral, Hanken Grotesk, IBM Plex Mono)" : `SUBSTITUTAS — nao carregou: ${faltam.join(", ")}`;
}
