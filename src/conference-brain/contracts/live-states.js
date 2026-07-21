/* ============================================================================
 * Estados do OBSERVADOR AO VIVO (Sprint 2) — vocabulário próprio, separado do
 * vocabulário do Sprint 1 (contracts/states.js).
 * ----------------------------------------------------------------------------
 * Por quê separado: o Sprint 1 observa um RELATÓRIO histórico (fonte binária:
 * disponível/parcial/indisponível). O Sprint 2 observa uma TELA ao vivo, que
 * pode falhar de formas que um relatório não falha — layout mudou, pediu
 * login, mostrou CAPTCHA, ficou parada. Fundir os dois vocabulários faria a
 * saúde do observador ao vivo perder informação ao ser lida pelo código do
 * Sprint 1. Ficam separados; quem precisa cruzar os dois faz isso de forma
 * explícita (ver live/health.js).
 * ==========================================================================*/
"use strict";

/** Saúde da fonte AO VIVO — mais granular que SOURCE_STATES do Sprint 1. */
const LIVE_SOURCE_HEALTH = Object.freeze({
  AVAILABLE: "available",
  PARTIAL: "partial",
  STALE: "stale",
  LAYOUT_CHANGED: "layout_changed",
  LOGIN_REQUIRED: "login_required",
  CAPTCHA_PRESENT: "captcha_present",
  INCONSISTENT: "inconsistent",
  UNAVAILABLE: "unavailable",
  RECOVERING: "recovering"
});
const LIVE_SOURCE_HEALTH_LIST = Object.freeze(Object.values(LIVE_SOURCE_HEALTH));

/** Estados que exigem intervenção humana — a coleta se SUSPENDE, nunca contorna. */
const LIVE_HEALTH_REQUIRES_HUMAN = Object.freeze([
  LIVE_SOURCE_HEALTH.LOGIN_REQUIRED,
  LIVE_SOURCE_HEALTH.CAPTCHA_PRESENT
]);

/**
 * @deprecated (Sprint 2.1) Vocabulário UNIDIMENSIONAL original do Sprint 2 —
 * mantido só por compatibilidade (consumidores e testes existentes). A
 * auditoria independente (`docs/auditoria/CONFERENCE_BRAIN_SPRINT2_AUDIT.md`)
 * apontou que ele mistura produção, prontidão informada e logística num
 * único eixo — risco material de colar coluna visual, botão "Avisar Pedido
 * Pronto" e evento de entregador no mesmo campo. A partir do Sprint 2.1, a
 * fonte de verdade é a observação MULTIDIMENSIONAL (`live/multidimensional-observation.js`):
 * `order_state` (produção) + `readiness_state`/`available_actions` (prontidão
 * informada) + `courier_state` (logística iFood) + `dispatch_state`
 * (logística própria) + `completion_state`, cada um com seu próprio histórico
 * e confiança. Este enum não é removido — `live/legacy-compat.js#deriveLegacyLiveStatus`
 * projeta a observação nova de volta neste vocabulário para quem ainda
 * consome só um status.
 */
const LIVE_ORDER_STATUS = Object.freeze({
  RECEIVED: "received",
  ACCEPTED: "accepted",
  PREPARING: "preparing",
  READY: "ready",
  AWAITING_PICKUP: "awaiting_pickup",
  PICKED_UP: "picked_up",
  DEPARTED: "departed",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  UNKNOWN: "unknown"
});
const LIVE_ORDER_STATUS_LIST = Object.freeze(Object.values(LIVE_ORDER_STATUS));

/**
 * Ponte para o vocabulário do Sprint 1 (ORDER_STATUS), só para reaproveitar
 * snapshots/estado sombra já existentes. É uma projeção COM PERDA de
 * propósito — o Sprint 1 não distingui aceito/preparando/aguardando retirada
 * — e por isso nunca deve substituir o status ao vivo original, só acompanhá-lo.
 */
