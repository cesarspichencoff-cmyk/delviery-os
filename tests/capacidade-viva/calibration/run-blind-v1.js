/**
 * Testes 2D.7 — validação cega holdout
 * node tests/capacidade-viva/calibration/run-blind-v1.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Blind = require("../../../src/capacidade-viva/calibration/blind-validation");
const { anonOrderToken, anonEpisodeId, episodeTurnKey } = require("../../../src/capacidade-viva/calibration/review-v3");

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
const blindDir = path.join(root, "data/capacidade-viva/calibration/blind-v1");
const configPath = path.join(
  root,
  "data/capacidade-viva/calibration/configs/cv-cal-tata-human-v1.json"
);

console.log("=== blind-v1 ===");

test("zero episódios de treino no holdout", () => {
  assert.ok(fs.existsSync(path.join(blindDir, "GABARITO_MOTOR_CONGELADO.json")));
  const gab = JSON.parse(fs.readFileSync(path.join(blindDir, "GABARITO_MOTOR_CONGELADO.json"), "utf8"));
  const ex = Blind.loadTrainingExclusion(root);
  for (const c of gab.cases) {
    assert.ok(!ex.orderTokens.has(c.order_token), "order token treino: " + c.case_id);
    assert.ok(!ex.episodeIdAnons.has(c.episode_id_anon), "episode treino: " + c.case_id);
    assert.ok(!ex.turnKeys.has(c.episode_turn_key), "turn treino: " + c.case_id);
  }
});

test("zero order token de treino", () => {
  const gab = JSON.parse(fs.readFileSync(path.join(blindDir, "GABARITO_MOTOR_CONGELADO.json"), "utf8"));
  const ex = Blind.loadTrainingExclusion(root);
  const hold = new Set(gab.cases.map((c) => c.order_token).filter(Boolean));
  for (const t of hold) assert.ok(!ex.orderTokens.has(t), t);
});

test("zero vazamento da classificação no arquivo do César", () => {
  const md = fs.readFileSync(path.join(blindDir, "CASOS_CEGOS_CESAR.md"), "utf8");
  const clean = Blind.assertBlindMarkdownClean(md);
  assert.ok(clean.ok, clean.leaks.join(", "));
  assert.ok(!/excecao_critica/.test(md));
  assert.ok(!/intervir_agora/.test(md));
  assert.ok(!/severity_label/.test(md));
});

test("gabarito congelado", () => {
  const gab = JSON.parse(fs.readFileSync(path.join(blindDir, "GABARITO_MOTOR_CONGELADO.json"), "utf8"));
  assert.strictEqual(gab.frozen, true);
  assert.ok(gab.config_sha256);
  assert.ok(gab.cases.length >= 16 && gab.cases.length <= 24);
  for (const c of gab.cases) {
    assert.ok(c.classificacao);
    assert.ok(c.regra_acionada);
    assert.strictEqual(c.config_sha256, gab.config_sha256);
  }
});

test("configuração congelada", () => {
  const freeze = JSON.parse(fs.readFileSync(path.join(blindDir, "FREEZE.json"), "utf8"));
  assert.strictEqual(freeze.frozen, true);
  const live = Blind.fileSha256(configPath);
  assert.strictEqual(freeze.config_sha256, live);
  assert.strictEqual(freeze.config_version, "cv-cal-tata-human-v1");
});

test("casos únicos", () => {
  const gab = JSON.parse(fs.readFileSync(path.join(blindDir, "GABARITO_MOTOR_CONGELADO.json"), "utf8"));
  const ids = gab.cases.map((c) => c.case_id);
  assert.strictEqual(new Set(ids).size, ids.length);
  const turns = gab.cases.map((c) => c.episode_turn_key);
  assert.strictEqual(new Set(turns).size, turns.length);
  const orders = gab.cases.map((c) => c.order_token).filter(Boolean);
  assert.strictEqual(new Set(orders).size, orders.length);
});

test("diversidade temporal", () => {
  const sum = JSON.parse(fs.readFileSync(path.join(blindDir, "99_SUMMARY.json"), "utf8"));
  assert.ok(sum.datas.length >= 2, "datas=" + sum.datas.length);
  assert.ok(sum.dias.length >= 2, "dias=" + sum.dias.length);
});

test("pedido zumbi classificado como fonte", () => {
  const gab = JSON.parse(fs.readFileSync(path.join(blindDir, "GABARITO_MOTOR_CONGELADO.json"), "utf8"));
  const fonte = gab.cases.filter((c) => c.classificacao === "qualidade_fonte" || c.zombie);
  // se houver zumbis no holdout, devem ser qualidade_fonte
  for (const c of fonte) {
    assert.ok(c.classificacao === "qualidade_fonte" || c.zombie);
    assert.ok(c.exclude_from_capacity || c.zombie || c.classificacao === "qualidade_fonte");
  }
  // unit: isTrainingLeak + zombie classify
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const pred = Blind.classifyEpisodeWithHumanConfig(
    {
      episode_id: "ep_z",
      order_id: "ord_z_unique_blind",
      type: "pedido_atrasado_vs_prometido_operacional",
      level: "atencao",
      evidence: ["idade 20000 ≥ 50"],
      peak_active_orders: 10,
      started_ms: Date.now(),
      started_at: new Date().toISOString()
    },
    cfg
  );
  assert.ok(pred.zombie || pred.classificacao === "qualidade_fonte");
});

test("nenhuma modificação em cv-cal-tata-human-v1", () => {
  const freeze = JSON.parse(fs.readFileSync(path.join(blindDir, "FREEZE.json"), "utf8"));
  const live = Blind.fileSha256(configPath);
  assert.strictEqual(live, freeze.config_sha256);
  // known hash from freeze generation must match file
  const expectedPrefix = freeze.config_sha256.slice(0, 8);
  assert.ok(/^[a-f0-9]{8}$/.test(expectedPrefix));
});

test("isTrainingLeak detecta treino", () => {
  const ex = Blind.loadTrainingExclusion(root);
  const turn = [...ex.turnKeys][0];
  assert.ok(turn);
  const [rawOrder, day] = turn.split("|");
  assert.ok(
    Blind.isTrainingLeak(
      { episode_id: "x", order_id: rawOrder, operational_day_start: day, started_at: day + "T12:00:00-03:00" },
      ex
    )
  );
});

test("comparar sem rótulos não falha", () => {
  const labelsPath = path.join(blindDir, "ROTULOS_HUMANOS_CEGOS.json");
  if (!fs.existsSync(labelsPath)) {
    const r = Blind.compareBlindLabels([], {});
    assert.strictEqual(r.ok, false);
  }
});

console.log("\n=== RESULT ===");
console.log(`passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
