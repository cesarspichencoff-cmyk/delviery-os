"use strict";

const assert = require("node:assert/strict");
const { costResourceAggregate } = require("../dist/src/production/resourceCosting.js");

const aggregate = {
  schema: "deliveryos.resource-aggregate.v1",
  order_count: 1,
  usages: [
    {
      resource_key: "BOX_750",
      label: "Caixa 750",
      kind: "PACKAGING_BOX",
      quantity: 2,
      uom: "EA",
      proof: "PACKAGING_RULE_FACT",
      stock_semantics: "THEORETICAL_EXPECTED_CONSUMPTION",
    },
    {
      resource_key: "BAG_M",
      label: "Sacola M",
      kind: "BAG",
      quantity: 1,
      uom: "EA",
      proof: "PACKAGING_RULE_FACT",
      stock_semantics: "THEORETICAL_EXPECTED_CONSUMPTION",
    },
    {
      resource_key: "HASHI",
      label: "Hashi",
      kind: "KIT_COMPONENT",
      quantity: 2,
      uom: "EA",
      proof: "KIT_RULE_FACT",
      stock_semantics: "THEORETICAL_EXPECTED_CONSUMPTION",
    },
    {
      resource_key: "ING:SALMAO",
      label: "Salmão",
      kind: "RECIPE_INGREDIENT",
      quantity: 120,
      uom: "GRM",
      proof: "RECIPE_BOM",
      stock_semantics: "THEORETICAL_EXPECTED_CONSUMPTION",
    },
  ],
  blocked_orders: [],
  recipe_cmv_ready_orders: 1,
  theoretical_cmv_basis_ready_orders: 1,
  packaging_and_kit_complete_orders: 1,
  orders_with_unknown_resources: [],
  semantics: {
    aggregate_is_theoretical: true,
    no_stock_write: true,
  },
};

const registry = {
  schema: "deliveryos.resource-cost-registry.v1",
  store: "0001 - TATA ITAIM",
  entries: [
    {
      resource_key: "BOX_750",
      label: "Caixa 750",
      effective_from: "2026-09-01",
      effective_to: null,
      unit_cost: 0.8,
      currency: "BRL",
      uom: "EA",
      source_ref: "fixture",
      proof: "PURCHASE_COST_PROVEN",
    },
    {
      resource_key: "BAG_M",
      label: "Sacola M",
      effective_from: "2026-09-01",
      effective_to: null,
      unit_cost: 0.5,
      currency: "BRL",
      uom: "EA",
      source_ref: "fixture",
      proof: "PURCHASE_COST_PROVEN",
    },
    {
      resource_key: "HASHI",
      label: "Hashi",
      effective_from: "2026-09-01",
      effective_to: null,
      unit_cost: 0.1,
      currency: "BRL",
      uom: "EA",
      source_ref: "fixture",
      proof: "PURCHASE_COST_PROVEN",
    },
    {
      resource_key: "ING:SALMAO",
      label: "Salmão",
      effective_from: "2026-09-01",
      effective_to: null,
      unit_cost: 0.09,
      currency: "BRL",
      uom: "GRM",
      source_ref: "fixture",
      proof: "INVENTORY_COST_PROVEN",
    },
  ],
};

const result = costResourceAggregate(aggregate, registry, "2026-09-30");
assert.equal(result.ready_for_packaging_and_kit_cost, true);
assert.equal(result.ready_for_full_theoretical_cmv, true);
assert.equal(result.uncosted.length, 0);
assert.equal(result.totals.packaging_and_kit_brl, 2.3);
assert.equal(result.totals.recipe_ingredient_brl, 10.8);
assert.equal(result.totals.total_theoretical_brl, 13.1);
assert.equal(result.effects.stock_write, false);
assert.equal(result.effects.cmv_write, false);

const mismatch = JSON.parse(JSON.stringify(registry));
mismatch.entries.find((x) => x.resource_key === "ING:SALMAO").uom = "KGM";
const blocked = costResourceAggregate(aggregate, mismatch, "2026-09-30");
assert.equal(blocked.ready_for_full_theoretical_cmv, false);
assert.ok(blocked.blocking_reasons.includes("COST_UOM_MISMATCH:ING:SALMAO:GRM:KGM"));

console.log("resource-costing-v1: ok");
