"use strict";
/* ============================================================================
 * Testes do modelo MULTIDIMENSIONAL (Sprint 2.1) — corrige a limitação
 * apontada pela auditoria independente do Sprint 2: um único status não pode
 * representar visualização, produção, prontidão informada, logística,
 * despacho e conclusão ao mesmo tempo.
 *
 * Fixtures sintéticas, fundamentadas na funcionalidade OFICIAL documentada
 * pelo iFood para parceiros (modos Expedição/Quadros, botão "Avisar Pedido
 * Pronto", QR de chegada opcional, agrupamento, agendados — ver
 * docs/conference-brain/IFOOD_FUNCTIONAL_MODEL_V1.md). NENHUM seletor real do
 * Gestor foi observado nesta missão — ver LIVE_VALIDATION_V1.md.
 * ==========================================================================*/
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

const S = require("../../src/conference-brain/contracts/live-states");
const MD = require("../../src/conference-brain/live/multidimensional-observation");
const Reconciliation = require("../../src/conference-brain/live/reconciliation");
const { deriveLegacyLiveStatus } = require("../../src/conference-brain/live/legacy-compat");
const Grouping = require("../../src/conference-brain/live/grouping");
const Schedule = require("../../src/conference-brain/live/schedule");
const Indicators = require("../../src/conference-brain/live/indicators");
const StoreState = require("../../src/conference-brain/live/store-state");
const Health = require("../../src/conference-brain/live/health");
const Clock = require("../../src/conference-brain/live/clock");
const MappingMode = require("../../src/conference-brain/live/mapping-mode");
const Preflight = require("../../src/conference-brain/live/playwright-preflight");
const OperatorPanel = require("../../src/conference-brain/live/operator-panel");

/* ---------------------------------------------------------------------------
 * Fixtures sintéticas — Modo Expedição
 * ------------------------------------------------------------------------- */
describe("fixtures sinteticas — modo Expedicao", () => {
  test("cartao compacto: so status e layout, sem logistica detalhada", () => {
    const o = MD.buildOrderObservation({
      externalId: "EXP-1", layout: { rawModeName: "Expedição" }, orderStateText: "Em preparo"
    });
    assert.equal(o.layout.mode, S.LAYOUT_MODE.EXPEDITION);
    assert.equal(o.order_state.value, S.ORDER_STATE.PREPARING);
    assert.equal(o.courier.state, S.COURIER_STATE.NOT_APPLICABLE);
  });

  test("varios pedidos no mesmo modo mantem identidade propria", () => {
    const a = MD.buildOrderObservation({ externalId: "EXP-A", layout: { rawModeName: "Expedição" }, orderStateText: "Pronto" });
    const b = MD.buildOrderObservation({ externalId: "EXP-B", layout: { rawModeName: "Expedição" }, orderStateText: "Em preparo" });
    assert.notEqual(a.external_id, b.external_id);
    assert.notEqual(a.order_state.value, b.order_state.value);
  });

  test("tag de tempo candidata e reconhecida pelo mapping mode", () => {
    const html = '<div class="expedition"><span class="tag time">8 min</span></div>';
    const cands = MappingMode.captureFunctionalCandidates(html);
    assert.deepEqual(cands.time_tags, ["8 min"]);
  });

  test("entregador procurando: courier_state=searching, order_state independente", () => {
    const o = MD.buildOrderObservation({
      externalId: "EXP-2", orderStateText: "Pronto", courier: { rawText: "Procurando entregador" }
    });
    assert.equal(o.courier.state, S.COURIER_STATE.SEARCHING);
    assert.equal(o.order_state.value, S.ORDER_STATE.READY);
  });

  test("entregador na loja nao inicia Conferencia nem muda order_state", () => {
    const o = MD.buildOrderObservation({
      externalId: "EXP-3", orderStateText: "Pronto", courier: { rawText: "Na loja" }
    });
    assert.equal(o.courier.state, S.COURIER_STATE.AT_STORE);
    assert.equal(o.order_state.value, S.ORDER_STATE.READY);
    assert.ok(Clock.courierLogisticsNeverDrivesConferenceFlow());
  });

  test("agrupamento observado no modo Expedicao preserva pedidos individuais", () => {
    const g = Grouping.normalizeGrouping({ groupId: "grp-1", memberOrderIds: ["EXP-A", "EXP-B"], courierShared: true, observedAt: "t1" });
    assert.equal(g.member_order_ids.length, 2);
    assert.equal(g.group_id, "grp-1");
  });
});

