/* ============================================================================
 * Observação MULTIDIMENSIONAL do pedido (Sprint 2.1).
 * ----------------------------------------------------------------------------
 * Corrige a limitação apontada pela auditoria independente do Sprint 2: um
 * único `LIVE_ORDER_STATUS` não pode representar, ao mesmo tempo, onde o
 * cartão apareceu, a situação de preparo, a prontidão INFORMADA à plataforma,
 * a logística do entregador, o despacho e a conclusão — são FATOS
 * independentes que podem mudar em momentos diferentes e por fontes
 * diferentes (a mesma tela ao vivo, em modos diferentes).
 *
 * Cada mapeador aqui é PURO (texto/sinal bruto -> dimensão canônica) e segue
 * o mesmo estilo de `status-map.js`: regex ANCORADA, sem correspondência =
 * `unknown` — nunca um palpite. Nenhum mapeador aqui promove um sinal a
 * evento do relógio; isso continua sendo papel de `observer.js`/`clock.js`.
 * ==========================================================================*/
"use strict";

const S = require("../contracts/live-states");
const { CONFIDENCE } = require("../contracts/states");
const { normalizeLiveStatus } = require("./status-map");
const { buildStoreStateDimension } = require("./store-state");

/* ---------------------------------------------------------------------------
 * 2. Modo de visualização — nunca representa o estado do pedido.
 * ------------------------------------------------------------------------- */

const LAYOUT_MODE_TEXT_MAP = Object.freeze([
  [/^(expedi(c|ç)[aã]o|expedition)$/i, S.LAYOUT_MODE.EXPEDITION],
  [/^(quadros?|kanban|boards?)$/i, S.LAYOUT_MODE.BOARDS],
  [/^(detalhes? do pedido|order.?details)$/i, S.LAYOUT_MODE.ORDER_DETAILS]
]);
/** Rotas conhecidas (documentadas oficialmente) — só usadas se o texto do modo não bater. */
const LAYOUT_MODE_ROUTE_MAP = Object.freeze([
  [/expedition/i, S.LAYOUT_MODE.EXPEDITION],
  [/kanban/i, S.LAYOUT_MODE.BOARDS]
]);

function mapLayoutMode(rawModeName, sanitizedRoute) {
  for (const [re, canon] of LAYOUT_MODE_TEXT_MAP) if (re.test(String(rawModeName || "").trim())) return canon;
  for (const [re, canon] of LAYOUT_MODE_ROUTE_MAP) if (re.test(String(sanitizedRoute || ""))) return canon;
  return S.LAYOUT_MODE.UNKNOWN;
}

/**
 * Constrói a dimensão `layout` completa. `sanitizedRoute` precisa já vir sem
 * query string nem identificador de pedido — a sanitização é responsabilidade
 * de quem observa, não deste mapeador.
 */
function buildLayoutDimension(signal) {
  const s = signal || {};
  return {
    mode: mapLayoutMode(s.rawModeName, s.sanitizedRoute),
    raw_mode_name: s.rawModeName || null,
    layout_signature: s.layoutSignature || null,
    sanitized_route: s.sanitizedRoute || null,
    mapping_version: s.mappingVersion || null,
    observed_at: s.observedAt || null
  };
}

/* ---------------------------------------------------------------------------
 * 3. Localização visual — evidência, nunca prova de evento.
 * ------------------------------------------------------------------------- */

const VISUAL_LOCATION_TEXT_MAP = Object.freeze([
  [/^(novos?|aceitar|accept|received)$/i, S.VISUAL_LOCATION.ACCEPT],
  [/^(em preparo|preparando|preparing)$/i, S.VISUAL_LOCATION.PREPARING],
  [/^(prontos?|ready)$/i, S.VISUAL_LOCATION.READY],
  [/^(entregando|em rota|in.?route|a caminho)$/i, S.VISUAL_LOCATION.IN_ROUTE],
  [/^(finalizados?|finalized|conclu[ií]dos?)$/i, S.VISUAL_LOCATION.FINALIZED],
  [/^(agendados?|scheduled)$/i, S.VISUAL_LOCATION.SCHEDULED],
  [/^(cancelados?|cancelled|canceled)$/i, S.VISUAL_LOCATION.CANCELLED],
  [/^(resultados? de busca|search.?results)$/i, S.VISUAL_LOCATION.SEARCH_RESULTS],
  [/^(detalhes? do pedido|order.?details)$/i, S.VISUAL_LOCATION.ORDER_DETAILS]
]);

