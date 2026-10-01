"use strict";

const assert = require("node:assert/strict");
const {
  buildStationProductionTicketV2,
  buildDeliveryCheckProjectionV1,
} = require("../dist/src/production/productionTicketV2.js");

const intent = {
  printer: {
    printer_code: "00003",
    printer_name: "DELIVERY SUSHI 1",
    printer_ip: "192.168.0.153",
    printer_port: null,
    peripherals_server: "192.168.0.24:3000",
  },
  template_version: "production-ticket-v2-shadow",
  semantic_key_material: "x",
  identifiers: {
    tata_sequence: "037",
    teknisa_order_id: "18452",
    ifood_order_id: "A1B2C3",
    order_time: "19:42",
  },
  lines: [
    {
      item_index: 0,
      product_code: "9.15.00.075.00",
      product_name: "COMBINADO SALMAO 1 PESSOA",
      quantity: 1,
      item_observations: ["SEM CEBOLINHA"],
      mount_group_id: "G1",
      box_label: "CX 750",
      prep_components: [
        {
          component_key: "EBITEN",
          label: "Ebiten",
          quantity: 2,
          unit: "EA",
          proof: "HUMAN_CONFIRMED",
        },
      ],
    },
    {
      item_index: 1,
      product_code: "9.50.00.400.00",
      product_name: "URAMAKI EBITEN ESPECIAL",
      quantity: 1,
      item_observations: [],
      mount_group_id: "G1",
      box_label: "CX 750",
      prep_components: [
        {
          component_key: "EBITEN",
          label: "Ebiten",
          quantity: 1,
          unit: "EA",
          proof: "HUMAN_CONFIRMED",
        },
        {
          component_key: "SALMAO_GR",
          label: "Salmão",
          quantity: 40,
          unit: "GRM",
          proof: "UNKNOWN",
        },
      ],
    },
  ],
  evidence: "PLANNED",
  calibration_status: "CALIBRATION_REQUIRED",
  physical_effect_authorized: false,
};

const station = buildStationProductionTicketV2(intent);
assert.equal(station.destination.printer_name, "DELIVERY SUSHI 1");
assert.equal(station.mount_groups.length, 1);
assert.equal(station.mount_groups[0].box_label, "CX 750");
assert.equal(station.mount_groups[0].items.length, 2);
assert.deepEqual(station.prep_components, [
  {
    component_key: "EBITEN",
    label: "Ebiten",
    quantity: 3,
    unit: "EA",
    proof: "HUMAN_CONFIRMED",
  },
]);
assert.deepEqual(station.prep_unknowns, ["UNPROVEN_PREP_COMPONENT:SALMAO_GR"]);
assert.equal(station.effects.print, false);

const resourceProjection = {
  schema: "deliveryos.order-resource-projection.v1",
  order_id: "18452",
  ready_for_operational_resource_report: true,
  ready_for_recipe_cmv: false,
  blocking_reasons: [],
  usages: [
    {
      resource_key: "BOX_750",
      label: "Caixa 750",
      kind: "PACKAGING_BOX",
      quantity: 1,
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
      resource_key: "KIT:Kit p/1",
      label: "Kit p/1",
      kind: "KIT",
      quantity: 1,
      uom: "EA",
      proof: "KIT_RULE_FACT",
      stock_semantics: "REFERENCE_ONLY",
    },
    {
      resource_key: "HASHI",
      label: "Hashi",
      kind: "KIT_COMPONENT",
      quantity: 1,
      uom: "EA",
      proof: "KIT_RULE_FACT",
      stock_semantics: "THEORETICAL_EXPECTED_CONSUMPTION",
    },
    {
      resource_key: "COMPLEMENT:9.75.00.030.00",
      label: "WASABI",
      kind: "COMPLEMENT",
      quantity: 1,
      uom: "EA",
      proof: "HUMAN_CONFIRMED",
      stock_semantics: "THEORETICAL_EXPECTED_CONSUMPTION",
    },
  ],
  unknowns: ["RECIPE_BOM_COVERAGE_INCOMPLETE"],
  semantics: {
    sold_is_not_actual_consumed: true,
    theoretical_is_not_stock_write: true,
    cmv_requires_recipe_bom_and_cost_basis: true,
  },
  effects: {
    stock_write: false,
    cmv_write: false,
    print: false,
    odhen_write: false,
  },
};

const deliveryCheck = buildDeliveryCheckProjectionV1(resourceProjection);
assert.equal(deliveryCheck.boxes.length, 1);
assert.equal(deliveryCheck.bags.length, 1);
assert.equal(deliveryCheck.kits.length, 1);
assert.equal(deliveryCheck.kit_components.length, 1);
assert.equal(deliveryCheck.complements.length, 1);
assert.deepEqual(deliveryCheck.unknowns, ["RECIPE_BOM_COVERAGE_INCOMPLETE"]);
assert.equal(deliveryCheck.effects.stock_write, false);
assert.equal(deliveryCheck.effects.print, false);
assert.equal(deliveryCheck.semantics.delivery_ui_projection_not_additional_ticket, true);

console.log("production-ticket-v2: ok");
