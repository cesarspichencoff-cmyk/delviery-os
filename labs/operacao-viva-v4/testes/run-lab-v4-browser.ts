/**
 * GATE DE NAVEGADOR DO LAB · OPERAÇÃO VIVA V4
 * ============================================================================
 * O gate determinístico prova COMPORTAMENTO sem navegador. Este prova o que só
 * o navegador consegue provar: que a página abre, que o teclado alcança tudo,
 * que a persistência local funciona de verdade, que nada de escrita sai para o
 * servidor e que `prefers-reduced-motion` é respeitado com a informação
 * intacta.
 *
 * O servidor sobe EM PROCESSO — o mesmo `criarServidor()` que `npm run ui:lab`
 * usa. Testar contra um segundo servidor "de teste" provaria o servidor de
 * teste.
 *
 * Os dez casos numerados do Modo de Validação são exigência literal do César
 * (2026-08-04) e estão marcados `[C1]`…`[C10]`.
 *
 * O que ele NÃO prova, e não adianta fingir: beleza, hierarquia e utilidade
 * numa sexta de pico. Isso é o avaliador independente e o César.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { BASE, criarServidor } from "../servidor/servidor";
import { IDS_DAS_CENAS } from "../fixtures/cenarios";
import { acharPII } from "../validacao/schema.js";

const raiz = process.cwd();

/** O diretório VERSIONADO. Este gate nunca escreve aqui — ver abaixo. */
const EVIDENCIAS_VERSIONADAS = join(raiz, "labs", "operacao-viva-v4", "evidencias");

/**
 * Onde as capturas e os arquivos temporários do gate são gravados.
 *
 * **Diretório temporário por padrão.** Antes o padrão era o diretório
 * VERSIONADO, e isso custou duas vezes: uma avaliação declarada read-only
 * modificou quatro PNGs rastreados, e depois o próprio gate apagou os 13
 * arquivos três vezes numa sessão só — porque limpava o diretório ANTES de
 * tentar abrir o navegador, e quando o navegador não abria o patrimônio já
 * tinha ido embora (D4).
 *
 * `LAB_V4_EVIDENCIAS` continua redirecionando para um caminho explícito,
 * porque avaliador independente precisa disso. O que mudou é que rodar um
 * teste deixou de ser um ato de escrita sobre patrimônio: sem a variável, o
 * gate grava num temporário e o **descarta** no fim.
 *
 * Atualizar a evidência versionada virou ato próprio e explícito:
 *
 *   npm run evidence:lab:v4:refresh
 *
 * É o único caminho que substitui o conjunto versionado, e substitui inteiro
 * ou não substitui nada.
 */
const EVID_DECLARADO = (process.env.LAB_V4_EVIDENCIAS ?? "").trim();

/**
 * A recusa que fecha o D4 na classe, em vez de só na ordem das linhas.
 *
 * Inverter `rmSync` e `launch()` conserta o sintoma. O defeito é que rodar o
 * gate normal podia, por padrão OU por variável, apontar para o patrimônio.
 * Aqui apontar para ele é **impossível**: comparação por caminho real, então
 * symlink e `..` não contornam.
 */
if (EVID_DECLARADO !== "") {
  const alvo = resolve(EVID_DECLARADO);
  const real = (c: string): string => (existsSync(c) ? realpathSync(c) : resolve(c));
  if (real(alvo) === real(EVIDENCIAS_VERSIONADAS)) {
    console.error(
      "LAB_V4_EVIDENCIAS aponta para o diretório VERSIONADO de evidências.\n" +
        "O gate de navegador não escreve em patrimônio rastreado. Para atualizar\n" +
        "a evidência versionada, use o ato explícito:\n\n" +
        "    npm run evidence:lab:v4:refresh\n",
    );
    process.exit(2);
  }
}

const EVID_E_TEMPORARIO = EVID_DECLARADO === "";
const EVID = EVID_E_TEMPORARIO
  ? mkdtempSync(join(tmpdir(), "lab-v4-evidencias-"))
  : resolve(EVID_DECLARADO);

/**
 * Executável de navegador alternativo, quando o avaliador tem o seu.
 *
 * Existe para que "qual build do Chromium" seja escolha DECLARADA de quem
 * roda, e não uma referência canônica que este repositório fixe sozinho. O
 * build usado entra no manifesto de procedência — medido, nunca presumido.
 */