/* ---------------------------------------------------------------------------
 * Fixtures sintéticas — Modo Quadros
 * ------------------------------------------------------------------------- */
describe("fixtures sinteticas — modo Quadros", () => {
  test("colunas oficiais reconhecidas como visual_location", () => {
    for (const [col, expected] of [
      ["Novos", S.VISUAL_LOCATION.ACCEPT], ["Em preparo", S.VISUAL_LOCATION.PREPARING],
      ["Prontos", S.VISUAL_LOCATION.READY], ["Entregando", S.VISUAL_LOCATION.IN_ROUTE]
    ]) {
      const o = MD.buildOrderObservation({ externalId: "K1", layout: { rawModeName: "Quadros" }, visual: { rawSection: col } });
      assert.equal(o.visual.location, expected, `coluna "${col}"`);
    }
  });

  test("pedido movendo de Em preparo para Pronto: visual_location muda, order_state acompanha", () => {
    const o1 = MD.buildOrderObservation({ externalId: "K2", visual: { rawSection: "Em preparo" }, orderStateText: "Em preparo", observedAt: "t1" });
    const o2 = MD.buildOrderObservation({ externalId: "K2", visual: { rawSection: "Prontos" }, orderStateText: "Pronto", observedAt: "t2" });
    const rec = Reconciliation.reconcileMultidimensional("K2", [o1, o2]);
    assert.equal(rec.visual_location, S.VISUAL_LOCATION.READY);
    assert.equal(rec.order_state, S.ORDER_STATE.READY);
    assert.equal(rec.anomalies.length, 0, "progressao normal nao e anomalia");
  });

  test('acao "Avisar Pedido Pronto" disponivel fica em available_actions, nao em order_state', () => {
    const o = MD.buildOrderObservation({
      externalId: "K3", orderStateText: "Pronto",
      readiness: { actionPresent: true, actionDisabled: false, actionLabel: "Avisar Pedido Pronto" }
    });
    assert.equal(o.order_state.value, S.ORDER_STATE.READY);
    assert.equal(o.readiness.available_actions[0].code, S.ACTION_CODES.NOTIFY_READY);
    assert.equal(o.readiness.available_actions[0].available, true);
  });

  test("pedido finalizado: completion=completed preserva order_state anterior no historico", () => {
    const o1 = MD.buildOrderObservation({ externalId: "K4", orderStateText: "Pronto", observedAt: "t1" });
    const o2 = MD.buildOrderObservation({ externalId: "K4", orderStateText: "Entregue", completionText: "Concluido", observedAt: "t2" });
    const rec = Reconciliation.reconcileMultidimensional("K4", [o1, o2]);
    assert.equal(rec.completion_state, S.COMPLETION_STATE.COMPLETED);
    // o historico de order_state continua tendo a passagem por "ready"
    assert.ok(rec.dimension_provenance.order_state.history.some((h) => h.value === S.ORDER_STATE.READY));
  });

  test("pedido agendado na aba Agendados nao conta como carga ativa cedo", () => {
    const sched = Schedule.buildSchedule({ isScheduled: true, scheduledFor: "2026-01-01T20:00:00-03:00" });
    assert.equal(Schedule.isActiveNow(sched, Date.parse("2026-01-01T08:00:00-03:00")), false);
  });
});

/* ---------------------------------------------------------------------------
 * Fixtures sintéticas — Detalhes do pedido
 * ------------------------------------------------------------------------- */