const LIVE_TO_SPRINT1_STATUS = Object.freeze({
  received: "recebido",
  accepted: "recebido",
  preparing: "recebido",
  ready: "pronto",
  awaiting_pickup: "pronto",
  picked_up: "saiu",
  departed: "saiu",
  completed: "concluido",
  cancelled: "cancelado",
  unknown: "desconhecido"
});

/** Tipos de evento do relógio mínimo da Conferência. */
const CLOCK_EVENT_TYPES = Object.freeze({
  READY_OBSERVED: "ready_observed",
  CONFERENCE_STARTED: "conference_started",
  WAITING_FOR_ITEM: "waiting_for_item",
  CONFERENCE_RESUMED: "conference_resumed",
  CONFERENCE_COMPLETED: "conference_completed",
  RELEASED: "released",
  DEPARTED_OBSERVED: "departed_observed",
  CANCELLED: "cancelled"
});
const CLOCK_EVENT_TYPE_LIST = Object.freeze(Object.values(CLOCK_EVENT_TYPES));

/** Origem permitida de um evento do relógio. */
const CLOCK_EVENT_ORIGIN = Object.freeze({
  IFOOD_SCREEN: "ifood_screen",
  OPERATOR_MANUAL: "operator_manual",
  SYSTEM_INFERENCE: "system_inference",
  IMPORTED_HISTORY: "imported_history"
});
const CLOCK_EVENT_ORIGIN_LIST = Object.freeze(Object.values(CLOCK_EVENT_ORIGIN));

/**
 * Transições válidas do relógio da Conferência. Chave = evento atual;
 * valor = eventos que podem vir a seguir. `ready_observed` é a entrada.
 *
 * `cancelled` e `departed_observed` são tratados à parte (em
 * `live/clock.js#isValidTransition`), fora deste grafo: são FATOS observados
 * na tela, não passos do fluxo humano de Conferência, e por isso podem
 * acontecer a partir de qualquer estado — inclusive quando ninguém tocou o
 * painel interno (ex.: operação que não usa Conferência para pedidos de
 * retirada simples, ou o observador sendo ligado no meio de um pedido já em
 * andamento). Modelar `departed_observed` como só alcançável depois de
 * `released` faria o observador DESCARTAR uma saída real só porque o humano
 * não registrou os passos internos — o que seria mentir por omissão.
 */
const CLOCK_VALID_NEXT = Object.freeze({
  [CLOCK_EVENT_TYPES.READY_OBSERVED]: [CLOCK_EVENT_TYPES.CONFERENCE_STARTED],
  [CLOCK_EVENT_TYPES.CONFERENCE_STARTED]: [
    CLOCK_EVENT_TYPES.WAITING_FOR_ITEM, CLOCK_EVENT_TYPES.CONFERENCE_COMPLETED
  ],
  [CLOCK_EVENT_TYPES.WAITING_FOR_ITEM]: [CLOCK_EVENT_TYPES.CONFERENCE_RESUMED],
  [CLOCK_EVENT_TYPES.CONFERENCE_RESUMED]: [
    CLOCK_EVENT_TYPES.WAITING_FOR_ITEM, CLOCK_EVENT_TYPES.CONFERENCE_COMPLETED
  ],
  [CLOCK_EVENT_TYPES.CONFERENCE_COMPLETED]: [CLOCK_EVENT_TYPES.RELEASED],
  [CLOCK_EVENT_TYPES.RELEASED]: [CLOCK_EVENT_TYPES.DEPARTED_OBSERVED],
  [CLOCK_EVENT_TYPES.DEPARTED_OBSERVED]: [],
  [CLOCK_EVENT_TYPES.CANCELLED]: []
});

