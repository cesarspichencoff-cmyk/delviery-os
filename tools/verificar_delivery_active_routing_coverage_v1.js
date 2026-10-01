"use strict";

const assert = require("node:assert/strict");
const { auditCoverage, inferPlaza } = require("./auditar_delivery_active_routing_coverage_v1.js");

assert.equal(inferPlaza({ group: "URAMAKIS", product: "URAMAKI X" }, ["00006","00004"]), "enrolados");
assert.equal(inferPlaza({ group: "URAMAKIS", product: "HOT ROLL" }, ["00006","00002"]), "enrolados_quentes");
assert.equal(inferPlaza({ group: "ENTRADAS FRIAS", product: "TARTAR X" }, ["00006"]), "enrolados_quentes");
assert.equal(inferPlaza({ group: "ACOMPANHAMENTOS", product: "MISSOSHIRO" }, ["00002"]), "cozinha_quentes");
assert.equal(inferPlaza({ group: "ACOMPANHAMENTOS", product: "WASABI" }, []), "montagem_outros");

const rows = [
  {
    "Modalidade": "Delivery IFood",
    "Código": 9500000000,
    "Produto": "URAMAKI DE SALMAO",
    "Nv. de Produto Superior": "URAMAKIS",
    "Qtd.": 3,
  },
  {
    "Modalidade": "Delivery IFood",
    "Código": 9750003000,
    "Produto": "WASABI",
    "Nv. de Produto Superior": "ACOMPANHAMENTOS",
    "Qtd.": 2,
  },
  {
    "Modalidade": "Mesa",
    "Código": 9500000000,
    "Produto": "URAMAKI DE SALMAO",
    "Nv. de Produto Superior": "URAMAKIS",
    "Qtd.": 99,
  },
];

const routing = {
  schema: "deliveryos.odhen.product-routing.compact.v1",
  products: {
    "9.50.00.000.00": ["00006","00004"],
  },
};

const nonProduction = {
  schema: "deliveryos.non-production-items.v1",
  store: "0001 - TATA ITAIM",
  semantics: "NO_OWN_PRODUCTION_TICKET",
  items: {
    "9.75.00.030.00": {
      product_name: "WASABI",
      logical_plaza: "montagem_outros",
      reason: "Complementary/mounted item; no own production command/ticket.",
      proof: "HUMAN_CONFIRMED",
    },
  },
};

const seed = {
  itens: [
    { nome: "Uramaki de Salmão", praca_principal: "enrolados" },
    { nome: "Wasabi", praca_principal: "montagem_outros" },
  ],
};

const report = auditCoverage(rows, routing, seed, nonProduction);
assert.equal(report.summary.delivery_skus, 2);
assert.equal(report.summary.delivery_units, 5);
assert.equal(report.summary.direct_route_skus, 1);
assert.equal(report.summary.direct_route_units, 3);
assert.equal(report.summary.physical_route_gap_skus, 0);
assert.equal(report.summary.physical_route_gap_units, 0);
assert.equal(report.summary.logical_plaza_resolved_skus, 2);
assert.equal(report.summary.no_own_production_ticket_skus, 1);
assert.equal(report.summary.no_own_production_ticket_units, 2);
assert.equal(report.summary.production_behavior_resolved_skus, 2);
assert.equal(report.summary.production_behavior_resolved_units, 5);
assert.equal(report.summary.production_behavior_sku_coverage, 1);
assert.equal(report.summary.production_behavior_unit_coverage, 1);
assert.equal(report.no_own_production_ticket_items[0].product, "WASABI");
assert.equal(report.no_own_production_ticket_items[0].logical_plaza, "montagem_outros");
assert.equal(
  report.no_own_production_ticket_items[0].production_behavior,
  "NO_OWN_PRODUCTION_TICKET",
);
assert.equal(report.effects.print, false);

console.log("active-delivery-routing-coverage-v1: ok");
