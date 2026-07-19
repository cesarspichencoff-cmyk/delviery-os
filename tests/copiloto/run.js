/**
 * Runner de testes do pacote Copiloto (sem deps externas).
 * node tests/copiloto/run.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const C = require("../../src/copiloto");

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

console.log("=== thresholds ===");
test("pressão separa gravidade de confiança", () => {
  const p = C.thresholds.classifyPressure("conferencia", {
    queue_depth: 10,
    median_dwell_min: 25,
    confidence: "baixa",
    persistence_min: 5,
    data_quality: "ok"
  });
  assert.strictEqual(p.severity, 2);
  assert.strictEqual(p.confidence, "baixa");
  assert.ok(p.note);
});

test("oscilação não é pressão", () => {
  const p = C.thresholds.classifyPressure("sushi", {
    queue_depth: 20,
    median_dwell_min: 30,
    confidence: "alta",
    persistence_min: 1,
    data_quality: "ok"
  });
  assert.strictEqual(p.level, "oscillation");
  assert.strictEqual(p.severity, 0);
});

test("falha técnica em dado stale", () => {
  const p = C.thresholds.classifyPressure("motoboy", {
    queue_depth: 5,
    data_quality: "stale",
    persistence_min: 5
  });
  assert.strictEqual(p.kind, "technical_failure");
});

console.log("=== forecast ===");
test("previsão 10/15/30", () => {
  const series = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const all = C.forecast.forecastAllHorizons({
    area: "conferencia",
    queue_history: series,
    dow: 5,
    hour: 19
  });
  assert.strictEqual(all.length, 3);
  assert.ok(all.every((f) => f.confidence && f.conclusion && f.horizon_min));
});

test("backtest sem crash e com mae", () => {
  const series = [];
  for (let i = 0; i < 80; i++) series.push(5 + Math.sin(i / 5) * 3 + (i % 7) * 0.2);
  const bt = C.forecast.backtest(series, 10, "ensemble");
  assert.ok(bt.n > 0);
  assert.ok(bt.mae != null);
});

console.log("=== anomalies ===");
test("detecta dwell up volume flat", () => {
  const a = C.anomalies.detectAnomalies({
    areas: {
      sushi: {
        label: "Sushi",
        volume_trend: "stable",
        dwell_trend: "worsening",
        median_dwell_min: 24,
        baseline_dwell: 14,
        confidence: "media"
      }
    },
    orders: []
  });
  assert.ok(a.some((x) => x.anomaly_id.includes("dwell_up")));
  assert.ok(a.every((x) => x.not_a_person_judgment));
});

console.log("=== focus ===");
test("escolhe área de maior prioridade", () => {
  const r = C.focus.selectFocus([
    {
      key: "a",
      area: "sushi",
      title: "Sushi",
      severity: 1,
      urgency: 1,
      reach: 3,
      confidence: "alta",
      intervenable: true
    },
    {
      key: "b",
      area: "motoboy",
      title: "Motoboy",
      severity: 3,
      urgency: 3,
      reach: 8,
      confidence: "media",
      intervenable: true
    }
  ]);
  assert.strictEqual(r.focus.area, "motoboy");
  assert.ok(r.focus.dimensions);
  assert.notStrictEqual(r.focus.dimensions.confidence, undefined);
});

test("confiança baixa não zera gravidade no score", () => {
  const low = C.focus.scoreCandidate({
    severity: 3,
    urgency: 3,
    reach: 10,
    confidence: "baixa",
    intervenable: true
  });
  const high = C.focus.scoreCandidate({
    severity: 3,
    urgency: 3,
    reach: 10,
    confidence: "alta",
    intervenable: true
  });
  assert.ok(low.priority_score > 15);
  assert.ok(low.dimensions.severity === 3);
  assert.ok(high.assertion_strength >= low.assertion_strength);
});

console.log("=== stability ===");
test("protege contra oscilação", () => {
  const sess = C.stability.createFocusSession();
  const a = {
    focus_id: "f1",
    area: "conferencia",
    severity: 2,
    urgency: 2,
    reach: 5,
    confidence: "media",
    priority_score: 25
  };
  C.stability.stabilize(sess, a, { t_min: 0 });
  C.stability.stabilize(sess, a, { t_min: 1 });
  const rival = {
    focus_id: "f2",
    area: "sushi",
    severity: 2,
    urgency: 1,
    reach: 4,
    confidence: "media",
    priority_score: 26
  };
  const r = C.stability.stabilize(sess, rival, { t_min: 2 });
  assert.ok(r.action === "keep" || r.action === "hold");
});

test("crítico troca foco", () => {
  const sess = C.stability.createFocusSession();
  const a = {
    focus_id: "f1",
    area: "sushi",
    severity: 2,
    urgency: 2,
    reach: 5,
    confidence: "media",
    priority_score: 20
  };
  C.stability.stabilize(sess, a, { t_min: 0 });
  C.stability.stabilize(sess, a, { t_min: 1 });
  const crit = {
    focus_id: "f2",
    area: "motoboy",
    severity: 3,
    urgency: 3,
    reach: 9,
    confidence: "alta",
    priority_score: 50
  };
  const r = C.stability.stabilize(sess, crit, { t_min: 3 });
  assert.strictEqual(r.action, "switch");
});

test("falha técnica limpa foco", () => {
  const sess = C.stability.createFocusSession();
  sess.active = { focus_id: "x", severity: 2 };
  const r = C.stability.stabilize(sess, null, { t_min: 5, technical_state: "failed" });
  assert.strictEqual(r.action, "clear");
});

console.log("=== closing ===");
test("máx 3 perguntas e zero se calmo", () => {
  const calm = C.closing.buildClosing({ pressures: [], unexplained: [], actions: [] });
  assert.strictEqual(calm.questions.length, 0);
  const busy = C.closing.buildClosing({
    pressures: [{ area: "a" }],
    unexplained: [1, 2, 3, 4].map((i) => ({
      id: "u" + i,
      observation: "obs" + i,
      unknown: "x",
      question: "q" + i,
      info_gain: 0.9 - i * 0.05,
      importance: 0.9
    }))
  });
  assert.ok(busy.questions.length <= 3);
  assert.ok(busy.constraints.max_seconds === 120);
});

console.log("=== silence ===");
test("níveis silent/discreet/intervention", () => {
  const st = C.silence.createSilenceState();
  const a = C.silence.classifyInterruption({ severity: 0, level: "normal" }, st, 0);
  assert.strictEqual(a.level, "silent");
  const b = C.silence.classifyInterruption({ severity: 1, level: "attention", confidence: "media" }, st, 10);
  assert.strictEqual(b.level, "discreet");
  const c = C.silence.classifyInterruption({ severity: 2, confidence: "alta", key: "k1" }, st, 20);
  assert.strictEqual(c.level, "intervention");
});

console.log("=== voice ===");
test("catálogo de intenções", () => {
  const list = C.voice.listIntents();
  assert.ok(list.length >= 20);
  assert.ok(list.every((i) => i.intent_id && i.examples && i.permission));
});

console.log("=== response ===");
test("resposta com 6 partes lógicas", () => {
  const r = C.response.exampleConferenceResponse();
  assert.ok(r.conclusion);
  assert.ok(r.evidence.length);
  assert.ok(r.audio.spoken_text);
  assert.ok(r.audio.max_seconds <= 20);
});

console.log("=== playbooks ===");
test("playbook crítico não auto-muta", () => {
  for (const p of C.playbooks.SEED_PLAYBOOKS) {
    assert.strictEqual(p.auto_mutate, false);
  }
});

console.log("=== shadow ===");
test("gates de promoção", () => {
  const no = C.shadow.canPromote(1, { shadow_hours: 1 });
  assert.strictEqual(no.ok, false);
  const yes = C.shadow.canPromote(1, { shadow_hours: 25, false_alert_rate: 0.1, human_review_approved: true });
  assert.strictEqual(yes.ok, true);
});

console.log("=== microcoaching ===");
test("proíbe ranking individual", () => {
  const r = C.microcoaching.buildCoaching({ target_person: "Maria", message: "x" });
  assert.strictEqual(r.ok, false);
});

console.log("=== memory ===");
test("separa epistemics", () => {
  const m = C.memory.createShiftMemory({ shift_id: "t" });
  C.memory.addEntry(m, { kind: "action", epistemic: "fact", payload: { x: 1 } });
  C.memory.addEntry(m, { kind: "report", epistemic: "human_report", payload: { x: 2 } });
  const sep = C.memory.separateEpistemics(m);
  assert.strictEqual(sep.fact.length, 1);
  assert.strictEqual(sep.human_report.length, 1);
});

console.log("=== golden scenarios ===");
const fixDir = path.join(__dirname, "..", "..", "mocks", "copiloto", "fixtures");
const indexPath = path.join(fixDir, "index.json");
if (!fs.existsSync(indexPath)) {
  require("../../mocks/copiloto/generate-fixtures");
}
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
test("30 cenários presentes", () => {
  assert.strictEqual(index.count, 30);
  assert.strictEqual(index.scenarios.length, 30);
});

for (const sc of index.scenarios) {
  test(`golden load ${sc.file}`, () => {
    const p = path.join(fixDir, "scenarios", sc.file);
    assert.ok(fs.existsSync(p), "missing " + sc.file);
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    assert.ok(data.scenario || data.state || data.forecast || data.closing || data.briefing || data.log);
  });
}

// specific golden asserts
test("golden: fechamento 3 perguntas limita a 3", () => {
  const data = JSON.parse(fs.readFileSync(path.join(fixDir, "scenarios", "27_fechamento_tres_perguntas.json"), "utf8"));
  assert.ok(data.closing.questions.length <= 3);
});

test("golden: foco protegido não switch imediato", () => {
  const data = JSON.parse(fs.readFileSync(path.join(fixDir, "scenarios", "10_foco_protegido_oscilacao.json"), "utf8"));
  assert.ok(["keep", "hold"].includes(data.result.action));
});

test("golden: conferencia tem response", () => {
  const data = JSON.parse(fs.readFileSync(path.join(fixDir, "scenarios", "04_conferencia_acumulando.json"), "utf8"));
  assert.ok(data.copilot_response.conclusion.includes("Conferência"));
});

console.log("\n=== RESULT ===");
console.log(`passed=${passed} failed=${failed}`);
if (failed) {
  for (const f of failures) console.log(" -", f.name, f.error);
  process.exit(1);
}
process.exit(0);
