/**
 * Gate de regressão: Copiloto e Entregas compartilham a mesma porta de realidade
 * no servidor de apresentação, sem ler banco de produção nem executar comandos.
 *
 * O CI já possui Playwright/Chromium, e este teste só abre localhost.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { criarServidor } from "../../tools/product_system_server";

async function main(): Promise<void> {
  if ((process.env.DELIVERYOS_DATABASE_URL || "").trim()) {
    throw new Error("COPILOTO_ENTREGAS_TEST_REQUIRES_NO_OPERATIONAL_DATABASE");
  }
  const server = await criarServidor();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("LOCAL_PORT_UNKNOWN");
    const host = "http://127.0.0.1:" + addr.port;

    const res = await fetch(host + "/api/copiloto?unit_id=ITAIM");
    assert.equal(res.status, 200);
    const data = await res.json() as {
      modulo?: string;
      celulas_operacionais?: {
        modo?: string;
        celulas?: Array<{
          nome: string;
          estado: string;
          pressao: unknown;
          cor_operacional: unknown;
          fila: unknown;
        }>;
      };
      entregas_observadas?: {
        estado?: string;
        unidade_solicitada?: string;
        nenhuma_acao_executada?: boolean;
        historico_sem_modo?: number | null;
        fonte?: string | null;
        grupos?: unknown[];
      };
    };
    assert.equal(data.modulo, "copiloto");
    assert.equal(data.entregas_observadas?.estado, "indisponivel");
    assert.equal(data.entregas_observadas?.unidade_solicitada, "ITAIM");
    assert.equal(data.entregas_observadas?.nenhuma_acao_executada, true);
    assert.equal(data.entregas_observadas?.historico_sem_modo, null);
    assert.equal(data.entregas_observadas?.fonte, null);
    assert.deepEqual(data.entregas_observadas?.grupos, []);
    assert.equal(data.celulas_operacionais?.modo, "somente_leitura_sem_motor_operacional");
    assert.deepEqual(data.celulas_operacionais?.celulas?.map(c => c.nome), [
      "Caixa", "Sushi", "Quentes", "Cozinha", "Conferência", "Entregas",
    ]);
    assert.ok(data.celulas_operacionais?.celulas?.every(c =>
      c.estado === "nao_conectada" && c.pressao === null &&
      c.cor_operacional === null && c.fila === null));
    assert.equal((await fetch(host + "/api/entregas")).status, 200);
    assert.equal((await fetch(host + "/api/copiloto", { method: "POST" })).status, 405);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.name));
    await page.goto(host + "/#/copiloto", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await page.waitForFunction(
      () => document.body.innerText.includes("Entregas · leitura compartilhada"),
      null,
      { timeout: 15000 },
    );
    const shown = await page.locator("body").innerText();
    assert.match(shown, /Entregas · leitura compartilhada/);
    assert.match(shown, /A fonte da plataforma ainda não foi configurada/);
    assert.doesNotMatch(shown, /viagens na projeção histórica/);
    assert.match(shown, /Células operacionais · cobertura/);
    for (const nome of ["Caixa", "Sushi", "Quentes", "Cozinha", "Conferência", "Entregas"]) {
      assert.match(shown, new RegExp(nome));
    }
    assert.match(shown, /Fonte não conectada/);
    assert.doesNotMatch(shown, /Caixa.*sobrecarregad[oa]/i);
    assert.deepEqual(errors, []);

    // Sonda adversarial: a resposta de uma rota abandonada NAO pode renderizar
    // sobre a Home que o operador ja abriu. Browser e servidor reais em localhost.
    const corrida = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await corrida.goto(host + "/#/", { waitUntil: "domcontentloaded" });
      await corrida.waitForFunction(
        () => document.querySelector("#superficie")?.getAttribute("aria-busy") === "false",
        null, { timeout: 15000 },
      );
      let liberar!: () => void;
      let sinalizar!: () => void;
      const bloqueio = new Promise<void>((r) => { liberar = r; });
      const requisicao = new Promise<void>((r) => { sinalizar = r; });
      await corrida.route("**/api/copiloto?*", async (route) => {
        sinalizar();
        await bloqueio;
        await route.continue();
      });
      await corrida.evaluate(() => { window.location.hash = "/copiloto"; });
      await requisicao;
      await corrida.evaluate(() => { window.location.hash = "/"; });
      await corrida.waitForFunction(
        () => document.querySelector("#superficie")?.getAttribute("aria-busy") === "false"
          && document.querySelector("#contexto")?.textContent?.includes("Operacao"),
        null, { timeout: 15000 },
      );
      const respostaAntiga = corrida.waitForResponse((res) => res.url().includes("/api/copiloto?"));
      liberar();
      await respostaAntiga;
      await corrida.waitForTimeout(250); // permite as microtarefas da resposta tardia
      assert.match(await corrida.locator("#contexto").innerText(), /Operacao/i);
      const telaFinal = await corrida.locator("#superficie").innerText();
      console.log("RACE_OBSERVED", JSON.stringify({
        contexto: "Operacao",
        copilotoSobrescreveu: telaFinal.includes("Entregas · leitura compartilhada"),
      }));
      assert.doesNotMatch(telaFinal,
        /Entregas · leitura compartilhada/,
        "RESPOSTA_ANTIGA_SOBRESCREVEU_HOME: rota abandonada nao pode virar tela atual");
    } finally {
      await corrida.close();
    }

    // A rejeicao/503 da rota que ficou para tras tambem nao pode converter
    // a Home atual em um erro visual de Copiloto.
    const rejeitada = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await rejeitada.goto(host + "/#/", { waitUntil: "domcontentloaded" });
      await rejeitada.waitForFunction(
        () => document.querySelector("#superficie")?.getAttribute("aria-busy") === "false",
        null, { timeout: 15000 },
      );
      let soltar!: () => void;
      let viu!: () => void;
      const aguardarResposta = new Promise<void>((r) => { soltar = r; });
      const viuRequisicao = new Promise<void>((r) => { viu = r; });
      await rejeitada.route("**/api/copiloto?*", async (route) => {
        viu();
        await aguardarResposta;
        await route.fulfill({ status: 503, contentType: "application/json", body: '{"erro":"teste_sintetico"}' });
      });
      await rejeitada.evaluate(() => { window.location.hash = "/copiloto"; });
      await viuRequisicao;
      await rejeitada.evaluate(() => { window.location.hash = "/"; });
      await rejeitada.waitForFunction(
        () => document.querySelector("#superficie")?.getAttribute("aria-busy") === "false"
          && document.querySelector("#contexto")?.textContent?.includes("Operacao"),
        null, { timeout: 15000 },
      );
      const antiga = rejeitada.waitForResponse((res) =>
        res.url().includes("/api/copiloto?") && res.status() === 503);
      soltar();
      await antiga;
      await rejeitada.waitForTimeout(250);
      const final = await rejeitada.locator("#superficie").innerText();
      assert.doesNotMatch(final, /Nao foi possivel ler esta superficie/,
        "ERRO_DE_ROTA_ABANDONADA_SOBRESCREVEU_HOME");
      assert.doesNotMatch(final, /Entregas · leitura compartilhada/,
        "A_ROTA_ABANDONADA_SOBRESCREVEU_HOME");
      console.log("RACE_503_OBSERVED", JSON.stringify({ erroAtrasadoSobrescreveu: false }));
    } finally {
      await rejeitada.close();
    }

    console.log("COPILOTO_ENTREGAS_HTTP_BROWSER=PASS localhost-only no-db no-write 390x844 + stale-success-and-error");
  } finally {
    if (browser) await browser.close();
    await new Promise<void>((resolve) => server.close(resolve));
  }
}

void main().catch((err: unknown) => {
  console.error("COPILOTO_ENTREGAS_HTTP_BROWSER=FAIL", err instanceof Error ? err.stack : "Unknown");
  process.exitCode = 1;
});