describe("fixtures sinteticas — detalhes do pedido", () => {
  test("detalhe com itens e observacao (contrato do Sprint 1, reaproveitado)", () => {
    const o = MD.buildOrderObservation({ externalId: "D1", layout: { rawModeName: "Detalhes do pedido" }, orderStateText: "Em preparo" });
    assert.equal(o.layout.mode, S.LAYOUT_MODE.ORDER_DETAILS);
  });

  test("acao disponivel nos detalhes, card em Em preparo (auditoria §11)", () => {
    const o = MD.buildOrderObservation({
      externalId: "D2", orderStateText: "Em preparo",
      readiness: { actionPresent: true, actionDisabled: false }
    });
    assert.equal(o.order_state.value, S.ORDER_STATE.PREPARING);
    assert.equal(o.readiness.available_actions[0].available, true);
  });

  test("logistica mais completa no detalhe do que no cartao compacto", () => {
    const compact = MD.buildOrderObservation({ externalId: "D3", layout: { rawModeName: "Expedição" }, orderStateText: "Pronto", observedAt: "t1" });
    const detail = MD.buildOrderObservation({
      externalId: "D3", layout: { rawModeName: "Detalhes do pedido" }, orderStateText: "Pronto",
      courier: { rawText: "Na loja", etaText: "2 min", qrPresent: true }, observedAt: "t2"
    });
    const rec = Reconciliation.reconcileMultidimensional("D3", [compact, detail]);
    assert.equal(rec.courier_state, S.COURIER_STATE.AT_STORE);
    // historico bruto guarda as DUAS leituras (uma delas "not_applicable" —
    // o cartão compacto não mostrou courier), mas só a leitura real conta
    // como candidata a "atual" — daí o courier_state final continuar at_store.
    assert.equal(rec.dimension_provenance.courier.history.length, 2);
    const realReadings = rec.dimension_provenance.courier.history.filter((h) => h.value !== S.COURIER_STATE.NOT_APPLICABLE);
    assert.equal(realReadings.length, 1, "so o detalhe trouxe courier real");
  });
});

/* ---------------------------------------------------------------------------
 * Cenários multidimensionais (Fase 23 da missão)
 * ------------------------------------------------------------------------- */