function mapVisualLocation(rawSection) {
  const s = String(rawSection || "").trim();
  for (const [re, canon] of VISUAL_LOCATION_TEXT_MAP) if (re.test(s)) return canon;
  return S.VISUAL_LOCATION.UNKNOWN;
}

function buildVisualDimension(signal) {
  const s = signal || {};
  return {
    location: mapVisualLocation(s.rawSection),
    raw_section: s.rawSection || null,
    layout_mode: s.layoutMode || S.LAYOUT_MODE.UNKNOWN,
    confidence: s.confidence || CONFIDENCE.MEDIUM,
    selector_used: s.selectorUsed || null,
    observed_at: s.observedAt || null
  };
}

/* ---------------------------------------------------------------------------
 * 4. Estado operacional (produção) — sem logística embutida.
 * ------------------------------------------------------------------------- */

const ORDER_STATE_TEXT_MAP = Object.freeze([
  [/^(novo|received|recebido|new|placed)$/i, S.ORDER_STATE.RECEIVED],
  [/^(aceito|accepted|confirmado|confirmed)$/i, S.ORDER_STATE.ACCEPTED],
  [/^(em preparo|preparando|preparing|in.?progress)$/i, S.ORDER_STATE.PREPARING],
  [/^(pronto|ready)$/i, S.ORDER_STATE.READY],
  [/^(finalizado|entregue|conclu[ií]do|completed|finalized|delivered)$/i, S.ORDER_STATE.FINALIZED],
  [/^(cancelado|cancelled|canceled|recusado|declined)$/i, S.ORDER_STATE.CANCELLED]
]);

function mapOrderState(rawStatus) {
  const s = String(rawStatus || "").trim();
  for (const [re, canon] of ORDER_STATE_TEXT_MAP) if (re.test(s)) return canon;
  return S.ORDER_STATE.UNKNOWN;
}

/* ---------------------------------------------------------------------------
 * 5. Prontidão informada e ações — nunca funde botão disponível com evento.
 * ------------------------------------------------------------------------- */

const READY_TEXT_RE = /^(pronto|ready)$/i;
const NOTIFY_LABEL_RE = /avisar pedido pronto|notify.*ready/i;
const CONFIRMED_NOTIFICATION_RE = /entregador (foi )?avisad|courier (has been |was )?notified|pedido pronto avisado/i;

/**
 * @param {object} signal
 *   rawOrderStateText   texto bruto de status (para saber se "pronto" apareceu)
 *   actionPresent       o botão/rótulo "Avisar Pedido Pronto" está na tela?
 *   actionDisabled      o botão está desabilitado/cinza?
 *   confirmationText    texto de confirmação explícito, se houver
 *   observedAt
 */
