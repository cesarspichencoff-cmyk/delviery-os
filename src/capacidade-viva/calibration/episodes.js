/* ============================================================================
 * Episódios — deduplica ticks, fronteiras de dia/turno, duração humana honesta.
 * ==========================================================================*/
"use strict";

const { stamp } = require("./labels");
const {
  resolveOperationalOptions,
  operationalDayKey,
  continuityBetween
} = require("./operational-window");

/**
 * @param {Array} tickRecords
 * @param {object} opts - { gap_min, interval_min, operational?, include_signal_episodes? }
 */
function buildEpisodes(tickRecords, opts) {
  const o = opts || {};
  const gapMin = o.gap_min != null ? o.gap_min : 10;
  const intervalMin = o.interval_min != null ? Number(o.interval_min) : null;
  const op = resolveOperationalOptions(o.operational || o);
  const gapMs =
    Math.max(gapMin, Number.isFinite(intervalMin) && intervalMin > 0 ? intervalMin : 0) * 60000;

  const open = new Map();
  const closed = [];
  const split_by_boundary = [];
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

  function durationFields(ep) {
    const tickCount = ep.tick_count || 1;
    const observed_span_min =
      ep.started_ms != null && ep.last_seen_ms != null
        ? round1((ep.last_seen_ms - ep.started_ms) / 60000)
        : null;
    const sampling = Number.isFinite(intervalMin) ? intervalMin : null;
    let duration_label;
    let minimum_observed_duration_min = null;
    if (tickCount <= 1) {
      duration_label = "observado em uma leitura";
      minimum_observed_duration_min = null; // não afirmar duração = intervalo
    } else if (observed_span_min != null) {
      duration_label = `duração mensurável · ${observed_span_min} min`;
      minimum_observed_duration_min = observed_span_min;
    } else {
      duration_label = "duração não calculável";
      minimum_observed_duration_min = null;
    }
    return {
      observed_span_min,
      observed_ticks: tickCount,
      sampling_interval_min: sampling,
      duration_label,
      minimum_observed_duration_min,
      // legado técnico: span (pode ser 0 em 1 tick)
      duration_min: observed_span_min,
      single_tick: tickCount <= 1,
      measurable_duration: tickCount >= 2 && observed_span_min != null
    };
  }

  function finalizeEpisode(ep, { resolved, resolved_at, resolved_ms, close_reason }) {
    const orderIds = toOrderIdList(ep.order_ids);
    const dayStart = operationalDayKey(ep.started_ms, op);
    const dayEnd = operationalDayKey(ep.last_seen_ms, op);
    const dur = durationFields(ep);
    const crossDay =
      dayStart.operational_day &&
      dayEnd.operational_day &&
      dayStart.operational_day !== dayEnd.operational_day;

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
      close_reason: close_reason || (resolved ? "gap_ou_fim" : "aberto_fim_janela"),
      operational_day_start: dayStart.operational_day,
      operational_day_end: dayEnd.operational_day,
      crosses_operational_day: !!crossDay,
      invalid_cross_day: !!crossDay,
      peak_severity: ep.peak_severity,
      evidence: ep.evidence || [],
      confidence: ep.confidence || "media",
      epistemic: ep.epistemic || null,
      evidence_kind: ep.evidence_kind || null,
      tick_count: ep.tick_count || 1,
      peak_active_orders: ep.peak_active_orders || 0,
      order_ids: orderIds,
      reopened: !!ep.reopened,
      ...dur
    };
  }

  function openNew(it, tick, t, reopened, reason) {
    seq++;
    const day = operationalDayKey(t, op);
    open.set(keyFor(it, tick), {
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
      epistemic: it.epistemic || null,
      evidence_kind: it.evidence_kind || null,
      tick_count: 1,
      peak_active_orders: tick.active_orders || 0,
      order_ids: new Set(it.order_id ? [it.order_id] : []),
      reopened: !!reopened,
      operational_day: day.operational_day,
      open_reason: reason || null
    });
  }

  function closeOpen(k, ep, resolved_at, resolved_ms, reason) {
    const fin = finalizeEpisode(ep, {
      resolved: true,
      resolved_at,
      resolved_ms,
      close_reason: reason
    });
    closed.push(fin);
    if (reason && String(reason).startsWith("quebra_")) {
      split_by_boundary.push({
        episode_id: fin.episode_id,
        reason,
        type: fin.type,
        order_id: fin.order_id,
        started_at: fin.started_at,
        last_seen_at: fin.last_seen_at,
        operational_day_start: fin.operational_day_start,
        operational_day_end: fin.operational_day_end
      });
    }
    open.delete(k);
  }

  for (const tick of tickRecords) {
    const t = tick.t_ms;
    const seen = new Set();
    const items = collectItems(tick, o);

    for (const it of items) {
      const k = keyFor(it, tick);
      seen.add(k);
      if (open.has(k)) {
        const ep = open.get(k);
        const gapExceeded = t - ep.last_seen_ms > gapMs;
        const cont = continuityBetween(ep.last_seen_ms, t, op);
        if (gapExceeded || !cont.continuous) {
          const reason = gapExceeded
            ? "gap_sem_observacao"
            : cont.reason || "quebra_continuidade";
          closeOpen(k, ep, ep.last_seen_at, ep.last_seen_ms, reason);
          openNew(it, tick, t, true, reason);
        } else {
          ep.last_seen_at = tick.local_iso || tick.t;
          ep.last_seen_ms = t;
          ep.peak_severity = Math.max(ep.peak_severity, it.severity || 1);
          ep.tick_count++;
          if (tick.active_orders != null)
            ep.peak_active_orders = Math.max(ep.peak_active_orders || 0, tick.active_orders);
          if (it.order_id) ep.order_ids.add(it.order_id);
          if (it.praca && !ep.praca) ep.praca = it.praca;
          if (it.epistemic && !ep.epistemic) ep.epistemic = it.epistemic;
        }
      } else {
        openNew(it, tick, t, false, "novo");
      }
    }

    for (const [k, ep] of [...open.entries()]) {
      if (seen.has(k)) continue;
      // gap sem o sinal
      if (t - ep.last_seen_ms > gapMs) {
        closeOpen(k, ep, ep.last_seen_at, ep.last_seen_ms, "gap_sem_observacao");
        continue;
      }
      // fronteira dia/turno mesmo sem o item no tick atual: se o tick atual já é outro dia
      const cont = continuityBetween(ep.last_seen_ms, t, op);
      if (!cont.continuous) {
        closeOpen(k, ep, ep.last_seen_at, ep.last_seen_ms, cont.reason || "quebra_continuidade");
      }
    }
  }

  for (const [k, ep] of [...open.entries()]) {
    const fin = finalizeEpisode(ep, {
      resolved: false,
      resolved_at: null,
      resolved_ms: null,
      close_reason: "aberto_fim_janela"
    });
    closed.push(fin);
    open.delete(k);
  }

  // safety: marcar inválidos se ainda cruzam dia (não deveria)
  for (const e of closed) {
    if (e.crosses_operational_day) e.invalid_cross_day = true;
  }

  const metrics = aggregateEpisodeMetrics(closed, { interval_min: intervalMin });

  return stamp({
    gap_min: gapMin,
    gap_effective_min: Math.max(
      gapMin,
      Number.isFinite(intervalMin) && intervalMin > 0 ? intervalMin : gapMin
    ),
    interval_min: intervalMin,
    operational: {
      timezone: op.timezone,
      operational_day_cutover_hour: op.operational_day_cutover_hour,
      break_on_operational_day: op.break_on_operational_day,
      break_on_shift: op.break_on_shift,
      max_data_gap_min: op.max_data_gap_min,
      allow_multi_day_continuity: op.allow_multi_day_continuity,
      shifts_configured: Array.isArray(op.shifts) ? op.shifts.length : 0
    },
    episodes: closed,
    split_by_boundary,
    n_split_by_boundary: split_by_boundary.length,
    n_episodes: metrics.n_episodes,
    n_critical_episodes: metrics.n_critical_episodes,
    n_attention_episodes: metrics.n_attention_episodes,
    unique_orders_affected: metrics.unique_orders_affected,
    duration_avg_min: metrics.duration_avg_min,
    duration_median_min: metrics.duration_median_min,
    duration_p90_min: metrics.duration_p90_min,
    duration_max_min: metrics.duration_max_min,
    // métricas humanas (só mensuráveis ≥2 ticks)
    measurable: metrics.measurable,
    single_tick: metrics.single_tick,
    episodes_without_order_id: metrics.episodes_without_order_id,
    episodes_resolved: metrics.episodes_resolved,
    episodes_open_at_end: metrics.episodes_open_at_end,
    episodes_crossing_day: metrics.episodes_crossing_day,
    by_praca: metrics.by_praca,
    by_type: metrics.by_type,
    by_level: metrics.by_level,
    by_confidence: metrics.by_confidence,
    by_epistemic: metrics.by_epistemic,
    reopened_note: "Reabertura após resolução ou fronteira cria novo episode_id",
    metrics_note:
      "Duração mensurável só com ≥2 ticks. Um tick = 'observado em uma leitura', não '0 min' humano."
  });
}

