/**
 * Acessibilidade AUTOMATICA em todas as rotas do Product System (axe-core).
 *
 * Por que todas, e nao so a tocada (L61): medir contraste so no territorio
 * novo deixou passar um defeito da rota INICIAL no celular — a barra inferior
 * da Home a 2,13:1, presente desde antes da missao — e um da propria missao,
 * que so aparecia sem banco (a faixa de demonstracao a 4,38:1).
 *
 * O axe-core NAO e dependencia do repositorio: o CI baixa uma versao fixa,
 * confere o sha256 e passa o caminho do `axe.min.js` por PRODUCT_UI_AXE. Sem
 * ele: sai 78, BLOQUEADO em voz alta — nunca verde.
 *
 * Uso:
 *   PRODUCT_UI_AXE=<axe.min.js> [PRODUCT_UI_CHROMIUM=<executavel>] \
 *     npx tsx tests/product/run-a11y-axe-tests.ts
 */

import { existsSync } from "node:fs";
import type http from "node:http";
import { chromium, type Browser } from "playwright";

import { entregasVM } from "../../src/product/viewmodels/entregas-vm";
import { montarEntregasDemo } from "../../src/product/demo/seed-demonstracao";
import { AGORA_FIXTURE, realidadeFixture } from "./entregas-fixture";

delete process.env.DELIVERYOS_DATABASE_URL;

const AXE = (process.env.PRODUCT_UI_AXE ?? "").trim();
if (!AXE || !existsSync(AXE)) {
  console.error("BLOQUEADO: PRODUCT_UI_AXE ausente ou inexistente. Nenhuma auditoria rodou — isto nao e verde.");
  process.exit(78);
}

const ROTAS = ["#/", "#/entregas", "#/operacao-viva", "#/conference-brain", "#/copiloto"] as const;
const LARGURAS = [390, 1440] as const;

interface Violacao {
  id: string;
  impact: string | null;
  n: number;
  alvo: string[];
}

void (async () => {
  let browser: Browser;
  try {
    browser = await chromium.launch(process.env.PRODUCT_UI_CHROMIUM ? { executablePath: process.env.PRODUCT_UI_CHROMIUM } : {});
  } catch (e) {
    console.error(`BLOQUEADO: Chromium nao abriu (${e instanceof Error ? e.message.split("\n")[0] : String(e)}).`);
    process.exit(78);
  }
  const { criarServidor } = await import("../../tools/product_system_server");
  const servidor: http.Server = await criarServidor();
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const endereco = servidor.address();
  const base = `http://127.0.0.1:${typeof endereco === "object" && endereco ? endereco.port : 0}`;

  // A leitura do servidor pela MESMA entregasVM, so com o transporte trocado.
  const f = await montarEntregasDemo();
  const corpoLeitura = JSON.stringify(
    (entregasVM as unknown as (...a: unknown[]) => unknown)(
      await f.snapshot(),
      AGORA_FIXTURE,
      f.getPolicyMaxStops(),
      { disponivel: true, realidade: realidadeFixture({ ocorrencias: true }) },
      { unidade: null },
    ),
  );

  const cenarios: { nome: string; rota: string; comLeitura: boolean }[] = [
    ...ROTAS.map((rota) => ({ nome: `${rota} (sem banco)`, rota, comLeitura: false })),
    { nome: "#/entregas (com leitura)", rota: "#/entregas", comLeitura: true },
  ];

  const problemas: string[] = [];
  let versao = "?";
  let auditorias = 0;
  try {
    for (const c of cenarios) {
      for (const largura of LARGURAS) {
        const ctx = await browser.newContext({ viewport: { width: largura, height: largura < 600 ? 844 : 900 } });
        const page = await ctx.newPage();
        try {
          if (c.comLeitura) {
            await page.route("**/api/entregas**", (r) =>
              r.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: corpoLeitura }),
            );
          }
          await page.goto(`${base}/${c.rota}`);
          await page.waitForSelector("#superficie[aria-busy='false'] > *", { timeout: 15000 });
          await page.addScriptTag({ path: AXE });
          // Em texto: o tsx injeta `__name` em funcoes nomeadas, e ele nao existe na pagina.
          const r = (await page.evaluate(`axe.run(document, { resultTypes: ["violations"] }).then((r) => ({
            versao: axe.version,
            v: r.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, alvo: x.nodes.slice(0, 3).map((n) => n.target.join(" ")) })),
          }))`)) as { versao: string; v: Violacao[] };
          versao = r.versao;
          auditorias += 1;
          for (const v of r.v) problemas.push(`${c.nome} ${largura}px: ${v.id} (${v.impact}, ${v.n}) ${JSON.stringify(v.alvo)}`);
          console.log(`  ${r.v.length === 0 ? "ok" : "XX"}  ${c.nome} ${largura}px — ${r.v.length} violacao(oes)`);
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
    await new Promise<void>((r) => servidor.close(() => r()));
  }

  console.log(`\naxe-core ${versao} · ${auditorias} auditorias · ${browser.version()}`);
  if (problemas.length) {
    console.error(`A11Y_AXE: ${problemas.length} violacao(oes)`);
    for (const p of problemas) console.error(` - ${p}`);
    process.exit(1);
  }
  console.log("A11Y_AXE: 0 violacoes");
  process.exit(0);
})();