function buildReadinessDimension(signal) {
  const s = signal || {};
  const looksReady = READY_TEXT_RE.test(String(s.rawOrderStateText || "").trim());
  const hasNotifyAction = s.actionPresent === true;
  const confirmed = s.confirmationText ? CONFIRMED_NOTIFICATION_RE.test(String(s.confirmationText)) : false;

  let readiness = S.READINESS_STATE.UNKNOWN;
  if (confirmed) readiness = S.READINESS_STATE.READY_NOTIFIED;
  else if (hasNotifyAction && !s.actionDisabled) readiness = S.READINESS_STATE.READY_NOTIFICATION_AVAILABLE;
  else if (looksReady) readiness = S.READINESS_STATE.READY_OBSERVED;
  else if (s.rawOrderStateText) readiness = S.READINESS_STATE.NOT_READY;

  const actions = [];
  if (hasNotifyAction || s.actionDisabled) {
    actions.push({
      code: S.ACTION_CODES.NOTIFY_READY,
      raw_label: s.actionLabel || (NOTIFY_LABEL_RE.test(String(s.actionLabel || "")) ? s.actionLabel : null),
      available: hasNotifyAction && !s.actionDisabled,
      disabled: Boolean(s.actionDisabled),
      origin: "ifood_screen",
      confidence: s.confidence || CONFIDENCE.MEDIUM,
      observed_at: s.observedAt || null
    });
  }

  return {
    state: readiness,
    available_actions: actions,
    // Sprint 2.2 (Fase 4, bloqueador 7): distingue "esta leitura CHECOU a
    // área de ações e não achou nenhuma" de "esta leitura não olhou essa
    // área" (cartão compacto, por exemplo). Sem isso, a reconciliação não
    // consegue saber se uma lista vazia significa remoção ou ausência de dado.
    actions_observed: s.actionsObserved === true || s.actionPresent !== undefined || Boolean(s.actionDisabled),
    confirmation_text: s.confirmationText || null,
    observed_at: s.observedAt || null
  };
}

/* ---------------------------------------------------------------------------
 * 6. Logística do entregador — paralela à produção, nunca fundida com ela.
 * ------------------------------------------------------------------------- */

const COURIER_STATE_TEXT_MAP = Object.freeze([
  [/^(procurando entregador|buscando entregador|searching|looking.?for.?courier)$/i, S.COURIER_STATE.SEARCHING],
  [/^(entregador alocado|assigned|atribu[ií]do)$/i, S.COURIER_STATE.ASSIGNED],
  [/^(a caminho da loja|heading.?to.?store|indo para a loja)$/i, S.COURIER_STATE.HEADING_TO_STORE],
  [/^(chegando|arriving|pr[oó]ximo)$/i, S.COURIER_STATE.ARRIVING],
  [/^(na loja|at.?store|chegou na loja)$/i, S.COURIER_STATE.AT_STORE],
  [/^(coletado|collected|retirado pelo entregador)$/i, S.COURIER_STATE.COLLECTED],
  [/^(em rota|in.?route|a caminho do cliente)$/i, S.COURIER_STATE.IN_ROUTE],
  [/^(entregue|delivered)$/i, S.COURIER_STATE.DELIVERED]
]);

function mapCourierState(rawText) {
  const s = String(rawText || "").trim();
  if (!s) return S.COURIER_STATE.NOT_APPLICABLE;
  for (const [re, canon] of COURIER_STATE_TEXT_MAP) if (re.test(s)) return canon;
  return S.COURIER_STATE.UNKNOWN;
}

/**
 * QR Code é RECURSO OPCIONAL da plataforma (ver docs/conference-brain/IFOOD_FUNCTIONAL_MODEL_V1.md).
 * Nunca se presume habilitado; ausência de QR nunca vira "sem entregador".
 */
function buildCourierDimension(signal) {
  const s = signal || {};
  return {
    state: mapCourierState(s.rawText),
    raw_text: s.rawText || null,
    eta_text: s.etaText || null,
    eta_time: s.etaTime || null,
    arrival_confirmed: s.arrivalConfirmed === true,
    // três valores possíveis, nunca dois: presente / ausente / desconhecido — nunca inferido
    qr_code: s.qrPresent === true ? "present" : (s.qrPresent === false ? "absent" : "unknown"),
    modality: s.modality || null,
    source: s.source || "ifood_screen",
    confidence: s.confidence || CONFIDENCE.MEDIUM,
    observed_at: s.observedAt || null
  };
}

/* ---------------------------------------------------------------------------
 * 7. Despacho — própria x iFood x retirada.
 * ------------------------------------------------------------------------- */

const DISPATCH_STATE_TEXT_MAP = Object.freeze([
  [/^(aguardando despacho|awaiting.?dispatch)$/i, S.DISPATCH_STATE.AWAITING_DISPATCH],
  [/^(despachado pela loja|dispatched by store|entrega pr[oó]pria despachada)$/i, S.DISPATCH_STATE.DISPATCHED_BY_STORE],
  [/^(coletado pelo ifood|collected by ifood|retirado pelo ifood)$/i, S.DISPATCH_STATE.COLLECTED_BY_IFOOD]
]);