function collectItems(tick, opts) {
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
        confidence: ex.confidence,
        epistemic: ex.epistemic || null,
        evidence_kind: classifyEvidenceKind(ex)
      });
    }
  }
  if (tick.tick_class && tick.tick_class.has_attention && !(tick.tick_class.has_critical)) {
    // incluir todas as attentions com order_id quando existirem; senão um proxy de praça
    const atts = tick.tick_class.attention_items || [];
    if (atts.length) {
      for (const att of atts) {
        items.push({
          type: att.type || "atencao_operacional",
          order_id: att.order_id || null,
          praca: att.praca || tick.praca_critica || null,
          severity: 2,
          level: "atencao",
          evidence: att.explanation || "atenção operacional",
          confidence: att.confidence || "media",
          epistemic: att.epistemic || null,
          evidence_kind: classifyEvidenceKind(att)
        });
      }
    } else {
      items.push({
        type: "atencao_operacional",
        order_id: null,
        praca: tick.praca_critica || null,
        severity: 2,
        level: "atencao",
        evidence: "atenção operacional",
        confidence: "media",
        epistemic: null,
        evidence_kind: "ausente"
      });
    }
  }
  if (tick.tick_class && tick.tick_class.tick_level === "sinal" && opts && opts.include_signal_episodes) {
    items.push({
      type: "sinal_continuo",
      severity: 1,
      level: "sinal",
      evidence: "sinais contínuos",
      confidence: "media",
      evidence_kind: "inferido"
    });
  }
  return items;
}

