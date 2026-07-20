/* ============================================================================
 * Testes do adaptador view-model V3.3 — não decide modo; só mapeia.
 * ==========================================================================*/
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  montarViewModelV33,
  mapearEstadoFonteV33,
  areaHintFromSit,
  toneFromCor,
  AREA_ORDER
} = require("../../src/live/interface/adaptador-v33");

test("adaptador-v33: areas na ordem canônica e tech para validação", () => {
  const vm = montarViewModelV33({
    mode: "calmo",
    emand: 3,
    ambientes: [
      { nome: "Sushi", cor: "verde", pressao: 40, estadoTxt: "Tudo fluindo", motivo: "ok" },
      { nome: "Caixa", cor: "validacao", pressao: null, estadoTxt: "Em validação", motivo: "sem medida" }
    ]
  });
  assert.equal(vm.mode, "calmo");
  assert.equal(vm.areas.length, AREA_ORDER.length);
  assert.equal(vm.areas[0].nome, "Caixa");
  assert.equal(vm.calmCopy, "Nada exige você agora.");
  assert.equal(vm.attention, null);
  const caixa = vm.areas.find((a) => a.nome === "Caixa");
  assert.equal(caixa.tech, true);
  assert.equal(caixa.tone, "tech");
});

test("adaptador-v33: foco expõe atenção sem inventar modo", () => {
  const vm = montarViewModelV33({
    mode: "foco",
    emand: 8,
    ambientes: [],
    situation: "Duplas precisam de atenção.",
    consequence: "Pedidos acumulando se nada for feito.",
    evidences: ["Pedido #12 esperando"],
    actionLabel: "Priorizar Duplas",
    foco: { sev: 2 },
    rec: { tipo: "priorizar_praca" },
    focoAreaHint: "Sushi"
  });
  assert.ok(vm.attention);
  assert.equal(vm.attention.situation, "Duplas precisam de atenção.");
  assert.equal(vm.attention.pure, false);
  assert.equal(vm.attention.gravity, "elevated");
  assert.ok(vm.areas.some((a) => a.nome === "Sushi" && a.dominant));
});

test("adaptador-v33: forecast mock não mistura com gravidade", () => {
  const vm = montarViewModelV33({
    mode: "foco",
    mocks: {
      demo: true,
      forecast: {
        simulated: true,
        confidence: { level: "moderada", dots: "●●○", visual: "confidence" },
        text: "se nada mudar",
        note: "estimativa, não certeza"
      }
    },
    situation: "x",
    consequence: "y",
    foco: { sev: 3 }
  });
  assert.equal(vm.forecast.confidence.visual, "confidence");
  assert.equal(vm.attention.gravity, "high");
  assert.notEqual(vm.forecast.confidence.visual, vm.attention.gravity);
});

test("mapearEstadoFonteV33: texto + forma, nunca só cor", () => {
  const s = mapearEstadoFonteV33("stale");
  assert.equal(s.form, "dashed");
  assert.match(s.text, /envelhecido|atras/i);
  const f = mapearEstadoFonteV33("failed", "timeout");
  assert.equal(f.form, "dashed");
  assert.match(f.label, /falha/i);
});

test("areaHintFromSit e toneFromCor são determinísticos", () => {
  /* Células operacionais V1: a saída (prontos concentrando na etapa final) é
   * lida pelo CAIXA; a célula Entregas fica "aguardando integração" enquanto o
   * domínio ENTREGAS não estiver integrado — destacar uma célula sem leitura
   * seria contraditório. */
  assert.equal(areaHintFromSit("saida"), "Caixa");
  assert.equal(areaHintFromSit("conferencia"), "Conferência");
  /* Quentes e Cozinha são células distintas — a praça sob pressão nunca pode
   * apontar para a célula errada (sem duplicar cozinha_quentes). */
  assert.equal(areaHintFromSit("praca", "enrolados_quentes"), "Quentes");
  assert.equal(areaHintFromSit("praca", "cozinha_quentes"), "Cozinha");
  assert.equal(toneFromCor("vermelho"), "tense");
  assert.equal(toneFromCor("validacao"), "tech");
});