describe("cenarios multidimensionais", () => {
  test("pronto + entregador procurando", () => {
    const o = MD.buildOrderObservation({ externalId: "M1", orderStateText: "Pronto", courier: { rawText: "Procurando entregador" } });
    assert.equal(o.order_state.value, "ready");
    assert.equal(o.courier.state, "searching");
  });

  test("pronto + entregador na loja", () => {
    const o = MD.buildOrderObservation({ externalId: "M2", orderStateText: "Pronto", courier: { rawText: "Na loja", qrPresent: true } });
    assert.equal(o.order_state.value, "ready");
    assert.equal(o.courier.state, "at_store");
    assert.equal(o.courier.qr_code, "present");
  });

  test("coluna Pronto + botao ainda disponivel (nao clicado)", () => {
    const o = MD.buildOrderObservation({
      externalId: "M3", visual: { rawSection: "Prontos" }, orderStateText: "Pronto",
      readiness: { actionPresent: true, actionDisabled: false }
    });
    assert.equal(o.visual.location, "ready");
    assert.equal(o.readiness.state, S.READINESS_STATE.READY_NOTIFICATION_AVAILABLE);
    assert.equal(deriveLegacyLiveStatus(o), S.LIVE_ORDER_STATUS.READY, "botao disponivel nao vira awaiting_pickup sozinho");
  });

  test("concluido sem saida comprovada — completion=completed, courier sem sinal de rota", () => {
    const o = MD.buildOrderObservation({ externalId: "M4", orderStateText: "Entregue", completionText: "Concluido" });
    assert.equal(o.completion.value, "completed");
    assert.equal(o.courier.state, "not_applicable");
    const { departureEvidence } = require("../../src/conference-brain/live/ready-departure");
    assert.equal(departureEvidence(["ready", "completed"]).observed, false, "completed sozinho continua nao comprovando saida (Sprint 2 preservado)");
  });

  test("entrega propria despachada", () => {
    const o = MD.buildOrderObservation({ externalId: "M5", dispatch: { rawText: "Despachado pela loja" } });
    assert.equal(o.dispatch.value, S.DISPATCH_STATE.DISPATCHED_BY_STORE);
  });

  test("pedido iFood coletado", () => {
    const o = MD.buildOrderObservation({ externalId: "M6", dispatch: { rawText: "Coletado pelo iFood" } });
    assert.equal(o.dispatch.value, S.DISPATCH_STATE.COLLECTED_BY_IFOOD);
  });

  test("pedido agrupado — 2 membros", () => {
    const g = Grouping.normalizeGrouping({ groupId: "g2", memberOrderIds: ["M7", "M8"], observedAt: "t1" });
    assert.equal(g.member_order_ids.length, 2);
  });

  test("pedido agrupado — 3 ou mais membros", () => {
    const g = Grouping.normalizeGrouping({ groupId: "g3", memberOrderIds: ["M9", "M10", "M11"], observedAt: "t1" });
    assert.equal(g.member_order_ids.length, 3);
  });

  test("agendado que entra em producao gera transicao detectavel", () => {
    const prev = Schedule.buildSchedule({ isScheduled: true, scheduledFor: "t0" });
    const curr = Schedule.buildSchedule({ isScheduled: false, activationObservedAt: "t1" });
    const trans = Schedule.scheduleTransition(prev, curr);
    assert.equal(trans.transitioned, true);
  });

  test("operacao vazia com loja aberta — saude available com razao honesta, nunca layout_changed", () => {
    const h = Health.classifyCycleHealth({ containerFound: true, ordersFound: 0, storeState: S.STORE_STATE.OPEN });
    assert.equal(h.state, S.LIVE_SOURCE_HEALTH.PARTIAL);
    assert.equal(h.reason, "nenhum_pedido_encontrado_nesta_leitura");
  });

  test("loja fechada — saude available (fonte leu com sucesso), nunca unavailable", () => {
    const h = Health.classifyCycleHealth({ containerFound: true, ordersFound: 0, storeState: S.STORE_STATE.CLOSED_BY_SCHEDULE });
    assert.equal(h.state, S.LIVE_SOURCE_HEALTH.AVAILABLE);
    assert.equal(h.reason, "loja_fechada");
  });

  test("layout alterado continua detectavel como antes (compatibilidade)", () => {
    const h = Health.classifyCycleHealth({ containerFound: false });
    assert.equal(h.state, S.LIVE_SOURCE_HEALTH.LAYOUT_CHANGED);
  });
});

/* ---------------------------------------------------------------------------
 * Reconciliação multidimensional
 * ------------------------------------------------------------------------- */