function classifyEvidenceKind(x) {
  if (!x) return "ausente";
  if (x.confirmed === true || x.epistemic === "confirmado") return "confirmado";
  if (x.epistemic === "inferido_alta_confianca") return "inferido_alta";
  if (x.epistemic === "inferido_baixa_confianca") return "inferido_baixa";
  if (x.epistemic === "ausente") return "ausente";
  return "inferido";
}

/**
 * Agrega métricas honestas.
 * Duração média/mediana/p90/max humanas usam só episódios mensuráveis (≥2 ticks).
 */
function aggregateEpisodeMetrics(episodes, opts) {
  const list = Array.isArray(episodes) ? episodes : [];
  const intervalMin = opts && opts.interval_min != null ? opts.interval_min : null;
  const critical = list.filter((e) => e.level === "excecao_critica");
  const attention = list.filter((e) => e.level === "atencao");
  const uniqueOrders = new Set();
  let withoutOrder = 0;
  let resolved = 0;
  let openEnd = 0;
  let crossing = 0;
  const by_praca = Object.create(null);
  const by_type = Object.create(null);
  const by_level = Object.create(null);
  const by_confidence = Object.create(null);
  const by_epistemic = Object.create(null);

  const singleTick = [];
  const measurableDurations = [];

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

    if (e.crosses_operational_day || e.invalid_cross_day) crossing++;

    const praca = e.praca || "sem_praca";
    by_praca[praca] = (by_praca[praca] || 0) + 1;
    const typ = e.type || "desconhecido";
    by_type[typ] = (by_type[typ] || 0) + 1;
    const lvl = e.level || "desconhecido";
    by_level[lvl] = (by_level[lvl] || 0) + 1;
    const conf = e.confidence || "desconhecida";
    by_confidence[conf] = (by_confidence[conf] || 0) + 1;
    const epi = e.epistemic || e.evidence_kind || "desconhecido";
    by_epistemic[epi] = (by_epistemic[epi] || 0) + 1;

    const ticks = e.observed_ticks != null ? e.observed_ticks : e.tick_count || 1;
    const span =
      e.observed_span_min != null
        ? e.observed_span_min
        : e.duration_min != null
          ? e.duration_min
          : e.started_ms != null && e.last_seen_ms != null
            ? round1((e.last_seen_ms - e.started_ms) / 60000)
            : null;

    if (ticks <= 1) {
      singleTick.push(e);
    } else if (span != null && Number.isFinite(Number(span))) {
      measurableDurations.push(Number(span));
    }
  }

  const measStats = summarizeDurations(measurableDurations);
  // legado: duration_* só mensuráveis (nunca misturar 0 de 1-tick na média humana)
  // se não houver mensuráveis → null
  return {
    n_episodes: list.length,
    n_critical_episodes: critical.length,
    n_attention_episodes: attention.length,
    unique_orders_affected: uniqueOrders.size,
    duration_avg_min: measStats.avg,
    duration_median_min: measStats.median,
    duration_p90_min: measStats.p90,
    duration_max_min: measStats.max,
    n_with_duration: measStats.n,
    measurable: {
      n: measurableDurations.length,
      duration_avg_min: measStats.avg,
      duration_median_min: measStats.median,
      duration_p90_min: measStats.p90,
      duration_max_min: measStats.max
    },
    single_tick: {
      n: singleTick.length,
      duration_label: "observado em uma leitura",
      note: "Não reportar como 0 min ao humano",
      sampling_interval_min: intervalMin
    },
    episodes_without_order_id: withoutOrder,
    episodes_resolved: resolved,
    episodes_open_at_end: openEnd,
    episodes_crossing_day: crossing,
    by_praca,
    by_type,
    by_level,
    by_confidence,
    by_epistemic
  };
}