function mapDispatchState(rawText) {
  const s = String(rawText || "").trim();
  if (!s) return S.DISPATCH_STATE.NOT_APPLICABLE;
  for (const [re, canon] of DISPATCH_STATE_TEXT_MAP) if (re.test(s)) return canon;
  return S.DISPATCH_STATE.UNKNOWN;
}

/* ---------------------------------------------------------------------------
 * 8. Conclusão — nunca apaga o que veio antes.
 * ------------------------------------------------------------------------- */

const COMPLETION_TEXT_MAP = Object.freeze([
  [/^(conclu[ií]do|completed|entregue|delivered|finalizado)$/i, S.COMPLETION_STATE.COMPLETED],
  [/^(cancelado|cancelled|canceled|recusado)$/i, S.COMPLETION_STATE.CANCELLED]
]);

function mapCompletionState(rawText) {
  const s = String(rawText || "").trim();
  for (const [re, canon] of COMPLETION_TEXT_MAP) if (re.test(s)) return canon;
  return s ? S.COMPLETION_STATE.ACTIVE : S.COMPLETION_STATE.UNKNOWN;
}

/* ---------------------------------------------------------------------------
 * 9. Modalidade — só evidência observada, nunca inferida da coluna.
 * ------------------------------------------------------------------------- */

const FULFILLMENT_TEXT_MAP = Object.freeze([
  [/^(entrega ifood|ifood delivery)$/i, S.FULFILLMENT_MODE.IFOOD_DELIVERY],
  [/^(entrega pr[oó]pria|store delivery|entrega da loja)$/i, S.FULFILLMENT_MODE.STORE_DELIVERY],
  [/^(retirada|pickup|customer pickup)$/i, S.FULFILLMENT_MODE.CUSTOMER_PICKUP],
  [/^(mesa|consumo local|table|local)$/i, S.FULFILLMENT_MODE.TABLE_OR_LOCAL],
  [/^(agendado|scheduled)$/i, S.FULFILLMENT_MODE.SCHEDULED]
]);

function mapFulfillmentMode(rawText) {
  const s = String(rawText || "").trim();
  for (const [re, canon] of FULFILLMENT_TEXT_MAP) if (re.test(s)) return canon;
  return S.FULFILLMENT_MODE.UNKNOWN;
}

/* ---------------------------------------------------------------------------
 * Observação completa — reúne todas as dimensões acima. NÃO reúne agenda,
 * agrupamento, indicadores ou saúde da fonte (vivem em módulos próprios,
 * `schedule.js`/`grouping.js`/`indicators.js`/`health.js`) porque essas
 * exigem contexto de mais de um pedido ou de mais de um ciclo.
 * ------------------------------------------------------------------------- */

/**
 * Ponte com o vocabulário COMPLETO do Sprint 2 (`normalizeLiveStatus`, 10
 * estados) para fontes que ainda só fornecem UM texto de status — sem
 * seletor separado de logística (a situação real deste ambiente: nenhum
 * seletor real do Gestor foi mapeado). `departed`/`picked_up` não existem no
 * vocabulário de `order_state` (produção) nem de `completion` — são fatos de
 * `courier_state`. Sem esta ponte, uma fonte unidimensional perderia esse
 * sinal ao passar pelo modelo novo. NUNCA sobrescreve um sinal explícito
 * (`r.courier`/`r.dispatch`) — só preenche quando a fonte não trouxe nada.
 */
function legacyLogisticsHint(orderStateText) {
  if (!orderStateText) return null;
  return normalizeLiveStatus(orderStateText);
}

