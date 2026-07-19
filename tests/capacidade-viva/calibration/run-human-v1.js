/**
 * Testes 2D.6 — calibração humana TATÁ v1
 * node tests/capacidade-viva/calibration/run-human-v1.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const HR = require("../../../src/capacidade-viva/calibration/human-rules");
const { classifyOrderSignals } = require("../../../src/capacidade-viva/calibration/taxonomy");
const { sugerirMenorIntervencaoSane } = require("../../../src/capacidade-viva/calibration/intervencao-sane");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  OK ", name);
  } catch (e) {
    failed++;
    console.log("  FAIL", name, "-", e.message);
  }
}

const cfgPath = path.join(
  __dirname,
  "../../../data/capacidade-viva/calibration/configs/cv-cal-tata-human-v1.json"
);
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

console.log("=== human tata v1 ===");

test("5 min normal", () => {
  const m = HR.classifyMotoboyWait(5, {});
  assert.ok(m.severity < 1, "sev=" + m.severity);
  assert.ok(m.taxonomy_level === "quieto" || m.taxonomy_level === "sinal");
  const cls = classifyOrderSignals(
    {
      id: "o",
      age_min: 20,
      ready_wait_min: 5,
      pronto: true,
      saiu: false,
      courier_wait_store_min: 5,
      courier_wait_epistemic: "confirmado"
    },
    cfg
  );
  assert.notStrictEqual(cls.level, "excecao_critica");
});

test("10 min atenção", () => {
  const m = HR.classifyMotoboyWait(10, {});
  assert.ok(m.severity >= 0.9 && m.severity <= 1.5, "sev=" + m.severity);
  const cls = classifyOrderSignals(
    {
      id: "o",
      age_min: 25,
      ready_wait_min: 10,
      pronto: true,
      saiu: false,
      courier_wait_store_min: 10,
      courier_wait_epistemic: "confirmado"
    },
    cfg
  );
  assert.strictEqual(cls.level, "atencao");
});

test("15 min quase crítico", () => {
  const m = HR.classifyMotoboyWait(15, {});
  assert.ok(m.severity >= 1.8 && m.severity <= 2.5, "sev=" + m.severity);
  assert.ok(m.severity_label === "quase_critico" || m.severity >= 2);
});

test("20 min crítico", () => {
  const m = HR.classifyMotoboyWait(20, {});
  assert.strictEqual(m.severity, 3);
  const cls = classifyOrderSignals(
    {
      id: "o",
      age_min: 40,
      ready_wait_min: 20,
      pronto: true,
      saiu: false,
      courier_wait_store_min: 20,
      courier_wait_epistemic: "confirmado"
    },
    cfg
  );
  assert.strictEqual(cls.level, "excecao_critica");
});

test("5–7 min nunca exceção crítica", () => {
  for (const w of [5, 5.5, 6, 6.9, 7, 7.87]) {
    const cls = classifyOrderSignals(
      {
        id: "o",
        age_min: 30,
        ready_wait_min: w,
        pronto: true,
        saiu: false,
        courier_wait_store_min: w,
        courier_wait_epistemic: "confirmado"
      },
      cfg,
      { n_ready: 10, n_delayed: 5, queue_growing: true, n_motoboys_waiting: 3 }
    );
    assert.notStrictEqual(cls.level, "excecao_critica", "wait " + w);
  }
});

test("30 min pronto sem saída = atenção forte", () => {
  const p = HR.classifyProntoSemSaida(30, {});
  assert.ok(p.severity >= 1.5 && p.severity < 3, "sev=" + p.severity);
  const cls = classifyOrderSignals(
    {
      id: "o",
      age_min: 35,
      ready_wait_min: 30,
      pronto: true,
      saiu: false,
      courier_wait_store_min: null
    },
    cfg
  );
  assert.strictEqual(cls.level, "atencao");
  assert.ok(cls.attentions.some((a) => /aguardando_saida|pronto/.test(a.type)));
});

test("40 min pronto sem saída = crítico", () => {
  const p = HR.classifyProntoSemSaida(40, {});
  assert.strictEqual(p.severity, 3);
  const cls = classifyOrderSignals(
    {
      id: "o",
      age_min: 45,
      ready_wait_min: 40,
      pronto: true,
      saiu: false,
      courier_wait_store_min: null
    },
    cfg
  );
  assert.strictEqual(cls.level, "excecao_critica");
});

test("pedido zumbi não altera ISF / exclude capacity", () => {
  const z = HR.isZombieOrder({ age_min: 500, saiu: false, cancelado: false }, cfg);
  assert.ok(z.zombie);
  assert.ok(z.exclude_from_isf);
  const cls = classifyOrderSignals(
    { id: "z", age_min: 13000, ready_wait_min: 0, pronto: false, saiu: false },
    cfg
  );
  assert.strictEqual(cls.level, "qualidade_fonte");
  assert.ok(cls.exclude_from_capacity);
  assert.ok(cls.exclude_from_isf);
});

test("baixa confiança mantém severidade e muda ação", () => {
  const high = HR.actionFromSeverityConfidence(3, "alta", "motoboy");
  const low = HR.actionFromSeverityConfidence(3, "baixa", "motoboy");
  assert.ok(high.message);
  assert.ok(low.message);
  // ambos intervenções de gravidade alta, mas ação pode diferir
  assert.ok(low.action.indexOf("confirmar") >= 0 || low.action.indexOf("intervir") >= 0);
  const cls = classifyOrderSignals(
    {
      id: "o",
      age_min: 50,
      ready_wait_min: 30,
      pronto: true,
      saiu: false,
      courier_wait_store_min: null
    },
    cfg
  );
  assert.ok(cls.severity > 0 || cls.level === "atencao" || cls.level === "excecao_critica");
  const iv = sugerirMenorIntervencaoSane({
    tick_class: {
      has_critical: cls.level === "excecao_critica",
      has_attention: cls.level === "atencao",
      critical_items: cls.exceptions || [],
      attention_items: cls.attentions || []
    },
    isf: { confidence: "baixa", por_praca: {}, praca_critica: null },
    config: cfg,
    confidence: "baixa"
  });
  assert.notStrictEqual(iv.action, "observar");
  assert.ok(iv.message && iv.message.length > 10);
});

test("intervenção concreta substitui observar", () => {
  const iv = sugerirMenorIntervencaoSane({
    tick_class: {
      has_critical: false,
      has_attention: true,
      critical_items: [],
      attention_items: [
        {
          type: "motoboy_na_loja",
          severity: 1.2,
          explanation: "motoboy 12 min"
        }
      ]
    },
    isf: { confidence: "media", por_praca: {}, praca_critica: null },
    config: cfg,
    confidence: "media"
  });
  assert.notStrictEqual(iv.action, "observar");
  assert.ok(/motoboy|saída|pedido/i.test(iv.message));
});

test("config humana não sobrescreve sane-v2", () => {
  const sanePath = path.join(
    __dirname,
    "../../../data/capacidade-viva/calibration/configs/cv-cal-sane-v2.json"
  );
  assert.ok(fs.existsSync(sanePath));
  const sane = JSON.parse(fs.readFileSync(sanePath, "utf8"));
  assert.strictEqual(sane.config_version, "cv-cal-sane-v2");
  assert.strictEqual(cfg.config_version, "cv-cal-tata-human-v1");
  // sane still critical at 5 min motoboy
  const clsSane = classifyOrderSignals(
    {
      id: "o",
      age_min: 20,
      ready_wait_min: 6,
      pronto: true,
      saiu: false,
      courier_wait_store_min: 6,
      courier_wait_epistemic: "confirmado"
    },
    sane
  );
  assert.strictEqual(clsSane.level, "excecao_critica");
});

test("rótulos humanos registrados", () => {
  const p = path.join(
    __dirname,
    "../../../data/capacidade-viva/calibration/review-v3/rotulos-humanos-cesar.json"
  );
  assert.ok(fs.existsSync(p));
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.ok(j.representativos["CV-R-001"]);
  assert.ok(j.limitrofes["CV-L-006"].critico);
});

console.log("\n=== RESULT ===");
console.log(`passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
