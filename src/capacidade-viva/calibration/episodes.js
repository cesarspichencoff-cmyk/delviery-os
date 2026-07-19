/* ============================================================================
 * Episódios — deduplica ticks em problemas contínuos + agregação honesta.
 * ==========================================================================*/
"use strict";

const { stamp } = require("./labels");

/**
 * @param {Array} tickRecords - [{ t_ms, local_iso, classifications, tick_class, shadow, active_orders }]
 * @param {object} opts - { gap_min: 10, interval_min?: number }
 */
function buildEpisodes(tickRecords, opts) {
  const o = opts || {};
  const gapMin = o.gap_min != null ? o.gap_min : 10;
  const intervalMin = o.interval_min != null ? Number(o.interval_min) : null;
  // Continuity must tolerate sampling: gap shorter than tick interval fragments every episode
  // into single-tick zero-duration rows. Effective gap = max(configured, interval).
  const gapMs =
    Math.max(gapMin, Number.isFinite(intervalMin) && intervalMin > 0 ? intervalMin : 0) * 60000;

  const open = new Map(); // key → episode
  const closed = [];
  let seq = 0;

  function keyFor(item, tick) {
    if (item.order_id) return `${item.type || item.kind}|order|${item.order_id}`;
    if (item.praca) return `${item.type || item.kind}|praca|${item.praca}`;
    if (tick.praca_critica) return `${item.type || "tick"}|praca|${tick.praca_critica}`;
    return `${item.type || (tick.tick_class && tick.tick_class.tick_level) || "tick"}|global`;
  }

  function toOrderIdList(setOrArr) {
    if (!setOrArr) return [];
    if (Array.isArray(setOrArr)) return setOrArr.filter(Boolean);
    if (setOrArr instanceof Set) return [...setOrArr].filter(Boolean);
    return [];
  }

  function finalizeEpisode(ep, { resolved, resolved_at, resolved_ms }) {
    const orderIds = toOrderIdList(ep.order_ids);
    const duration_min =
      ep.started_ms != null && ep.last_seen_ms != null
        ? round1((ep.last_seen_ms - ep.started_ms) / 60000)
        : null;
    return {
      episode_id: ep.episode_id,
      type: ep.type,
      level: ep.level,
      order_id: ep.order_id || null,
      praca: ep.praca || null,
      started_at: ep.started_at,
      started_ms: ep.started_ms,
      last_seen_at: ep.last_seen_at,
      last_seen_ms: ep.last_seen_ms,
      resolved_at: resolved ? resolved_at : null,
      resolved_ms: resolved ? resolved_ms : null,
      open_at_window_end: !resolved,
      duration_min,
      peak_severity: ep.peak_severity,
      evidence: ep.evidence || [],
      confidence: ep.confidence || "media",
      tick_count: ep.tick_count || 1,
      peak_active_orders: ep.peak_active_orders || 0,
      order_ids: orderIds,
      reopened: !!ep.reopened
    };
  }

  for (const tick of tickRecords) {
    const t = tick.t_ms;
    const seen = new Set();
    const items = [];

    if (tick.tick_class && tick.tick_class.has_critical) {
      for (const ex of tick.tick_class.critical_items || []) {
        items.push({
          type: ex.type,
          order_id: ex.order_id || (ex.payload && ex.payload.id) || null,
          praca: ex.praca || null,
          severity: 3,
          level: "excecao_critica",
          evidence: ex.explanation,
          confidence: ex.confidence
        });
      }
    }
    if (tick.tick_class && tick.tick_class.has_attention && !(tick.tick_class.has_critical)) {
      const att0 = (tick.tick_class.attention_items && tick.tick_class.attention_items[0]) || null;
      items.push({
        type: (att0 && att0.type) || "atencao_operacional",
        order_id: (att0 && att0.order_id) || null,
        praca: (att0 && att0.praca) || tick.praca_critica || null,
        severity: 2,
        level: "atencao",
        evidence: att0 ? att0.explanation : "atenção operacional",
        confidence: (att0 && att0.confidence) || "media"
      });
    }
    if (tick.tick_class && tick.tick_class.tick_level === "sinal" && o.include_signal_episodes) {
      items.push({
        type: "sinal_continuo",
        severity: 1,
        level: "sinal",
        evidence: "sinais contínuos",
        confidence: "media"
      });
    }

    for (const it of items) {
      const k = keyFor(it, tick);
      seen.add(k);
      if (open.has(k)) {
        const ep = open.get(k);
        // reabertura após gap: fecha o antigo e cria novo
        if (t - ep.last_seen_ms > gapMs) {
          closed.push(
            finalizeEpisode(ep, {
              resolved: true,
              resolved_at: ep.last_seen_at,
              resolved_ms: ep.last_seen_ms
            })
          );
          open.delete(k);
          seq++;
          open.set(k, {
            episode_id: `ep_${seq}`,
            type: it.type,
            level: it.level,
            order_id: it.order_id || null,
            praca: it.praca || tick.praca_critica || null,
            started_at: tick.local_iso || tick.t,
            started_ms: t,
            last_seen_at: tick.local_iso || tick.t,
            last_seen_ms: t,
            peak_severity: it.severity || 1,
            evidence: [it.evidence].filter(Boolean),
            confidence: it.confidence || "media",
            tick_count: 1,
            peak_active_orders: tick.active_orders || 0,
            order_ids: new Set(it.order_id ? [it.order_id] : []),
            reopened: true
          });
        } else {
          ep.last_seen_at = tick.local_iso || tick.t;
          ep.last_seen_ms = t;
          ep.peak_severity = Math.max(ep.peak_severity, it.severity || 1);
          ep.tick_count++;
          if (tick.active_orders != null)
            ep.peak_active_orders = Math.max(ep.peak_active_orders || 0, tick.active_orders);
          if (it.order_id) ep.order_ids.add(it.order_id);
          if (it.praca && !ep.praca) ep.praca = it.praca;
        }
      } else {
        seq++;
        open.set(k, {
          episode_id: `ep_${seq}`,
          type: it.type,
          level: it.level,
          order_id: it.order_id || null,
          praca: it.praca || tick.praca_critica || null,
          started_at: tick.local_iso || tick.t,
          started_ms: t,
          last_seen_at: tick.local_iso || tick.t,
          last_seen_ms: t,
          peak_severity: it.severity || 1,
          evidence: [it.evidence].filter(Boolean),
          confidence: it.confidence || "media",
          tick_count: 1,
          peak_active_orders: tick.active_orders || 0,
          order_ids: new Set(it.order_id ? [it.order_id] : [])
        });
      }
    }

    // resolve episodes not seen and gap exceeded
    for (const [k, ep] of [...open.entries()]) {
      if (seen.has(k)) continue;
      if (t - ep.last_seen_ms > gapMs) {
        closed.push(
          finalizeEpisode(ep, {
            resolved: true,
            resolved_at: ep.last_seen_at,
            resolved_ms: ep.last_seen_ms
          })
        );
        open.delete(k);
      }
    }
  }

  // remaining open at end of window — not resolved
  for (const ep of open.values()) {
    closed.push(
      finalizeEpisode(ep, {
        resolved: false,
        resolved_at: null,
        resolved_ms: null
      })
    );
  }

  const metrics = aggregateEpisodeMetrics(closed);

  return stamp({
    gap_min: gapMin,
    gap_effective_min: Math.max(gapMin, Number.isFinite(intervalMin) && intervalMin > 0 ? intervalMin : gapMin),
    interval_min: intervalMin,
    episodes: closed,
    n_episodes: metrics.n_episodes,
    n_critical_episodes: metrics.n_critical_episodes,
    n_attention_episodes: metrics.n_attention_episodes,
    unique_orders_affected: metrics.unique_orders_affected,
    duration_avg_min: metrics.duration_avg_min,
    duration_median_min: metrics.duration_median_min,
    duration_p90_min: metrics.duration_p90_min,
    duration_max_min: metrics.duration_max_min,
    episodes_without_order_id: metrics.episodes_without_order_id,
    episodes_resolved: metrics.episodes_resolved,
    episodes_open_at_end: metrics.episodes_open_at_end,
    by_praca: metrics.by_praca,
    by_type: metrics.by_type,
    by_level: metrics.by_level,
    reopened_note: "Reabertura após resolução cria novo episode_id",
    metrics_note:
      "Duração = last_seen - started (min). Ausência → null, nunca zero enganoso. unique_orders só com order_id real."
  });
}

