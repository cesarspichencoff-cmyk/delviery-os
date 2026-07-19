/* ============================================================================
 * Timezone — normaliza para America/Sao_Paulo sem apagar o original.
 * ==========================================================================*/
"use strict";

const { stamp } = require("./labels");

const TARGET_TZ = "America/Sao_Paulo";

/**
 * Evidência por fonte conhecida do DeliveryOS.
 */
function sourceTimezoneEvidence(sourceId) {
  const map = {
    ifood_real_jsonl: {
      declared: "UTC (campo timestamp ISO com Z)",
      inferred: "America/Sao_Paulo para wall-clock operacional",
      evidence:
        "payload_original usa DATA E HORA DO PEDIDO em formato BR (DD/MM/YYYY HH:mm:ss) alinhado a operação local; log Camada 0 grava ISO Z (UTC).",
      conversion: "UTC → America/Sao_Paulo para buckets dia/hora; preserva timestamp_utc original",
      ambiguity: "Eventos com aceito==recebido no mesmo segundo podem mascarar latência real"
    },
    itens_jsonl: {
      declared: "ausente (data_hora string BR sem offset)",
      inferred: "America/Sao_Paulo",
      evidence: "Campo data_hora no formato 20/06/2026 11:05 sem Z; parser de loja BR.",
      conversion: "Interpreta string como wall-clock America/Sao_Paulo → ISO com offset -03:00 (sem DST no Brasil desde 2019)",
      ambiguity: "Sem offset explícito no arquivo — inferência documentada"
    },
    synthetic: {
      declared: "UTC de fixture",
      inferred: "UTC de fixture",
      evidence: "Gerado em calibração",
      conversion: "nenhuma ou mesma regra SP se marcado local",
      ambiguity: "none"
    }
  };
  return map[sourceId] || {
    declared: "desconhecido",
    inferred: TARGET_TZ,
    evidence: "padrão operacional DeliveryOS",
    conversion: "best-effort",
    ambiguity: "fonte sem metadado de timezone"
  };
}

/**
 * Converte instante para partes locais SP.
 * @param {string|number|Date} input - ISO Z, epoch, ou Date
 * @returns {{ timestamp_utc, local_iso, local_date, local_hour, local_dow, timezone }}
 */
function toSaoPaulo(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) {
    return stamp({
      ok: false,
      error: "invalid_timestamp",
      timestamp_original: input,
      timezone: TARGET_TZ
    });
  }
  const timestamp_utc = d.toISOString();
  // America/Sao_Paulo fixed -03:00 (no DST since 2019)
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TARGET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short"
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  // hour 24 → 00 next day edge in some engines
  let hour = Number(parts.hour === "24" ? 0 : parts.hour);
  const local_date = `${parts.year}-${parts.month}-${parts.day}`;
  const local_iso = `${local_date}T${String(hour).padStart(2, "0")}:${parts.minute}:${parts.second}-03:00`;
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const local_dow = dowMap[parts.weekday] != null ? dowMap[parts.weekday] : d.getUTCDay();

  return stamp({
    ok: true,
    timestamp_original: typeof input === "string" ? input : timestamp_utc,
    timestamp_utc,
    local_iso,
    local_date,
    local_hour: hour,
    local_minute: Number(parts.minute),
    local_dow,
    timezone: TARGET_TZ,
    conversion_applied: true,
    silent: false
  });
}

/**
 * Parse data_hora BR sem timezone → SP wall clock.
 */
function parseBrWallClockToUtcIso(brString) {
  const m = String(brString || "").match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return { ok: false, error: "unparseable_br", timestamp_original: brString };
  const sec = m[6] || "00";
  // Interpret as -03:00
  const isoLocal = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${sec}-03:00`;
  const ms = Date.parse(isoLocal);
  if (!Number.isFinite(ms)) return { ok: false, error: "invalid_br", timestamp_original: brString };
  return toSaoPaulo(ms);
}

/**
 * Anexa campos SP a um evento normalizado (não remove timestamp original).
 */
function enrichEventTimezone(event, sourceId) {
  const e = Object.assign({}, event);
  e.timezone_meta = sourceTimezoneEvidence(sourceId || "ifood_real_jsonl");
  if (e.timestamp) {
    const sp = toSaoPaulo(e.timestamp);
    e.timestamp_utc = sp.timestamp_utc || e.timestamp;
    e.timestamp_original = e.timestamp_original || e.timestamp;
    e.local_date = sp.local_date;
    e.local_hour = sp.local_hour;
    e.local_dow = sp.local_dow;
    e.local_iso = sp.local_iso;
    e.timezone = TARGET_TZ;
  }
  return e;
}

module.exports = {
  TARGET_TZ,
  sourceTimezoneEvidence,
  toSaoPaulo,
  parseBrWallClockToUtcIso,
  enrichEventTimezone
};
