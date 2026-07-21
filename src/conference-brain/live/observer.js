/* ============================================================================
 * Observador incremental (Sprint 2, Fase 13).
 * ----------------------------------------------------------------------------
 * Orquestra UM ciclo: observar -> normalizar -> reconciliar -> comparar com o
 * estado anterior -> emitir eventos SÓ para mudanças -> persistir -> saúde.
 * Idempotente e retomável: todo o estado por pedido é reconstruído a partir
 * do que já está no `store` (nada vive só em memória de forma insubstituível).
 *
 * Desacoplado do navegador de propósito: recebe `fetchOrders()` — uma função
 * que devolve `{orders, signals}` a cada chamada. Em produção, essa função
 * vem de `browser-adapter.js` (Playwright real); em teste, uma função falsa
 * simula ciclos sucessivos sem precisar de navegador nenhum.
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");
const { classifyCycleHealth, requiresHumanIntervention } = require("./health");
const { normalizeLiveStatus, buildStatusEvent } = require("./status-map");
const { reconcileOrder } = require("./reconciliation");
const { departureEvidence, isReadyMilestone } = require("./ready-departure");
const clock = require("./clock");
const { CLOCK_EVENT_TYPES, CLOCK_EVENT_ORIGIN } = require("../contracts/live-states");

const OBSERVER_VERSION = "conference-live-observer-v1";

function newCycleId() { return crypto.randomBytes(6).toString("hex"); }

/**
 * @param {object} opts
 *   store          instância de storage/store.js (memória ou disco)
 *   fetchOrders    async () -> {orders:[{external_id, raw_status, ...}], signals}
 *   runId          identificador estável desta execução (sobrevive a restart se persistido por quem chama)
 *   collectorVersion
 */