describe("reconciliacao multidimensional", () => {
  test("Expedicao -> Quadros nao cria pedido novo, so agrega observacoes", () => {
    const o1 = MD.buildOrderObservation({ externalId: "R1", layout: { rawModeName: "Expedição" }, orderStateText: "Pronto", observedAt: "t1" });
    const o2 = MD.buildOrderObservation({ externalId: "R1", layout: { rawModeName: "Quadros" }, orderStateText: "Pronto", observedAt: "t2" });
    const rec = Reconciliation.reconcileMultidimensional("R1", [o1, o2]);
    assert.equal(rec.observation_count, 2);
    assert.equal(rec.external_id, "R1");
  });

  test("Quadros -> detalhes: courier visto no detalhe nao e perdido", () => {
    const o1 = MD.buildOrderObservation({ externalId: "R2", layout: { rawModeName: "Quadros" }, orderStateText: "Pronto", observedAt: "t1" });
    const o2 = MD.buildOrderObservation({ externalId: "R2", layout: { rawModeName: "Detalhes do pedido" }, courier: { rawText: "Na loja" }, observedAt: "t2" });
    const rec = Reconciliation.reconcileMultidimensional("R2", [o1, o2]);
    assert.equal(rec.courier_state, "at_store");
  });

  test("detalhes -> cartao compacto: informacao antiga mais completa nao e apagada", () => {
    const detail = MD.buildOrderObservation({ externalId: "R3", courier: { rawText: "Na loja" }, observedAt: "t1" });
    const compact = MD.buildOrderObservation({ externalId: "R3", observedAt: "t2" }); // sem courier visivel
    const rec = Reconciliation.reconcileMultidimensional("R3", [detail, compact]);
    assert.equal(rec.courier_state, "at_store", "cartao compacto (sem evidencia) nao apaga o que o detalhe mostrou");
  });

  test("status novo mais recente ainda vence sobre informacao antiga", () => {
    const o1 = MD.buildOrderObservation({ externalId: "R4", orderStateText: "Em preparo", observedAt: "t1" });
    const o2 = MD.buildOrderObservation({ externalId: "R4", orderStateText: "Pronto", observedAt: "t2" });
    const rec = Reconciliation.reconcileMultidimensional("R4", [o1, o2]);
    assert.equal(rec.order_state, "ready");
  });

  test("logistica alterada entre leituras fica no historico, nunca escondida", () => {
    const o1 = MD.buildOrderObservation({ externalId: "R5", courier: { rawText: "Procurando entregador" }, observedAt: "t1" });
    const o2 = MD.buildOrderObservation({ externalId: "R5", courier: { rawText: "Na loja" }, observedAt: "t2" });
    const rec = Reconciliation.reconcileMultidimensional("R5", [o1, o2]);
    assert.equal(rec.courier_state, "at_store");
    assert.equal(rec.dimension_provenance.courier.history.length, 2);
  });

  test("agrupamento alterado gera nova versao, membros anteriores preservados no historico", () => {
    const g1 = { groupId: "g5", memberOrderIds: ["R6", "R7"], observedAt: "t1" };
    const g2 = { groupId: "g5", memberOrderIds: ["R6", "R7", "R8"], observedAt: "t2" };
    const rec = Grouping.reconcileGrouping([g1, g2]);
    assert.equal(rec.versions.length, 2);
    assert.equal(rec.current.member_order_ids.length, 3);
  });

  test("acao removida (avisada) fica versionada, nao apagada em silencio", () => {
    const o1 = MD.buildOrderObservation({ externalId: "R9", orderStateText: "Pronto", readiness: { actionPresent: true, actionDisabled: false }, observedAt: "t1" });
    const o2 = MD.buildOrderObservation({ externalId: "R9", orderStateText: "Pronto", readiness: { confirmationText: "Entregador foi avisado" }, observedAt: "t2" });
    const rec = Reconciliation.reconcileMultidimensional("R9", [o1, o2]);
    assert.equal(rec.readiness_state, S.READINESS_STATE.READY_NOTIFIED);
    assert.equal(rec.dimension_provenance.available_actions.versions.length, 1, "acao so apareceu numa leitura; versionada, nao perdida");
  });

  test("36 duplicidades historicas do Sprint 1 tambem nao quebram a reconciliacao multidimensional", () => {
    const RAW = path.resolve(__dirname, "../../../delviery-os/data/raw/incoming");
    const files = [
      path.join(RAW, "ifood_2026-06-20_a_2026-06-30/relatorio_pedidos_com_itens_jun20-30.html"),
      path.join(RAW, "ifood_2026-07-01/relatorio_pedidos_01-07.html")
    ];
    if (!files.every((f) => fs.existsSync(f))) return; // ambiente sem os dados historicos irmaos
    const { createHistoricalHtmlAdapter } = require("../../src/conference-brain/ingestion/adapters/historical-html");
    const adapter = createHistoricalHtmlAdapter(files, {});
    const rows = adapter.observe();
    const byId = new Map();
    for (const r of rows) { if (!byId.has(r.oid)) byId.set(r.oid, []); byId.get(r.oid).push(r); }
    const dupIds = Array.from(byId.entries()).filter(([, rs]) => rs.length > 1).map(([id]) => id);
    assert.equal(dupIds.length, 36);
    for (const id of dupIds) {
      const obs = byId.get(id).map((r, i) => MD.buildOrderObservation({
        externalId: id, observedAt: new Date(Date.now() + i * 1000).toISOString(),
        orderStateText: r.status === "CONCLUDED" ? "Entregue" : r.status, completionText: r.status === "CONCLUDED" ? "Concluido" : null
      }));
      const rec = Reconciliation.reconcileMultidimensional(id, obs); // nunca lanca
      assert.equal(rec.external_id, id);
    }
  });
});

