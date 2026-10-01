"use strict";

const assert = require("node:assert/strict");
const Production = require("../dist/src/production/productionTicket.js");

for (const service of ["almoco", "jantar"]) {
  for (const square of [
    "caixa",
    "cozinha",
    "enrolados",
    "combinados",
    "enrolados_quentes",
    "duplas",
  ]) {
    const routed = Production.routeProductionSquare(square, service);
    assert.equal(routed.status, "UNKNOWN");
    assert.equal(routed.target, null);
    assert.match(
      routed.reason,
      /LEGACY_STATIC_ROUTE_SUPERSEDED_BY_PRODUCT_ROUTING_CONFIG/,
    );
  }
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

assert.equal(preview.ready, false);
assert.equal(preview.route.target, null);
assert.ok(preview.blocking_reasons.includes("ROUTE_NOT_PROVEN"));
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

const kitchenPreview = Production.buildProductionTicketPreview({
  service: "jantar",
  square: "cozinha",
  identifiers: { tata: "038", teknisa: "18453", ifood: "D4E5F6" },
  horario: "19:43",
  mount_groups: [
    {
      box_label: "",
      items: [
        { nome: "Guioza", quantidade: 2, observacoes: ["sem cebolinha"] },
      ],
    },
  ],
});
assert.equal(kitchenPreview.ready, false);
assert.equal(kitchenPreview.route.target, null);
assert.ok(kitchenPreview.blocking_reasons.includes("ROUTE_NOT_PROVEN"));
assert.equal(kitchenPreview.content.includes("MONTAR NA"), false);
assert.match(kitchenPreview.content, /\[ \] PRODUZIDO/);

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
