/** Contrato do experimento: DOM ficcional, Chromium local, nenhum acesso ao Gestor. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  let passed = 0;
  function ok(test: string, fn: () => void) {
    fn(); passed++; console.log("ok " + test);
  }
  try {
    const page = await browser.newPage();
    const requests: string[] = [];
    page.on("request", req => requests.push(req.url()));
    await page.setContent(`<!doctype html><main id="lista">
      <div class="pedido">
        <span class="codigo">PED-1001</span>
        <span class="estado">Em preparo</span>
        <span class="cliente">Nome privado ficticio: Pessoa Silva 11999998888</span>
      </div>
    </main>`);
    const file = join(process.cwd(), "src/ingest/gestorDomFixtureObserver.js");
    await page.addScriptTag({ content: readFileSync(file, "utf8") });
    await page.evaluate(() => {
      const w = window as any;
      w.__observations = [];
      w.__observer = w.__DELIVERYOS_GESTOR_DOM_FIXTURE__.start({
        root: document,
        selectors: { container: "#lista", row: ".pedido",
          reference: ".codigo", status: ".estado" },
        onSnapshot: (s: unknown) => w.__observations.push(s),
        maxAgeMs: 1000
      });
    });
    const states = async () => page.evaluate(() => (window as any).__observations);
    let s = await states();
    ok("estado inicial demonstracao", () => {
      assert.equal(s.length, 1);
      assert.equal(s[0].source_mode, "demonstracao");
      assert.equal(s[0].observations[0].state, "em_producao");
    });
    ok("sem PII ou texto livre no snapshot", () => {
      assert.doesNotMatch(JSON.stringify(s), /Silva|11999998888|cliente/);
    });

    await page.locator(".estado").evaluate(el => { el.textContent = "Pronto"; });
    await page.waitForFunction(() => (window as any).__observations.length === 2);
    s = await states();
    ok("atualizacao passiva por MutationObserver", () => {
      assert.equal(s[1].observations[0].state, "pronto");
    });

    await page.locator(".estado").evaluate(el => { el.textContent = "Pronto"; });
    await page.waitForTimeout(45);
    s = await states();
    ok("deduplicacao de mesmo estado", () => assert.equal(s.length, 2));

    await page.locator(".estado").evaluate(el => { el.textContent = "Em separacao"; });
    await page.waitForFunction(() => (window as any).__observations.length === 3);
    s = await states();
    ok("estado desconhecido recusa toda observacao", () => {
      assert.equal(s[2].state, "indisponivel");
      assert.equal(s[2].reason, "CAMPO_NAO_QUALIFICADO");
      assert.deepEqual(s[2].observations, []);
    });

    await page.locator(".pedido").evaluate(el => el.remove());
    await page.waitForFunction(() => (window as any).__observations.length === 4);
    s = await states();
    ok("lista vazia sem prova nao vira zero", () => {
      assert.equal(s[3].reason, "LISTA_VAZIA_SEM_PROVA");
    });
    await page.locator("#lista").evaluate(el => el.remove());
    await page.waitForFunction(() => (window as any).__observations.length === 5);
    s = await states();
    ok("regiao removida bloqueia a leitura", () => {
      assert.equal(s[4].reason, "REGIAO_AUSENTE");
    });

    const stale = await page.evaluate(() =>
      (window as any).__observer.current(Date.now() + 3000));
    ok("stale apaga fatos atuais", () => {
      assert.equal(stale.reason, "DADOS_ANTIGOS");
      assert.deepEqual(stale.observations, []);
    });
    await page.evaluate(() => (window as any).__observer.stop());
    await page.setContent("<main id='lista'><div class='pedido'><span class='codigo'>PED-2001</span><span class='estado'>Pronto</span></div></main>");
    await page.waitForTimeout(40);
    s = await states();
    ok("stop nao deixa observador ativo", () => assert.equal(s.length, 5));
    ok("nao houve chamada de rede", () => assert.deepEqual(requests, []));
  } finally {
    await browser.close();
  }
  console.log(`GESTOR_DOM_FIXTURE_SHADOW_GREEN ${passed}/${passed} (SOMENTE FIXTURE)`);
}
main().catch(err => { console.error(err); process.exitCode = 1; });
