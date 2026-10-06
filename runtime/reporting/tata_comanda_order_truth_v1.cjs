"use strict";

const SCHEMA = "deliveryos.tata-comanda-order-truth.v1";
const SEMANTICS = "2026-10-06.tata-comanda-truth-v1";
const MONEY_EPSILON = 0.005;

function clean(value) { return String(value ?? "").trim(); }
function requireText(value, code) {
  const v = clean(value);
  if (!v) throw new Error(code);
  return v;
}
function optionalText(value) {
  if (value === null || value === undefined) return null;
  const v = clean(value);
  return v || null;
}
function instant(value, code, required = false) {
  if (value === null || value === undefined || clean(value) === "") {
    if (required) throw new Error(code);
    return null;
  }
  const v = clean(value);
  if (Number.isNaN(Date.parse(v))) throw new Error(code);
  return v;
}
function numeric(value, code, required = false) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error(code);
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(code);
  return n;
}
function nonNegative(value, code, required = false) {
  const n = numeric(value, code, required);
  if (n === null) return null;
  if (n < 0) throw new Error(code);
  return n;
}
function money(value, code, required = false) {
  const n = numeric(value, code, required);
  return n === null ? null : Number(n.toFixed(3));
}
function approx(a, b) {
  return a !== null && b !== null && Math.abs(a - b) <= MONEY_EPSILON;
}
function durationMs(start, end) {
  if (!start || !end) return null;
  const ms = Date.parse(end) - Date.parse(start);
  return ms >= 0 ? ms : null;
}
function allowedItem(raw, index) {
  return Object.freeze({
    line_no: optionalText(raw?.line_no) ?? String(index + 1),
    product_code: requireText(raw?.product_code, "ITEM_PRODUCT_CODE_REQUIRED"),
    route_code: optionalText(raw?.route_code),
    quantity: nonNegative(raw?.quantity, "ITEM_QUANTITY_INVALID", true),
    unit_price_brl: money(raw?.unit_price_brl, "ITEM_UNIT_PRICE_INVALID"),
    discount_brl: money(raw?.discount_brl ?? 0, "ITEM_DISCOUNT_INVALID", true),
    surcharge_brl: money(raw?.surcharge_brl ?? 0, "ITEM_SURCHARGE_INVALID", true),
  });
}
function itemFinancial(items) {
  if (items.some((item) => item.unit_price_brl === null)) {
    return { known: false, gross_brl: null, discount_brl: null, surcharge_brl: null, net_brl: null };
  }
  let gross = 0, discount = 0, surcharge = 0;
  for (const item of items) {
    gross += item.quantity * item.unit_price_brl;
    discount += item.discount_brl;
    surcharge += item.surcharge_brl;
  }
  return {
    known: true,
    gross_brl: Number(gross.toFixed(3)),
    discount_brl: Number(discount.toFixed(3)),
    surcharge_brl: Number(surcharge.toFixed(3)),
    net_brl: Number((gross - discount + surcharge).toFixed(3)),
  };
}
function allowedReceipt(raw) {
  return Object.freeze({
    code: requireText(raw?.code, "RECEIPT_CODE_REQUIRED"),
    label: optionalText(raw?.label),
    amount_brl: money(raw?.amount_brl, "RECEIPT_AMOUNT_INVALID", true),
  });
}

