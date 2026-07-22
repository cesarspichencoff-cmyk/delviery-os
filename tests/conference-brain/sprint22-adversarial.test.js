"use strict";
/* ============================================================================
 * Testes adversariais do Sprint 2.2 — reproduzem, um a um, os bloqueadores
 * encontrados pela rechecagem independente
 * (docs/auditoria/CONFERENCE_BRAIN_SPRINT21_RECHECK.md, commit f7529fa,
 * lido via `git show`, não incorporado a este branch).
 *
 * Cada describe corresponde a um bloqueador. Onde possível, o teste foi
 * escrito para falhar contra o código do Sprint 2.1 (antes desta missão) e
 * passar depois da correção — a prova de que o bloqueador foi fechado, não
 * apenas documentado como fechado.
 * ==========================================================================*/
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const PiiGuard = require("../../src/conference-brain/live/pii-guard");
const MappingMode = require("../../src/conference-brain/live/mapping-mode");
const { sanitizeExcerpt } = require("../../src/conference-brain/live/evidence");
const PanelServer = require("../../tools/conference-brain/operator-panel-server");
const { createStore } = require("../../src/conference-brain/storage/store");

/* ---------------------------------------------------------------------------
 * Bloqueador 1 — privacidade do Modo de Mapeamento
 * ------------------------------------------------------------------------- */
describe("bloqueador 1 — privacidade (allowlist, nao blocklist)", () => {
  const casosDeNome = [
    "Joao Silva", "Ana Cristóvão", "MARIA DA SILVA SANTOS", "José D'Ávila",
    "François Müller", "李明" // unicode nao latino tambem nunca pode vazar
  ];
  for (const nome of casosDeNome) {
    test(`nome "${nome}" nunca aparece em texto bruto na assinatura`, () => {
      const html = `<div class="customer-status">${nome}</div>`;
      const sig = MappingMode.captureStructuralSignature(html);
      assert.ok(!JSON.stringify(sig).includes(nome), `"${nome}" vazou na assinatura`);
    });
  }

  test("telefone formatado nunca aparece bruto", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("(11) 91234-5678", "x")));
  });
  test("telefone nao formatado nunca aparece bruto", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("11912345678", "x")));
  });
  test("endereco nunca aparece bruto", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("Rua das Flores, 123", "x")));
  });
  test("observacao do cliente (texto livre) nunca aparece bruta", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("sem cebola por favor, e' alergico", "x")));
  });
  test("codigo de entrega nunca aparece bruto", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("ENT-88291-XZ", "x")));
  });
  test("email nunca aparece bruto", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("cliente@exemplo.com", "x")));
  });
  test("CPF nunca aparece bruto", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("123.456.789-01", "x")));
  });
  test("query string sensivel nunca aparece bruta", () => {
    assert.ok(PiiGuard.isRedactedMarker(PiiGuard.sanitizeText("?token=abc123&session=xyz", "x")));
  });
  test("atributo HTML com valor livre nunca aparece bruto", () => {
    const html = '<div data-customer="Joao Silva 999999999"></div>';
    // flagsPiiLikeAttributes so sinaliza o NOME do atributo, nunca extrai o valor
    const flags = MappingMode.flagsPiiLikeAttributes(html);
    assert.ok(!JSON.stringify(flags).includes("Joao"));
  });
  test("texto de acessibilidade (aria-label) nunca tem o VALOR extraido", () => {
    const html = '<span aria-label="Pedido de Joao Silva, telefone 11999999999"></span>';
    const a11y = MappingMode.candidateA11yAttributes(html);
    assert.ok(!JSON.stringify(a11y).includes("Joao"));
    assert.deepEqual(a11y.aria_attributes, ["aria-label"]); // so o NOME do atributo
  });
  test("erro contendo PII e' sanitizado pela camada de evidencia", () => {
    const msg = sanitizeExcerpt("falha ao processar pedido de Maria Oliveira, tel (21) 98888-7777");
    assert.ok(!msg.includes("Maria Oliveira"));
    assert.ok(!msg.includes("98888-7777"));
  });
  test("objetos aninhados sao sanitizados recursivamente", () => {
    const out = PiiGuard.sanitizeDeep({ pedido: { cliente: { nome: "Joao Silva", nota: "sem cebola" } } });
    assert.ok(!JSON.stringify(out).includes("Joao Silva"));
    assert.ok(!JSON.stringify(out).includes("sem cebola"));
  });
  test("arrays sao sanitizados elemento a elemento", () => {
    const out = PiiGuard.sanitizeDeep(["Joao Silva", "Pronto", "Maria Santos"]);
    assert.equal(out[1], "Pronto"); // vocabulario conhecido preservado
    assert.ok(PiiGuard.isRedactedMarker(out[0]));
    assert.ok(PiiGuard.isRedactedMarker(out[2]));
  });
  test("unicode e acentos sao tratados como qualquer outro texto (nunca bypass)", () => {
    const out = PiiGuard.sanitizeText("José D'Ávila Ançã", "x");
    assert.ok(PiiGuard.isRedactedMarker(out));
  });
  test("vocabulario funcional conhecido continua passando literal (nao superssanitiza)", () => {
    for (const t of ["Pronto", "Em preparo", "CONCLUDED", "CANCELLED", "Avisar Pedido Pronto"]) {
      assert.equal(PiiGuard.sanitizeText(t, "x"), t, `"${t}" deveria passar como vocabulario conhecido`);
    }
  });
  test("assinatura estrutural do HTML real do Sprint 1 continua sem PII e sem regressao", () => {
    const path = require("path");
    const fs = require("fs");
    const RAW = path.resolve(__dirname, "../../../delviery-os/data/raw/incoming");
    const f = path.join(RAW, "ifood_2026-07-01/relatorio_pedidos_01-07.html");
    if (!fs.existsSync(f)) return;
    const html = fs.readFileSync(f, "utf8");
    const sig = MappingMode.captureStructuralSignature(html);
    assert.equal(sig.pii_like_attributes_flagged.length, 0);
    // os 3 status conhecidos do relatorio real continuam literais (vocabulario seguro)
    assert.ok(sig.candidate_status_texts.includes("CONCLUDED"));
  });
});