/* ============================================================================
 * Sprint 2.1 — modelo MULTIDIMENSIONAL. Cada dimensão abaixo descreve um
 * FATO INDEPENDENTE do pedido; nenhuma "vence" as outras, nenhuma é derivada
 * da outra por suposição. Fundamentado em funcionalidade OFICIAL do Gestor de
 * Pedidos iFood documentada publicamente (blog-parceiros.ifood.com.br,
 * consultado em 2026-07-21 — ver docs/conference-brain/IFOOD_FUNCTIONAL_MODEL_V1.md)
 * — NUNCA em DOM real, que continua não observado nesta missão.
 * ==========================================================================*/

/** Em qual MODO da interface o cartão foi observado. Nunca representa o pedido. */
const LAYOUT_MODE = Object.freeze({
  EXPEDITION: "expedition",
  BOARDS: "boards",
  ORDER_DETAILS: "order_details",
  UNKNOWN: "unknown"
});
const LAYOUT_MODE_LIST = Object.freeze(Object.values(LAYOUT_MODE));

/** ONDE o cartão apareceu (coluna/seção) — evidência, nunca prova de evento. */
const VISUAL_LOCATION = Object.freeze({
  ACCEPT: "accept",
  PREPARING: "preparing",
  READY: "ready",
  IN_ROUTE: "in_route",
  FINALIZED: "finalized",
  SCHEDULED: "scheduled",
  CANCELLED: "cancelled",
  SEARCH_RESULTS: "search_results",
  ORDER_DETAILS: "order_details",
  UNKNOWN: "unknown"
});
const VISUAL_LOCATION_LIST = Object.freeze(Object.values(VISUAL_LOCATION));

/** Situação de PRODUÇÃO do pedido — sem logística embutida. */
const ORDER_STATE = Object.freeze({
  RECEIVED: "received",
  ACCEPTED: "accepted",
  PREPARING: "preparing",
  READY: "ready",
  FINALIZED: "finalized",
  CANCELLED: "cancelled",
  UNKNOWN: "unknown"
});
const ORDER_STATE_LIST = Object.freeze(Object.values(ORDER_STATE));
/** Ordem de progressão natural — só para detectar regressão, nunca peso/score. */
const ORDER_STATE_RANK = Object.freeze(
  [ORDER_STATE.RECEIVED, ORDER_STATE.ACCEPTED, ORDER_STATE.PREPARING, ORDER_STATE.READY, ORDER_STATE.FINALIZED]
);

/** PRONTIDÃO informada — distinta de "estar na coluna Pronto". */
const READINESS_STATE = Object.freeze({
  NOT_READY: "not_ready",
  READY_OBSERVED: "ready_observed",
  READY_NOTIFIED: "ready_notified",
  READY_NOTIFICATION_AVAILABLE: "ready_notification_available",
  UNKNOWN: "unknown"
});
const READINESS_STATE_LIST = Object.freeze(Object.values(READINESS_STATE));

/** Código de ação observável no cartão/detalhe. O observador NUNCA clica nelas. */
const ACTION_CODES = Object.freeze({
  NOTIFY_READY: "notify_ready"
});

/** Situação do ENTREGADOR — logística iFood, paralela à produção. */
const COURIER_STATE = Object.freeze({
  NOT_APPLICABLE: "not_applicable",
  SEARCHING: "searching",
  ASSIGNED: "assigned",
  HEADING_TO_STORE: "heading_to_store",
  ARRIVING: "arriving",
  AT_STORE: "at_store",
  COLLECTED: "collected",
  IN_ROUTE: "in_route",
  DELIVERED: "delivered",
  UNKNOWN: "unknown"
});
const COURIER_STATE_LIST = Object.freeze(Object.values(COURIER_STATE));

/** DESPACHO — distingue logística própria, do iFood e retirada. */
const DISPATCH_STATE = Object.freeze({
  NOT_APPLICABLE: "not_applicable",
  AWAITING_DISPATCH: "awaiting_dispatch",
  DISPATCHED_BY_STORE: "dispatched_by_store",
  COLLECTED_BY_IFOOD: "collected_by_ifood",
  UNKNOWN: "unknown"
});
const DISPATCH_STATE_LIST = Object.freeze(Object.values(DISPATCH_STATE));

