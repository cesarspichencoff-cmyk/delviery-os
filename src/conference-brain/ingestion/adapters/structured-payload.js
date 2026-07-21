/* ============================================================================
 * Adaptador: payload estruturado.
 * ----------------------------------------------------------------------------
 * Serve a dois propósitos:
 *   1. fixtures de teste (payload em memória, determinístico);
 *   2. porta de entrada do FUTURO coletor de navegador — quando existir, ele
 *      entrega registros já estruturados por aqui, sem que ingestão, snapshots
 *      ou estado sombra mudem uma linha.
 *
 * Diferente do histórico, este formato PODE trazer carimbos de pronto/saída.
 * Quando trouxer, a saúde da fonte deixa de ser parcial por ausência deles.
 * ==========================================================================*/
"use strict";

const { ORDER_STATUS, CONFIDENCE } = require("../../contracts/states");
const { normalizeStatus, normalizeName } = require("../../normalize/normalizer");

const COLLECTOR_VERSION = "structured-payload-v1";
const PARSER_VERSION = "structured-v1";

function isoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * @param {Array} records registros estruturados
 * @param {object} [opts]  { source, channel }
 */
function createStructuredPayloadAdapter(records, opts) {
  const options = opts || {};
  const list = Array.isArray(records) ? records : [];

  return {
    source: options.source || "payload_estruturado",
    channel: options.channel || "iFood",
    collectorVersion: options.collectorVersion || COLLECTOR_VERSION,
    parserVersion: PARSER_VERSION,

    observe() { return list.slice(); },

    normalizeRow(row, ctx) {
      const warnings = [];
      const missing = [];
      const id = String(row.order_id || row.external_id || row.oid || "").trim();

      const received = isoOrNull(row.received_at);
      if (!received) { missing.push("received_at"); warnings.push("received_at_ausente"); }
      const ready = isoOrNull(row.ready_at);
      const dispatched = isoOrNull(row.dispatched_at);
      const concluded = isoOrNull(row.concluded_at);
      const cancelled = isoOrNull(row.cancelled_at);
      if (!ready) missing.push("ready_at");
      if (!dispatched) missing.push("dispatched_at");

      const status = row.status ? normalizeStatus(row.status) : ORDER_STATUS.UNKNOWN;
      if (status === ORDER_STATUS.UNKNOWN && row.status) warnings.push("status_desconhecido:" + row.status);

      const rawItems = Array.isArray(row.items) ? row.items : [];
      const items = rawItems.map((it, idx) => {
        const name = String(it.name || it.raw_name || "").trim();
        return {
          order_id: id,
          line_index: idx,
          raw_name: name,
          normalized_name: normalizeName(name),
          quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
          observation: it.observation || null,
          complements: it.complements || null,
          confidence: CONFIDENCE.HIGH
        };
      }).filter((i) => i.raw_name);

      const units = items.reduce((a, i) => a + i.quantity, 0);
      const order = {
        order_id: id,
        external_id: String(row.external_id || row.oid || id),
        channel: ctx.channel || this.channel,
        status,
        received_at: received,
        confirmed_at: isoOrNull(row.confirmed_at),
        ready_at: ready,
        dispatched_at: dispatched,
        cancelled_at: cancelled,
        concluded_at: concluded,
        total_value: Number.isFinite(row.total_value) ? row.total_value : null,
        distinct_items: items.length || null,
        total_units: units || null,
        first_observed_at: ctx.observed_at,
        last_observed_at: ctx.observed_at,
        confidence: warnings.length ? CONFIDENCE.MEDIUM : CONFIDENCE.HIGH,
        source: ctx.source || this.source
      };
      if (ctx.unit) order.unit = ctx.unit;

      const events = [];
      const push = (st, at, conf) => {
        if (at) events.push({
          order_id: id, status: st, event_at: at, observed_at: ctx.observed_at,
          origin: order.source, confidence: conf || CONFIDENCE.HIGH
        });
      };
      push(ORDER_STATUS.RECEIVED, received);
      push(ORDER_STATUS.CONFIRMED, order.confirmed_at);
      push(ORDER_STATUS.READY, ready);
      push(ORDER_STATUS.DISPATCHED, dispatched);
      push(ORDER_STATUS.CONCLUDED, concluded);
      push(ORDER_STATUS.CANCELLED, cancelled, CONFIDENCE.MEDIUM);

      return { order, items, events, missing_fields: missing, warnings };
    }
  };
}

module.exports = { createStructuredPayloadAdapter, COLLECTOR_VERSION, PARSER_VERSION };