function buildOrderObservation(raw) {
  const r = raw || {};
  const observedAt = r.observedAt || new Date().toISOString();
  const hint = legacyLogisticsHint(r.orderStateText);

  const courierSignal = Object.assign({}, r.courier);
  if (!courierSignal.rawText && hint === "departed") courierSignal.rawText = "Em rota";
  if (!courierSignal.rawText && hint === "picked_up") courierSignal.rawText = "Coletado";

  return {
    external_id: r.externalId || null,
    observed_at: observedAt,

    layout: buildLayoutDimension(Object.assign({ observedAt }, r.layout)),
    visual: buildVisualDimension(Object.assign({ observedAt }, r.visual)),

    order_state: {
      value: mapOrderState(r.orderStateText),
      raw_text: r.orderStateText || null,
      origin: (r.orderState && r.orderState.origin) || "ifood_screen",
      confidence: (r.orderState && r.orderState.confidence) || CONFIDENCE.MEDIUM,
      event_time: (r.orderState && r.orderState.eventTime) || null,
      observed_interval: (r.orderState && r.orderState.observedInterval) || null,
      observed_at: observedAt
    },

    readiness: buildReadinessDimension(Object.assign({ observedAt, rawOrderStateText: r.orderStateText }, r.readiness)),

    courier: buildCourierDimension(Object.assign({ observedAt }, courierSignal)),

    dispatch: {
      value: mapDispatchState(r.dispatch && r.dispatch.rawText),
      raw_text: (r.dispatch && r.dispatch.rawText) || null,
      confidence: (r.dispatch && r.dispatch.confidence) || CONFIDENCE.MEDIUM,
      observed_at: observedAt
    },

    completion: {
      value: mapCompletionState(r.completionText || r.orderStateText),
      raw_text: r.completionText || null,
      observed_at: observedAt
    },

    fulfillment: {
      value: mapFulfillmentMode(r.fulfillmentText),
      raw_text: r.fulfillmentText || null,
      confidence: r.fulfillmentText ? CONFIDENCE.HIGH : CONFIDENCE.LOW,
      observed_at: observedAt
    },

    // Sprint 2.2 — a rechecagem provou que store_state, itens, observação e
    // valor ficavam de fora da observação multidimensional, apesar da
    // documentação falar em "nove dimensões". Agora entram de verdade.
    store: buildStoreStateDimension(Object.assign({ observedAt }, r.store)),
    items: Array.isArray(r.items) ? r.items : [],
    customer_note: r.customerNote || null,
    total_value: r.totalValue != null ? r.totalValue : null,

    // Sprint 2.3 (bloqueador 2 da rechecagem do 2.2): `reconcileMultidimensional`
    // já sabia reconciliar agrupamento/agenda/indicadores (Grouping.reconcileGrouping,
    // reconcileSchedule, reconcileIndicators) — mas esta função, a única porta
    // de entrada real usada por `observer.js`, nunca aceitava nem repassava
    // esses três sinais. A reconciliação estava pronta; a observação nunca a
    // alimentava. `grouping` ganha `observedAt` por padrão (mesmo padrão das
    // demais dimensões) porque `grouping.js#normalizeGrouping` precisa dele
    // para ordenar temporalmente; `schedule`/`indicators` usam o `observed_at`
    // do nível raiz da observação, já presente.
    grouping: r.grouping ? Object.assign({ observedAt }, r.grouping) : null,
    schedule: r.schedule || null,
    indicatorsObserved: r.indicatorsObserved === true,
    indicators: Array.isArray(r.indicators) ? r.indicators : []
  };
}

module.exports = {
  mapLayoutMode, buildLayoutDimension,
  mapVisualLocation, buildVisualDimension,
  mapOrderState,
  buildReadinessDimension,
  mapCourierState, buildCourierDimension,
  mapDispatchState,
  mapCompletionState,
  mapFulfillmentMode,
  buildOrderObservation, legacyLogisticsHint,
  // vocabulário conhecido, reexportado para o guard de PII (allowlist —
  // ver live/pii-guard.js) reconhecer texto funcional sem duplicar padrões
  LAYOUT_MODE_TEXT_MAP, VISUAL_LOCATION_TEXT_MAP, ORDER_STATE_TEXT_MAP,
  COURIER_STATE_TEXT_MAP, DISPATCH_STATE_TEXT_MAP, COMPLETION_TEXT_MAP,
  FULFILLMENT_TEXT_MAP, NOTIFY_LABEL_RE, CONFIRMED_NOTIFICATION_RE
};
