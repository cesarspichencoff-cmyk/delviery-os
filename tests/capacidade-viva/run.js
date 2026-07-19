/**
 * Testes Capacidade Viva V0.1 + adapters inteligência.
 * node tests/capacidade-viva/run.js
 */
"use strict";

const assert = require("assert");
const CV = require("../../src/capacidade-viva");
const intel = require("../../src/live/interface/adaptador-inteligencia");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  OK ", name);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log("  FAIL", name, "-", e.message);
  }
}

const config = CV.loadDefaultConfig();
const demo = require("../../data/capacidade-viva/fixtures/items-demo.json");

console.log("=== carga ponderada ===");
test("carga usa complexidade não só quantidade", () => {
  const simples = CV.cargaPonderadaPraca({
    config,
    items: [
      { id: "a", praca: "sushi", quantidade: 5, complexidade: "simples" },
      { id: "b", praca: "sushi", quantidade: 5, complexidade: "simples" }
    ]
  });
  const complexos = CV.cargaPonderadaPraca({
    config,
    items: [
      { id: "c", praca: "quentes", quantidade: 2, complexidade: "muito_complexo" },
      { id: "d", praca: "quentes", quantidade: 2, complexidade: "complexo" }
    ]
  });
  assert.ok(complexos.carga > 0);
  assert.ok(simples.components.length === 2);
  assert.ok(simples.false_precision === false);
});

console.log("=== complexidade ===");
test("pesos configuráveis", () => {
  assert.ok(CV.pesoComplexidade(config, "simples") < CV.pesoComplexidade(config, "complexo"));
  const c = CV.classifyItem(demo.items[0], config);
  assert.ok(c.peso >= 1);
});

console.log("=== equipe ===");
test("capacidade sem rastrear indivíduos", () => {
  const cap = CV.capacidadeEquipe(
    { equipe: { sushi: 8, conferencia: 5, quentes: 3, caixa: 3, cozinha: 2, motoboy: 4, flutuantes: 1 } },
    config
  );
  assert.strictEqual(cap.tracks_individuals, false);
  assert.ok(cap.por_praca.sushi.fator_capacidade > 0.5);
});

console.log("=== contexto temporal ===");
test("dia e horário provisórios", () => {
  const friPeak = CV.fatorTemporal(config, new Date("2026-07-17T20:00:00")); // sexta
  assert.ok(friPeak.fator >= 1);
  const vol = CV.leituraVolumeGlobal(55, config);
  assert.ok(vol.does_not_override_praca_critica);
});

console.log("=== ISF ===");
test("praça crítica não escondida por média", () => {
  const isf = CV.calcularISF({
    config,
    turno: { equipe: { sushi: 8, quentes: 1, conferencia: 5, caixa: 3, cozinha: 1, motoboy: 2 } },
    por_praca: {
      sushi: { items: demo.items.filter((i) => i.praca === "sushi") },
      quentes: {
        items: demo.items.filter((i) => i.praca === "quentes").concat(
          demo.items.filter((i) => i.praca === "quentes")
        ),
        envelhecimento: 8,
        bloqueios: 2
      },
      conferencia: { items: demo.items.filter((i) => i.praca === "conferencia") }
    },
    n_pedidos: 40,
    confianca: "media"
  });
  assert.ok(isf.praca_critica);
  assert.strictEqual(isf.uses_average_to_hide_critical, false);
  assert.ok(isf.por_praca[isf.praca_critica].isf >= isf.por_praca.sushi.isf);
});

console.log("=== exceções ===");
test("exceção crítica sem depender de volume geral", () => {
  const ex = CV.detectarExcecoes({
    config,
    orders: [{ id: "X1", motoboy_esperando: true, pronto: true, age_min: 12 }],
    source: {}
  });
  assert.ok(ex.count >= 1);
  assert.ok(ex.not_continuous_pressure);
});

console.log("=== menor intervenção ===");
test("pausa seletiva antes da geral", () => {
  const isf = {
    confidence: "media",
    praca_critica: "quentes",
    por_praca: { quentes: { praca: "quentes", estado: "acima_capacidade", isf: 1.4 } },
    insufficient_data: false
  };
  const iv = CV.sugerirMenorIntervencao({ isf, excecoes: { items: [], count: 0 }, config });
  assert.strictEqual(iv.action, "pausa_seletiva");
  assert.strictEqual(iv.auto_apply, false);
  assert.ok(iv.requires_human_confirmation);
});

test("motoboy esperando → intervenção cirúrgica", () => {
  const iv = CV.sugerirMenorIntervencao({
    isf: {
      confidence: "media",
      insufficient_data: false,
      praca_critica: "sushi",
      por_praca: { sushi: { estado: "controlavel", isf: 0.4 } }
    },
    excecoes: {
      count: 1,
      items: [{ type: "motoboy_esperando", title: "Motoboy esperando" }]
    },
    config
  });
  assert.strictEqual(iv.action, "finalizar_pedidos_motoboy_esperando");
});

