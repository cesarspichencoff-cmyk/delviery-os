/* ============================================================================
 * Motor de snapshots — janelas operacionais explicáveis.
 * ----------------------------------------------------------------------------
 * Puro (sem I/O). Toda grandeza é uma CONTAGEM OBSERVÁVEL, não um índice
 * abstrato: qualquer número aqui pode ser conferido a olho contra os pedidos.
 *
 * Honestidade estrutural: "pedidos ativos" e "convergência" exigem carimbo de
 * PRONTO. Quando a fonte não observa `ready_at` (caso do histórico), estes
 * campos vêm `null` e a janela é marcada como parcial — jamais estimados.
 * ==========================================================================*/
"use strict";

const { SOURCE_STATES, CONFIDENCE } = require("../contracts/states");
const { SNAPSHOT_WINDOW_V1 } = require("../contracts/rule-version");

const MS_MIN = 60000;

const ts = (v) => { if (!v) return null; const t = Date.parse(v); return Number.isNaN(t) ? null : t; };
const floorTo = (t, min) => Math.floor(t / (min * MS_MIN)) * (min * MS_MIN);

/**
 * Constrói snapshots a partir de pedidos normalizados.
 * @param {Array} orders  pedidos (contrato `orders`)
 * @param {object} [opts] { windowMinutes, sourceState, now }
 * @returns {Array} snapshots (contrato `operational_snapshots`)
 */
function buildSnapshots(orders, opts) {
  const options = opts || {};
  const win = options.windowMinutes || SNAPSHOT_WINDOW_V1.params.window_minutes;
  if (!SNAPSHOT_WINDOW_V1.params.supported_minutes.includes(win)) {
    throw new Error("janela_nao_suportada:" + win);
  }
  const list = Array.isArray(orders) ? orders : [];

  // A fonte observa "pronto"? Define o que é afirmável.
  const withReady = list.filter((o) => ts(o.ready_at) !== null).length;
  const hasReady = withReady > 0;
  const readyCoverage = list.length ? withReady / list.length : 0;

  let sourceState = options.sourceState ||
    (hasReady ? SOURCE_STATES.AVAILABLE : SOURCE_STATES.PARTIAL);
  if (hasReady && readyCoverage < 0.9 && sourceState === SOURCE_STATES.AVAILABLE) {
    sourceState = SOURCE_STATES.PARTIAL;
  }

  const events = [];
  for (const o of list) {
    const r = ts(o.received_at);
    const rd = ts(o.ready_at);
    const cc = ts(o.concluded_at) || ts(o.dispatched_at);
    if (r !== null) events.push({ t: r, kind: "received", o });
    if (rd !== null) events.push({ t: rd, kind: "ready", o });
    if (cc !== null) events.push({ t: cc, kind: "concluded", o });
  }
  if (!events.length) return [];

  const min = floorTo(Math.min(...events.map((e) => e.t)), win);
  const max = floorTo(Math.max(...events.map((e) => e.t)), win);

  const buckets = new Map();
  const bucketOf = (t) => floorTo(t, win);
  for (const e of events) {
    const b = bucketOf(e.t);
    if (!buckets.has(b)) buckets.set(b, { received: 0, ready: 0, concluded: 0, readyDurations: [] });
    const x = buckets.get(b);
    if (e.kind === "received") x.received++;
    if (e.kind === "concluded") x.concluded++;
    if (e.kind === "ready") {
      x.ready++;
      const r = ts(e.o.received_at);
      if (r !== null) x.readyDurations.push((e.t - r) / MS_MIN);
    }
  }

  const snapshots = [];
  let prevActive = null;
  for (let b = min; b <= max; b += win * MS_MIN) {
    const x = buckets.get(b) || { received: 0, ready: 0, concluded: 0, readyDurations: [] };
    const end = b + win * MS_MIN;

    // Ativo = recebido antes do fim da janela e ainda não pronto/concluído/cancelado.
    // Só é afirmável quando a fonte observa "pronto".
    let active = null;
    if (hasReady) {
      active = 0;
      for (const o of list) {
        const r = ts(o.received_at);
        if (r === null || r >= end) continue;
        const done = ts(o.ready_at) || ts(o.concluded_at) || ts(o.dispatched_at) || ts(o.cancelled_at);
        if (done === null || done >= end) active++;
      }
    }

    const avgReady = x.readyDurations.length
      ? x.readyDurations.reduce((a, v) => a + v, 0) / x.readyDurations.length
      : null;

    const snap = {
      snapshot_at: new Date(b).toISOString(),
      window_minutes: win,
      active_orders: active,
      received_in_window: x.received,
      ready_in_window: hasReady ? x.ready : null,
      concluded_in_window: x.concluded,
      // Convergência: quantos ficaram prontos JUNTOS nesta janela. Contagem, não score.
      convergence: hasReady ? x.ready : null,
      avg_ready_minutes: avgReady === null ? null : Math.round(avgReady * 10) / 10,
      queue_delta: active === null || prevActive === null ? null : active - prevActive,
      source_state: sourceState,
      confidence: sourceState === SOURCE_STATES.AVAILABLE ? CONFIDENCE.HIGH
        : sourceState === SOURCE_STATES.PARTIAL ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW,
      rule_version: SNAPSHOT_WINDOW_V1.ref
    };
    if (!hasReady) {
      snap.notes = "fonte_nao_observa_pronto:ativos_e_convergencia_indisponiveis";
    }
    snapshots.push(snap);
    prevActive = active;
  }
  return snapshots;
}

/** Ritmo entre janelas — entrada, saída, crescimento e recuperação, separados. */
function computeRhythm(snapshots, index, lookback) {
  const back = lookback || 2;
  const cur = snapshots[index];
  if (!cur) return null;
  const prev = snapshots.slice(Math.max(0, index - back), index);
  const inflow = cur.received_in_window;
  const outflow = cur.concluded_in_window;
  let growingWindows = 0;
  for (const s of prev.concat([cur])) {
    if (s.received_in_window > s.concluded_in_window) growingWindows++;
  }
  const readyTimes = prev.map((s) => s.avg_ready_minutes).filter((v) => v != null);
  const baselineReady = readyTimes.length ? readyTimes.reduce((a, v) => a + v, 0) / readyTimes.length : null;
  const readyGrowth = (baselineReady && cur.avg_ready_minutes)
    ? cur.avg_ready_minutes / baselineReady : null;
  return {
    inflow, outflow,
    inflow_over_outflow: inflow > outflow,
    growing_windows: growingWindows,
    queue_delta: cur.queue_delta,
    recovering: cur.queue_delta != null && cur.queue_delta < 0,
    avg_ready_minutes: cur.avg_ready_minutes,
    baseline_ready_minutes: baselineReady == null ? null : Math.round(baselineReady * 10) / 10,
    ready_growth_ratio: readyGrowth == null ? null : Math.round(readyGrowth * 100) / 100
  };
}

module.exports = { buildSnapshots, computeRhythm };
