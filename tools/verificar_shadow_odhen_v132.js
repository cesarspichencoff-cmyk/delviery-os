"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { readFileSync } = require("node:fs");

const Shadow = require("../dist/src/shadow/odhenReadonly.js");
const MOTOR = require("../src/perfil-delivery/motor.js");
const seed = JSON.parse(readFileSync(path.join(__dirname, "..", "data", "cardapio_knowledge_seed.json"), "utf8")).itens;

const fixture = {
  NRCOMANDA: "0000170512",
  NRCOMANDAEXT: "IFOOD-0724",
  NRVENDAREST: "998877",
  emissao: "2026-09-27T21:15:00-03:00",

  // PII/payment/address deliberately present in raw fixture to prove it never leaks.
  CONSUMIDOR: "CLIENTE FICTICIO",
  TELEFONE: "0000000000",
  ENDERECO: "RUA FICTICIA",
  PAGAMENTO: "FICTICIO",

  products: [
    { CDPRODUTO: "1001", NMPRODUTO: "Uramaki de Salmão", QTPRODCOMVEN: 1 },
    { CDPRODUTO: "1002", NMPRODUTO: "Sashimi de Salmão", QTPRODCOMVEN: 2 },
  ],
  observation_scan_complete: true,
  observation_rows: [
    {
      source_field: "DSOBSDESCIT",
      value: "SEM CEBOLINHA",
      item_index: 0,
      scope_hint: "item",
      join_proven: true,
    },
    {
      source_field: "DSOBSPEDDIGCMD",
      value: "ENTREGAR MOLHO A PARTE",
      scope_hint: "order",
      join_proven: true,
    },
  ],
};

const normalized = Shadow.normalizeOdhenShadow(fixture);

assert.equal(normalized.ready_for_motor, true);
assert.equal(normalized.observation_state, "PROVEN_ASSIGNED");
assert.equal(normalized.items.length, 2);
assert.deepEqual(normalized.items[0].observacoes.map(x => x.value), ["SEM CEBOLINHA"]);
assert.deepEqual(normalized.order_observations.map(x => x.value), ["ENTREGAR MOLHO A PARTE"]);
assert.equal(normalized.unassigned_observations.length, 0);
assert.equal(normalized.effects.print, false);
assert.equal(normalized.effects.call_print_endpoint, false);
assert.equal(normalized.effects.database_write, false);
assert.equal(normalized.effects.fiscal_action, false);
assert.equal(normalized.effects.order_update, false);
assert.equal(normalized.effects.status_update, false);
assert.equal(normalized.effects.service_install, false);
assert.equal(normalized.effects.watcher_install, false);
assert.equal(normalized.effects.cutover, false);

const serialized = JSON.stringify(normalized);
for (const forbidden of ["CLIENTE FICTICIO", "0000000000", "RUA FICTICIA", "PAGAMENTO"]) {
  assert.equal(serialized.includes(forbidden), false, "PII/payment leaked: " + forbidden);
}

const rows = Shadow.toMotorRows(normalized);
assert.deepEqual(rows, [
  {
    pedido_id: "0000170512",
    item_nome: "Uramaki de Salmão",
    quantidade: 1,
    observacao: "SEM CEBOLINHA",
    horario: "2026-09-27T21:15:00-03:00",
  },
  {
    pedido_id: "0000170512",
    item_nome: "Sashimi de Salmão",
    quantidade: 2,
    observacao: null,
    horario: "2026-09-27T21:15:00-03:00",
  },
]);

const fonte = MOTOR.makeFonteItensFromRows(rows, seed);
assert.equal(fonte.stats.pedidos, 1);
assert.equal(fonte.stats.linhas, 2);
assert.equal(fonte.stats.naoCasados, 0);
assert.equal(fonte("0000170512").length, 2);
assert.equal(fonte("0000170512")[0].obs, "SEM CEBOLINHA");

const replay = Shadow.normalizeOdhenShadow(JSON.parse(JSON.stringify(fixture)));
assert.equal(Shadow.sameShadowSnapshot(normalized, replay), true);

const changed = JSON.parse(JSON.stringify(fixture));
changed.observation_rows[0].value = "SEM CEBOLINHA E SEM GERGELIM";
const changedNormalized = Shadow.normalizeOdhenShadow(changed);
assert.equal(Shadow.sameShadowSnapshot(normalized, changedNormalized), false);

const incomplete = Shadow.normalizeOdhenShadow({
  ...fixture,
  observation_scan_complete: false,
  observation_rows: [],
});
assert.equal(incomplete.ready_for_motor, false);
assert.ok(incomplete.blocking_reasons.includes("OBSERVATION_SOURCE_NOT_PROVEN_COMPLETE"));
assert.throws(() => Shadow.toMotorRows(incomplete), /SHADOW_NOT_READY_FOR_MOTOR/);

const ambiguousObservation = Shadow.normalizeOdhenShadow({
  ...fixture,
  observation_scan_complete: true,
  observation_rows: [
    {
      source_field: "DSOBSCOMANDA",
      value: "OBSERVACAO AINDA SEM ESCOPO PROVADO",
      scope_hint: "unknown",
      join_proven: false,
    },
  ],
});
assert.equal(ambiguousObservation.ready_for_motor, false);
assert.equal(ambiguousObservation.observation_state, "UNKNOWN_UNASSIGNED_CANDIDATES");
assert.ok(ambiguousObservation.blocking_reasons.includes("OBSERVATION_CANDIDATE_UNASSIGNED"));
assert.equal(ambiguousObservation.unassigned_observations.length, 1);

const invalidQuantity = Shadow.normalizeOdhenShadow({
  ...fixture,
  products: [{ CDPRODUTO: "1001", NMPRODUTO: "Uramaki de Salmão", QTPRODCOMVEN: 0 }],
});
assert.equal(invalidQuantity.ready_for_motor, false);
assert.ok(invalidQuantity.blocking_reasons.some(x => x.startsWith("INVALID_ITEM_QTY_")));

const provenNone = Shadow.normalizeOdhenShadow({
  NRCOMANDA: "0000170513",
  products: [{ CDPRODUTO: "1001", NMPRODUTO: "Uramaki de Salmão", QTPRODCOMVEN: 1 }],
  observation_scan_complete: true,
  observation_rows: [],
});
assert.equal(provenNone.ready_for_motor, true);
assert.equal(provenNone.observation_state, "PROVEN_NONE");

console.log("shadow-odhen-v132: ok");
