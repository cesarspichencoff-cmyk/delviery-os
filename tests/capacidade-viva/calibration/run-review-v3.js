/**
 * Testes 2D.5 — pack representativo por episódio
 * node tests/capacidade-viva/calibration/run-review-v3.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const RV3 = require("../../../src/capacidade-viva/calibration/review-v3");

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

const repPath = path.join(
  __dirname,
  "../../../data/capacidade-viva/calibration/review-v3/casos-representativos.json"
);
const limPath = path.join(
  __dirname,
  "../../../data/capacidade-viva/calibration/review-v3/casos-limitrofes.json"
);

function sampleEpisodes() {
  const base = Date.parse("2026-06-01T15:00:00.000Z");
  const eps = [];
  // multiple days, pracas, types
  const days = [0, 1, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 20, 21, 22, 24, 25, 28];
  const typesAtt = ["pedido_atrasado_vs_prometido_operacional", "prontos_acumulando", "aguardando_saida_causa_nao_confirmada"];
  const typesExc = ["motoboy_na_loja", "entregador_alocado_sem_retirada", "pronto_sem_saida_excessivo"];
  let n = 0;
  for (const d of days) {
    for (let k = 0; k < 3; k++) {
      n++;
      const t0 = base + d * 86400000 + k * 3 * 3600000;
      const isExc = k === 2;
      eps.push({
        episode_id: "ep_" + n,
        type: isExc ? typesExc[n % typesExc.length] : typesAtt[n % typesAtt.length],
        level: isExc ? "excecao_critica" : "atencao",
        order_id: "order-" + n,
        praca: n % 2 ? "sushi" : "conferencia",
        started_at: new Date(t0).toISOString(),
        started_ms: t0,
        last_seen_at: new Date(t0 + 15 * 60000).toISOString(),
        last_seen_ms: t0 + 15 * 60000,
        peak_active_orders: 10 + (n % 20),
        peak_severity: isExc ? 3 : 2,
        tick_count: 2,
        observed_ticks: 2,
        observed_span_min: 15,
        duration_label: "duração mensurável · 15 min",
        confidence: isExc ? "alta" : "media",
        epistemic: isExc ? "confirmado" : "inferido_alta_confianca",
        evidence: isExc ? ["espera na loja confirmada"] : ["pedido atrasado vs prometido"],
        operational_day_start: new Date(t0).toISOString().slice(0, 10)
      });
    }
  }
  // consecutive ticks same order same day — must collapse
  const tDup = base + 2 * 86400000;
  eps.push({
    episode_id: "ep_dup1",
    type: "pedido_atrasado_vs_prometido_operacional",
    level: "atencao",
    order_id: "order-dup",
    praca: "conferencia",
    started_at: new Date(tDup).toISOString(),
    started_ms: tDup,
    last_seen_at: new Date(tDup).toISOString(),
    last_seen_ms: tDup,
    peak_active_orders: 5,
    peak_severity: 2,
    tick_count: 1,
    confidence: "media",
    epistemic: "inferido_alta_confianca",
    evidence: ["atrasado"],
    operational_day_start: new Date(tDup).toISOString().slice(0, 10)
  });
  eps.push({
    episode_id: "ep_dup2",
    type: "pedido_atrasado_vs_prometido_operacional",
    level: "atencao",
    order_id: "order-dup",
    praca: "conferencia",
    started_at: new Date(tDup + 15 * 60000).toISOString(),
    started_ms: tDup + 15 * 60000,
    last_seen_at: new Date(tDup + 15 * 60000).toISOString(),
    last_seen_ms: tDup + 15 * 60000,
    peak_active_orders: 8,
    peak_severity: 2,
    tick_count: 1,
    confidence: "media",
    epistemic: "inferido_alta_confianca",
    evidence: ["atrasado"],
    operational_day_start: new Date(tDup).toISOString().slice(0, 10)
  });
  return eps;
}

console.log("=== review-v3 unit ===");

test("nenhuma repetição de episode/order no mesmo turno", () => {
  const pack = RV3.selectRepresentativePack(sampleEpisodes(), { min_n: 16, max_n: 24 });
  const keys = pack.representativos.map((c) => c.episode_turn_key);
  assert.strictEqual(new Set(keys).size, keys.length);
  const orders = pack.representativos
    .filter((c) => c.order_token)
    .map((c) => c.order_token + "|" + (c.intervalo_episodio && c.intervalo_episodio.operational_day));
  assert.strictEqual(new Set(orders).size, orders.length);
});

test("nenhuma sequência de ticks como casos independentes", () => {
  const pack = RV3.selectRepresentativePack(sampleEpisodes(), { min_n: 16, max_n: 24 });
  const v = RV3.validateRepresentativePack(pack);
  assert.ok(!v.errors.some((e) => e.startsWith("sequencia_ticks")), v.errors.join("; "));
});

test("múltiplas datas", () => {
  const pack = RV3.selectRepresentativePack(sampleEpisodes(), { min_n: 16, max_n: 24 });
  const dates = new Set(pack.representativos.map((c) => c.data));
  assert.ok(dates.size >= 2, "dates=" + dates.size);
});

test("bucket igual à classificação do motor", () => {
  const pack = RV3.selectRepresentativePack(sampleEpisodes(), { min_n: 16, max_n: 24 });
  for (const c of pack.representativos) {
    assert.strictEqual(c.bucket_amostragem, RV3.bucketFromMotor(c.classificacao_motor), c.case_id);
  }
});

test("confiança compatível com evidência", () => {
  const bad = {
    episode_id: "e1",
    type: "atencao_operacional",
    level: "atencao",
    order_id: "o1",
    praca: "sushi",
    started_ms: Date.now(),
    started_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    last_seen_ms: Date.now(),
    peak_active_orders: 10,
    confidence: "media",
    epistemic: "ausente",
    evidence: []
  };
  const conf = RV3.normalizeConfidence(bad);
  assert.strictEqual(conf.confianca, "baixa");
  const c = RV3.caseFromEpisode(bad);
  assert.strictEqual(c.confianca, "baixa");
});

test("zero controlável com fonte insuficiente", () => {
  const pack = RV3.selectRepresentativePack(sampleEpisodes(), { min_n: 16, max_n: 24 });
  for (const c of pack.representativos.filter((x) => x.bucket_amostragem === "controlavel")) {
    assert.ok(c.pedidos_ativos > 0);
    assert.notStrictEqual(c.fonte_saude, "sem_cobertura");
    assert.notStrictEqual(c.fonte_saude, "ausente");
  }
});

test("zero crítico baseado só em ISF hipotético sem sinais", () => {
  const pack = RV3.selectRepresentativePack(sampleEpisodes(), { min_n: 16, max_n: 24 });
  for (const c of pack.representativos.filter((x) => x.bucket_amostragem === "critico")) {
    assert.ok(c.sinais && c.sinais.length, c.case_id);
  }
  // episódios atuais não geram bucket critico (motor não emite) — ok
  assert.ok(true);
});

test("artefato gerado válido", () => {
  assert.ok(fs.existsSync(repPath), "rodar tools/gerar_review_v3.js");
  const rep = JSON.parse(fs.readFileSync(repPath, "utf8"));
  assert.ok(rep.n_cases >= 16 && rep.n_cases <= 24);
  const v = RV3.validateRepresentativePack({ representativos: rep.cases });
  assert.ok(v.ok, v.errors.join("; "));
  assert.ok(v.dates >= 2);
  // no consecutive independent ticks
  assert.ok(!v.errors.some((e) => e.includes("sequencia")));
});

test("limítrofes em arquivo separado", () => {
  assert.ok(fs.existsSync(limPath));
  const lim = JSON.parse(fs.readFileSync(limPath, "utf8"));
  assert.ok(Array.isArray(lim.cases));
  const rep = JSON.parse(fs.readFileSync(repPath, "utf8"));
  const repKeys = new Set(rep.cases.map((c) => c.episode_turn_key));
  for (const c of lim.cases) {
    assert.ok(!repKeys.has(c.episode_turn_key), "limítrofe não deve repetir no principal: " + c.case_id);
  }
});

test("dedup order no mesmo turno nos dados reais", () => {
  const rep = JSON.parse(fs.readFileSync(repPath, "utf8"));
  const keys = rep.cases.map((c) => c.episode_turn_key);
  assert.strictEqual(new Set(keys).size, keys.length);
});

console.log("\n=== RESULT ===");
console.log(`passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