/**
 * Agrega métricas honestas de uma lista de episódios já finalizados.
 * Valores ausentes → null (nunca 0 enganoso).
 */
function aggregateEpisodeMetrics(episodes) {
  const list = Array.isArray(episodes) ? episodes : [];
  const critical = list.filter((e) => e.level === "excecao_critica");
  const attention = list.filter((e) => e.level === "atencao");
  const uniqueOrders = new Set();
  let withoutOrder = 0;
  let resolved = 0;
  let openEnd = 0;
  const by_praca = Object.create(null);
  const by_type = Object.create(null);
  const by_level = Object.create(null);

  const durations = [];
  for (const e of list) {
    const ids = Array.isArray(e.order_ids)
      ? e.order_ids
      : e.order_ids instanceof Set
        ? [...e.order_ids]
        : e.order_id
          ? [e.order_id]
          : [];
    for (const id of ids) if (id) uniqueOrders.add(id);
    if (!ids.length && !e.order_id) withoutOrder++;

    if (e.open_at_window_end || e.resolved_at == null) openEnd++;
    else resolved++;

    const praca = e.praca || "sem_praca";
    by_praca[praca] = (by_praca[praca] || 0) + 1;
    const typ = e.type || "desconhecido";
    by_type[typ] = (by_type[typ] || 0) + 1;
    const lvl = e.level || "desconhecido";
    by_level[lvl] = (by_level[lvl] || 0) + 1;

    if (e.duration_min != null && Number.isFinite(Number(e.duration_min))) {
      durations.push(Number(e.duration_min));
    }
  }

  const durationStats = summarizeDurations(durations);

  return {
    n_episodes: list.length,
    n_critical_episodes: critical.length,
    n_attention_episodes: attention.length,
    unique_orders_affected: uniqueOrders.size,
    // se não há durações calculáveis → null (não 0)
    duration_avg_min: durationStats.avg,
    duration_median_min: durationStats.median,
    duration_p90_min: durationStats.p90,
    duration_max_min: durationStats.max,
    n_with_duration: durationStats.n,
    episodes_without_order_id: withoutOrder,
    episodes_resolved: resolved,
    episodes_open_at_end: openEnd,
    by_praca,
    by_type,
    by_level
  };
}

