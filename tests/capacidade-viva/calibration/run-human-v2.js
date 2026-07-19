/**
 * Testes 2D.8 — calibração humana TATÁ v2 (pós blind-v1)
 * node tests/capacidade-viva/calibration/run-human-v2.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const HR = require("../../../src/capacidade-viva/calibration/human-rules");
const { classifyOrderSignals } = require("../../../src/capacidade-viva/calibration/taxonomy");

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

const root = path.join(__dirname, "../../..");
const cfgPath = path.join(root, "data/capacidade-viva/calibration/configs/cv-cal-tata-human-v2.json");
const v1Path = path.join(root, "data/capacidade-viva/calibration/configs/cv-cal-tata-human-v1.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

console.log("=== human tata v2 ===");

test("v1 preservada no disco", () => {
  assert.ok(fs.existsSync(v1Path));
  const v1 = JSON.parse(fs.readFileSync(v1Path, "utf8"));
  assert.strictEqual(v1.config_version, "cv-cal-tata-human-v1");
  assert.strictEqual(cfg.config_version, "cv-cal-tata-human-v2");
});

test("usesHumanRules v2", () => {
  assert.ok(HR.usesHumanRules(cfg));
  assert.ok(HR.isHumanV2(cfg));
});

// --- Motoboy faixas discretas ---
const motoCases = [
  [5, "normal"],
  [6.17, "normal"],
  [8.13, "normal"],
  [9.99, "normal"],
  [10, "atencao"],
  [12.47, "atencao"],
  [15, "quase_critico"],
  [19.99, "quase_critico"],
  [20, "critico"]
];

for (const [min, expected] of motoCases) {
  test(`motoboy ${min} min = ${expected}`, () => {
    const m = HR.classifyMotoboyWait(min, {}, { force_discrete: true });
    assert.strictEqual(m.severity_label, expected, `label=${m.severity_label} sev=${m.severity}`);
    if (expected === "normal") {
      assert.ok(m.taxonomy_level === "quieto" || m.taxonomy_level === "sinal");
      assert.ok(m.severity < 1);
    }
    if (expected === "atencao") {
      assert.strictEqual(m.taxonomy_level, "atencao");
      assert.ok(m.severity >= 1 && m.severity < 2);
    }
    if (expected === "quase_critico") {
      assert.strictEqual(m.taxonomy_level, "quase_critico");
      assert.ok(m.severity >= 2 && m.severity < 3);
    }
    if (expected === "critico") {
      assert.strictEqual(m.taxonomy_level, "excecao_critica");
      assert.strictEqual(m.severity, 3);
    }
    // amplificadores não elevam estado visível
    const m2 = HR.classifyMotoboyWait(
      min,
      { n_ready: 10, n_delayed: 5, queue_growing: true, n_motoboys_waiting: 3 },
      { force_discrete: true }
    );
    assert.strictEqual(m2.severity_label, expected, "amp elevou estado: " + m2.severity_label);
  });
}

// --- Pronto sem saída ---
const prontoCases = [
  [14.7, "normal"],
  [15, "normal"],
  [24.99, "normal"],
  [25, "atencao"],
  [28.9, "atencao"],
  [35, "quase_critico"],
  [39.99, "quase_critico"],
  [40, "critico"]
];

for (const [min, expected] of prontoCases) {
  test(`pronto sem saída ${min} min = ${expected}`, () => {
    const p = HR.classifyProntoSemSaida(min, {}, { force_discrete: true });
    assert.strictEqual(p.severity_label, expected, `label=${p.severity_label}`);
    const cls = classifyOrderSignals(
      {
        id: "o",
        age_min: 0,
        ready_wait_min: min,
        pronto: true,
        saiu: false,
        courier_wait_store_min: null,
        age_is_proxy_from_volume: false
      },
      cfg
    );
    if (expected === "normal") {
      assert.ok(cls.level === "quieto" || cls.level === "sinal", "level=" + cls.level);
      assert.notStrictEqual(cls.level, "atencao");
      assert.notStrictEqual(cls.level, "excecao_critica");
    }
    if (expected === "atencao") {
      assert.strictEqual(cls.level, "atencao");
      assert.ok(cls.severity_label === "atencao" || cls.severity < 2);
    }
    if (expected === "quase_critico") {
      assert.strictEqual(cls.severity_label, "quase_critico");
    }
    if (expected === "critico") {
      assert.strictEqual(cls.level, "excecao_critica");
    }
  });
}

// --- Fonte / zumbi ---
test("495 min sem terminal = qualidade_da_fonte", () => {
  const z = HR.isZombieOrder({ age_min: 100, ready_wait_min: 495, saiu: false, cancelado: false }, cfg);
  assert.ok(z.zombie);
  const cls = classifyOrderSignals(
    { id: "z", age_min: 143.7, ready_wait_min: 495, pronto: true, saiu: false },
    cfg
  );
  assert.strictEqual(cls.level, "qualidade_fonte");
  assert.ok(cls.exclude_from_isf);
  assert.ok(cls.exclude_from_capacity);
});

test("525 min sem terminal = qualidade_da_fonte", () => {
  const cls = classifyOrderSignals(
    { id: "z", age_min: 68.8, ready_wait_min: 525, pronto: true, saiu: false },
    cfg
  );
  assert.strictEqual(cls.level, "qualidade_fonte");
  assert.ok(cls.exclude_from_capacity);
});

test("zumbi não aumenta pressão (exclude ISF/capacity)", () => {
  const cls = classifyOrderSignals(
    { id: "z", age_min: 500, ready_wait_min: 500, pronto: true, saiu: false },
    cfg
  );
  assert.strictEqual(cls.level, "qualidade_fonte");
  assert.ok(cls.exclude_from_isf);
  assert.ok(cls.exclude_from_capacity);
  assert.ok(cls.exclude_from_pause);
  assert.strictEqual(cls.severity, 0);
});

test("qualidade da fonte tem precedência sobre crítico", () => {
  // idade 50 seria crítico operacional, mas ready 400 é fonte
  const cls = classifyOrderSignals(
    { id: "z", age_min: 50, ready_wait_min: 400, pronto: true, saiu: false },
    cfg
  );
  assert.strictEqual(cls.level, "qualidade_fonte");
  assert.notStrictEqual(cls.level, "excecao_critica");
});

test("restante da operação: pedido normal ainda classifica", () => {
  const cls = classifyOrderSignals(
    {
      id: "ok",
      age_min: 20,
      ready_wait_min: 12,
      pronto: true,
      saiu: false,
      courier_wait_store_min: 12,
      courier_wait_epistemic: "confirmado"
    },
    cfg
  );
  assert.strictEqual(cls.level, "atencao");
  assert.ok(!cls.exclude_from_isf);
});

// --- Evidência insuficiente ---
test("apenas pedidos ativos não produz pressão confirmada", () => {
  const cls = classifyOrderSignals(
    { id: "v", age_min: 0, ready_wait_min: 0, pronto: false, saiu: false, age_is_proxy_from_volume: true },
    cfg,
    { only_active_orders: true, volume_only: true, insufficient_evidence: true }
  );
  assert.ok(
    cls.level === "evidencia_insuficiente" || cls.level === "quieto",
    "level=" + cls.level
  );
  assert.notStrictEqual(cls.level, "atencao");
  assert.notStrictEqual(cls.level, "excecao_critica");
});

test("metadados v2 sem alegação de validação independente", () => {
  assert.strictEqual(cfg.human_calibration.origin, "correcao_pos_blind_v1");
  assert.strictEqual(cfg.human_calibration.no_independent_validation_claim, true);
  assert.ok(/regressao|diagnostico/i.test(cfg.human_calibration.blind_v1_role || cfg.calibration.blind_v1));
});

// críticos reais ainda críticos
test("idade operacional 52 sem zumbi = crítico", () => {
  const cls = classifyOrderSignals(
    { id: "c", age_min: 52.5, ready_wait_min: 0, pronto: false, saiu: false, age_is_proxy_from_volume: false },
    cfg
  );
  assert.strictEqual(cls.level, "excecao_critica");
});

test("motoboy 43 min = crítico", () => {
  const cls = classifyOrderSignals(
    {
      id: "c",
      age_min: 0,
      ready_wait_min: 43,
      pronto: true,
      saiu: false,
      courier_wait_store_min: 43.45,
      courier_wait_epistemic: "confirmado"
    },
    cfg
  );
  assert.strictEqual(cls.level, "excecao_critica");
});

console.log("\n=== RESULT ===");
console.log(`passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