console.log("=== recuperação ===");
test("classifica recuperação líquida e colateral", () => {
  const before = {
    praca_critica: "quentes",
    por_praca: { quentes: { isf: 1.2, estado: "acima_capacidade" }, sushi: { isf: 0.4, estado: "controlavel" } }
  };
  const afterOk = {
    praca_critica: "quentes",
    por_praca: { quentes: { isf: 0.5, estado: "controlavel" }, sushi: { isf: 0.4, estado: "controlavel" } },
    signals: { fila_parou_crescer: true, erros_nao_aumentaram: true }
  };
  const r1 = CV.classificarRecuperacao({ before, after: afterOk, executed: true, elapsed_min: 12, config });
  assert.strictEqual(r1.outcome, "recuperacao_liquida");
  assert.ok(r1.not_employee_evaluation);

  const afterCol = {
    praca_critica: "conferencia",
    por_praca: {
      quentes: { isf: 0.5, estado: "controlavel" },
      conferencia: { isf: 1.5, estado: "acima_capacidade" }
    }
  };
  const r2 = CV.classificarRecuperacao({ before, after: afterCol, executed: true, elapsed_min: 18, config });
  assert.strictEqual(r2.outcome, "deslocou_problema");
});

console.log("=== feedback ===");
test("feedback humano opcional", () => {
  const f = CV.registrarFeedback({ choice: "ajudou_parcialmente", observation: "ok" });
  assert.ok(f.ok);
  assert.strictEqual(f.feedback.required_during_peak, false);
});

console.log("=== config versionada ===");
test("alteração registra anterior/novo/motivo/versão", () => {
  const cfg = JSON.parse(JSON.stringify(config));
  const hist = CV.createHistory();
  const { entry } = CV.applyConfigChange(cfg, hist, {
    path: "atraso.pronto_parado_min",
    value: 10,
    reason: "calibração provisória"
  });
  assert.strictEqual(entry.previous, 8);
  assert.strictEqual(entry.next, 10);
  assert.ok(entry.version_after);
  assert.ok(hist.entries.length === 1);
});

console.log("=== explicabilidade ===");
test("envelope explicável", () => {
  const e = CV.explainable(1.2, { source: "test", explanation: "demo", confidence: "media" });
  assert.ok(e.value != null && e.source && e.timestamp && e.confidence && e.explanation);
});

console.log("=== adapters V3.3 ===");
test("toV33ViewHints não redesenha", () => {
  const av = CV.avaliar({
    turno: { equipe: { sushi: 2, quentes: 1, conferencia: 2, caixa: 1, cozinha: 1, motoboy: 1 } },
    por_praca: {
      quentes: { items: demo.items.filter((i) => i.praca === "quentes"), envelhecimento: 10, bloqueios: 3 }
    },
    n_pedidos: 80,
    orders: [{ id: "1", motoboy_esperando: true, age_min: 15, pronto: true }]
  });
  const v = CV.toV33ViewHints(av);
  assert.ok(v.not_redesign);
  assert.ok(v.mode_hint);
});

test("forecast adapter marca simulated=false com histórico", () => {
  const f = intel.buildForecastForArea({
    area: "conferencia",
    queue_history: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    horizon_min: 15
  });
  assert.strictEqual(f.simulated, false);
  assert.ok(f.confidence.visual === "confidence");
  assert.ok(/estimativa|não certeza|certeza/i.test(f.note + f.text));
});

test("forecast sem dado não fabrica pressão", () => {
  const f = intel.buildForecastForArea({ area: "sushi", queue_history: [] });
  assert.strictEqual(f.simulated, true);
  assert.ok(/Não tenho leitura suficiente/i.test(f.text));
});

test("action track responsável funcional", () => {
  const pb = intel.suggestPlaybookForArea("quentes");
  const a = intel.adaptActionTrack({ stateId: "assumiu", playbook: pb, from_engine: true });
  assert.ok(a.responsible.note.indexOf("ranking") >= 0);
  assert.strictEqual(a.onlyCurrent, true);
});

test("confiança insuficiente → observar", () => {
  const iv = CV.sugerirMenorIntervencao({
    isf: { insufficient_data: true, confidence: "baixa", por_praca: {} },
    excecoes: { items: [], count: 0 },
    config
  });
  assert.strictEqual(iv.action, "observar");
});

console.log("\n=== RESULT ===");
console.log(`passed=${passed} failed=${failed}`);
if (failed) {
  for (const f of failures) console.log(" -", f.name, f.error);
  process.exit(1);
}
process.exit(0);