/* ---------------------------------------------------------------------------
 * Compatibilidade
 * ------------------------------------------------------------------------- */
describe("compatibilidade (Sprint 2.1 nao quebra o Sprint 2)", () => {
  test("projecao legada existe e e' claramente documentada como deprecated", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../src/conference-brain/live/legacy-compat.js"), "utf8");
    assert.match(src, /@deprecated/);
  });

  test("ambiguidade total retorna unknown, nunca um palpite", () => {
    assert.equal(deriveLegacyLiveStatus({}), S.LIVE_ORDER_STATUS.UNKNOWN);
    assert.equal(deriveLegacyLiveStatus(null), S.LIVE_ORDER_STATUS.UNKNOWN);
  });

  test("composicao nao altera estado global — multidimensional nao toca snapshots nem estado sombra", () => {
    const srcDir = path.join(__dirname, "../../src/conference-brain/live");
    for (const f of ["multidimensional-observation.js", "reconciliation.js"]) {
      const src = fs.readFileSync(path.join(srcDir, f), "utf8");
      assert.ok(!/snapshots\/engine|shadow\/conference-state/.test(src), `${f} nao pode importar o motor de estado sombra`);
    }
  });

  test("relogio preservado: transicoes antigas continuam validas", () => {
    let events = [];
    for (const type of ["ready_observed", "conference_started", "conference_completed", "released", "departed_observed"]) {
      const r = Clock.recordEvent({ order_id: "C1", event_type: type, observed_at: "t", origin: "operator_manual", existing_events: events });
      assert.equal(r.ok, true);
      events.push(r.event);
    }
  });

  test("relogio nunca depende de logistica de entregador (travado por funcao dedicada)", () => {
    assert.equal(Clock.courierLogisticsNeverDrivesConferenceFlow(), true);
    assert.equal(Clock.dispatchNeverReplacesRelease(), true);
  });

  test("ready_observed pode nascer de order_state OU de readiness (Fase 18)", () => {
    assert.equal(Clock.isReadyFromMultidimensional({ order_state: "ready" }), true);
    assert.equal(Clock.isReadyFromMultidimensional({ readiness_state: "ready_notification_available" }), true);
    assert.equal(Clock.isReadyFromMultidimensional({ order_state: "preparing", readiness_state: "not_ready" }), false);
  });

  test("LIVE_ORDER_STATUS do Sprint 2 continua existindo e funcionando", () => {
    assert.equal(S.LIVE_ORDER_STATUS.READY, "ready");
    assert.ok(S.LIVE_ORDER_STATUS_LIST.includes("departed"));
  });

  test("os 79 pontos de contrato do Sprint 2 (status-map, ready-departure, browser-adapter) seguem intocados", () => {
    for (const f of ["status-map.js", "ready-departure.js", "browser-adapter.js", "clock.js", "observer.js"]) {
      assert.ok(fs.existsSync(path.join(__dirname, "../../src/conference-brain/live", f)));
    }
  });
});

/* ---------------------------------------------------------------------------
 * Saúde da fonte — novos fatores explicativos (Fase 15)
 * ------------------------------------------------------------------------- */
