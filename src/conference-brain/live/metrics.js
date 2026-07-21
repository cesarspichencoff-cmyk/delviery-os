/* ============================================================================
 * Métricas derivadas do relógio da Conferência (Sprint 2, Fase 12).
 * ----------------------------------------------------------------------------
 * Puro. NÃO integra ao estado oficial nem ao estado sombra — são números
 * calculados sobre os eventos do relógio, para uso futuro (Sprint 3), sem
 * promoção nenhuma nesta fase. Carimbo ausente => métrica `null`, nunca 0.
 * ==========================================================================*/
"use strict";

const { CLOCK_EVENT_TYPES } = require("../contracts/live-states");
const T = CLOCK_EVENT_TYPES;

function timeOf(ev) {
  if (!ev) return null;
  const t = ev.event_time || ev.observed_at;
  return t ? Date.parse(t) : null;
}
function deltaMs(a, b) {
  const ta = timeOf(a), tb = timeOf(b);
  if (ta == null || tb == null) return null;
  return tb - ta;
}
function firstOf(events, type) { return events.find((e) => e.event_type === type) || null; }
function lastOf(events, type) {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].event_type === type) return events[i];
  return null;
}

/**
 * Métricas de UM pedido a partir do seu histórico de eventos (ordenado por
 * `sequence`). Cada campo é `null` quando os dois carimbos que a compõem
 * não existem — nunca estimado.
 */
function orderMetrics(events) {
  const list = Array.isArray(events) ? events : [];
  const ready = firstOf(list, T.READY_OBSERVED);
  const started = firstOf(list, T.CONFERENCE_STARTED);
  const completed = lastOf(list, T.CONFERENCE_COMPLETED);
  const released = lastOf(list, T.RELEASED);
  const departed = lastOf(list, T.DEPARTED_OBSERVED);

  // tempo total em pausa (pode haver mais de um ciclo aguardando/retomando).
  // Uma pausa ainda aberta (sem retomada observada) torna o total `null` —
  // ainda está acontecendo, somar um valor parcial fingiria que acabou.
  const waitingEvents = list.filter((e) => e.event_type === T.WAITING_FOR_ITEM);
  let waitingMs = 0, hasOpenPause = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].event_type !== T.WAITING_FOR_ITEM) continue;
    const resume = list.slice(i + 1).find((e) => e.event_type === T.CONFERENCE_RESUMED);
    if (!resume) { hasOpenPause = true; continue; }
    const d = deltaMs(list[i], resume);
    if (d == null) hasOpenPause = true; else waitingMs += d;
  }
  const waitingForItemMs = !waitingEvents.length ? 0 : (hasOpenPause ? null : waitingMs);

  const totalConferenceMs = deltaMs(started, completed);
  const activeConferenceMs = (totalConferenceMs != null && typeof waitingForItemMs === "number")
    ? totalConferenceMs - waitingForItemMs : totalConferenceMs;

  return {
    ready_to_conference_started_ms: deltaMs(ready, started),
    active_conference_ms: activeConferenceMs,
    waiting_for_item_ms: waitingForItemMs,
    completion_to_release_ms: deltaMs(completed, released),
    release_to_departure_ms: deltaMs(released, departed),
    ready_to_departure_ms: deltaMs(ready, departed)
  };
}

/**
 * Estado da frota inteira: para cada pedido, seu ÚLTIMO evento do relógio
 * decide em qual balde ele entra. Pedidos concluídos/cancelados/sem relógio
 * ainda (só `ready_observed`) contam corretamente em "aguardando Conferência".
 */
function fleetCounts(ordersLastEventType) {
  const counts = {
    awaiting_conference: 0, in_conference: 0, awaiting_item: 0, released_not_departed: 0
  };
  for (const lastType of Object.values(ordersLastEventType || {})) {
    if (lastType === T.READY_OBSERVED) counts.awaiting_conference++;
    else if (lastType === T.CONFERENCE_STARTED || lastType === T.CONFERENCE_RESUMED) counts.in_conference++;
    else if (lastType === T.WAITING_FOR_ITEM) counts.awaiting_item++;
    else if (lastType === T.RELEASED) counts.released_not_departed++;
  }
  return counts;
}

module.exports = { orderMetrics, fleetCounts, timeOf, deltaMs };