function summarizeDurations(durations) {
  if (!durations.length) {
    return { n: 0, avg: null, median: null, p90: null, max: null };
  }
  const sorted = durations.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    avg: round1(sum / sorted.length),
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    max: round1(sorted[sorted.length - 1])
  };
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

function reaggregateFromSerialized(episodesPayload) {
  let list = [];
  if (Array.isArray(episodesPayload)) list = episodesPayload;
  else if (episodesPayload && Array.isArray(episodesPayload.episodes)) list = episodesPayload.episodes;
  list = list.map(normalizeSerializedEpisode);
  const metrics = aggregateEpisodeMetrics(list);
  return stamp({ episodes: list, ...metrics, source: "reaggregate_from_serialized" });
}

function normalizeSerializedEpisode(e) {
  if (!e || typeof e !== "object") return e;
  let order_ids = e.order_ids;
  if (order_ids && !Array.isArray(order_ids) && !(order_ids instanceof Set)) {
    if (typeof order_ids === "object") {
      const vals = Object.values(order_ids).filter((v) => typeof v === "string" || typeof v === "number");
      order_ids = vals.length ? vals : [];
    } else order_ids = [];
  }
  if (order_ids instanceof Set) order_ids = [...order_ids];
  if (!Array.isArray(order_ids)) order_ids = e.order_id ? [e.order_id] : [];

  let observed_span_min = e.observed_span_min;
  if (observed_span_min == null && e.started_ms != null && e.last_seen_ms != null) {
    observed_span_min = round1((e.last_seen_ms - e.started_ms) / 60000);
  }
  if (observed_span_min == null && e.duration_min != null && Number.isFinite(Number(e.duration_min))) {
    observed_span_min = Number(e.duration_min);
  }
  if (observed_span_min != null && !Number.isFinite(Number(observed_span_min))) observed_span_min = null;

  const tickCount = e.observed_ticks != null ? e.observed_ticks : e.tick_count || 1;
  const open = e.open_at_window_end === true || e.resolved_at == null || e.resolved_at === undefined;

  return Object.assign({}, e, {
    order_ids,
    observed_span_min,
    duration_min: observed_span_min,
    observed_ticks: tickCount,
    tick_count: tickCount,
    single_tick: tickCount <= 1,
    measurable_duration: tickCount >= 2 && observed_span_min != null,
    duration_label:
      e.duration_label ||
      (tickCount <= 1 ? "observado em uma leitura" : observed_span_min != null ? `duração mensurável · ${observed_span_min} min` : "duração não calculável"),
    minimum_observed_duration_min: tickCount <= 1 ? null : observed_span_min,
    open_at_window_end: open,
    resolved_at: open ? null : e.resolved_at
  });
}

module.exports = {
  buildEpisodes,
  aggregateEpisodeMetrics,
  reaggregateFromSerialized,
  summarizeDurations,
  normalizeSerializedEpisode,
  classifyEvidenceKind
};