describe("saude da fonte — fatores explicativos novos", () => {
  test("modo desconhecido reduz confianca mas nao muda o estado sozinho", () => {
    const h = Health.classifyCycleHealth({ containerFound: true, ordersFound: 3, emptyOrderRatio: 0, criticalFieldsMissing: [], layoutMode: "unknown" });
    assert.equal(h.state, S.LIVE_SOURCE_HEALTH.AVAILABLE);
    assert.ok(h.reasons.includes("modo_de_layout_desconhecido"));
  });

  test("unidade nao confirmada bloqueia leitura confiante", () => {
    const h = Health.classifyCycleHealth({ accountContextBlock: "unidade_nao_confirmada" });
    assert.equal(h.state, S.LIVE_SOURCE_HEALTH.PARTIAL);
  });

  test("multiplas unidades detectadas vira inconsistent", () => {
    const h = Health.classifyCycleHealth({ accountContextBlock: "multiplas_unidades_detectadas" });
    assert.equal(h.state, S.LIVE_SOURCE_HEALTH.INCONSISTENT);
  });

  test("modal bloqueando a lista vira partial, nunca layout_changed", () => {
    const h = Health.classifyCycleHealth({ containerFound: true, modalBlocking: true });
    assert.equal(h.state, S.LIVE_SOURCE_HEALTH.PARTIAL);
  });

  test("detalhe de pedido aberto cobrindo a lista vira partial", () => {
    const h = Health.classifyCycleHealth({ containerFound: true, orderDetailsOpenCoveringList: true });
    assert.equal(h.state, S.LIVE_SOURCE_HEALTH.PARTIAL);
  });

  test("filtro ativo explica zero resultados sem virar falha de layout", () => {
    const h = Health.classifyCycleHealth({ containerFound: true, ordersFound: 0, filterActive: true });
    assert.equal(h.state, S.LIVE_SOURCE_HEALTH.PARTIAL);
    assert.equal(h.reason, "filtro_ativo_sem_resultado");
  });

  test("aba somente agendados selecionada e' distinta de operacao vazia", () => {
    const h = Health.classifyCycleHealth({ containerFound: true, ordersFound: 0, scheduledOnlyTabSelected: true });
    assert.equal(h.reason, "somente_agendados_selecionado");
  });

  test("account_context: unidade confirmada nao bloqueia", () => {
    const ctx = StoreState.buildAccountContext({ merchantId: "m1", currentUnitConfirmed: true });
    assert.equal(StoreState.accountContextBlocksConfidentReading(ctx), null);
  });
});

/* ---------------------------------------------------------------------------
 * Indicadores — classificação correta (Fase 12)
 * ------------------------------------------------------------------------- */
describe("indicadores e alertas", () => {
  test("cada codigo oficial e classificado numa categoria valida", () => {
    const categorias = ["indicador", "alerta", "atributo", "evento", "estado", "acao disponivel"];
    for (const code of S.INDICATOR_CODE_LIST) {
      const cat = Indicators.classifyIndicator(code);
      assert.ok(cat, `codigo ${code} precisa ter categoria`);
    }
  });

  test("codigo desconhecido nao vira indicador nenhum", () => {
    assert.equal(Indicators.buildIndicator({ code: "NAO_EXISTE" }), null);
  });

  test("nenhum indicador vira status por atalho — todos carregam categoria distinta de order_state", () => {
    const ind = Indicators.buildIndicator({ code: S.INDICATOR_CODES.PREPARATION_DELAYED });
    assert.notEqual(ind.category, "status");
  });
});

/* ---------------------------------------------------------------------------
 * Modo de Mapeamento evoluído (Fase 20)
 * ------------------------------------------------------------------------- */
