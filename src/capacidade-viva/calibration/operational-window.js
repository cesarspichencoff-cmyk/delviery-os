/* ============================================================================
 * Fronteira de dia / turno operacional — America/Sao_Paulo.
 * Não inventa escala de equipe. Configurável via opts (não altera cv-cal-sane-v2).
 * ==========================================================================*/
"use strict";

const { toSaoPaulo } = require("./timezone");

/** Defaults de fronteira (provisórios, documentados). */
const DEFAULTS = {
  timezone: "America/Sao_Paulo",
  /** Hora local (0–23) em que o dia operacional vira. 5 = madrugada pós-fechamento típico. */
  operational_day_cutover_hour: 5,
  /** Quebra obrigatória por dia operacional. */
  break_on_operational_day: true,
  /** Quebra por turno nomeado (quando shifts definidos). */
  break_on_shift: true,
  /**
   * Turnos opcionais (podem cruzar meia-noite civil).
   * Vazio = só quebra por dia operacional.
   * Ex.: [{ id: "almoco", start_hour: 11, end_hour: 16 }, ...]
   */
  shifts: [],
  /** Gap máximo sem observação contínua (min). null = só gap de episódio. */
  max_data_gap_min: 180,
  /** Nunca unir automaticamente entre dias operacionais distintos. */
  allow_multi_day_continuity: false
};

/**
 * Resolve opções mesclando defaults (sem mutar config de pesos).
 * @param {object} [opts]
 */
function resolveOperationalOptions(opts) {
  const o = Object.assign({}, DEFAULTS, opts || {});
  if (opts && opts.operational) Object.assign(o, opts.operational);
  return o;
}

/**
 * Chave de dia operacional em America/Sao_Paulo.
 * Se cutover=5, 04:59 do dia D ainda é dia D-1; 05:00 é dia D.
 * @param {number|string|Date} t
 * @param {object} [opts]
 * @returns {{ ok: boolean, operational_day: string|null, local_date: string|null, local_hour: number|null, local_iso: string|null, timezone: string }}
 */
function operationalDayKey(t, opts) {
  const o = resolveOperationalOptions(opts);
  const sp = toSaoPaulo(t);
  if (!sp.ok) {
    return {
      ok: false,
      operational_day: null,
      local_date: null,
      local_hour: null,
      local_iso: null,
      timezone: o.timezone
    };
  }
  const hour = sp.local_hour;
  const cut = o.operational_day_cutover_hour;
  let day = sp.local_date; // YYYY-MM-DD
  if (hour != null && cut != null && hour < cut) {
    // recua um dia civil
    const ms = typeof t === "number" ? t : Date.parse(sp.timestamp_utc || t);
    const prev = new Date(ms - 24 * 3600000);
    const spPrev = toSaoPaulo(prev);
    day = spPrev.ok ? spPrev.local_date : day;
  }
  return {
    ok: true,
    operational_day: day,
    local_date: sp.local_date,
    local_hour: hour,
    local_iso: sp.local_iso,
    timezone: o.timezone,
    cutover_hour: cut,
    timestamp_original: sp.timestamp_original,
    timestamp_utc: sp.timestamp_utc
  };
}

/**
 * Identifica turno configurado no instante t (se houver shifts).
 * @returns {{ shift_id: string|null, crosses_midnight: boolean }}
 */
function shiftAt(t, opts) {
  const o = resolveOperationalOptions(opts);
  const sp = toSaoPaulo(t);
  if (!sp.ok || !Array.isArray(o.shifts) || !o.shifts.length) {
    return { shift_id: null, crosses_midnight: false };
  }
  const hour = sp.local_hour + (sp.local_minute || 0) / 60;
  for (const s of o.shifts) {
    const start = Number(s.start_hour);
    const end = Number(s.end_hour);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start <= end) {
      if (hour >= start && hour < end) return { shift_id: s.id || `${start}-${end}`, crosses_midnight: false };
    } else {
      // ultrapassa meia-noite civil
      if (hour >= start || hour < end) return { shift_id: s.id || `${start}-${end}`, crosses_midnight: true };
    }
  }
  return { shift_id: "fora_turno", crosses_midnight: false };
}

/**
 * Fronteira entre dois instantes (continuidade permitida?).
 * @returns {{ continuous: boolean, reason: string|null, day_a: string|null, day_b: string|null, shift_a: string|null, shift_b: string|null }}
 */
function continuityBetween(tPrevMs, tNextMs, opts) {
  const o = resolveOperationalOptions(opts);
  if (tPrevMs == null || tNextMs == null || !Number.isFinite(tPrevMs) || !Number.isFinite(tNextMs)) {
    return { continuous: false, reason: "timestamp_invalido", day_a: null, day_b: null, shift_a: null, shift_b: null };
  }
  const da = operationalDayKey(tPrevMs, o);
  const db = operationalDayKey(tNextMs, o);
  const sa = shiftAt(tPrevMs, o);
  const sb = shiftAt(tNextMs, o);

  if (o.break_on_operational_day && !o.allow_multi_day_continuity) {
    if (da.operational_day && db.operational_day && da.operational_day !== db.operational_day) {
      return {
        continuous: false,
        reason: "quebra_dia_operacional",
        day_a: da.operational_day,
        day_b: db.operational_day,
        shift_a: sa.shift_id,
        shift_b: sb.shift_id
      };
    }
  }

  if (o.break_on_shift && o.shifts && o.shifts.length) {
    if (sa.shift_id && sb.shift_id && sa.shift_id !== sb.shift_id) {
      return {
        continuous: false,
        reason: "quebra_turno",
        day_a: da.operational_day,
        day_b: db.operational_day,
        shift_a: sa.shift_id,
        shift_b: sb.shift_id
      };
    }
  }

  if (o.max_data_gap_min != null && Number.isFinite(o.max_data_gap_min)) {
    const gapMin = (tNextMs - tPrevMs) / 60000;
    if (gapMin > o.max_data_gap_min) {
      return {
        continuous: false,
        reason: "grande_gap_sem_dados",
        day_a: da.operational_day,
        day_b: db.operational_day,
        shift_a: sa.shift_id,
        shift_b: sb.shift_id,
        gap_min: gapMin
      };
    }
  }

  return {
    continuous: true,
    reason: null,
    day_a: da.operational_day,
    day_b: db.operational_day,
    shift_a: sa.shift_id,
    shift_b: sb.shift_id
  };
}

module.exports = {
  DEFAULTS,
  resolveOperationalOptions,
  operationalDayKey,
  shiftAt,
  continuityBetween
};
