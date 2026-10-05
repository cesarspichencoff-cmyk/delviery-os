"use strict";

function clean(value) {
  return String(value ?? "").trim();
}

function allowedEvent(event) {
  if (!event || event.schema !== "deliveryos.tata-reader-stable-order-event.v1") {
    throw new Error("SOURCE_EVENT_SCHEMA_MISMATCH");
  }
  if (!clean(event.order_key) || !clean(event.snapshot_hash) || !event.order) {
    throw new Error("SOURCE_EVENT_IDENTITY_REQUIRED");
  }
  const order = event.order;
  const items = Array.isArray(order.items) ? order.items.map(item => Object.freeze({
    NRPRODCOMVEN: clean(item.NRPRODCOMVEN),
    CDPRODUTO: clean(item.CDPRODUTO),
    CDARVPROD: item.CDARVPROD == null ? null : clean(item.CDARVPROD),
    QTPRODCOMVEN: clean(item.QTPRODCOMVEN),
    IDSTPRCOMVEN: clean(item.IDSTPRCOMVEN),
  })) : [];

  return Object.freeze({
    schema: event.schema,
    order_key: clean(event.order_key),
    snapshot_hash: clean(event.snapshot_hash),
    observed_at: clean(event.observed_at),
    order: Object.freeze({
      CDFILIAL: clean(order.CDFILIAL),
      CDLOJA: clean(order.CDLOJA),
      NRVENDAREST: clean(order.NRVENDAREST),
      NRCOMANDA: clean(order.NRCOMANDA),
      NRCOMANDAEXT: order.NRCOMANDAEXT == null ? null : clean(order.NRCOMANDAEXT),
      IDORGCMDVENDA: clean(order.IDORGCMDVENDA),
      IDSTCOMANDA: clean(order.IDSTCOMANDA),
      DTHRABERMESA: clean(order.DTHRABERMESA),
      items: Object.freeze(items),
    }),
    service_resolution: event.service_resolution ?? null,
    ready_for_downstream_shadow: event.ready_for_downstream_shadow === true,
    blockers: Object.freeze([...(event.blockers ?? [])].map(clean)),
  });
}

function allowedDecision(decision) {
  if (!decision || decision.schema !== "deliveryos.live-shadow-decision.v1") {
    throw new Error("SHADOW_DECISION_SCHEMA_MISMATCH");
  }
  if (!clean(decision.order_key) || !clean(decision.snapshot_hash) || !clean(decision.fingerprint)) {
    throw new Error("SHADOW_DECISION_IDENTITY_REQUIRED");
  }
  return decision;
}

function buildReportSourceEnvelope(event, decision, options = {}) {
  const sourceEvent = allowedEvent(event);
  const shadowDecision = allowedDecision(decision);

  if (sourceEvent.order_key !== clean(shadowDecision.order_key)) {
    throw new Error("REPORT_ENVELOPE_ORDER_KEY_MISMATCH");
  }
  if (sourceEvent.snapshot_hash !== clean(shadowDecision.snapshot_hash)) {
    throw new Error("REPORT_ENVELOPE_SNAPSHOT_MISMATCH");
  }

  const unitId = sourceEvent.order.CDFILIAL;
  const storeId = sourceEvent.order.CDLOJA;
  if (!unitId || !storeId) throw new Error("REPORT_ENVELOPE_STORE_IDENTITY_REQUIRED");

  const contractId = clean(options.contractId || "tata.cross-system-reporting-contract.v2");
  const generatedAt = clean(options.generatedAt || new Date().toISOString());
  if (!contractId) throw new Error("REPORTING_CONTRACT_ID_REQUIRED");
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error("REPORT_ENVELOPE_RECORDED_AT_INVALID");
  }

  const eventId = sourceEvent.order_key + "|" + sourceEvent.snapshot_hash;
  return Object.freeze({
    schema: "tata.delivery-report-source-envelope.v1",
    specversion: "1.0",
    id: eventId,
    source: "deliveryos://caixa-mooca/" + encodeURIComponent(unitId) + "/" + encodeURIComponent(storeId),
    type: "tata.delivery.order-shadow-decision.v1",
    subject: "order/" + encodeURIComponent(sourceEvent.order.NRCOMANDA),
    time: sourceEvent.observed_at,
    recorded_at: generatedAt,
    contract_id: contractId,
    identity: Object.freeze({
      unit_id: unitId,
      store_id: storeId,
      order_key: sourceEvent.order_key,
      snapshot_hash: sourceEvent.snapshot_hash,
      nr_venda_rest: sourceEvent.order.NRVENDAREST,
      nr_comanda: sourceEvent.order.NRCOMANDA,
      nr_comanda_ext: sourceEvent.order.NRCOMANDAEXT,
      origin: sourceEvent.order.IDORGCMDVENDA,
      opened_at: sourceEvent.order.DTHRABERMESA,
    }),
    source_event: sourceEvent,
    shadow_decision: shadowDecision,
    privacy: Object.freeze({
      customer_pii_required: false,
      customer_pii_persisted: false,
      raw_customer_payload_persisted: false,
    }),
    authority: Object.freeze({
      delivery_os: "ORDER_OBSERVATION_AND_DECISION",
      tata_academia: "PACKAGING_KIT_CLASSIFICATION_RULES",
      tata_os: "REPORTING_PROJECTION_AND_APPEND_ONLY_LEDGER",
    }),
    effects: Object.freeze({
      database_read: false,
      database_write: false,
      sequence_binding_write: false,
      print: false,
      spooler_write: false,
      odhen_write: false,
      fiscal_action: false,
      sefaz_call: false,
    }),
  });
}

module.exports = { buildReportSourceEnvelope };
