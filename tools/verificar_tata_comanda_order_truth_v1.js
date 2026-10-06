"use strict";
const assert = require("node:assert/strict");
const {
  buildTataComandaOrderTruthV1,
  selectLatestTataComandaOrderTruthRevisionV1,
} = require("../runtime/reporting/tata_comanda_order_truth_v1.cjs");

function base(overrides = {}) {
  const seed = {
    identity: {
      unit_id: "0001", store_id: "01", nr_venda_rest: "V1", nr_comanda: "C1",
      nr_comanda_ext: "EXT1", origin: "DLV_IFO", order_status: "X",
      opened_at: "2026-10-05T18:04:08-03:00", snapshot_hash: "HASH-A",
      customer_name: "NAO_PERSISTIR", customer_phone: "NAO_PERSISTIR",
    },
    revision: {
      source_observed_at: "2026-10-05T18:05:00-03:00",
      envelope_recorded_at: "2026-10-06T04:20:00-03:00",
    },
    items: [
      { line_no: "1", product_code: "P1", route_code: "R1", quantity: 2, unit_price_brl: 40, discount_brl: 5, surcharge_brl: 0, observation: "NAO_PERSISTIR" },
      { line_no: "2", product_code: "P2", route_code: "R2", quantity: 1, unit_price_brl: 25, discount_brl: 0, surcharge_brl: 0 },
    ],
    lifecycle: {
      kds_started_at: "2026-10-05T18:05:01-03:00",
      kds_finished_at: "2026-10-05T18:10:01-03:00",
      sale_closed_at: "2026-10-05T18:09:58-03:00",
      money_recorded_at: "2026-10-05T18:07:20-03:00",
    },
    financial: {
      order_service_fee_brl: 10, sale_total_brl: 110, movement_total_brl: 110,
      receipts: [{ code: "005", label: "MASTER CREDITO", amount_brl: 110 }],
    },
    raw_customer_payload: { address: "NAO_PERSISTIR" },
    latitude: -23.5, longitude: -46.6,
  };
  return { ...seed, ...overrides };
}

const truth = buildTataComandaOrderTruthV1(base());
assert.equal(truth.financial.item_gross_brl, 105);
assert.equal(truth.financial.item_discount_brl, 5);
assert.equal(truth.financial.item_net_brl, 100);
assert.equal(truth.financial.item_plus_service_brl, 110);
assert.equal(truth.financial.reconciled, true);
assert.equal(truth.lifecycle.kds_cycle.duration_ms, 300000);
assert.equal(truth.lifecycle.kds_cycle.production_time_claim, false);
assert.equal(truth.lifecycle.kds_cycle.delivery_time_claim, false);
assert.equal(truth.lifecycle.production_time_minutes, null);
assert.equal(truth.lifecycle.delivery_time_minutes, null);
assert.equal(truth.revision.selection_clock, "SOURCE_OBSERVED_AT");
assert.equal(Object.hasOwn(truth.identity, "customer_name"), false);
assert.equal(Object.hasOwn(truth.identity, "customer_phone"), false);
assert.equal(Object.hasOwn(truth.items[0], "observation"), false);
assert.equal(Object.hasOwn(truth, "raw_customer_payload"), false);
assert.equal(Object.hasOwn(truth, "latitude"), false);
assert.equal(Object.hasOwn(truth, "longitude"), false);
assert.equal(truth.effects.database_read, false);
assert.equal(truth.effects.database_write, false);
assert.equal(truth.collection_boundary.authoritative_source_requires_read_only_database_access, true);
assert.equal(truth.collection_boundary.extended_reader_permissions_currently_authorized, false);