const EXECUTAVEL = (process.env.LAB_V4_CHROMIUM ?? "").trim();
const PORTA = Number(process.env.LAB_V4_PORTA_TESTE ?? 5292);
const URLBASE = `http://127.0.0.1:${PORTA}${BASE}/`;

const VIEWPORTS = [
  { nome: "desktop", width: 1280, height: 800 },
  { nome: "tablet", width: 768, height: 1024 },
  { nome: "celular", width: 390, height: 844 },
] as const;

/** As cenas capturadas. Poucas de propósito — evidência, não álbum. */
const CENAS_CAPTURADAS = [
  "calma-real",
  "sushi-quentes-isolado",
  "ausencia-de-dados",
  "recomendacao-corrigida",
] as const;

let passaram = 0;
const falhas: string[] = [];
const capturas: string[] = [];

async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passaram += 1;
    console.log(`  ✓ ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.error(`  ✗ ${nome}`);
  }
}

/**
 * Erros de console que importam. Falha de favicon não é defeito de produto.
 *
 * A URL entra no julgamento porque o texto sozinho NÃO basta, e isso foi
 * medido: o Chrome completo pede `/favicon.ico` e o headless shell não pede.
 * Quando pede, a mensagem é só "Failed to load resource: the server responded
 * with a status of 404 (Not Found)" — sem a palavra `favicon`, que vive em
 * `location().url`. Um filtro que lesse só o texto reprovaria o gate conforme
 * o BUILD do navegador, e isso elegeria um build canônico por acidente.
 */
function erroMaterial(texto: string, url = ""): boolean {
  if (/favicon/i.test(texto) || /\/favicon\.ico(\?|$)/i.test(url)) return false;
  return true;
}

interface Aberta {
  readonly page: Page;
  readonly erros: string[];
  readonly escritas: string[];
}

async function abrir(
  ctx: BrowserContext,
  cena?: string,
): Promise<Aberta> {
  const page = await ctx.newPage();
  const erros: string[] = [];
  const escritas: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && erroMaterial(m.text(), m.location().url)) {
      erros.push(`${m.text()} [${m.location().url}]`);
    }
  });
  page.on("pageerror", (e) => erros.push(String(e)));
  // A trava do lado do cliente: nenhuma requisição de escrita deve nascer.
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.method() !== "HEAD") {
      escritas.push(`${r.method()} ${r.url()}`);
    }
  });
  await page.goto(cena ? `${URLBASE}?cena=${cena}` : URLBASE, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".unidade", { timeout: 10_000 });
  return { page, erros, escritas };
}

async function preencherEEnviar(page: Page, verdict: string): Promise<void> {
  const form = page.locator("form.validacao").first();
  await form.locator(`input[name="verdict"][value="${verdict}"]`).check();
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(
    (v) =>
      document.querySelector("form.validacao .validacao__estado")?.getAttribute("data-estado") ===
      v,
    verdictParaEstado(verdict),
    { timeout: 5000 },
  );
}

/**
 * Abre um bloco recolhível clicando no `summary` — como uma pessoa faria.
 *
 * Forçar `details.open = true` por script passaria mesmo se a revelação
 * estivesse quebrada, e aí os testes que dependem dela mediriam outra coisa.
 */
async function abrirBloco(page: Page, titulo: string): Promise<void> {
  const resumo = page.locator(".bloco__resumo", { hasText: titulo }).first();
  const detalhe = page.locator("details.bloco--recolhivel", { has: resumo }).first();
  if (await detalhe.evaluate((d) => (d as HTMLDetailsElement).open)) return;
  await resumo.click();
  await detalhe.locator(".bloco__corpo").first().waitFor({ state: "visible" });
}

function verdictParaEstado(v: string): string {
  return {
    CORRECT: "correto",
    PARTIALLY_CORRECT: "parcialmente_correto",
    INCORRECT: "incorreto",
    UNCONFIRMED: "nao_confirmado",
  }[v]!;
}

function requisitar(metodo: string, caminho: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: PORTA, method: metodo, path: caminho },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/* ================================================================== */

/**
 * Qual binário o Playwright REALMENTE sobe.
 *
 * `chromium.executablePath()` não serve, e isso foi medido: aqui ele devolve
 * `.../chromium-1228/chrome-linux64/chrome`, um arquivo que **não existe** —
 * porque `launch()` em headless usa o *headless shell*, outro caminho.
 * Registrar o que `executablePath()` diz seria anotar no manifesto um binário
 * que nunca rodou.
 *
 * `launchServer()` expõe o processo, e `spawnfile` é o arquivo que o sistema
 * operacional executou. É a mesma resolução que `launch()` faz — mesma
 * `chromium`, mesmas opções — só que observável.
 */
async function binarioReal(): Promise<{ pedido: string | null; real: string | null }> {
  if (EXECUTAVEL !== "") {
    try {
      return { pedido: EXECUTAVEL, real: realpathSync(EXECUTAVEL) };
    } catch {
      return { pedido: EXECUTAVEL, real: null };
    }
  }
  let servidor: Awaited<ReturnType<typeof chromium.launchServer>> | null = null;
  try {
    servidor = await chromium.launchServer();
    const pedido = servidor.process().spawnfile;
    let real: string | null = null;
    try {
      real = realpathSync(pedido);
    } catch {
      real = null;
    }
    return { pedido, real };
  } catch {
    return { pedido: null, real: null };
  } finally {
    if (servidor !== null) await servidor.close();
  }
}

/** O que a máquina consegue PROVAR sobre o navegador que acabou de abrir. */
async function procedenciaMedida(browser: Browser): Promise<Record<string, unknown>> {
  const { pedido, real } = await binarioReal();
  const build = real !== null ? basename(dirname(dirname(real))) : null;
  let playwright: string | null = null;
  try {
    playwright = String(
      (JSON.parse(readFileSync(require.resolve("playwright/package.json"), "utf8")) as {
        version?: string;
      }).version ?? "",
    ) || null;
  } catch {
    playwright = null;
  }
  // Mesmo padrão de `tools/carimbar_build.js`: o ambiente manda, o git é o
  // padrão, e ausente fica `null` — declaradamente desconhecido, nunca
  // inventado. Existe porque raiz sem `.git` (container, raiz de teste) não
  // deveria produzir manifesto sem identidade quando quem chamou a conhece.
  let commit: string | null = (process.env.DELIVERYOS_COMMIT ?? "").trim() || null;
  if (commit === null) {
    try {
      commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: raiz, encoding: "utf8" }).trim();
    } catch {
      commit = null;
    }
  }
  return {
    browser_provenance: "MEDIDO",
    gerado_por: "labs/operacao-viva-v4/testes/run-lab-v4-browser.ts",
    gerado_em: new Date().toISOString(),
    commit,
    playwright,
    chromium: {
      // Medida no navegador que rodou, não deduzida de caminho.
      versao_reportada: browser.version(),
      // O caminho que o Playwright pede e o arquivo que existe de verdade. Os
      // dois, porque podem divergir — e aqui divergem: o Playwright pede o
      // build `1228` e o arquivo por trás do symlink é o `1194`. Um manifesto
      // que guardasse só um dos dois esconderia exatamente essa diferença.
      executavel_pedido: pedido,
      executavel_real: real,
      // O diretório do build, que é onde o número real mora
      // (ex.: `chromium_headless_shell-1194`). Versão reportada e build são
      // coisas diferentes, e as duas ficam registradas.
      build_diretorio: build,
      divergencia_de_build: pedido !== null && real !== null && pedido !== real,
      escolhido_por: EXECUTAVEL !== "" ? "LAB_V4_CHROMIUM" : "padrao do Playwright",
    },
    plataforma: `${process.platform}-${process.arch}`,
    node: process.version,
    viewports: VIEWPORTS.map((v) => ({ nome: v.nome, width: v.width, height: v.height })),
    cenas: [...CENAS_CAPTURADAS],
    fixture: true,
    declaracao:
      "Todas as cenas sao FIXTURE. Nenhuma captura mostra operacao real e nenhuma contem PII.",
  };
}

async function principal(): Promise<void> {
  const servidor = criarServidor();
  await new Promise<void>((r) => servidor.listen(PORTA, "127.0.0.1", () => r()));

  let browser: Browser | null = null;
  // Medida enquanto o navegador está ABERTO — `browser.version()` não responde
  // depois do `close()`, e o `finally` fecha antes de o manifesto ser escrito.
  let procedencia: Record<string, unknown> | null = null;
  try {
    // O NAVEGADOR PRIMEIRO, e a ordem é o defeito D4 fechado.
    //
    // A versão anterior apagava e recriava o diretório de evidências ANTES
    // desta linha. Quando o `launch()` falhava — e falhou, por descompasso de
    // build do Playwright — os arquivos já tinham sido apagados e nada os
    // regenerava. Apagar antes da operação que pode falhar é o defeito; a
    // ordem abaixo é a correção mínima, e o diretório temporário acima é a
    // correção na classe.
    browser = await chromium.launch(EXECUTAVEL !== "" ? { executablePath: EXECUTAVEL } : {});
    procedencia = await procedenciaMedida(browser);

    rmSync(EVID, { recursive: true, force: true });
    mkdirSync(EVID, { recursive: true });

    /* ---------------- Carregamento e responsividade ---------------- */

    for (const v of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: v.width, height: v.height },
      });

      await teste(`[${v.nome}] a rota abre, sem erro material de console`, async () => {
        const { page, erros } = await abrir(ctx, "foco-com-secundarios");
        assert.deepEqual(erros, [], `erros no console: ${erros.join(" | ")}`);
        assert.equal(await page.locator(".unidade").count(), 6);
        await page.close();
      });

      await teste(`[${v.nome}] a página não rola na horizontal`, async () => {
        const { page } = await abrir(ctx, "ambiente-critico-persistente");
        const estoura = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        assert.equal(estoura, false, "o corpo da página rola na horizontal");
        await page.close();
      });

      await teste(`[${v.nome}] as capturas de evidência são geradas`, async () => {
        for (const cena of CENAS_CAPTURADAS) {
          const { page } = await abrir(ctx, cena);
          const arquivo = join(EVID, `${cena}--${v.nome}.png`);
          await page.screenshot({ path: arquivo, fullPage: true });
          capturas.push(`${cena}--${v.nome}.png`);
          await page.close();
        }
      });

      await ctx.close();
    }

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

    /* ---------------- Navegação e teclado ---------------- */

    await teste("a troca de cena redesenha a leitura inteira", async () => {
      const { page } = await abrir(ctx, "calma-real");
      const antes = await page.locator(".estado__titulo").innerText();
      await page.selectOption("#seletorCena", "ambiente-critico-persistente");
      await page.waitForFunction(
        () => document.querySelector(".estado__titulo")?.textContent === "Foco",
      );
      const depois = await page.locator(".estado__titulo").innerText();
      assert.equal(antes, "Em fluxo");
      assert.equal(depois, "Foco");
      await page.close();
    });

    await teste("as 18 cenas abrem sem erro de console", async () => {
      for (const id of IDS_DAS_CENAS) {
        const { page, erros } = await abrir(ctx, id);
        assert.deepEqual(erros, [], `${id}: ${erros.join(" | ")}`);
        await page.close();
      }
    });

    await teste("o teclado alcança o seletor, os campos e os botões", async () => {
      const { page } = await abrir(ctx, "foco-com-secundarios");
      const alcancados: string[] = [];
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press("Tab");
        alcancados.push(
          await page.evaluate(() => {
            const a = document.activeElement;
            if (!a) return "";
            const nome = a.getAttribute("name");
            return `${a.tagName.toLowerCase()}${nome ? `[${nome}]` : ""}`;
          }),
        );
      }
      assert.ok(alcancados.includes("a"), "o link de pular conteúdo não foi alcançado");
      assert.ok(alcancados.includes("select"), "o seletor de cena não foi alcançado");
      assert.ok(
        alcancados.some((x) => x.startsWith("input[verdict]")),
        "os vereditos de validação não foram alcançados pelo teclado",
      );
      await page.close();
    });

    await teste("o foco visível existe e não é herdado do navegador sem contorno", async () => {
      const { page } = await abrir(ctx, "calma-real");
      await page.locator("#seletorCena").focus();
      const contorno = await page.evaluate(() => {
        const e = document.querySelector("#seletorCena")!;
        const s = getComputedStyle(e);
        return `${s.outlineStyle}|${s.outlineWidth}`;
      });
      assert.ok(!contorno.startsWith("none"), `sem contorno de foco: ${contorno}`);
      await page.close();
    });

    /* ---------------- Estados de fonte e ausência ---------------- */

    await teste("os quatro cenários de fonte mostram o estado e a consequência", async () => {
      const esperado: Record<string, string> = {
        "fonte-atrasada": "atrasada",
        "fonte-indisponivel": "indisponivel",
        "fonte-divergente": "divergente",
        "ausencia-de-dados": "desconhecida",
      };
      for (const [cena, estado] of Object.entries(esperado)) {
        const { page } = await abrir(ctx, cena);

        // A TIRA fica sempre visível: recolher o detalhe não pode esconder a
        // saúde da fonte. É o par que impede a revelação progressiva de virar
        // ocultamento.
        const chip = page.locator(`.tira__item[data-estado="${estado}"]`).first();
        await chip.waitFor({ state: "visible" });
        assert.ok(
          await chip.isVisible(),
          `${cena}: a tira não mostra nenhuma fonte em "${estado}"`,
        );

        // E o detalhe, uma abertura de distância, carrega a consequência.
        await abrirBloco(page, "Saúde das fontes");
        const n = await page.locator(`.fonte[data-estado="${estado}"]`).count();
        assert.ok(n >= 1, `${cena}: nenhuma fonte em "${estado}" no detalhe`);
        const texto = await page.locator(".fonte").first().innerText();
        assert.match(texto, /NA LEITURA|Na leitura/);
        await page.close();
      }
    });

    await teste("ausência não vira zero na tela", async () => {
      const { page } = await abrir(ctx, "ausencia-de-dados");
      const pulso = await page.locator(".pulso__n").innerText();
      const rot = await page.locator(".pulso__rot").innerText();
      assert.equal(pulso, "—", `o pulso virou "${pulso}"`);
      assert.match(rot, /não observado/);
      const semMedicao = await page.locator('.unidade[data-degrau="0"]').count();
      assert.equal(semMedicao, 6, "alguma unidade se declarou medida sem fonte");
      await page.close();
    });

    await teste("o ambiente crítico secundário continua vermelho na tela", async () => {
      const { page } = await abrir(ctx, "ambiente-critico-persistente");
      const foco = await page.locator(".foco__eyebrow").innerText();
      assert.match(foco, /Sushi Quentes/);
      const cozinha = page.locator('.unidade[data-unidade="cozinha"]');
      assert.equal(await cozinha.getAttribute("data-degrau"), "3");
      // O painel de Foco não pode cobrir o caminho do pedido.
      assert.ok(await cozinha.isVisible());
      await page.close();
    });

    await teste("o Foco mostra confiança não estimada, sem número", async () => {
      const { page } = await abrir(ctx, "foco-com-secundarios");
      const texto = await page.locator(".foco").innerText();
      assert.match(texto, /Confiança: não estimada/);
      assert.ok(!/\bconfiança[^.]*\d+\s*%/i.test(texto), "apareceu percentual de confiança");
      assert.match(texto, /CONDIÇÃO DE RETIRADA/i);
      assert.match(texto, /VALIDADE/i);
      await page.close();
    });

    /* ---------------- Reduced motion ---------------- */

    await teste("prefers-reduced-motion zera animação sem perder informação", async () => {
      const normal = await browser!.newContext({ viewport: { width: 1280, height: 800 } });
      const reduzido = await browser!.newContext({
        viewport: { width: 1280, height: 800 },
        reducedMotion: "reduce",
      });
      const medir = async (c: BrowserContext) => {
        const { page } = await abrir(c, "sushi-quentes-isolado");
        const r = await page.evaluate(() => {
          let animando = 0;
          for (const e of document.querySelectorAll("*")) {
            const s = getComputedStyle(e);
            if (s.animationName !== "none" && s.animationDuration !== "0s") animando += 1;
          }
          return { animando, caracteres: (document.body.innerText || "").length };
        });
        await page.close();
        return r;
      };
      const a = await medir(normal);
      const b = await medir(reduzido);
      await normal.close();
      await reduzido.close();
      assert.ok(a.animando > 0, "a cena normal não anima nada — o controle não vale");
      assert.equal(b.animando, 0, `com reduced motion sobraram ${b.animando} animações`);
      assert.equal(
        a.caracteres,
        b.caracteres,
        "a contagem de caracteres mudou — alguma informação vive só no movimento",
      );
    });

    /* ---------------- Modo de Validação — os dez do César ---------------- */

    await teste("[C1] os quatro vereditos podem ser marcados", async () => {
      const { page } = await abrir(ctx, "calma-real");
      for (const v of ["CORRECT", "PARTIALLY_CORRECT", "INCORRECT", "UNCONFIRMED"]) {
        await preencherEEnviar(page, v);
        const est = await page
          .locator("form.validacao .validacao__estado")
          .first()
          .getAttribute("data-estado");
        assert.equal(est, verdictParaEstado(v), `veredito ${v} não virou estado`);
      }
      await abrirBloco(page, "Resumo do turno");
      await page.locator("#btnLimparTudo").click();
      await page.waitForTimeout(300);
      await page.close();
    });

    await teste("[C2] a validação persiste depois de recarregar", async () => {
      const { page } = await abrir(ctx, "risco-de-conferencia");
      await preencherEEnviar(page, "PARTIALLY_CORRECT");
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForSelector("form.validacao");
      const est = await page
        .locator("form.validacao .validacao__estado")
        .first()
        .getAttribute("data-estado");
      assert.equal(est, "parcialmente_correto", "a validação não sobreviveu à recarga");
      await page.close();
    });

    await teste("[C3] o resumo do turno acompanha o registro", async () => {
      const { page } = await abrir(ctx, "risco-de-conferencia");
      await abrirBloco(page, "Resumo do turno");
      const total = await page
        .locator('.resumo__item:has(.resumo__rot:text-is("Total avaliado")) .resumo__val')
        .innerText();
      assert.equal(total, "1", `o resumo diz ${total} com uma validação registrada`);
      await page.close();
    });

    await teste("[C4] corrigir uma validação existente não cria uma segunda", async () => {
      const { page } = await abrir(ctx, "risco-de-conferencia");
      const form = page.locator("form.validacao").first();
      await form.locator('input[name="correcoes"][value="fonte_desatualizada"]').check();
      await form.locator('input[name="verdict"][value="INCORRECT"]').check();
      await form.locator('button[type="submit"]').click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("form.validacao .validacao__estado")
            ?.getAttribute("data-estado") === "corrigido",
      );
      await abrirBloco(page, "Resumo do turno");
      const total = await page
        .locator('.resumo__item:has(.resumo__rot:text-is("Total avaliado")) .resumo__val')
        .innerText();
      assert.equal(total, "1", "corrigir empilhou um segundo registro");
      await page.close();
    });

    await teste("[C5] limpar apaga os registros locais", async () => {
      const { page } = await abrir(ctx, "risco-de-conferencia");
      await abrirBloco(page, "Resumo do turno");
      await page.locator("#btnLimparTudo").click();
      await page.waitForFunction(
        () =>
          document.querySelector(
            '.resumo__item:has(.resumo__rot) .resumo__val',
          ) !== null,
      );
      await page.waitForTimeout(400);
      const est = await page
        .locator("form.validacao .validacao__estado")
        .first()
        .getAttribute("data-estado");
      assert.equal(est, "nao_avaliado", "a validação sobreviveu à limpeza");
      await page.close();
    });

    await teste("[C6] dois contextos de navegador ficam isolados", async () => {
      const a = await browser!.newContext({ viewport: { width: 1280, height: 800 } });
      const b = await browser!.newContext({ viewport: { width: 1280, height: 800 } });
      const pa = await abrir(a, "duas-sacolas-sustentada");
      await preencherEEnviar(pa.page, "CORRECT");
      const pb = await abrir(b, "duas-sacolas-sustentada");
      const est = await pb.page
        .locator("form.validacao .validacao__estado")
        .first()
        .getAttribute("data-estado");
      assert.equal(est, "nao_avaliado", "a validação vazou entre contextos");
      await a.close();
      await b.close();
    });

    await teste("[C7] nenhuma requisição de escrita sai do cliente", async () => {
      const c = await browser!.newContext({ viewport: { width: 1280, height: 800 } });
      const { page, escritas } = await abrir(c, "recomendacao-validada");
      await preencherEEnviar(page, "CORRECT");
      await abrirBloco(page, "Resumo do turno");
      await page.locator("#btnLimparTudo").click();
      await page.waitForTimeout(400);
      assert.deepEqual(escritas, [], `o cliente emitiu escrita: ${escritas.join(" | ")}`);
      await c.close();
    });

    await teste("[C8] o servidor continua recusando tudo que não é GET/HEAD", async () => {
      for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
        assert.equal(await requisitar(m, `${BASE}/api/cenas`), 405, `${m} não deu 405`);
      }
      assert.equal(await requisitar("GET", `${BASE}/api/cenas`), 200);
      assert.equal(await requisitar("HEAD", `${BASE}/`), 200);
    });

    await teste("[C9] o arquivo exportado não contém PII", async () => {
      const c = await browser!.newContext({ viewport: { width: 1280, height: 800 } });
      const { page } = await abrir(c, "recomendacao-corrigida");
      const form = page.locator("form.validacao").first();
      await form.locator('input[name="verdict"][value="PARTIALLY_CORRECT"]').check();
      await form
        .locator('input[name="acao_mais_util"]')
        .fill("Repor o salmao antes de reforcar a bancada");
      await form.locator('button[type="submit"]').click();
      await page.waitForTimeout(500);

      await abrirBloco(page, "Resumo do turno");
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.locator("#btnExportar").click(),
      ]);
      const caminho = join(EVID, "exportacao-de-teste.json");
      await download.saveAs(caminho);
      const conteudo = readFileSync(caminho, "utf8");
      const pacote = JSON.parse(conteudo) as {
        registros: Record<string, unknown>[];
      };

      // A varredura usa a MESMA função do produto, e não uma regex reescrita
      // aqui. A primeira versão deste teste reaplicava o padrão de e-mail ao
      // arquivo inteiro e reprovava por causa de `versao_fixture:
      // "lab-v4-fixtures@1.0.0"` — um teste que não conhece o recorte do
      // produto mede outra coisa.
      assert.deepEqual(acharPII(pacote), [], "a exportação contém PII segundo o próprio Lab");

      // E o par direto: os campos que uma PESSOA digita, um por um, crus.
      const LIVRES = [
        "comentario",
        "correcao_texto",
        "acao_mais_util",
        "problema_nao_detectado",
      ];
      const PADROES = [
        /[\w.+-]+@[\w-]+\.[\w.-]+/,
        /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
        /\b(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/,
        /\b\d{5}-?\d{3}\b/,
      ];
      for (const r of pacote.registros) {
        for (const campo of LIVRES) {
          const v = r[campo];
          if (typeof v !== "string") continue;
          for (const p of PADROES) {
            assert.ok(!p.test(v), `PII no campo livre ${campo}: ${p}`);
          }
        }
      }

      assert.match(conteudo, /"autenticado":\s*false/);
      assert.match(conteudo, /"sincronizado":\s*false/);
      assert.match(conteudo, /"ator":\s*"LOCAL_ANONYMOUS_VALIDATOR"/);
      rmSync(caminho, { force: true });
      await c.close();
    });

    await teste("[C10] importação inválida e maliciosa é recusada", async () => {
      const c = await browser!.newContext({ viewport: { width: 1280, height: 800 } });
      const { page } = await abrir(c, "calma-real");
      const arquivo = join(EVID, "import-hostil.json");

      const casos = [
        {
          nome: "schema de outro produto",
          json: JSON.stringify({ schema: "outra-coisa@9", registros: [] }),
          motivo: /schema_desconhecido/,
          esperado: "schema_desconhecido",
        },
        {
          nome: "marcação executável",
          json: JSON.stringify({
            schema: "deliveryos-lab-validation-export@1",
            registros: [
              {
                schema: "deliveryos-lab-validation@1",
                validation_id: "x",
                scenario_id: "calma-real",
                reading_id: "calma-real::leitura",
                verdict: "CORRECT",
                correcoes: [],
                comentario: "<img src=x onerror=alert(1)>",
              },
            ],
          }),
          motivo: /conteudo_executavel/,
          esperado: "conteudo_executavel",
        },
        {
          nome: "dado pessoal",
          json: JSON.stringify({
            schema: "deliveryos-lab-validation-export@1",
            registros: [
              {
                schema: "deliveryos-lab-validation@1",
                validation_id: "x",
                scenario_id: "calma-real",
                reading_id: "calma-real::leitura",
                verdict: "CORRECT",
                correcoes: [],
                comentario: "avisar o cliente em joao@exemplo.com",
              },
            ],
          }),
          motivo: /pii_detectada/,
          esperado: "pii_detectada",
        },
      ];

      for (const caso of casos) {
        // Limpar o recado ANTES é obrigatório, e isto foi um defeito deste
        // próprio teste: a mensagem da recusa anterior ainda casava com
        // /recusada/, então a espera passava de imediato e o caso seguinte era
        // avaliado contra o texto velho.
        await page.evaluate(() => {
          document.querySelector("#recadoResumo")!.textContent = "";
        });
        writeFileSync(arquivo, caso.json);
        await abrirBloco(page, "Resumo do turno");
        await page.locator("#arquivoImport").setInputFiles(arquivo);
        await page.waitForFunction(
          (m: string) =>
            (document.querySelector("#recadoResumo")?.textContent ?? "").includes(m),
          caso.esperado,
          { timeout: 5000 },
        );
        const recado = await page.locator("#recadoResumo").innerText();
        assert.match(recado, caso.motivo, `${caso.nome}: recusa com motivo errado`);
        const total = await page
          .locator('.resumo__item:has(.resumo__rot:text-is("Total avaliado")) .resumo__val')
          .innerText();
        assert.equal(total, "0", `${caso.nome}: importou apesar de recusar`);
      }
      rmSync(arquivo, { force: true });
      await c.close();
    });

    await ctx.close();
  } finally {
    if (browser !== null) await browser.close();
    await new Promise<void>((r) => servidor.close(() => r()));
  }

  writeFileSync(
    join(EVID, "README.md"),
    [
      "# Evidências — Lab Operação Viva V4",
      "",
      "Capturas geradas pelo gate de navegador (`npm run test:lab:v4:browser`), com",
      "Playwright sobre o mesmo `criarServidor()` que `npm run ui:lab` usa. Todas as",
      "cenas são FIXTURE: nenhuma captura mostra operação real, e nenhuma contém PII.",
      "",
      "**O gate normal grava num diretório temporário e o descarta.** Este conjunto só",
      "chega ao diretório versionado pelo ato explícito `npm run evidence:lab:v4:refresh`,",
      "que substitui o conjunto inteiro ou não substitui nada.",
      "",
      "A procedência do navegador que produziu estas imagens está em `procedencia.json`.",
      "",
      `Viewports: ${VIEWPORTS.map((v) => `${v.nome} ${v.width}×${v.height}`).join(" · ")}`,
      "",
      ...capturas.sort().map((c) => `- \`${c}\``),
      "",
    ].join("\n"),
  );

  // O manifesto sai do processo que ABRIU o navegador. Quem publica não tem
  // como saber qual binário rodou, e adivinhar seria procedência inventada.
  if (procedencia !== null) {
    writeFileSync(
      join(EVID, "procedencia.json"),
      `${JSON.stringify({ manifesto_versao: 1, ...procedencia }, null, 2)}\n`,
    );
  }

  console.log(`\nNavegador: ${passaram} passaram, ${falhas.length} falharam`);
  // O caminho REAL, não o padrão. A primeira versão imprimia
  // `labs/operacao-viva-v4/evidencias/` fixo, e continuava dizendo isso mesmo
  // quando `LAB_V4_EVIDENCIAS` mandava as capturas para outro lugar — um log
  // que afirma onde gravou sem saber onde gravou.
  console.log(`Capturas: ${capturas.length} em ${EVID}`);
  console.log(`Diretório: ${EVID_E_TEMPORARIO ? "TEMPORARIO (sera descartado)" : "DECLARADO"}`);
  for (const f of falhas) console.error(`  ✗ ${f}`);

  // Descartar SÓ o que este processo criou. Um diretório que veio por
  // `LAB_V4_EVIDENCIAS` é de quem o passou, e apagá-lo repetiria o D4 com
  // outro nome.
  if (EVID_E_TEMPORARIO) rmSync(EVID, { recursive: true, force: true });

  if (falhas.length > 0) {
    console.error("\nLAB_V4_BROWSER_GATE_RED");
    process.exit(1);
  }
  console.log("\nLAB_V4_BROWSER_GATE_GREEN");
}

void principal().catch((e: unknown) => {
  console.error("falha ao executar o gate de navegador:", e);
  // Morrer não é desculpa para deixar lixo: o temporário é criado no carregamento
  // do módulo, antes de qualquer `try`, e o navegador que não abre passa por aqui.
  if (EVID_E_TEMPORARIO) rmSync(EVID, { recursive: true, force: true });
  process.exit(1);
});
