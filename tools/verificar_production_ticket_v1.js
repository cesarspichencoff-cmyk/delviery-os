"use strict";

const assert = require("node:assert/strict");
const Production = require("../dist/src/production/productionTicket.js");

const routes = [
  ["almoco", "caixa", "CAIXA"],
  ["almoco", "cozinha", "COZINHA"],
  ["almoco", "enrolados", "BALCAO_SUSHI_2"],
  ["almoco", "combinados", "BALCAO_SUSHI_1"],
  ["almoco", "enrolados_quentes", "BALCAO_SUSHI_2"],
  ["jantar", "caixa", "CAIXA"],
  ["jantar", "cozinha", "COZINHA"],
  ["jantar", "enrolados", "DELIVERY_SUSHI_2"],
  ["jantar", "combinados", "DELIVERY_SUSHI_1"],
  ["jantar", "enrolados_quentes", "BALCAO_SUSHI_2"],
];

for (const [service, square, target] of routes) {
  const routed = Production.routeProductionSquare(square, service);
  assert.equal(routed.status, "PROVEN");
  assert.equal(routed.target, target);
}

for (const service of ["almoco", "jantar"]) {
  const unknown = Production.routeProductionSquare("duplas", service);
  assert.equal(unknown.status, "UNKNOWN");
  assert.equal(unknown.target, null);
}

const preview = Production.buildProductionTicketPreview({
  service: "jantar",
  square: "enrolados",
  identifiers: {
    tata: "037",
    teknisa: "18452",
    ifood: "A1B2C3",
  },
  horario: "19:42",
  mount_groups: [
    {
      box_label: "CX 750",
      items: [
        {
          nome: "Uramaki Salmão",
          quantidade: 2,
          observacoes: ["sem cebolinha"],
        },
        {
          nome: "Futomaki",
          quantidade: 1,
        },
      ],
    },
    {
      box_label: "CX 450",
      items: [
        {
          nome: "Temaki Atum",
          quantidade: 1,
          observacoes: ["molho separado"],
        },
      ],
    },
  ],
});

assert.equal(preview.ready, true);
assert.equal(preview.route.target, "DELIVERY_SUSHI_2");
assert.match(preview.content, /TATA 037/);
assert.match(preview.content, /TEKNISA 18452/);
assert.match(preview.content, /IFOOD A1B2C3/);
assert.match(preview.content, /MONTAR NA CX 750/);
assert.match(preview.content, /2x URAMAKI SALMÃO/);
assert.match(preview.content, /!!! OBS: SEM CEBOLINHA !!!/);
assert.match(preview.content, /MONTAR NA CX 450/);
assert.equal(preview.effects.print, false);
assert.equal(preview.effects.odhen_write, false);
assert.equal(preview.privacy.customer_fields_supported, false);
assert.equal(preview.privacy.address_fields_supported, false);
assert.equal(preview.privacy.payment_fields_supported, false);
assert.equal(preview.privacy.free_text_observations_sensitive, true);

const missingBox = Production.buildProductionTicketPreview({
  service: "almoco",
  square: "combinados",
  identifiers: { tata: "101", teknisa: "999", ifood: null },
  mount_groups: [{ box_label: "", items: [{ nome: "Combinado", quantidade: 1 }] }],
});
assert.equal(missingBox.ready, false);
assert.ok(missingBox.blocking_reasons.includes("MISSING_BOX_LABEL_0"));

const missingTata = Production.buildProductionTicketPreview({
  service: "almoco",
  square: "enrolados",
  identifiers: { tata: "", teknisa: "999", ifood: null },
  mount_groups: [{ box_label: "CX 450", items: [{ nome: "Temaki", quantidade: 1 }] }],
});
assert.equal(missingTata.ready, false);
assert.ok(missingTata.blocking_reasons.includes("MISSING_TATA_SEQUENCE"));

const unknownRoute = Production.buildProductionTicketPreview({
  service: "jantar",
  square: "duplas",
  identifiers: { tata: "200", teknisa: "1000", ifood: "Z9Y8" },
  mount_groups: [{ box_label: "CX 450", items: [{ nome: "Sashimi", quantidade: 2 }] }],
});
assert.equal(unknownRoute.ready, false);
assert.ok(unknownRoute.blocking_reasons.includes("ROUTE_NOT_PROVEN"));

const requested = Production.renderKitchenNeedSummary({
  mode: "SOLICITADO_DESDE_CORTE",
  since_label: "19:30",
  hot: 12,
  ebiten: 5,
  shiso: 3,
});
assert.match(requested, /SOLICITADO DESDE 19:30/);
assert.match(requested, /HOT     12/);
assert.match(requested, /EBITEN  5/);
assert.match(requested, /SHISO   3/);

const pending = Production.renderKitchenNeedSummary({
  mode: "PENDENTE_PROVADO",
  hot: 4,
  ebiten: 1,
  shiso: 0,
});
assert.match(pending, /PENDENTE PROVADO/);

assert.throws(
  () =>
    Production.renderKitchenNeedSummary({
      mode: "SOLICITADO_DESDE_CORTE",
      since_label: "12:00",
      hot: -1,
      ebiten: 0,
      shiso: 0,
    }),
  /INVALID_KITCHEN_NEED:HOT/,
);

console.log("production-ticket-v1: ok");
