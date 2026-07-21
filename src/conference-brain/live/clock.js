/* ============================================================================
 * Relógio mínimo da Conferência (Sprint 2, Fase 10).
 * ----------------------------------------------------------------------------
 * Puro, sem I/O. Um evento do relógio é um FATO append-only: uma vez criado,
 * não é editado — uma correção é um evento novo com `reason`, nunca uma
 * reescrita silenciosa. `automatic_decisions_allowed` continua false (Sprint 1,
 * flags.js); nada aqui decide sozinho — cada evento tem `origin`, e só
 * `system_inference` é gerado sem toque humano, sempre marcado como tal.
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");
const {
  CLOCK_EVENT_TYPES, CLOCK_EVENT_TYPE_LIST, CLOCK_EVENT_ORIGIN, CLOCK_VALID_NEXT
} = require("../contracts/live-states");
const { CONFIDENCE } = require("../contracts/states");

const CLOCK_VERSION = "conference-clock-v1";

/** ID idempotente: mesmo pedido + tipo + sequência => mesmo id, mesmo em retentativa. */
function eventId(orderId, eventType, sequence) {
  return crypto.createHash("sha256").update(`${orderId}|${eventType}|${sequence}`).digest("hex").slice(0, 24);
}

/**
 * Estado do relógio de UM pedido a partir do seu histórico de eventos —
 * recalculável a qualquer momento, nunca guardado como verdade paralela.
 */
function currentClockState(events) {
  const sorted = (events || []).slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  const last = sorted[sorted.length - 1];
  return last ? last.event_type : null;
}

/** Eventos que são FATOS observados na tela, não passos do fluxo humano — ver contracts/live-states.js. */
const FREE_TRANSITION_EVENTS = Object.freeze([
  CLOCK_EVENT_TYPES.CANCELLED, CLOCK_EVENT_TYPES.DEPARTED_OBSERVED
]);

/**
 * Um evento pode ser adicionado ao histórico? `cancelled` e `departed_observed`
 * sempre podem ocorrer (são fatos da tela, não etapas do painel — ver
 * contracts/live-states.js); os demais seguem CLOCK_VALID_NEXT. Não decide SE
 * deve acontecer — só se é uma transição estruturalmente válida.
 */
function isValidTransition(fromEventType, toEventType) {
  if (FREE_TRANSITION_EVENTS.includes(toEventType)) return true;
  if (!fromEventType) return toEventType === CLOCK_EVENT_TYPES.READY_OBSERVED;
  const allowed = CLOCK_VALID_NEXT[fromEventType] || [];
  return allowed.includes(toEventType);
}

/**
 * Registra um evento no relógio de um pedido. Nunca lança: transição inválida
 * vira `{ok:false, reason}` para o chamador decidir (registrar como anomalia,
 * pedir confirmação no painel etc.) — o relógio em si não aborta o processo.
 *
 * @param {object} opts
 *   order_id, event_type, event_time (pode ser null — ver status-map.js),
 *   observed_at, origin, confidence, reason (opcional), raw_status (opcional),
 *   existing_events (histórico atual do pedido, para validar a transição)
 */
function recordEvent(opts) {
  const o = opts || {};
  if (!o.order_id) return { ok: false, reason: "order_id_obrigatorio" };
  if (!CLOCK_EVENT_TYPE_LIST.includes(o.event_type)) {
    return { ok: false, reason: "event_type_invalido:" + o.event_type };
  }
  if (!Object.values(CLOCK_EVENT_ORIGIN).includes(o.origin)) {
    return { ok: false, reason: "origin_invalida:" + o.origin };
  }

  const existing = o.existing_events || [];
  const fromType = currentClockState(existing);
  if (!isValidTransition(fromType, o.event_type)) {
    return {
      ok: false,
      reason: `transicao_invalida:${fromType || "(inicio)"}->${o.event_type}`
    };
  }

  const sequence = existing.length;
  const event = {
    event_id: eventId(o.order_id, o.event_type, sequence),
    order_id: o.order_id,
    event_type: o.event_type,
    event_time: o.event_time || o.observed_at || null,
    observed_at: o.observed_at || new Date().toISOString(),
    origin: o.origin,
    confidence: o.confidence || (o.origin === CLOCK_EVENT_ORIGIN.OPERATOR_MANUAL ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM),
    reason: o.reason || null,
    raw_status: o.raw_status || null,
    collector_version: CLOCK_VERSION,
    sequence
  };
  return { ok: true, event };
}

/**
 * Regra explícita da missão: nunca inferir `conference_started` só porque o
 * pedido ficou pronto. `ready_observed` é reflexo direto da tela; iniciar a
 * Conferência é ação humana (`operator_manual`) ou, no máximo, uma inferência
 * declarada como tal — nunca automática e silenciosa.
 */
function readyDoesNotImplyStarted() { return true; }

module.exports = {
  CLOCK_VERSION, CLOCK_EVENT_TYPES, CLOCK_EVENT_ORIGIN,
  eventId, currentClockState, isValidTransition, recordEvent, readyDoesNotImplyStarted
};
