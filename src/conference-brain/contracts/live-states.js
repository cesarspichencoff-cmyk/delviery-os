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

/** Estados canônicos do pedido observados na TELA ao vivo (vocabulário da missão). */
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

module.exports = {
  LIVE_SOURCE_HEALTH, LIVE_SOURCE_HEALTH_LIST, LIVE_HEALTH_REQUIRES_HUMAN,
  LIVE_ORDER_STATUS, LIVE_ORDER_STATUS_LIST, LIVE_TO_SPRINT1_STATUS,
  CLOCK_EVENT_TYPES, CLOCK_EVENT_TYPE_LIST,
  CLOCK_EVENT_ORIGIN, CLOCK_EVENT_ORIGIN_LIST,
  CLOCK_VALID_NEXT
};