function summarizeDurations(durations) {
  if (!durations.length) {
    return { n: 0, avg: null, median: null, p90: null, max: null };
  }
  const sorted = durations.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = round1(sum / sorted.length);
  const median = percentile(sorted, 0.5);
  const p90 = percentile(sorted, 0.9);
  const max = round1(sorted[sorted.length - 1]);
  return { n: sorted.length, avg, median, p90, max };
}

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  if (sortedAsc.length === 1) return round1(sortedAsc[0]);
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return round1(sortedAsc[lo]);
  const w = idx - lo;
  return round1(sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w);
}

function round1(x) {
  return Math.round(Number(x) * 10) / 10;
}

/**
 * Re-agrega a partir de lista serializada (JSON) — corrige MASTER sem reclassificar.
 */
function reaggregateFromSerialized(episodesPayload) {
  let list = [];
  if (Array.isArray(episodesPayload)) list = episodesPayload;
  else if (episodesPayload && Array.isArray(episodesPayload.episodes)) list = episodesPayload.episodes;
  // normalize serialized Sets lost as {} or objects
  list = list.map(normalizeSerializedEpisode);
  const metrics = aggregateEpisodeMetrics(list);
  return stamp({
    episodes: list,
    ...metrics,
    source: "reaggregate_from_serialized"
  });
}

function normalizeSerializedEpisode(e) {
  if (!e || typeof e !== "object") return e;
  let order_ids = e.order_ids;
  if (order_ids && !Array.isArray(order_ids) && !(order_ids instanceof Set)) {
    // JSON turned Set into {} or {0:id}
    if (typeof order_ids === "object") {
      const vals = Object.values(order_ids).filter((v) => typeof v === "string" || typeof v === "number");
      order_ids = vals.length ? vals : [];
    } else order_ids = [];
  }
  if (order_ids instanceof Set) order_ids = [...order_ids];
  if (!Array.isArray(order_ids)) order_ids = e.order_id ? [e.order_id] : [];

  let duration_min = e.duration_min;
  if (duration_min == null && e.started_ms != null && e.last_seen_ms != null) {
    duration_min = round1((e.last_seen_ms - e.started_ms) / 60000);
  }
  // empty string / invalid → null
  if (duration_min !== null && duration_min !== undefined && !Number.isFinite(Number(duration_min))) {
    duration_min = null;
  }

  const open =
    e.open_at_window_end === true ||
    e.resolved_at == null ||
    e.resolved_at === undefined;

  return Object.assign({}, e, {
    order_ids,
    duration_min: duration_min == null ? null : Number(duration_min),
    open_at_window_end: open,
    resolved_at: open ? null : e.resolved_at
  });
}

module.exports = {
  buildEpisodes,
  aggregateEpisodeMetrics,
  reaggregateFromSerialized,
  summarizeDurations,
  normalizeSerializedEpisode
};
