/* ============================================================================
 * Episódios — deduplica ticks em problemas contínuos.
 * ==========================================================================*/
"use strict";

const { stamp } = require("./labels");

/**
 * @param {Array} tickRecords - [{ t_ms, local_iso, classifications, tick_class, shadow, active_orders }]
 * @param {object} opts - { gap_min: 10 }
 */
function buildEpisodes(tickRecords, opts) {
  const gapMs = ((opts && opts.gap_min) || 10) * 60000;
  const open = new Map(); // key → episode
  const closed = [];
  let seq = 0;

  function keyFor(item, tick) {
    if (item.order_id) return `${item.type || item.kind}|order|${item.order_id}`;
    if (item.praca) return `${item.type || item.kind}|praca|${item.praca}`;
    if (tick.praca_critica) return `${item.type || "tick"}|praca|${tick.praca_critica}`;
    return `${item.type || tick.tick_level}|global`;
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
          severity: 3,
          level: "excecao_critica",
          evidence: ex.explanation,
          confidence: ex.confidence
        });
      }
    }
    if (tick.tick_class && tick.tick_class.has_attention && !(tick.tick_class.has_critical)) {
      items.push({
        type: "atencao_operacional",
        praca: tick.praca_critica || null,
        severity: 2,
        level: "atencao",
        evidence: tick.tick_class.attention_items && tick.tick_class.attention_items[0]
          ? tick.tick_class.attention_items[0].explanation
          : "atenção operacional",
        confidence: "media"
      });
    }
    // continuous signal-only ticks: optional light episodes
    if (tick.tick_class && tick.tick_class.tick_level === "sinal" && opts && opts.include_signal_episodes) {
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
          ep.resolved_at = ep.last_seen_at;
          ep.duration_min = round1((ep.last_seen_ms - ep.started_ms) / 60000);
          ep.order_ids = [...ep.order_ids];
          closed.push(ep);
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
            resolved_at: null,
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
          if (tick.active_orders != null) ep.peak_active_orders = Math.max(ep.peak_active_orders || 0, tick.active_orders);
          if (it.order_id) ep.order_ids.add(it.order_id);
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
          resolved_at: null,
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
        ep.resolved_at = ep.last_seen_at;
        ep.duration_min = round1((ep.last_seen_ms - ep.started_ms) / 60000);
        ep.order_ids = [...ep.order_ids];
        closed.push(ep);
        open.delete(k);
      }
    }
  }

  // close remaining
  for (const ep of open.values()) {
    ep.resolved_at = ep.last_seen_at;
    ep.duration_min = round1((ep.last_seen_ms - ep.started_ms) / 60000);
    ep.order_ids = [...ep.order_ids];
    closed.push(ep);
  }

  const critical = closed.filter((e) => e.level === "excecao_critica");
  const attention = closed.filter((e) => e.level === "atencao");
  const uniqueOrders = new Set();
  for (const e of closed) for (const id of e.order_ids || []) uniqueOrders.add(id);

  const durations = closed.map((e) => e.duration_min || 0);
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const max = durations.length ? Math.max(...durations) : 0;

  return stamp({
    gap_min: (opts && opts.gap_min) || 10,
    episodes: closed,
    n_episodes: closed.length,
    n_critical_episodes: critical.length,
    n_attention_episodes: attention.length,
    unique_orders_affected: uniqueOrders.size,
    duration_avg_min: round1(avg),
    duration_max_min: round1(max),
    reopened_note: "Reabertura após resolução cria novo episode_id"
  });
}

function round1(x) {
  return Math.round(Number(x) * 10) / 10;
}

module.exports = { buildEpisodes };