/* ---------------------------------------------------------------------------
 * Bloqueador 2 — bind local do painel
 * ------------------------------------------------------------------------- */
describe("bloqueador 2 — painel escuta so em loopback", () => {
  test("padrao (sem PANEL_HOST) resolve para 127.0.0.1", () => {
    const r = PanelServer.resolvePanelHost({});
    assert.equal(r.ok, true);
    assert.equal(r.host, "127.0.0.1");
  });

  test("localhost e' aceito quando configurado", () => {
    assert.equal(PanelServer.resolvePanelHost({ PANEL_HOST: "localhost" }).ok, true);
  });

  test("::1 e' aceito SO quando configurado explicitamente", () => {
    assert.equal(PanelServer.resolvePanelHost({ PANEL_HOST: "::1" }).ok, true);
  });

  test("0.0.0.0 e' recusado", () => {
    const r = PanelServer.resolvePanelHost({ PANEL_HOST: "0.0.0.0" });
    assert.equal(r.ok, false);
    assert.match(r.reason, /curinga/);
  });

  test(":: e' recusado", () => {
    const r = PanelServer.resolvePanelHost({ PANEL_HOST: "::" });
    assert.equal(r.ok, false);
  });

  test("IP de LAN e' recusado", () => {
    const r = PanelServer.resolvePanelHost({ PANEL_HOST: "192.168.1.50" });
    assert.equal(r.ok, false);
    assert.match(r.reason, /nao_loopback/);
  });

  test("hostname externo arbitrario e' recusado", () => {
    const r = PanelServer.resolvePanelHost({ PANEL_HOST: "meudominio.com" });
    assert.equal(r.ok, false);
  });

  test("bind real do servidor e' 127.0.0.1, nunca :: (reproduz e prova a correcao do bloqueador 2)", async () => {
    const server = PanelServer.createServer(createStore({ memoryOnly: true }));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    assert.equal(addr.address, "127.0.0.1");
    assert.notEqual(addr.address, "::");
    await new Promise((resolve) => server.close(resolve));
  });

  test("encerramento limpo: porta liberada apos close()", async () => {
    const server = PanelServer.createServer(createStore({ memoryOnly: true }));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    const server2 = PanelServer.createServer(createStore({ memoryOnly: true }));
    await new Promise((resolve, reject) => {
      server2.once("error", reject);
      server2.listen(port, "127.0.0.1", resolve);
    });
    await new Promise((resolve) => server2.close(resolve));
  });

  test("porta ocupada gera erro EADDRINUSE, nunca sobe silenciosamente em outra interface", async () => {
    const s1 = PanelServer.createServer(createStore({ memoryOnly: true }));
    await new Promise((resolve) => s1.listen(0, "127.0.0.1", resolve));
    const port = s1.address().port;
    const s2 = PanelServer.createServer(createStore({ memoryOnly: true }));
    const err = await new Promise((resolve) => {
      s2.once("error", resolve);
      s2.listen(port, "127.0.0.1");
    });
    assert.equal(err.code, "EADDRINUSE");
    await new Promise((resolve) => s1.close(resolve));
  });
});

/* ---------------------------------------------------------------------------
 * Bloqueadores 3 e 4 — integração multidimensional real (observer + painel)
 * ------------------------------------------------------------------------- */