function createLiveObserver(opts) {
  const o = opts || {};
  const store = o.store;
  const runId = o.runId || (OBSERVER_VERSION + ":" + Date.now());

  // Estado por pedido, reconstruído do store a cada chamada — nunca a única cópia.
  function loadOrderState(externalId) {
    const clockEvents = store.all("conference_clock_events").filter((e) => e.order_id === externalId)
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    const observations = store.all("live_observations").filter((r) => r.external_id === externalId)
      .sort((a, b) => String(a.observed_at).localeCompare(String(b.observed_at)));
    return { clockEvents, observations };
  }

  function allKnownExternalIds() {
    return Array.from(new Set(store.all("live_observations").map((r) => r.external_id)));
  }

  /** Executa um ciclo completo. Nunca lança — falha vira saúde `unavailable` + anomalia registrada. */
  async function runCycle() {
    const cycleId = newCycleId();
    const startedAt = new Date().toISOString();
    let fetched;
    try {
      fetched = await o.fetchOrders();
    } catch (e) {
      const rec = {
        run_id: runId, cycle_id: cycleId, started_at: startedAt,
        collector_version: o.collectorVersion || OBSERVER_VERSION,
        source_health: "unavailable", finished_at: new Date().toISOString(),
        errors: [String((e && e.message) || e)]
      };
      store.put("live_cycle_runs", rec);
      return { ok: false, cycle: rec };
    }

    const orders = fetched.orders || [];
    const signals = fetched.signals || {};
    const health = fetched.health || classifyCycleHealth(signals);

    if (requiresHumanIntervention(health.state)) {
      const rec = {
        run_id: runId, cycle_id: cycleId, started_at: startedAt,
        collector_version: o.collectorVersion || OBSERVER_VERSION,
        source_health: health.state, finished_at: new Date().toISOString(),
        notes: "coleta_suspensa:" + health.reason
      };
      store.put("live_cycle_runs", rec);
      return { ok: true, suspended: true, cycle: rec, health };
    }

    const seenIds = new Set();
    const changes = [];
    const newClockEvents = [];
    const cycleErrors = [];

    for (const raw of orders) {
      if (!raw.external_id) continue;
      seenIds.add(raw.external_id);
      const status = normalizeLiveStatus(raw.raw_status);
      const observedAt = new Date().toISOString();
      const { observations: prevObs, clockEvents: prevClock } = loadOrderState(raw.external_id);
      const prevLast = prevObs[prevObs.length - 1] || null;

      const statusEvent = buildStatusEvent(
        prevLast ? { raw_status: prevLast.raw_status, observed_at: prevLast.observed_at } : null,
        { raw_status: raw.raw_status, screen_event_time: raw.screen_event_time || null, observed_at: observedAt }
      );

      const liveObs = {
        run_id: runId, cycle_id: cycleId, external_id: raw.external_id,
        observed_at: observedAt, raw_status: raw.raw_status || "",
        source_health: health.state, confidence: statusEvent.confidence,
        status, items: raw.items || undefined, last_change_detected_at: statusEvent.changed ? observedAt : undefined
      };
      const putRes = store.put("live_observations", liveObs);
      if (!putRes.ok) cycleErrors.push(`observacao_rejeitada:${raw.external_id}:${(putRes.errors || []).join(",")}`);

      if (statusEvent.changed) {
        changes.push({ external_id: raw.external_id, from: prevLast && normalizeLiveStatus(prevLast.raw_status), to: status });

        // Único evento do relógio emitido automaticamente pela tela: PRONTO.
        // Todo o resto do relógio é ação humana (ver clock.js/readyDoesNotImplyStarted).
        if (isReadyMilestone(status) && clock.currentClockState(prevClock) == null) {
          const r = clock.recordEvent({
            order_id: raw.external_id, event_type: CLOCK_EVENT_TYPES.READY_OBSERVED,
            event_time: statusEvent.event_time, observed_at: observedAt,
            origin: CLOCK_EVENT_ORIGIN.IFOOD_SCREEN, confidence: statusEvent.confidence,
            raw_status: raw.raw_status, existing_events: prevClock
          });
          if (r.ok) { store.put("conference_clock_events", r.event); newClockEvents.push(r.event); }
          else cycleErrors.push(`evento_ready_rejeitado:${raw.external_id}:${r.reason}`);
        }

        // Saída real só é auto-emitida quando COMPROVADA (nunca a partir de "completed" sozinho).
        const history = prevObs.map((x) => normalizeLiveStatus(x.raw_status)).concat([status]);
        const dep = departureEvidence(history);
        if (dep.observed && !prevClock.some((e) => e.event_type === CLOCK_EVENT_TYPES.DEPARTED_OBSERVED)) {
          const r = clock.recordEvent({
            order_id: raw.external_id, event_type: CLOCK_EVENT_TYPES.DEPARTED_OBSERVED,
            observed_at: observedAt, origin: CLOCK_EVENT_ORIGIN.IFOOD_SCREEN,
            confidence: statusEvent.confidence, raw_status: raw.raw_status, existing_events: prevClock
          });
          if (r.ok) { store.put("conference_clock_events", r.event); newClockEvents.push(r.event); }
          else cycleErrors.push(`evento_saida_rejeitado:${raw.external_id}:${r.reason}`);
        }
      }
    }

    // Pedidos que sumiram da tela: nunca presumir saída — só marcar e aguardar.
    const missing = allKnownExternalIds().filter((id) => !seenIds.has(id));
    for (const id of missing) {
      const { observations } = loadOrderState(id);
      const last = observations[observations.length - 1];
      if (!last || last.status === "completed" || last.status === "cancelled") continue; // já concluído, não é "sumiço"
      if (last.missing_from_view) continue; // já registrado, não repete
      store.put("live_observations", Object.assign({}, last, {
        run_id: runId, cycle_id: cycleId, observed_at: new Date().toISOString(),
        source_health: health.state, missing_from_view: true
      }));
    }

    const cycleRec = {
      run_id: runId, cycle_id: cycleId, started_at: startedAt,
      finished_at: new Date().toISOString(),
      collector_version: o.collectorVersion || OBSERVER_VERSION,
      source_health: health.state,
      orders_observed: orders.length,
      fields_missing: signals.criticalFieldsMissing || [],
      errors: cycleErrors
    };
    store.put("live_cycle_runs", cycleRec);

    return { ok: true, cycle: cycleRec, health, changes, newClockEvents };
  }

  return { runCycle, loadOrderState };
}

module.exports = { OBSERVER_VERSION, createLiveObserver };
