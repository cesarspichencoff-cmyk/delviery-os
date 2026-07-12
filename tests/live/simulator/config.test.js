/* Fase 3A — testes 5-6: timezone é obrigatório e IANA inválido falha de
 * forma explícita; seed também é obrigatória. Nunca UTC silencioso. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { executarCenario, validarStoreTimeZone } = require("../../../tools/live/simulator/executor");

test("5. timezone é obrigatório — sem ele a execução falha explicitamente", () => {
  assert.throws(() => executarCenario({ cenario: "fluxo_normal", seed: "s" }),
    /store_time_zone_obrigatorio/);
  assert.throws(() => executarCenario({ cenario: "fluxo_normal", seed: "s", storeTimeZone: "" }),
    /store_time_zone_obrigatorio/);
});

test("6. timezone inválido falha de forma explícita (nunca cai em UTC)", () => {
  assert.throws(() => executarCenario({
    cenario: "fluxo_normal", seed: "s", storeTimeZone: "Fuso/Inexistente"
  }), /store_time_zone_invalido/);
  assert.throws(() => validarStoreTimeZone("Nao/Existe"), /store_time_zone_invalido/);
});

test("outros fusos IANA válidos são aceitos (o fuso não é constante escondida)", () => {
  const r = executarCenario({ cenario: "fluxo_normal", seed: "s", storeTimeZone: "Asia/Tokyo" });
  assert.equal(r.relatorio.store_time_zone, "Asia/Tokyo");
  assert.equal(r.relatorio.pedidos.matched, 1);
});

test("seed é obrigatória — determinismo não nasce de acaso implícito", () => {
  assert.throws(() => executarCenario({
    cenario: "fluxo_normal", storeTimeZone: "America/Sao_Paulo"
  }), /seed_obrigatoria/);
});
