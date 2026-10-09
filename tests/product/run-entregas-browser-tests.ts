/**
 * Entregas no NAVEGADOR — o que so a tela renderizada prova.
 *
 * O servidor e o de verdade (`tools/product_system_server.ts`, sem banco). A
 * leitura do servidor e a fixture `entregas-fixture.ts` passada pela MESMA
 * `entregasVM()` do servidor; so o transporte de `/api/entregas` e
 * interceptado. Sem interceptacao, a tela mostra o caminho "sem banco".
 *
 * Uso:
 *   npx tsx tests/product/run-entregas-browser-tests.ts [--evidencias <dir>]
 * Chromium: PRODUCT_UI_CHROMIUM=<executavel> quando o do Playwright nao existe
 * (neste container: /opt/pw-browsers/chromium). Sem navegador: sai 78, BLOQUEADO
 * em voz alta — nunca verde.
 */

import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type http from "node:http";
import { chromium, type Browser, type Page } from "playwright";

import { entregasVM } from "../../src/product/viewmodels/entregas-vm";
import { montarEntregasDemo } from "../../src/product/demo/seed-demonstracao";
import { AGORA_FIXTURE, realidadeFixture } from "./entregas-fixture";
import { fontesEmUso, servirFontesCanonicas } from "./fontes-canonicas";

delete process.env.DELIVERYOS_DATABASE_URL;

const argEvid = process.argv.indexOf("--evidencias");
const EVIDENCIAS = argEvid > 0 ? resolve(process.argv[argEvid + 1] ?? "") : "";
if (EVIDENCIAS) mkdirSync(EVIDENCIAS, { recursive: true });

let passaram = 0;
const falhas: string[] = [];
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message.split("\n").slice(0, 3).join(" | ") : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

const VIEWPORTS = {
  celular: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

async function vmJson(unidade: string | null): Promise<string> {
  const f = await montarEntregasDemo();
  const vm = (entregasVM as unknown as (...a: unknown[]) => unknown)(
    await f.snapshot(),
    AGORA_FIXTURE,
    f.getPolicyMaxStops(),
    { disponivel: true, realidade: realidadeFixture() },
    { unidade },
  );
  return JSON.stringify(vm);
}

/**
 * Contraste AA calculado NA PAGINA, sobre a cor composta (alfa sobre o fundo
 * efetivo). Em texto puro de proposito: o tsx injeta `__name` em funcoes
 * nomeadas, e esse helper nao existe dentro do navegador.
 */
const CONTRASTE_AA = `(() => {
            const rgb = (c) => {
              const m = c.match(/rgba?\\(([^)]+)\\)/);
              if (!m) return null;
              const p = m[1].split(",").map((x) => Number.parseFloat(x));
              return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
            };
            const lum = (c) => {
              const f = (v) => {
                const s = v / 255;
                return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
              };
              return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
            };
            const fundo = (el) => {
              const pilha = [];
              for (let e = el; e; e = e.parentElement) {
                const b = rgb(getComputedStyle(e).backgroundColor);
                if (b && b[3] > 0) pilha.push(b);
                if (b && b[3] === 1) break;
              }
              let cor = [255, 255, 255];
              for (const b of pilha.reverse()) {
                const al = b[3];
                cor = [0, 1, 2].map((i) => b[i] * al + cor[i] * (1 - al));
              }
              return cor;
            };
            const fora = [];
            const raiz = document.querySelector('[data-territorio="rua"]');
            if (!raiz) return ["sem territorio da rua"];
            for (const el of raiz.querySelectorAll("*")) {
              const temTexto = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
              if (!temTexto) continue;
              const cs = getComputedStyle(el);
              if (cs.visibility === "hidden" || cs.display === "none" || el.offsetParent === null) continue;
              if (el.closest(".sr-only")) continue;
              const c = rgb(cs.color);
              if (!c) continue;
              const f = fundo(el);
              const al = c[3];
              const cor = [0, 1, 2].map((i) => c[i] * al + f[i] * (1 - al));
              const l1 = lum(cor);
              const l2 = lum(f);
              const razao = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
              const px = Number.parseFloat(cs.fontSize);
              const grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
              if (razao < (grande ? 3 : 4.5)) fora.push(\`\${razao.toFixed(2)} \${el.tagName.toLowerCase()}.\${el.className} "\${(el.textContent ?? "").trim().slice(0, 40)}"\`);
            }
            return fora;
          })()`;

interface Abertura {
  page: Page;
  pedidos: string[];
  erros: string[];
  fechar: () => Promise<void>;
}

async function abrir(
  browser: Browser,
  base: string,
  o: { viewport: { width: number; height: number }; comLeitura: boolean; reduzido?: boolean; relogio?: boolean; hash?: string },
): Promise<Abertura> {
  const ctx = await browser.newContext({ viewport: o.viewport, reducedMotion: o.reduzido ? "reduce" : "no-preference" });
  await servirFontesCanonicas(ctx, process.env.PRODUCT_UI_FONTES);
  const page = await ctx.newPage();
  const pedidos: string[] = [];
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon/i.test(m.text()) && !/404 \(Not Found\)/.test(m.text())) erros.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() === 404 && !/favicon/.test(r.url())) erros.push(`404 ${r.url()}`);
  });
  if (o.comLeitura) {
    await page.route("**/api/entregas**", async (rota) => {
      const u = new URL(rota.request().url());
      pedidos.push(u.search);
      await rota.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: await vmJson(u.searchParams.get("unidade")) });
    });
  } else {
    page.on("request", (r) => {
      if (r.url().includes("/api/entregas")) pedidos.push(new URL(r.url()).search);
    });
  }
  if (o.relogio) await page.clock.install({ time: new Date(AGORA_FIXTURE) });
  await page.goto(`${base}/${o.hash ?? "#/entregas"}`);
  await page.waitForSelector("#superficie[aria-busy='false'] > *", { timeout: 15000 });
  return { page, pedidos, erros, fechar: () => ctx.close() };
}