/** CONCLUSÃO — nunca apaga histórico de preparo/prontidão/logística. */
const COMPLETION_STATE = Object.freeze({
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  UNKNOWN: "unknown"
});
const COMPLETION_STATE_LIST = Object.freeze(Object.values(COMPLETION_STATE));

/** MODALIDADE — só a partir de evidência observada, nunca inferida da coluna. */
const FULFILLMENT_MODE = Object.freeze({
  IFOOD_DELIVERY: "ifood_delivery",
  STORE_DELIVERY: "store_delivery",
  CUSTOMER_PICKUP: "customer_pickup",
  TABLE_OR_LOCAL: "table_or_local",
  SCHEDULED: "scheduled",
  UNKNOWN: "unknown"
});
const FULFILLMENT_MODE_LIST = Object.freeze(Object.values(FULFILLMENT_MODE));

/** Estado da LOJA — separado da saúde técnica da fonte (ver live/store-state.js). */
const STORE_STATE = Object.freeze({
  OPEN: "open",
  CLOSED_BY_SCHEDULE: "closed_by_schedule",
  CLOSED_MANUALLY: "closed_manually",
  CLOSED_BY_CONNECTIVITY: "closed_by_connectivity",
  TEMPORARILY_UNAVAILABLE: "temporarily_unavailable",
  UNKNOWN: "unknown"
});
const STORE_STATE_LIST = Object.freeze(Object.values(STORE_STATE));

/**
 * Códigos de indicador/alerta do cartão (Fase 12). Cada um é classificado
 * (indicador/alerta/atributo) em live/indicators.js — aqui só o vocabulário.
 */
const INDICATOR_CODES = Object.freeze({
  PREPARATION_TIME_REMAINING: "PREPARATION_TIME_REMAINING",
  HALF_PREPARATION_TIME_REACHED: "HALF_PREPARATION_TIME_REACHED",
  PREPARATION_DELAYED: "PREPARATION_DELAYED",
  COURIER_SEARCHING: "COURIER_SEARCHING",
  COURIER_ETA: "COURIER_ETA",
  COURIER_AT_STORE: "COURIER_AT_STORE",
  CHAT_PENDING: "CHAT_PENDING",
  NEGOTIATION_PENDING: "NEGOTIATION_PENDING",
  GROUPED_DELIVERY: "GROUPED_DELIVERY",
  SCHEDULED_ORDER: "SCHEDULED_ORDER"
});
const INDICATOR_CODE_LIST = Object.freeze(Object.values(INDICATOR_CODES));

module.exports = {
  LIVE_SOURCE_HEALTH, LIVE_SOURCE_HEALTH_LIST, LIVE_HEALTH_REQUIRES_HUMAN,
  LIVE_ORDER_STATUS, LIVE_ORDER_STATUS_LIST, LIVE_TO_SPRINT1_STATUS,
  CLOCK_EVENT_TYPES, CLOCK_EVENT_TYPE_LIST,
  CLOCK_EVENT_ORIGIN, CLOCK_EVENT_ORIGIN_LIST,
  CLOCK_VALID_NEXT,
  // Sprint 2.1 — multidimensional
  LAYOUT_MODE, LAYOUT_MODE_LIST,
  VISUAL_LOCATION, VISUAL_LOCATION_LIST,
  ORDER_STATE, ORDER_STATE_LIST, ORDER_STATE_RANK,
  READINESS_STATE, READINESS_STATE_LIST, ACTION_CODES,
  COURIER_STATE, COURIER_STATE_LIST,
  DISPATCH_STATE, DISPATCH_STATE_LIST,
  COMPLETION_STATE, COMPLETION_STATE_LIST,
  FULFILLMENT_MODE, FULFILLMENT_MODE_LIST,
  STORE_STATE, STORE_STATE_LIST,
  INDICATOR_CODES, INDICATOR_CODE_LIST
};