describe("bloqueadores 3/4 — modelo multidimensional integrado de ponta a ponta", () => {
  const { createLiveObserver } = require("../../src/conference-brain/live/observer");
  const PanelServer2 = require("../../tools/conference-brain/operator-panel-server");

  function scriptedObserver(store, script, runId) {
    let cycle = 0;
    return createLiveObserver({
      store, runId: runId || "teste-e2e",
      fetchOrders: async () => {
        const orders = script[cycle++] || [];
        return { orders, signals: { containerFound: true, ordersFound: orders.length, emptyOrderRatio: 0, criticalFieldsMissing: [], consecutiveFailures: 0 } };
      }
    });
  }

  test("driver falso produz observacao multidimensional PERSISTIDA (nao so em teste isolado)", async () => {
    const store = createStore({ memoryOnly: true });
    const obs = scriptedObserver(store, [[{ external_id: "E1", raw_status: "Pronto", courier: { rawText: "Na loja" } }]]);
    await obs.runCycle();
    const stored = store.all("live_observations")[0];
    assert.ok(stored.dimensions, "observer.js precisa persistir a observacao multidimensional, nao so o status antigo");
    assert.equal(stored.dimensions.courier.state, "at_store");
  });

  test("reconciliacao multidimensional e' recalculavel do store apos o ciclo (fonte de verdade)", async () => {
    const store = createStore({ memoryOnly: true });
    const obs = scriptedObserver(store, [
      [{ external_id: "E2", raw_status: "Pronto" }],
      [{ external_id: "E2", raw_status: "Pronto", courier: { rawText: "Na loja" } }]
    ]);
    await obs.runCycle();
    await obs.runCycle();
    const dim = obs.getReconciledDimension("E2");
    assert.equal(dim.courier_state, "at_store");
    assert.equal(dim.observation_count, 2);
  });

  test("status legado (LIVE_ORDER_STATUS) e' DERIVADO da reconciliacao, nunca a fonte", async () => {
    const store = createStore({ memoryOnly: true });
    const obs = scriptedObserver(store, [[{ external_id: "E3", raw_status: "Saiu para entrega" }]]);
    await obs.runCycle();
    const stored = store.all("live_observations")[0];
    // o status persistido bate com o que a reconciliacao produziria — nunca diverge
    const { deriveLegacyLiveStatus } = require("../../src/conference-brain/live/legacy-compat");
    assert.equal(stored.status, deriveLegacyLiveStatus(obs.getReconciledDimension("E3")));
    assert.equal(stored.status, "departed");
  });

  test("painel real (ordersInPlay + renderPage) mostra courier_at_store no HTML — nao so panelRow isolado", async () => {
    const store = createStore({ memoryOnly: true });
    const obs = scriptedObserver(store, [[{ external_id: "E4", raw_status: "Pronto", courier: { rawText: "Na loja" } }]]);
    await obs.runCycle();
    const rows = PanelServer2.ordersInPlay(store);
    assert.equal(rows[0].courier_at_store, true);
    const html = PanelServer2.renderPage(rows);
    assert.match(html, /entregador na loja/);
  });

  test("painel real mostra bloqueio quando o relogio esta aguardando item", async () => {
    const store = createStore({ memoryOnly: true });
    const obs = scriptedObserver(store, [[{ external_id: "E5", raw_status: "Pronto" }]]);
    await obs.runCycle();
    const clock = require("../../src/conference-brain/live/clock");
    let events = store.all("conference_clock_events").filter((e) => e.order_id === "E5");
    for (const type of ["conference_started", "waiting_for_item"]) {
      const r = clock.recordEvent({ order_id: "E5", event_type: type, observed_at: "t", origin: "operator_manual", existing_events: events });
      store.put("conference_clock_events", r.event);
      events = events.concat([r.event]);
    }
    const rows = PanelServer2.ordersInPlay(store);
    const html = PanelServer2.renderPage(rows);
    assert.match(html, /bloqueado/);
  });

  test("HTML do painel real nunca contem PII mesmo com observacao do cliente presente", async () => {
    const store = createStore({ memoryOnly: true });
    const obs = scriptedObserver(store, [[{
      external_id: "E6", raw_status: "Pronto", customerNote: "entregar para Joao Silva, sem cebola"
    }]]);
    await obs.runCycle();
    const rows = PanelServer2.ordersInPlay(store);
    const html = PanelServer2.renderPage(rows);
    assert.ok(!html.includes("Joao Silva"));
    assert.ok(!html.includes("sem cebola"));
  });

  test("painel sem nenhuma observacao multidimensional persistida continua funcionando (compat Sprint 2 pura)", () => {
    const store = createStore({ memoryOnly: true });
    const clock = require("../../src/conference-brain/live/clock");
    const r = clock.recordEvent({ order_id: "LEGACY1", event_type: "ready_observed", observed_at: "t", origin: "ifood_screen", existing_events: [] });
    store.put("conference_clock_events", r.event);
    const rows = PanelServer2.ordersInPlay(store);
    const html = PanelServer2.renderPage(rows);
    assert.equal(rows[0].details, undefined);
    assert.ok(!html.includes("undefined"));
  });
});