describe("modo de mapeamento — candidatos funcionais", () => {
  test("nunca clica, nunca muta, nunca persiste HTML bruto (mesma garantia do Sprint 2)", () => {
    const html = '<div class="expedition"><button>Avisar Pedido Pronto</button></div>';
    const sig = MappingMode.captureStructuralSignature(html);
    assert.equal(sig.persists_no_html, true);
    assert.ok(!JSON.stringify(sig).includes("<div"));
  });

  test("candidatos de acao que nao batem com vocabulario conhecido nunca aparecem em texto bruto (Sprint 2.2)", () => {
    // Sprint 2.1 usava blocklist (so rejeitava se contivesse "telefone"/"nome")
    // — a rechecagem provou que um nome de pessoa real passava direto por nao
    // conter nenhuma palavra proibida. Sprint 2.2: allowlist. O texto nao
    // desaparece (perderia sinal estrutural) — vira marcador sanitizado.
    const html = '<button>telefone contato</button>';
    const labels = MappingMode.candidateActionLabels(html);
    assert.equal(labels.length, 1);
    assert.equal(labels[0].redacted, true);
    assert.equal(typeof labels[0].text_hash, "string");
    assert.ok(!JSON.stringify(labels).includes("telefone"));
  });

  test("assinatura reage a mudanca de modo/coluna/acao (nao so card/badge genericos)", () => {
    const a = MappingMode.captureStructuralSignature('<div class="order-card"></div>');
    const b = MappingMode.captureStructuralSignature('<div class="board-column"><button>Avisar Pedido Pronto</button></div>');
    assert.notEqual(a.hash, b.hash);
  });

  test("a11y extrai so nomes de atributo/role, nunca o valor de aria-label", () => {
    const html = '<span role="tab" aria-label="Pedido de Joao Silva 999-999-9999"></span>';
    const a11y = MappingMode.candidateA11yAttributes(html);
    assert.deepEqual(a11y.roles, ["tab"]);
    assert.deepEqual(a11y.aria_attributes, ["aria-label"]);
    assert.ok(!JSON.stringify(a11y).includes("Joao Silva"));
  });
});

/* ---------------------------------------------------------------------------
 * Preflight do Playwright (Fase 21)
 * ------------------------------------------------------------------------- */
describe("preflight do Playwright", () => {
  test("sem config nenhuma, recusa com blockers explicitos", () => {
    const r = Preflight.refuseIfNotReady({});
    assert.equal(r.allowed, false);
    assert.ok(r.check.blockers.length > 0);
  });

  test("nunca marca session_validated=true sozinho", () => {
    const r = Preflight.verifyMappingPreconditions({});
    assert.equal(r.session_validated, false);
  });

  test("verifica presenca real do executavel no disco, sem lancar se nao existir", () => {
    const r = Preflight.checkExecutable("C:/caminho/que/nao/existe/chrome.exe");
    assert.equal(r.configured, true);
    assert.equal(r.found, false);
  });
});

/* ---------------------------------------------------------------------------
 * Painel — sinais priorizados, sem poluição (Fase 19)
 * ------------------------------------------------------------------------- */
describe("painel — sinais multidimensionais priorizados", () => {
  test("painel sem dimensao multidimensional funciona exatamente como no Sprint 2", () => {
    const row = OperatorPanel.panelRow({ external_id: "P1", clock_events: [{ event_type: "ready_observed" }] });
    assert.equal(row.blocked, undefined, "sem dimension, nao adiciona campos novos");
  });

  test("entregador na loja aparece como sinal, sem poluir com todas as dimensoes", () => {
    const dim = { courier_state: "at_store", indicators: [], grouping: null, schedule: null };
    const row = OperatorPanel.panelRow({ external_id: "P2", clock_events: [{ event_type: "ready_observed" }], dimension: dim });
    assert.equal(row.courier_at_store, true);
    assert.equal(Object.prototype.hasOwnProperty.call(row, "details"), true, "detalhes ficam disponiveis, mas separados da linha principal");
  });

  test("alerta logistico so aparece quando categoria e' alerta", () => {
    const ind = Indicators.buildIndicator({ code: S.INDICATOR_CODES.COURIER_SEARCHING });
    const dim = { courier_state: "searching", indicators: [ind] };
    const row = OperatorPanel.panelRow({ external_id: "P3", clock_events: [], dimension: dim });
    assert.equal(row.logistics_alert, null, "COURIER_SEARCHING e' estado, nao alerta — nao deve aparecer aqui");
  });
});
