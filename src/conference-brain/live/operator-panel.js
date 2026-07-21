/* ============================================================================
 * Painel interno mínimo — lógica pura (Sprint 2, Fase 11).
 * ----------------------------------------------------------------------------
 * Este módulo NÃO desenha nada. É a máquina de estados que decide quais ações
 * aparecem para qual pedido — a superfície HTTP fica em
 * tools/conference-brain/operator-panel-server.js, atrás da flag
 * `conferenceOperatorPanelV1`, nunca conectada à interface pública do Copiloto.
 *
 * Regra de produto: no máximo as ações válidas para o estado atual — nunca os
 * sete botões ao mesmo tempo. Sem identificação de funcionário, sem ranking,
 * sem pontuação — cada ação vira um evento do relógio com `origin:
 * "operator_manual"`, sem nome de quem tocou.
 * ==========================================================================*/
"use strict";

const { CLOCK_EVENT_TYPES } = require("../contracts/live-states");
const { currentClockState } = require("./clock");
const T = CLOCK_EVENT_TYPES;

/** Ação compacta -> evento do relógio que ela gera. */
const ACTIONS = Object.freeze({
  start: { label: "Iniciar", event: T.CONFERENCE_STARTED },
  waiting: { label: "Aguardando item", event: T.WAITING_FOR_ITEM },
  resume: { label: "Retomar", event: T.CONFERENCE_RESUMED },
  complete: { label: "Finalizar", event: T.CONFERENCE_COMPLETED },
  release: { label: "Liberar", event: T.RELEASED },
  depart: { label: "Saiu", event: T.DEPARTED_OBSERVED },
  cancel: { label: "Cancelar evento", event: T.CANCELLED }
});

/** Ações válidas por último estado — só as que fazem sentido, nunca todas. */
const ACTIONS_BY_STATE = Object.freeze({
  [T.READY_OBSERVED]: ["start"],
  [T.CONFERENCE_STARTED]: ["waiting", "complete"],
  [T.WAITING_FOR_ITEM]: ["resume"],
  [T.CONFERENCE_RESUMED]: ["waiting", "complete"],
  [T.CONFERENCE_COMPLETED]: ["release"],
  [T.RELEASED]: ["depart"],
  [T.DEPARTED_OBSERVED]: [],
  [T.CANCELLED]: []
});

/** Estados a partir dos quais uma correção (cancelar) ainda faz sentido. */
const CANCELLABLE_FROM = Object.freeze([
  T.READY_OBSERVED, T.CONFERENCE_STARTED, T.WAITING_FOR_ITEM,
  T.CONFERENCE_RESUMED, T.CONFERENCE_COMPLETED, T.RELEASED
]);

/** Ações visíveis para o pedido, dado o histórico de eventos do relógio. */
function visibleActions(events) {
  const state = currentClockState(events);
  const actions = (ACTIONS_BY_STATE[state] || []).slice();
  if (CANCELLABLE_FROM.includes(state)) actions.push("cancel");
  return actions.map((key) => ({ key, label: ACTIONS[key].label, irreversible: key === "cancel" }));
}

/** Resumo compacto de um pedido para a lista do painel — só o que a Fase 11 pede. */
function panelRow(order) {
  const events = order.clock_events || [];
  const state = currentClockState(events) || "sem_relogio";
  const readyEvent = events.find((e) => e.event_type === T.READY_OBSERVED);
  const readyAt = readyEvent ? (readyEvent.event_time || readyEvent.observed_at) : null;
  const readyMs = readyAt ? Date.parse(readyAt) : NaN;
  const minutesSinceReady = Number.isFinite(readyMs) ? Math.round((Date.now() - readyMs) / 60000) : null;

  return {
    short_id: order.short_id || order.external_id,
    minutes_since_ready: minutesSinceReady,
    state,
    volumes: order.volumes != null ? order.volumes : null,
    warnings: order.warnings || [],
    source_health: order.source_health || "desconhecida",
    actions: visibleActions(events)
  };
}

/**
 * Aplica uma ação escolhida no painel — delega ao relógio (clock.js), nunca
 * decide sozinho. `confirmToken` é exigido para `cancel` (confirmação leve
 * para evento irreversível, Fase 11) — sem ele, a ação é recusada.
 */
function applyAction(actionKey, ctx) {
  const action = ACTIONS[actionKey];
  if (!action) return { ok: false, reason: "acao_desconhecida:" + actionKey };
  if (action.event === T.CANCELLED && !ctx.confirmToken) {
    return { ok: false, reason: "confirmacao_obrigatoria_para_acao_irreversivel" };
  }
  const clock = require("./clock");
  return clock.recordEvent({
    order_id: ctx.order_id,
    event_type: action.event,
    observed_at: ctx.observed_at || new Date().toISOString(),
    origin: "operator_manual",
    reason: ctx.reason || null,
    existing_events: ctx.existing_events || []
  });
}

module.exports = { ACTIONS, ACTIONS_BY_STATE, CANCELLABLE_FROM, visibleActions, panelRow, applyAction };