let fontesAnunciadas = false;
async function evidencia(page: Page, nome: string): Promise<void> {
  if (!EVIDENCIAS) return;
  if (!fontesAnunciadas) {
    fontesAnunciadas = true;
    console.log(`      capturas com fontes ${await fontesEmUso(page)}`);
  }
  await page.screenshot({ path: join(EVIDENCIAS, `${nome}-dobra.png`) });
  await page.screenshot({ path: join(EVIDENCIAS, `${nome}-inteira.png`), fullPage: true });
}

void (async () => {
  let browser: Browser;
  try {
    browser = await chromium.launch(process.env.PRODUCT_UI_CHROMIUM ? { executablePath: process.env.PRODUCT_UI_CHROMIUM } : {});
  } catch (e) {
    console.error(`BLOQUEADO: Chromium nao abriu (${e instanceof Error ? e.message.split("\n")[0] : String(e)}).`);
    console.error("Defina PRODUCT_UI_CHROMIUM. Nenhum teste de navegador rodou — isto nao e verde.");
    process.exit(78);
  }
  const { criarServidor } = await import("../../tools/product_system_server");
  const servidor: http.Server = await criarServidor();
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const endereco = servidor.address();
  const base = `http://127.0.0.1:${typeof endereco === "object" && endereco ? endereco.port : 0}`;
  console.log(`\nENTREGAS NO NAVEGADOR — ${browser.version()} · ${base}`);

  try {
    await teste("N1 a primeira dobra e da leitura da rua (celular e desktop)", async () => {
      for (const [nome, viewport] of Object.entries(VIEWPORTS)) {
        const a = await abrir(browser, base, { viewport, comLeitura: true });
        try {
          const titulo = a.page.locator('[data-territorio="rua"] [data-titulo-da-leitura]');
          assert.equal(await titulo.count(), 1, `${nome}: sem titulo da leitura`);
          const caixa = await titulo.boundingBox();
          assert.ok(caixa && caixa.y + caixa.height <= viewport.height, `${nome}: o titulo da leitura esta fora da primeira dobra (${caixa?.y})`);
          assert.match((await titulo.innerText()).trim(), /viagens na rua/);
          await evidencia(a.page, `leitura-${nome}`);
          assert.deepEqual(a.erros, [], `${nome}: erros no console`);
        } finally {
          await a.fechar();
        }
      }
    });

    await teste("N1b sem banco: o estado tecnico ocupa a dobra, e a demonstracao vem depois", async () => {
      for (const [nome, viewport] of Object.entries(VIEWPORTS)) {
        const a = await abrir(browser, base, { viewport, comLeitura: false });
        try {
          const tecnico = a.page.locator('[data-territorio="rua"][data-solidez="interrompida"] [data-titulo-da-leitura]');
          assert.equal(await tecnico.count(), 1, `${nome}: sem estado tecnico`);
          const caixa = await tecnico.boundingBox();
          assert.ok(caixa && caixa.y + caixa.height <= viewport.height, `${nome}: estado tecnico fora da dobra`);
          const demo = await a.page.locator('[data-territorio="demonstracao"]').boundingBox();
          assert.ok(demo && caixa && demo.y > caixa.y, `${nome}: a demonstracao veio antes`);
          await evidencia(a.page, `sem-banco-${nome}`);
          assert.deepEqual(a.erros, [], `${nome}: erros no console`);
        } finally {
          await a.fechar();
        }
      }
    });

    await teste("N2 nenhuma rolagem lateral de 320 a 1440", async () => {
      for (const largura of [320, 390, 768, 1024, 1440]) {
        const a = await abrir(browser, base, { viewport: { width: largura, height: 800 }, comLeitura: true });
        try {
          const larg = await a.page.evaluate(() => document.documentElement.scrollWidth);
          assert.ok(larg <= largura, `${largura}px: a pagina tem ${larg}px de largura`);
        } finally {
          await a.fechar();
        }
      }
    });

    await teste("N3 teclado: o filtro de unidade e alcancavel, troca a leitura e devolve o foco a unidade escolhida", async () => {
      const a = await abrir(browser, base, { viewport: VIEWPORTS.desktop, comLeitura: true });
      try {
        let achou = false;
        for (let i = 0; i < 80; i += 1) {
          await a.page.keyboard.press("Tab");
          const href = await a.page.evaluate(() => (document.activeElement as HTMLAnchorElement | null)?.getAttribute("href") ?? "");
          if (href === "#/entregas?unidade=ITAIM") {
            achou = true;
            break;
          }
        }
        assert.ok(achou, "o filtro ITAIM nao e alcancavel pelo teclado");
        await Promise.all([
          a.page.waitForRequest((r) => r.url().includes("/api/entregas") && r.url().includes("unidade=ITAIM"), { timeout: 8000 }),
          a.page.keyboard.press("Enter"),
        ]);
        await a.page.waitForFunction(() => document.querySelector("[data-titulo-da-leitura]")?.textContent?.includes("em ITAIM"), undefined, { timeout: 8000 });
        const foco = await a.page.evaluate(() => ({
          href: document.activeElement?.getAttribute("href"),
          atual: document.activeElement?.getAttribute("aria-current"),
        }));
        assert.deepEqual(foco, { href: "#/entregas?unidade=ITAIM", atual: "true" }, "o foco se perdeu na troca de unidade");
      } finally {
        await a.fechar();
      }
    });

    await teste("N4 a leitura envelhece na tela: idade sobe e a linha de sinal declara leitura antiga", async () => {
      const a = await abrir(browser, base, { viewport: VIEWPORTS.celular, comLeitura: true, relogio: true });
      try {
        const rua = a.page.locator('[data-territorio="rua"]');
        assert.equal(await rua.getAttribute("data-envelhecida"), "nao");
        await a.page.clock.fastForward(6 * 60 * 1000);
        await a.page.waitForFunction(() => document.querySelector('[data-territorio="rua"]')?.getAttribute("data-envelhecida") === "sim", undefined, { timeout: 8000 });
        assert.match(await a.page.locator("[data-idade-da-leitura]").innerText(), /6 min/);
        assert.ok(await a.page.getByText("Esta leitura nao e a mais recente").isVisible(), "a ressalva da leitura antiga nao apareceu");
        await evidencia(a.page, "leitura-envelhecida-celular");
      } finally {
        await a.fechar();
      }
    });

    await teste("N5 reler busca de novo (GET) e zera a idade da leitura", async () => {
      const a = await abrir(browser, base, { viewport: VIEWPORTS.desktop, comLeitura: true, relogio: true });
      try {
        await a.page.clock.fastForward(4 * 60 * 1000);
        const antes = a.pedidos.length;
        await Promise.all([
          a.page.waitForRequest((r) => r.url().includes("/api/entregas") && r.method() === "GET", { timeout: 8000 }),
          a.page.locator("[data-reler]").first().click({ timeout: 5000 }),
        ]);
        await a.page.waitForFunction(() => document.querySelector('[data-territorio="rua"]')?.getAttribute("data-envelhecida") === "nao", undefined, { timeout: 8000 });
        assert.ok(a.pedidos.length > antes, "reler nao buscou");
      } finally {
        await a.fechar();
      }
    });

    await teste("N6 movimento reduzido: nada anima", async () => {
      const a = await abrir(browser, base, { viewport: VIEWPORTS.desktop, comLeitura: true, reduzido: true });
      try {
        const rodando = await a.page.evaluate(() => document.getAnimations().filter((x) => x.playState === "running").length);
        assert.equal(rodando, 0);
      } finally {
        await a.fechar();
      }
    });

    await teste("N7 contraste AA de todo texto do territorio da rua", async () => {
      for (const [nome, viewport] of Object.entries(VIEWPORTS)) {
        const a = await abrir(browser, base, { viewport, comLeitura: true });
        try {
          const reprovados = (await a.page.evaluate(CONTRASTE_AA)) as string[];
          assert.deepEqual(reprovados, [], `${nome}: contraste abaixo de AA`);
        } finally {
          await a.fechar();
        }
      }
    });

    await teste("N8 hierarquia de titulos sem salto e alvo de toque minimo nos controles da leitura", async () => {
      const a = await abrir(browser, base, { viewport: VIEWPORTS.celular, comLeitura: true });
      try {
        const niveis = await a.page.evaluate(() => [...document.querySelectorAll("#superficie h1, #superficie h2, #superficie h3, #superficie h4")].map((h) => Number(h.tagName[1])));
        assert.equal(niveis[0], 1, "a superficie nao comeca por h1");
        for (let i = 1; i < niveis.length; i += 1) {
          assert.ok(niveis[i]! <= niveis[i - 1]! + 1, `salto de h${niveis[i - 1]} para h${niveis[i]}`);
        }
        const controles = await a.page.locator('[data-territorio="rua"] a, [data-territorio="rua"] button').count();
        assert.ok(controles > 0, "a leitura da rua nao tem nenhum controle (filtro, reler)");
        const pequenos = await a.page.evaluate(() =>
          [...document.querySelectorAll('[data-territorio="rua"] a, [data-territorio="rua"] button')]
            .map((el) => ({ t: (el.textContent ?? "").trim().slice(0, 30), r: el.getBoundingClientRect() }))
            .filter((x) => x.r.width > 0 && (x.r.height < 44 || x.r.width < 44))
            .map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`),
        );
        assert.deepEqual(pequenos, [], "controle menor que 44px");
      } finally {
        await a.fechar();
      }
    });
    await teste("N9 inspetor recolhido nao vaza pixel nem recebe foco de teclado", async () => {
      for (const comLeitura of [true, false]) {
        const a = await abrir(browser, base, { viewport: VIEWPORTS.desktop, comLeitura });
        try {
          const vazando = await a.page.evaluate(() =>
            [...document.querySelectorAll('.inspetor__corpo[data-aberto="nao"]')]
              .map((el) => ({ id: el.id, h: el.getBoundingClientRect().height }))
              .filter((x) => x.h > 1)
              .map((x) => `${x.id} ${Math.round(x.h)}px`),
          );
          assert.deepEqual(vazando, [], `${comLeitura ? "com" : "sem"} leitura: corpo recolhido ocupa altura visivel`);
          const escondidos: string[] = [];
          for (let i = 0; i < 160; i += 1) {
            await a.page.keyboard.press("Tab");
            const dentro = await a.page.evaluate(() => {
              const el = document.activeElement;
              const corpo = el?.closest('.inspetor__corpo[data-aberto="nao"]');
              return corpo ? `${corpo.id} > ${(el?.textContent ?? "").trim().slice(0, 30)}` : null;
            });
            if (dentro) escondidos.push(dentro);
          }
          assert.deepEqual(escondidos, [], `${comLeitura ? "com" : "sem"} leitura: o teclado entrou em conteudo recolhido`);
        } finally {
          await a.fechar();
        }
      }
    });
    await teste("N10 a correcao e de CLASSE: nenhuma superficie rola de lado (320 a 1920) e nenhum inspetor recolhido vaza ou recebe foco", async () => {
      const problemas: string[] = [];
      for (const rota of ["#/", "#/operacao-viva", "#/conference-brain", "#/copiloto", "#/entregas"]) {
        for (const largura of [320, 390, 768, 1024, 1440, 1920]) {
          const a = await abrir(browser, base, { viewport: { width: largura, height: 900 }, comLeitura: rota === "#/entregas", hash: rota });
          try {
            const r = await a.page.evaluate(() => ({
              larg: document.documentElement.scrollWidth,
              vazando: [...document.querySelectorAll('.inspetor__corpo[data-aberto="nao"]')].filter((el) => el.getBoundingClientRect().height > 1).length,
              focaveis: [...document.querySelectorAll('.inspetor__corpo[data-aberto="nao"] a, .inspetor__corpo[data-aberto="nao"] button')].filter(
                (el) => getComputedStyle(el).visibility !== "hidden",
              ).length,
            }));
            if (r.larg > largura) problemas.push(`${rota} ${largura}px: documento com ${r.larg}px`);
            if (r.vazando) problemas.push(`${rota} ${largura}px: ${r.vazando} inspetor(es) recolhido(s) com altura visivel`);
            if (r.focaveis) problemas.push(`${rota} ${largura}px: ${r.focaveis} controle(s) visivel(is) dentro de inspetor recolhido`);
            if (a.erros.length) problemas.push(`${rota} ${largura}px: ${a.erros.join(" | ")}`);
          } finally {
            await a.fechar();
          }
        }
      }
      assert.deepEqual(problemas, []);
    });

    // A MOLDURA (faixa de topo, selo do shell, unidade ativa) e a primeira coisa
    // legivel. Sobre uma leitura do servidor ela nao pode dizer "SOMENTE
    // DEMONSTRACAO" nem "unidade ativa: demo-unit" — seria a moldura desmentindo
    // a tela. O esperado vem da propria view model, nunca escrito a mao.
    const PROCEDENCIAS = ["real", "simulado", "controle", "controle_positivo_sintetico"];
    const moldura = (page: Page) =>
      page.evaluate(() => {
        const sel = document.querySelector("#seletorUnidade") as HTMLElement | null;
        return {
          selos: [...document.querySelectorAll("#conexaoShell [data-estado]")].map((e) => (e as HTMLElement).dataset.estado ?? ""),
          unidade: (document.querySelector("#unidadeAtiva")?.textContent ?? "").trim(),
          seletorVisivel: Boolean(sel && sel.getClientRects().length > 0 && getComputedStyle(sel).visibility !== "hidden"),
        };
      });

    await teste("N11 a moldura nao desmente a leitura: selo de procedencia dos fatos, unidade da leitura, sem seletor que nao age", async () => {
      const esperado = (JSON.parse(await vmJson(null)) as { leitura: { selos: { estado: string }[] } }).leitura.selos
        .map((s) => s.estado)
        .filter((e) => PROCEDENCIAS.includes(e));
      assert.ok(esperado.length > 0, "a fixture perdeu o modo dos fatos");
      for (const viewport of [{ width: 320, height: 800 }, VIEWPORTS.celular, VIEWPORTS.desktop]) {
        const a = await abrir(browser, base, { viewport, comLeitura: true });
        try {
          const m = await moldura(a.page);
          assert.deepEqual(m.selos, esperado, `${viewport.width}px: o selo do shell nao e a procedencia da leitura`);
          assert.doesNotMatch(m.unidade, /demo-unit/i, `${viewport.width}px: a moldura diz a unidade da demonstracao sobre a leitura`);
          assert.match(m.unidade, /leitura/i);
          assert.match(m.unidade, /todas/i);
          assert.equal(m.seletorVisivel, false, `${viewport.width}px: o seletor da demonstracao segue na tela e nao age sobre a leitura`);
          // Selo e marca nao se pintam um sobre o outro (medido em 320px no M1B-R2).
          const sobrepostos = await a.page.evaluate(() => {
            const r1 = document.querySelector(".shell__marca strong")?.getBoundingClientRect();
            const r2 = document.querySelector("#conexaoShell")?.getBoundingClientRect();
            if (!r1 || !r2) return "sem marca ou sem selo";
            return r1.right > r2.left && r2.right > r1.left && r1.bottom > r2.top && r2.bottom > r1.top ? "sobrepostos" : "";
          });
          assert.equal(sobrepostos, "", `${viewport.width}px: marca e selo`);
          if (viewport.width === 390) {
            await a.page.evaluate(() => {
              window.location.hash = "#/entregas?unidade=ITAIM";
            });
            await a.page.waitForFunction(() => document.querySelector("[data-titulo-da-leitura]")?.textContent?.includes("em ITAIM"), undefined, { timeout: 8000 });
            assert.match((await moldura(a.page)).unidade, /ITAIM/, "a unidade da moldura nao seguiu o filtro");
            await a.page.evaluate(() => {
              window.location.hash = "#/operacao-viva";
            });
            await a.page.waitForFunction(() => !document.querySelector('[data-territorio="rua"]') && document.querySelector("#superficie")?.getAttribute("aria-busy") === "false", undefined, { timeout: 8000 });
            const fora = await moldura(a.page);
            assert.deepEqual(fora.selos, ["somente_demonstracao"], "fora da leitura a moldura deixou de dizer demonstracao");
            assert.match(fora.unidade, /demo-unit/i);
            assert.equal(fora.seletorVisivel, true, "o seletor nao voltou onde ele age");
          }
          assert.deepEqual(a.erros, [], `${viewport.width}px: erros no console`);
        } finally {
          await a.fechar();
        }
      }
    });

    await teste("N11b controle: sem leitura, a moldura continua dizendo demonstracao", async () => {
      const a = await abrir(browser, base, { viewport: VIEWPORTS.celular, comLeitura: false });
      try {
        const m = await moldura(a.page);
        assert.deepEqual(m.selos, ["somente_demonstracao"]);
        assert.match(m.unidade, /demo-unit/i);
        assert.equal(m.seletorVisivel, true);
      } finally {
        await a.fechar();
      }
    });

    // Reler leva o tempo da porta: medido, 2,5 s com 100 mil fatos e 8 s com 300
    // mil. A leitura anterior se declara (hora e idade, D95) e continua sendo
    // informacao enquanto a nova nao chega — esqueleto no lugar dela e tela
    // morta; erro no lugar dela apaga o que se sabia.
    await teste("N13 reler nao apaga a leitura: a anterior fica, declarada 'relendo', ate a nova chegar", async () => {
      const a = await abrir(browser, base, { viewport: VIEWPORTS.celular, comLeitura: true });
      try {
        const titulo = a.page.locator("[data-titulo-da-leitura]");
        const antes = await titulo.innerText();
        let liberar: () => void = () => undefined;
        const segurar = new Promise<void>((r) => {
          liberar = r;
        });
        await a.page.route("**/api/entregas**", async (rota) => {
          await segurar;
          await rota.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: await vmJson(null) });
        });
        await a.page.locator("[data-reler]").first().click();
        await a.page.waitForFunction(() => document.querySelector('[data-territorio="rua"]')?.getAttribute("data-relendo") === "sim", undefined, { timeout: 5000 });
        // Sem aria-busy na regiao: dentro dela o leitor de tela pode calar o aviso.
        assert.equal(await a.page.locator('[data-territorio="rua"][aria-busy="true"]').count(), 0);
        assert.equal(await titulo.innerText(), antes, "a leitura anterior sumiu enquanto relia");
        assert.equal(await a.page.locator("#superficie .skeleton").count(), 0, "esqueleto no lugar da leitura");
        assert.match(await a.page.locator("[data-releitura]").innerText(), /relendo/i);
        liberar();
        await a.page.waitForFunction(() => document.querySelector('[data-territorio="rua"]')?.getAttribute("data-relendo") !== "sim", undefined, { timeout: 8000 });
        assert.equal((await a.page.locator("[data-releitura]").innerText()).trim(), "", "o aviso de releitura ficou depois da chegada");
        assert.equal(await a.page.evaluate(() => document.activeElement?.hasAttribute("data-reler") ?? false), true, "o foco nao voltou ao botao");
      } finally {
        await a.fechar();
      }
    });

    await teste("N13b reler que falha nao apaga a leitura: a anterior fica, a falha escrita, e ela segue envelhecendo", async () => {
      const a = await abrir(browser, base, { viewport: VIEWPORTS.desktop, comLeitura: true, relogio: true });
      try {
        const titulo = a.page.locator("[data-titulo-da-leitura]");
        const antes = await titulo.innerText();
        const eyebrow = await a.page.locator(".rua__eyebrow").first().innerText();
        const hora = /as (\d{2}h\d{2})/.exec(eyebrow)?.[1];
        assert.ok(hora, `a camada tecnica nao diz a hora da leitura: ${eyebrow}`);
        await a.page.route("**/api/entregas**", (rota) =>
          rota.fulfill({ status: 503, contentType: "application/json; charset=utf-8", body: '{"erro":"indisponivel"}' }),
        );
        await a.page.locator("[data-reler]").first().click();
        await a.page.waitForFunction(() => /nao foi possivel ler de novo/i.test(document.querySelector("[data-releitura]")?.textContent ?? ""), undefined, { timeout: 8000 });
        assert.equal(await titulo.innerText(), antes, "a releitura que falhou apagou a leitura anterior");
        const falha = await a.page.locator("[data-releitura]").innerText();
        assert.ok(falha.includes(hora!), "a falha nao diz de quando e a leitura que ficou");
        assert.ok(falha.includes("503"), "a falha nao diz o que o servidor respondeu");
        assert.equal(falha.includes("/api/"), false, "a falha expoe o caminho interno da API");
        await a.page.clock.fastForward(6 * 60 * 1000);
        await a.page.waitForFunction(() => document.querySelector('[data-territorio="rua"]')?.getAttribute("data-envelhecida") === "sim", undefined, { timeout: 8000 });
        // O texto que so aparece na leitura antiga e na falha tambem passa por AA.
        assert.ok(await a.page.getByText("Esta leitura nao e a mais recente").isVisible());
        const reprovados = (await a.page.evaluate(CONTRASTE_AA)) as string[];
        assert.deepEqual(reprovados, [], "contraste abaixo de AA na leitura antiga com falha de releitura");
      } finally {
        await a.fechar();
      }
    });

    await teste("N12 a saude do servidor declara a composicao: sem banco, so demonstracao", async () => {
      const r = await fetch(`${base}/api/health`);
      const s = (await r.json()) as { demo?: unknown; leitura_do_servidor?: unknown; banner?: unknown };
      assert.equal(s.demo, true);
      assert.equal(s.leitura_do_servidor, false, "a saude nao declara se ha leitura do servidor");
      assert.equal(s.banner, "AMBIENTE DE DEMONSTRACAO · DELIVERYOS PRODUCT SYSTEM");
    });
  } finally {
    await browser.close();
    await new Promise<void>((r) => servidor.close(() => r()));
  }

  if (falhas.length) {
    console.error(`\nENTREGAS_BROWSER: ${passaram}/${passaram + falhas.length} PASS`);
    for (const f of falhas) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\nENTREGAS_BROWSER: ${passaram}/${passaram} PASS`);
})();
