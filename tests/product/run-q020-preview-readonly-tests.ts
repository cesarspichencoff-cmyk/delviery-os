/** Q020/Q023: real browser checks of the preview-only TATA reality block.
 * No operational reader, bank, printer or order is contacted.
 * Requires local demo preview at 127.0.0.1:5370.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function main(): Promise<void> {
const base = process.env.Q020_PREVIEW_URL || "http://127.0.0.1:5370";
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/, "Q020 só consulta Preview local");
const browser = await chromium.launch({ headless: true });
const screenshots = join(tmpdir(), "deliveryos-m1b-home-20261020");
mkdirSync(screenshots, { recursive: true });
let passed = 0;
const check = (name: string, f: () => Promise<void>) => f().then(() => { passed++; console.log("PASS", name); });

const historico = {
  tata_comanda: {
    disponivel: true, ao_vivo: false, fonte: "tata_comanda_readonly_audit", data_operacional: "2026-10-05",
    pedidos: 195, unidade: "ITAIM",
    privacidade: { customer_pii: false, payload_bruto: false },
  },
};
const fontes = {
  fontes: [{
    id: "tata_comanda_reader", configurada: true, estado: "parcial",
    avaliado_em: "2026-10-20T12:00:00Z",
    privacidade: { customer_pii: false, identificador_de_pedido: false, texto_bruto_de_erro: false },
  }],
};
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
let wrongMethod = false;
page.on("request", r => { if (r.method() !== "GET" && r.method() !== "HEAD") wrongMethod = true; });
async function load() {
  // Navegar de novo para o mesmo hash nao recarrega a pagina (Playwright retorna null).
  let r = await page.goto(base + "/#/operacao-viva", { waitUntil: "domcontentloaded" });
  if (!r) r = await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(r?.status(), 200);
  await page.waitForSelector('[data-q020="leitura-tata"]');
  await page.waitForFunction(() => document.querySelector("#superficie")?.getAttribute("aria-busy") === "false");
}
try {
  await check("Q020-1 preview sem leitor declara indisponibilidade, preserva Operacao Viva", async () => {
    await load();
    const t = await page.locator('[data-q020="leitura-tata"]').innerText();
    assert.match(t, /Leitor nao configurado neste ambiente/);
    assert.match(t, /NAO e o movimento atual|Historico de pedidos indisponivel/);
    assert.equal(await page.locator('[data-q020="leitura-tata"]').count(), 1);
    assert.match(await page.locator("#superficie").innerText(), /Viagens projetadas/);
  });
  await page.route("**/api/historico", route => route.fulfill({ contentType:"application/json", body:JSON.stringify(historico) }));
  await page.route("**/api/fontes", route => route.fulfill({ contentType:"application/json", body:JSON.stringify(fontes) }));
  await check("Q020-2 agregado 195 nao vira operacao viva; saude parcial separada", async () => {
    await load();
    const t = await page.locator('[data-q020="leitura-tata"]').innerText();
    assert.match(t, /2026-10-05: 195 pedidos registrados/);
    assert.match(t, /NAO e o movimento atual/);
    assert.match(t, /Estado avaliado: parcial/);
    assert.doesNotMatch(t, /pedido 0851|pedido 1265/);
    await page.screenshot({ path: join(screenshots, "q020-fixture-390.png"), fullPage: true });
  });
  await page.unrouteAll({ behavior:"wait" });
  await page.route("**/api/historico", route => route.fulfill({ status:503, body:"fora" }));
  await page.route("**/api/fontes", route => route.fulfill({ status:503, body:"fora" }));
  await check("Q020-3 falha nas duas fontes nao vira zero e nao apaga tela principal", async () => {
    await load();
    const t = await page.locator('[data-q020="leitura-tata"]').innerText();
    assert.match(t, /Historico de pedidos indisponivel/);
    assert.match(t, /Saude do leitor indisponivel/);
    assert.doesNotMatch(t, /0 pedidos registrados/);
    assert.match(await page.locator("#superficie").innerText(), /Integridade do sinal/);
  });
  await page.unrouteAll({ behavior:"wait" });
  await page.route("**/api/historico", route => route.fulfill({ contentType:"application/json", body:JSON.stringify({
    tata_comanda: { ...historico.tata_comanda, privacidade: { customer_pii:true, payload_bruto:false },
      pedidos:99999, loja:"<img src=x onerror=alert(1)>" },
  }) }));
  await page.route("**/api/fontes", route => route.fulfill({ contentType:"application/json", body:JSON.stringify({
    fontes:[{ ...fontes.fontes[0], estado:"saudavel", privacidade:{customer_pii:true, identificador_de_pedido:false, texto_bruto_de_erro:false} }],
  }) }));
  await check("Q020-4 privacidade invalida bloqueia exibicao e nao injeta HTML", async () => {
    await load();
    const t = await page.locator('[data-q020="leitura-tata"]').innerText();
    assert.doesNotMatch(t, /99999/);
    assert.doesNotMatch(t, /Estado avaliado: saudavel/);
    assert.equal(await page.locator('[data-q020="leitura-tata"] img').count(), 0);
  });
  await check("Q020-5 desktop nao perde o bloco nem transborda a largura", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await load();
    assert.equal(await page.locator("[data-q020=\x27leitura-tata\x27]").count(), 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 2, "transbordamento desktop " + overflow);
    await page.screenshot({ path: join(screenshots, "q020-fixture-1440.png"), fullPage: true });
  });
  await check("Q020-6 nenhuma mutacao HTTP e executada no Preview", async () => {
    assert.equal(wrongMethod, false);
  });
  console.log("Q020_PREVIEW_READONLY: " + passed + "/" + passed + " PASS, Chromium 390px");
} finally {
  await page.close();
  await browser.close();
}
}
void main().catch(e => { console.error("Q020_PREVIEW_READONLY=FAIL", e); process.exitCode = 1; });