const oldObservedLaterRecorded = buildTataComandaOrderTruthV1(base({
  identity: { ...base().identity, snapshot_hash: "EMPTY-OLD" },
  revision: { source_observed_at: "2026-10-05T18:46:00-03:00", envelope_recorded_at: "2026-10-06T04:20:00.005-03:00" },
  items: [{ line_no: "1", product_code: "EMPTY-MARKER", quantity: 0 }],
  financial: {},
}));
const completeObservedLater = buildTataComandaOrderTruthV1(base({
  identity: { ...base().identity, snapshot_hash: "COMPLETE-NEW" },
  revision: { source_observed_at: "2026-10-05T18:46:30-03:00", envelope_recorded_at: "2026-10-06T04:20:00.001-03:00" },
  items: [{ line_no: "1", product_code: "P-COMPLETE", quantity: 7 }],
  financial: {},
}));
const chosen = selectLatestTataComandaOrderTruthRevisionV1([oldObservedLaterRecorded, completeObservedLater]);
assert.equal(chosen.identity.snapshot_hash, "COMPLETE-NEW");
assert.equal(chosen.items[0].quantity, 7);

const noPrice = buildTataComandaOrderTruthV1(base({
  items: [{ line_no: "1", product_code: "P3", quantity: 1 }],
  financial: { order_service_fee_brl: 0 },
}));
assert.equal(noPrice.financial.state, "PARTIAL_OR_UNKNOWN");
assert.equal(noPrice.financial.item_net_brl, null);
assert.equal(noPrice.financial.reconciled, false);

const reversedKds = buildTataComandaOrderTruthV1(base({
  lifecycle: { kds_started_at: "2026-10-05T18:10:00-03:00", kds_finished_at: "2026-10-05T18:09:00-03:00" },
}));
assert.equal(reversedKds.lifecycle.kds_cycle.duration_ms, null);
assert.equal(reversedKds.lifecycle.kds_cycle.state, "PARTIAL");


const fs = require("node:fs");
const path = require("node:path");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/tata_reader_lifecycle_permission_manifest_candidate_v1.json"), "utf8"));
assert.equal(manifest.status, "CANDIDATE_NOT_AUTHORIZED_NOT_APPLIED");
assert.equal(manifest.authorization_required_before_apply, true);
assert.equal(manifest.applied, false);
assert.equal(manifest.effects.permission_change, false);
assert.deepEqual(
  Object.keys(manifest.candidate_columns).sort(),
  ["HISTPEDCONS", "ITCMD_LOG", "MOVCAIXADLV", "TIPORECE", "VENDA"],
);
for (const forbidden of ["INSERT", "UPDATE", "DELETE", "EXECUTE", "customer_name", "customer_phone", "customer_address"]) {
  assert.ok(manifest.explicitly_not_requested.includes(forbidden), "missing forbidden boundary: " + forbidden);
}

const day = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/tata_comanda_day_truth_2026-10-05_v1.json"), "utf8"));
assert.equal(day.status, "PROVEN_AGGREGATE_READONLY_AUDIT");
assert.equal(day.orders.total, 195);
assert.equal(day.orders.units, 638);
assert.equal(day.orders.channels.DLV_IFO + day.orders.channels.DLV_NMO + day.orders.channels.DLV_FOS, 195);
assert.equal(day.lifecycle_coverage.kds_p, 195);
assert.equal(day.lifecycle_coverage.kds_f, 195);
assert.equal(day.financial.direct_exact_orders + day.financial.service_fee_residual_orders, 195);
assert.equal(Number((day.financial.item_net_candidate_brl + day.financial.service_fee_residual_total_brl).toFixed(2)), day.financial.movement_total_brl);
assert.equal(
  Number((
    day.financial.receipt_channels.DLV_IFO.amount_brl +
    day.financial.receipt_channels.DLV_NMO.amount_brl +
    day.financial.receipt_channels.DLV_FOS.amount_brl
  ).toFixed(2)),
  day.financial.movement_total_brl,
);
assert.ok(day.unknowns.includes("PRODUCTION_TIME_MISSING"));
assert.ok(day.unknowns.includes("DELIVERY_TIME_MISSING"));
assert.equal(day.revision_clock.recovered_units, 10);
assert.equal(day.revision_clock.semantic_order_changes_when_fixing_clock, 2);

console.log("tata-comanda-order-truth-v1: ok");