function buildTataComandaOrderTruthV1(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("TATA_COMANDA_TRUTH_INPUT_REQUIRED");
  }
  const identity = input.identity ?? {};
  const sourceObservedAt = instant(
    input.revision?.source_observed_at ?? input.observed_at,
    "SOURCE_OBSERVED_AT_INVALID",
    true,
  );
  const envelopeRecordedAt = instant(
    input.revision?.envelope_recorded_at,
    "ENVELOPE_RECORDED_AT_INVALID",
  );
  const items = Object.freeze(
    (Array.isArray(input.items) ? input.items : []).map(allowedItem),
  );
  if (!items.length) throw new Error("ORDER_ITEMS_REQUIRED");

  const kdsStart = instant(input.lifecycle?.kds_started_at, "KDS_STARTED_AT_INVALID");
  const kdsFinish = instant(input.lifecycle?.kds_finished_at, "KDS_FINISHED_AT_INVALID");
  const kdsDuration = durationMs(kdsStart, kdsFinish);
  const kdsState =
    kdsStart && kdsFinish && kdsDuration !== null
      ? "OBSERVED"
      : kdsStart || kdsFinish
        ? "PARTIAL"
        : "UNKNOWN";

  const financialItems = itemFinancial(items);
  const serviceFee = money(input.financial?.order_service_fee_brl ?? 0, "ORDER_SERVICE_FEE_INVALID", true);
  const saleTotal = money(input.financial?.sale_total_brl, "SALE_TOTAL_INVALID");
  const movementTotal = money(input.financial?.movement_total_brl, "MOVEMENT_TOTAL_INVALID");
  const receipts = Object.freeze(
    (Array.isArray(input.financial?.receipts) ? input.financial.receipts : []).map(allowedReceipt),
  );
  const receiptTotal = receipts.length
    ? Number(receipts.reduce((sum, r) => sum + r.amount_brl, 0).toFixed(3))
    : null;
  const itemPlusService = financialItems.known
    ? Number((financialItems.net_brl + serviceFee).toFixed(3))
    : null;
  const reconciled =
    itemPlusService !== null &&
    saleTotal !== null &&
    movementTotal !== null &&
    approx(itemPlusService, saleTotal) &&
    approx(saleTotal, movementTotal) &&
    (receiptTotal === null || approx(receiptTotal, movementTotal));

  return Object.freeze({
    schema: SCHEMA,
    semantics_version: SEMANTICS,
    identity: Object.freeze({
      unit_id: requireText(identity.unit_id, "UNIT_ID_REQUIRED"),
      store_id: requireText(identity.store_id, "STORE_ID_REQUIRED"),
      nr_venda_rest: requireText(identity.nr_venda_rest, "NR_VENDA_REST_REQUIRED"),
      nr_comanda: requireText(identity.nr_comanda, "NR_COMANDA_REQUIRED"),
      nr_comanda_ext: optionalText(identity.nr_comanda_ext),
      origin: requireText(identity.origin, "ORDER_ORIGIN_REQUIRED"),
      order_status: optionalText(identity.order_status),
      opened_at: instant(identity.opened_at, "ORDER_OPENED_AT_INVALID", true),
      snapshot_hash: requireText(identity.snapshot_hash, "SNAPSHOT_HASH_REQUIRED"),
    }),
    revision: Object.freeze({
      source_observed_at: sourceObservedAt,
      envelope_recorded_at: envelopeRecordedAt,
      selection_clock: "SOURCE_OBSERVED_AT",
      envelope_recorded_at_role: "AUDIT_ONLY_NOT_REVISION_ORDER",
    }),
    items,
    lifecycle: Object.freeze({
      kds_cycle: Object.freeze({
        state: kdsState,
        started_at: kdsStart,
        finished_at: kdsFinish,
        duration_ms: kdsDuration,
        semantics: "LOCAL_KDS_CYCLE",
        production_time_claim: false,
        delivery_time_claim: false,
      }),
      sale_closed_at: instant(input.lifecycle?.sale_closed_at, "SALE_CLOSED_AT_INVALID"),
      money_recorded_at: instant(input.lifecycle?.money_recorded_at, "MONEY_RECORDED_AT_INVALID"),
      production_time_minutes: null,
      delivery_time_minutes: null,
      production_time_status: "UNKNOWN_NO_AUTHORITATIVE_PRODUCTION_TIMESTAMP",
      delivery_time_status: "UNKNOWN_NO_AUTHORITATIVE_CUSTOMER_DELIVERY_TIMESTAMP",
    }),
    financial: Object.freeze({
      state: reconciled ? "RECONCILED" : "PARTIAL_OR_UNKNOWN",
      item_gross_brl: financialItems.gross_brl,
      item_discount_brl: financialItems.discount_brl,
      item_surcharge_brl: financialItems.surcharge_brl,
      item_net_brl: financialItems.net_brl,
      order_service_fee_brl: serviceFee,
      item_plus_service_brl: itemPlusService,
      sale_total_brl: saleTotal,
      movement_total_brl: movementTotal,
      receipt_total_brl: receiptTotal,
      reconciled,
      receipts,
    }),
    source_lineage: Object.freeze({
      current_order: "TEKNISA.COMANDAVEN+VENDAREST",
      current_items: "TEKNISA.ITCOMANDAVEN",
      item_revision_history: "TEKNISA.ITCMD_LOG",
      kds_cycle: "TEKNISA.HISTPEDCONS",
      financial_movement: "TEKNISA.MOVCAIXADLV",
      sale_financial_close: "TEKNISA.VENDA",
      receipt_dictionary: "TEKNISA.TIPORECE",
    }),
    privacy: Object.freeze({
      customer_pii_required: false,
      customer_pii_persisted: false,
      raw_observation_text_persisted: false,
      coordinates_persisted: false,
      raw_customer_payload_persisted: false,
    }),
    collection_boundary: Object.freeze({
      authoritative_source_requires_read_only_database_access: true,
      extended_reader_permissions_currently_authorized: false,
    }),
    effects: Object.freeze({
      database_read: false,
      database_write: false,
      permission_change: false,
      print: false,
      spooler_write: false,
      odhen_write: false,
      fiscal_action: false,
      sefaz_call: false,
    }),
  });
}

function selectLatestTataComandaOrderTruthRevisionV1(revisions) {
  if (!Array.isArray(revisions) || revisions.length === 0) throw new Error("REVISION_LIST_REQUIRED");
  for (const revision of revisions) {
    if (!revision || revision.schema !== SCHEMA) throw new Error("REVISION_SCHEMA_MISMATCH");
  }
  return revisions.reduce((best, candidate) => {
    const a = Date.parse(best.revision.source_observed_at);
    const b = Date.parse(candidate.revision.source_observed_at);
    if (b > a) return candidate;
    if (b < a) return best;
    return candidate.identity.snapshot_hash.localeCompare(best.identity.snapshot_hash) > 0 ? candidate : best;
  });
}

module.exports = {
  SCHEMA,
  SEMANTICS,
  buildTataComandaOrderTruthV1,
  selectLatestTataComandaOrderTruthRevisionV1,
};
