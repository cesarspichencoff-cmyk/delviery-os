"use strict";

const assert = require("node:assert/strict");
const { buildConfig, canonicalizeProductCode } = require("./gerar_retail_routing_config_v1.js");
const { compareConfig } = require("./verificar_routing_config_drift_v1.js");

assert.equal(canonicalizeProductCode("9150007500"), "9.15.00.075.00");
assert.equal(canonicalizeProductCode("2001201A00"), "2.00.12.01A.00");

const printerRows = [
  {
    "Código": "00009",
    "Modelo": "Epson TM-T20",
    "Nome Impressora": "BALCAOSUSHI1",
    "Porta/IP de Impressão": "LPT4",
    "Endereço de IP da impressora": "192.168.0.142",
    "Endereço do servidor de periféricos": "192.168.0.24:3000",
  },
  {
    "Código": "00003",
    "Modelo": "Epson TM-T20",
    "Nome Impressora": "DELIVERY SUSHI 1",
    "Porta/IP de Impressão": null,
    "Endereço de IP da impressora": "192.168.0.153",
    "Endereço do servidor de periféricos": "192.168.0.24:3000",
  },
];

const productRows = [
  {
    "Código": "9150007500",
    "Produto": "COMBINADO SALMAO 1 PESSOA",
    "Setor de Produção": " - ",
    "Impressora do Puxa": null,
    "Impressora de Produção": "BALCAOSUSHI1",
    "Impressora de Produção (2)": "DELIVERY SUSHI 1",
    "Impressora de Produção (Backup)": null,
    "Impressora de Produção (2) (Backup)": null,
    "Impressora do Puxa (Backup)": null,
    "Imprime Cancelamento de Pedido": "Sim",
  },
];

const built = buildConfig(productRows, printerRows, {
  store: "0001 - TATA ITAIM",
  capturedDate: "2026-09-30",
  capturedAtLocal: "2026-09-30T20:18:00-03:00",
  productsSha256: "a".repeat(64),
  printersSha256: "b".repeat(64),
});

assert.deepEqual(built.routing.products["9.15.00.075.00"], ["00009", "00003"]);
assert.equal(built.catalog.schema, "deliveryos.retail.product-catalog.v1");
assert.equal(built.catalog.products.length, 1);
assert.deepEqual(built.catalog.products[0], {
  product_code: "9.15.00.075.00",
  product_name: "COMBINADO SALMAO 1 PESSOA",
  printer_codes: ["00009", "00003"],
});
assert.deepEqual(built.routing.counts, {
  products: 1,
  one_target: 0,
  two_targets: 1,
  zero_target: 0,
  puxa: 0,
});
assert.deepEqual(
  built.printerMap.mappings.filter((x) => x.used_by_products).map((x) => x.printer_code),
  ["00009", "00003"],
);

const same = compareConfig(built.routing, built.routing, built.printerMap, built.printerMap);
assert.equal(same.material_drift, false);

const changedRouting = JSON.parse(JSON.stringify(built.routing));
changedRouting.products["9.15.00.075.00"] = ["00009"];
const routeDrift = compareConfig(
  built.routing,
  changedRouting,
  built.printerMap,
  built.printerMap,
);
assert.equal(routeDrift.material_drift, true);
assert.equal(routeDrift.routing.changed.length, 1);

const changedPrinters = JSON.parse(JSON.stringify(built.printerMap));
changedPrinters.mappings[0].printer_ip = "192.168.0.250";
const printerDrift = compareConfig(
  built.routing,
  built.routing,
  built.printerMap,
  changedPrinters,
);
assert.equal(printerDrift.material_drift, true);
assert.equal(printerDrift.printers.changed.length, 1);

assert.throws(
  () =>
    buildConfig(
      [
        {
          ...productRows[0],
          "Impressora do Puxa": "BALCAOSUSHI1",
        },
      ],
      printerRows,
      {
        store: "0001 - TATA ITAIM",
        capturedDate: "2026-09-30",
        productsSha256: "a".repeat(64),
        printersSha256: "b".repeat(64),
      },
    ),
  /active puxa routes detected/,
);

console.log("retail-routing-config-tooling-v1: ok");
