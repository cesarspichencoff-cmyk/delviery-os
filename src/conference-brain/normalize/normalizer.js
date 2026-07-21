/* ============================================================================
 * Normalização — do bruto observado ao vocabulário do DeliveryOS.
 * ----------------------------------------------------------------------------
 * Puro e sem I/O. Nunca inventa carimbo: campo ausente vira null e é declarado
 * em `missing_fields`, jamais estimado.
 * ==========================================================================*/
"use strict";

const { ORDER_STATUS, CONFIDENCE } = require("../contracts/states");

const PARSER_VERSION = "normalizer-v1";

/** "20/06/2026 11:05" (America/Sao_Paulo) -> ISO com offset -03:00. */
function parseLocalDateTime(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, d, mo, y, h, mi, se] = m;
  // offset fixo -03:00: o TATÁ opera em America/Sao_Paulo, que não usa DST desde 2019.
  return `${y}-${mo}-${d}T${h}:${mi}:${se || "00"}-03:00`;
}

/** "R$ 90,99" -> 90.99 · devolve null se não for parseável (nunca 0 por engano). */
function parseMoney(s) {
  if (s == null) return null;
  const cleaned = String(s).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const v = Number.parseFloat(cleaned);
  return Number.isFinite(v) ? v : null;
}

/** "5 dist. / 7 un." -> { distinct:5, units:7 } · campos ausentes viram null. */
function parseItemCounts(s) {
  const out = { distinct: null, units: null };
  if (!s) return out;
  const d = String(s).match(/(\d+)\s*dist/i);
  const u = String(s).match(/(\d+)\s*un/i);
  if (d) out.distinct = Number(d[1]);
  if (u) out.units = Number(u[1]);
  return out;
}

/** Status da plataforma -> status canônico. Desconhecido é declarado, não adivinhado. */
function normalizeStatus(raw) {
  const s = String(raw || "").trim().toUpperCase();
  switch (s) {
    case "CONCLUDED": case "CONCLUIDO": case "COMPLETED": return ORDER_STATUS.CONCLUDED;
    case "CANCELLED": case "CANCELED": case "CANCELADO": return ORDER_STATUS.CANCELLED;
    case "DECLINED": case "REJECTED": case "RECUSADO": return ORDER_STATUS.CANCELLED;
    case "READY": case "PRONTO": return ORDER_STATUS.READY;
    case "DISPATCHED": case "SAIU": return ORDER_STATUS.DISPATCHED;
    case "CONFIRMED": case "CONFIRMADO": return ORDER_STATUS.CONFIRMED;
    case "RECEIVED": case "RECEBIDO": case "PLACED": return ORDER_STATUS.RECEIVED;
    default: return ORDER_STATUS.UNKNOWN;
  }
}

/** DECLINED é cancelamento, mas de natureza distinta — preservado como nota. */
function statusNote(raw) {
  const s = String(raw || "").trim().toUpperCase();
  return (s === "DECLINED" || s === "REJECTED") ? "recusado_pela_loja_ou_plataforma" : null;
}

/**
 * "1x Uramaki Ebiten\n1x Yakissoba <em>(sem cebola)</em>" -> linhas de item.
 * A observação vem no <em>(...)</em> e pertence ao pedido/linha, nunca é inventada.
 */
function parseItemsHtml(html) {
  const items = [];
  if (!html) return items;
  const text = String(html).replace(/<br\s*\/?>/gi, "\n");
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, idx) => {
    let observation = null;
    const em = line.match(/<em>\s*\(?([^<]*?)\)?\s*<\/em>/i);
    if (em) observation = em[1].trim() || null;
    const clean = line.replace(/<[^>]+>/g, "").trim();
    const qm = clean.match(/^(\d+)\s*x\s*(.+)$/i);
    const quantity = qm ? Number(qm[1]) : 1;
    let raw_name = (qm ? qm[2] : clean).trim();
    // a observação, já capturada, não deve poluir o nome
    if (observation) raw_name = raw_name.replace(/\(?\s*$/, "").replace(observation, "").replace(/\(\s*\)?$/, "").trim();
    raw_name = raw_name.replace(/[\s(]+$/, "").trim();
    if (!raw_name) return;
    items.push({ line_index: idx, raw_name, normalized_name: normalizeName(raw_name), quantity, observation });
  });
  return items;
}

/** Nome normalizado para casar com o catálogo: minúsculo, sem acento, sem ruído. */
function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Registro bruto do relatório histórico -> pedido normalizado + itens + eventos.
 * @returns {{order, items, events, missing_fields, warnings}}
 */
function normalizeHistoricalRow(row, ctx) {
  const context = ctx || {};
  const warnings = [];
  const missing = [];

  const receivedAt = parseLocalDateTime(row.dt);
  if (!receivedAt) { missing.push("received_at"); warnings.push("dt_nao_parseavel:" + String(row.dt)); }

  const status = normalizeStatus(row.status);
  if (status === ORDER_STATUS.UNKNOWN) warnings.push("status_desconhecido:" + String(row.status));
  const note = statusNote(row.status);

  const counts = parseItemCounts(row.nitens);
  const items = parseItemsHtml(row.itens_html);

  // Coerência declarada, nunca corrigida em silêncio.
  if (counts.units != null) {
    const soma = items.reduce((a, i) => a + (i.quantity || 0), 0);
    if (soma !== counts.units) warnings.push(`unidades_divergentes:declarado=${counts.units},somado=${soma}`);
  }

  // Esta fonte NÃO observa pronto/saída — declarar, jamais estimar.
  missing.push("ready_at", "dispatched_at", "confirmed_at");

  const order = {
    order_id: String(row.oid || "").trim(),
    external_id: String(row.oid || "").trim(),
    channel: context.channel || "iFood",
    status,
    received_at: receivedAt,
    confirmed_at: null,
    ready_at: null,
    dispatched_at: null,
    cancelled_at: status === ORDER_STATUS.CANCELLED ? receivedAt : null,
    concluded_at: null,
    total_value: parseMoney(row.tv),
    distinct_items: counts.distinct,
    total_units: counts.units,
    first_observed_at: context.observed_at || receivedAt,
    last_observed_at: context.observed_at || receivedAt,
    confidence: warnings.length ? CONFIDENCE.MEDIUM : CONFIDENCE.HIGH,
    source: context.source || "historico_html"
  };
  if (context.unit) order.unit = context.unit;

  const events = [];
  if (receivedAt) {
    events.push({
      order_id: order.order_id, status: ORDER_STATUS.RECEIVED, event_at: receivedAt,
      observed_at: order.first_observed_at, origin: order.source, confidence: CONFIDENCE.HIGH
    });
  }
  if (status === ORDER_STATUS.CANCELLED && receivedAt) {
    events.push({
      order_id: order.order_id, status: ORDER_STATUS.CANCELLED, event_at: receivedAt,
      observed_at: order.first_observed_at, origin: order.source, confidence: CONFIDENCE.LOW,
      note: (note || "cancelamento_sem_carimbo_proprio") + ";horario_do_recebimento_usado_como_referencia"
    });
  }

  return {
    order,
    items: items.map((i) => Object.assign({ order_id: order.order_id, confidence: CONFIDENCE.HIGH }, i)),
    events,
    missing_fields: missing,
    warnings
  };
}

module.exports = {
  PARSER_VERSION,
  parseLocalDateTime, parseMoney, parseItemCounts,
  normalizeStatus, statusNote, parseItemsHtml, normalizeName,
  normalizeHistoricalRow
};
