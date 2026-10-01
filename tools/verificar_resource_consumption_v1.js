"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  projectOrderResources,
  aggregateOrderResources,
} = require("../dist/src/production/resourceConsumption.js");

const kits = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "kit_component_registry_v1.json"), "utf8"),
);

const order1 = projectOrderResources({
  order_id: "18452",
  sold_items: [
    {
      product_code: "9.15.00.075.00",
      product_name: "COMBINADO SALMAO 1 PESSOA",
      quantity: 1,
    },
    {
      product_code: "9.75.00.030.00",
      product_name: "WASABI",
      quantity: 1,
    },
  ],
  complements: [
    {
      product_code: "9.75.00.030.00",
      product_name: "WASABI",
      quantity: 1,
      proof: "HUMAN_CONFIRMED",
    },
  ],
  packaging: {
    groups: [
      {
        box: "750",
        boxes: 1,
        status: "PROVEN_OPERATIONAL_DOCUMENT",
      },
    ],
    bags: {
      minimum: 1,
      status: "PROVEN_OPERATIONAL_DOCUMENT",
      exact_bag_count: 1,
      exact_bag_count_status: "FACT",
      group_sizes: [
        {
          group: "food",
          size: "M",
          status: "FACT",
        },
      ],
    },
    has_unknown: false,
  },
  kits: {
    status: "FACT",
    kits: [{ kit: "Kit p/1", quantidade: 1 }],
  },
  kit_registry: kits,
});

assert.equal(order1.ready_for_operational_resource_report, true);
assert.equal(order1.ready_for_recipe_cmv, false);
assert.ok(order1.unknowns.includes("RECIPE_BOM_COVERAGE_INCOMPLETE"));

const usage = (kind, key) =>
  order1.usages.find((x) => x.kind === kind && x.resource_key === key);

assert.equal(usage("PACKAGING_BOX", "BOX_750").quantity, 1);
assert.equal(usage("BAG", "BAG_M").quantity, 1);
assert.equal(usage("KIT", "KIT:Kit p/1").quantity, 1);
assert.equal(usage("KIT_COMPONENT", "HASHI").quantity, 1);
assert.equal(usage("KIT_COMPONENT", "SHOYU_GARRAFINHA_50ML").quantity, 1);
assert.equal(usage("KIT_COMPONENT", "SHOYUZARA").quantity, 1);
assert.equal(usage("KIT_COMPONENT", "GUARDANAPO").quantity, 1);
assert.equal(usage("COMPLEMENT", "COMPLEMENT:9.75.00.030.00").quantity, 1);

const order2 = projectOrderResources({
  order_id: "18453",
  sold_items: [
    {
      product_code: "9.50.00.000.00",
      product_name: "URAMAKI DE SALMAO",
      quantity: 2,
    },
  ],
  packaging: {
    groups: [
      {
        box: "750",
        boxes: 1,
        status: "PROVEN_CURRENT_HUMAN_RULE",
      },
    ],
    bags: {
      minimum: 1,
      status: "PROVEN_OPERATIONAL_DOCUMENT",
      exact_bag_count: 1,
      exact_bag_count_status: "FACT",
      group_sizes: [{ group: "food", size: "P", status: "FACT" }],
    },
    has_unknown: false,
  },
  kits: {
    status: "FACT",
    kits: [{ kit: "Kit p/1", quantidade: 1 }],
  },
  kit_registry: kits,
  recipe_ingredients: [
    {
      resource_key: "ING:SALMAO",
      label: "Salmão",
      quantity: 120,
      uom: "GRM",
      proof: "RECIPE_BOM",
      source_item_code: "9.50.00.000.00",
      source_item_name: "URAMAKI DE SALMAO",
    },
    {
      resource_key: "ING:ARROZ_SUSHI",
      label: "Arroz de sushi",
      quantity: 160,
      uom: "GRM",
      proof: "RECIPE_BOM",
      source_item_code: "9.50.00.000.00",
      source_item_name: "URAMAKI DE SALMAO",
    },
  ],
});

assert.equal(order2.ready_for_operational_resource_report, true);
assert.equal(order2.ready_for_recipe_cmv, true);

const aggregate = aggregateOrderResources([order1, order2]);
assert.equal(aggregate.order_count, 2);
assert.equal(aggregate.recipe_cmv_ready_orders, 1);
assert.deepEqual(aggregate.blocked_orders, []);
assert.equal(
  aggregate.usages.find((x) => x.kind === "PACKAGING_BOX" && x.resource_key === "BOX_750").quantity,
  2,
);
assert.equal(
  aggregate.usages.find((x) => x.kind === "KIT_COMPONENT" && x.resource_key === "HASHI").quantity,
  2,
);

assert.equal(order1.effects.stock_write, false);
assert.equal(order1.effects.cmv_write, false);

console.log("resource-consumption-v1: ok");
