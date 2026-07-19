/**
 * Testes 2D.4 — pack humano operacional sem duplicatas
 * node tests/capacidade-viva/calibration/run-review-v2.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const RV = require("../../../src/capacidade-viva/calibration/review-v2");

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

const packPath = path.join(
  __dirname,
  "../../../data/capacidade-viva/calibration/review-v2/casos-operacionais.json"
);
const qualityPath = path.join(
  __dirname,
  "../../../data/capacidade-viva/calibration/review-v2/casos-qualidade-fonte.json"
);
const itemsPath = path.join(
  __dirname,
  "../../../data/capacidade-viva/calibration/review-v2/itens-pendentes.json"
);

console.log("=== review-v2 unit ===");

test("40 fingerprints únicos", () => {
  const cands = [];
  function add(partial) {
    const c = Object.assign(
      {
        confianca: "media",
        fonte_saude: "saudavel_ou_conhecida",
        itens_totais: 12,
        pedidos_prontos_aguardando: 1,
        evidencia_kind: "confirmado",
        dados_ausentes: [],
        pii: false,
        tem_excecao_critica: false,
        sinais_logisticos: [],
        pedidos_atrasados: 0,
        isf_estado: "controlavel"
      },
      partial
    );
    c.fingerprint = RV.caseFingerprint(c);
    cands.push(c);
  }
  // 15 controláveis (sinal, baixa pressão)
  for (let i = 0; i < 15; i++) {
    add({
      t_ms: 1000 + i * 90000,
      horario_local: `2026-06-01T0${i % 9}:00:00-03:00`,
      data: "2026-06-01",
      praca: i % 2 ? "sushi" : "conferencia",
      pedidos_ativos: 3 + i,
      classificacao_motor: "sinal",
      order_token: "c" + i,
      episodio_id_anon: "ec" + i
    });
  }
  // 15 atenção
  for (let i = 0; i < 15; i++) {
    add({
      t_ms: 200000 + i * 90000,
      horario_local: `2026-06-02T1${i % 9}:00:00-03:00`,
      data: "2026-06-02",
      praca: "conferencia",
      pedidos_ativos: 12 + i,
      classificacao_motor: "atencao",
      sinais_logisticos: ["pedido_atrasado_vs_prometido_operacional"],
      pedidos_atrasados: 1,
      isf_estado: "atencao",
      order_token: "a" + i,
      episodio_id_anon: "ea" + i
    });
  }
  // 15 críticos (alta pressão, atencao)
  for (let i = 0; i < 15; i++) {
    add({
      t_ms: 400000 + i * 90000,
      horario_local: `2026-06-03T1${i % 9}:30:00-03:00`,
      data: "2026-06-03",
      praca: "sushi",
      pedidos_ativos: 45 + i,
      classificacao_motor: "atencao",
      sinais_logisticos: ["prontos_acumulando"],
      pedidos_atrasados: 6,
      pedidos_prontos_aguardando: 10,
      isf_estado: "acima_capacidade",
      order_token: "k" + i,
      episodio_id_anon: "ek" + i
    });
  }
  // 15 exceções
  for (let i = 0; i < 15; i++) {
    add({
      t_ms: 600000 + i * 90000,
      horario_local: `2026-06-04T1${i % 9}:45:00-03:00`,
      data: "2026-06-04",
      praca: "conferencia",
      pedidos_ativos: 15 + i,
      classificacao_motor: "excecao_critica",
      tem_excecao_critica: true,
      sinais_logisticos: ["motoboy_na_loja"],
      confianca: "alta",
      order_token: "x" + i,
      episodio_id_anon: "ex" + i
    });
  }
  const pack = RV.buildPacks(cands, { per_bucket: 10 });
  assert.strictEqual(pack.pack_a.n, 40);
  assert.strictEqual(pack.pack_a.duplicates, 0);
  assert.ok(pack.pack_a.fingerprints_unique);
  const fps = pack.pack_a.cases.map((c) => c.fingerprint);
  assert.strictEqual(new Set(fps).size, 40);
});

test("zero duplicatas soft (mesmo horário/volume/classe)", () => {
  const base = {
    t_ms: 1,
    horario_local: "2026-06-01T18:00:00-03:00",
    data: "2026-06-01",
    praca: "sushi",
    pedidos_ativos: 10,
    itens_totais: 10,
    pedidos_prontos_aguardando: 1,
    sinais_logisticos: [],
    classificacao_motor: "sinal",
    tem_excecao_critica: false,
    confianca: "media",
    fonte_saude: "saudavel_ou_conhecida",
    isf_estado: "controlavel",
    pedidos_atrasados: 0,
    evidencia_kind: "confirmado",
    dados_ausentes: [],
    pii: false
  };
  const cands = [];
  for (let i = 0; i < 5; i++) {
    const c = Object.assign({}, base, { order_token: "same", episodio_id_anon: "same" });
    c.fingerprint = RV.caseFingerprint(c);
    cands.push(c);
  }
  // diversify enough for other buckets
  for (let i = 0; i < 40; i++) {
    const c = Object.assign({}, base, {
      t_ms: 1000 + i,
      horario_local: `2026-06-03T${10 + (i % 8)}:${(i * 3) % 60}:00-03:00`,
      pedidos_ativos: 8 + (i % 30),
      classificacao_motor: i % 4 === 0 ? "excecao_critica" : i % 4 === 1 ? "atencao" : "sinal",
      tem_excecao_critica: i % 4 === 0,
      sinais_logisticos: i % 4 === 0 ? ["motoboy_na_loja"] : i % 4 === 1 ? ["pedido_atrasado_vs_prometido_operacional"] : [],
      isf_estado: i % 4 === 1 && i > 20 ? "acima_capacidade" : "controlavel",
      pedidos_atrasados: i > 20 ? 6 : 0,
      order_token: "t" + i,
      episodio_id_anon: "e" + i
    });
    c.fingerprint = RV.caseFingerprint(c);
    cands.push(c);
  }
  const pack = RV.buildPacks(cands, { per_bucket: 10 });
  const softs = pack.pack_a.cases.map(
    (c) => `${c.horario_local}|${c.praca}|${c.pedidos_ativos}|${c.classificacao_motor}|${(c.sinais_logisticos || []).join(",")}`
  );
  assert.strictEqual(new Set(softs).size, softs.length);
});

test("10 casos por bucket", () => {
  assert.ok(fs.existsSync(packPath), "pack operacional deve existir (rodar tools/gerar_review_v2.js)");
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  assert.strictEqual(pack.counts.controlavel, 10);
  assert.strictEqual(pack.counts.atencao, 10);
  assert.strictEqual(pack.counts.critico, 10);
  assert.strictEqual(pack.counts.excecao, 10);
  assert.strictEqual(pack.n_cases, 40);
});

test("controlável não pode ter fonte ausente / zero pedidos", () => {
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  for (const c of pack.cases.filter((x) => x.bucket_amostragem === "controlavel")) {
    assert.ok(c.pedidos_ativos > 0, c.case_id);
    assert.notStrictEqual(c.fonte_saude, "ausente");
    assert.notStrictEqual(c.fonte_saude, "sem_cobertura");
  }
});

test("bucket não contradiz classificação (regras)", () => {
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  for (const c of pack.cases) {
    if (c.bucket_amostragem === "excecao") {
      assert.strictEqual(c.classificacao_motor, "excecao_critica");
    }
    if (c.bucket_amostragem === "controlavel") {
      assert.notStrictEqual(c.classificacao_motor, "excecao_critica");
      if (c.classificacao_motor === "atencao") assert.ok(c.caso_limitrofe, c.case_id + " precisa limítrofe");
    }
    if (c.bucket_amostragem === "critico") {
      assert.notStrictEqual(c.classificacao_motor, "excecao_critica");
    }
  }
});

test("contexto mínimo preenchido", () => {
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  for (const c of pack.cases) {
    assert.ok(c.horario_local, c.case_id);
    assert.ok(c.pedidos_ativos != null && c.pedidos_ativos > 0, c.case_id);
    assert.ok(c.classificacao_motor, c.case_id);
    assert.ok(c.fingerprint, c.case_id);
    assert.ok(c.contribuicao_principal, c.case_id);
    assert.ok(c.capacidade_hipotetica === true, c.case_id);
  }
});

test("caso insuficiente vai para qualidade da fonte", () => {
  const empty = {
    t_ms: 1,
    horario_local: "2026-05-26T21:00:00-03:00",
    data: "2026-05-26",
    praca: null,
    pedidos_ativos: 0,
    itens_totais: 0,
    pedidos_prontos_aguardando: 0,
    sinais_logisticos: [],
    classificacao_motor: "quieto",
    tem_excecao_critica: false,
    confianca: "baixa",
    fonte_saude: "sem_cobertura",
    isf_estado: null,
    pedidos_atrasados: 0,
    evidencia_kind: "ausente",
    dados_ausentes: ["tudo"],
    pii: false
  };
  empty.fingerprint = RV.caseFingerprint(empty);
  assert.ok(RV.isSourceQuality(empty));
  assert.ok(!RV.hasMinimumOperationalContext(empty));
  const pack = RV.buildPacks([empty], { per_bucket: 10 });
  assert.ok(pack.pack_b.n >= 1);
  assert.ok(pack.stats.rejected_empty_as_controlavel >= 1);
});

test("metadata/merchandise/promotion não entram na carga", () => {
  const items = RV.classifyAllPending([
    { nome: "Boné Tatá chumbo", praca_sugerida: "caixa", complexidade_sugerida: "moderado" },
    { nome: "Número de pessoas", praca_sugerida: "conferencia", complexidade_sugerida: "moderado" },
    { nome: "Tatá Especial - Club Vip Gourmet", praca_sugerida: "sushi", complexidade_sugerida: "moderado" },
    { nome: "Carpaccio de Salmão Trufado", praca_sugerida: "sushi", complexidade_sugerida: "moderado" },
    { nome: "Baunilha", praca_sugerida: "conferencia", complexidade_sugerida: "moderado" }
  ]);
  const byName = Object.fromEntries(items.items.map((i) => [i.nome, i]));
  assert.strictEqual(byName["Boné Tatá chumbo"].tipo_sugerido, "merchandise");
  assert.strictEqual(byName["Boné Tatá chumbo"].entra_carga_produtiva, false);
  assert.strictEqual(byName["Número de pessoas"].tipo_sugerido, "metadata");
  assert.strictEqual(byName["Número de pessoas"].entra_carga_produtiva, false);
  assert.strictEqual(byName["Tatá Especial - Club Vip Gourmet"].tipo_sugerido, "promotion");
  assert.strictEqual(byName["Tatá Especial - Club Vip Gourmet"].entra_carga_produtiva, false);
  assert.strictEqual(byName["Carpaccio de Salmão Trufado"].tipo_sugerido, "production_item");
  assert.strictEqual(byName["Baunilha"].tipo_sugerido, "modifier");
  assert.strictEqual(byName["Baunilha"].entra_carga_produtiva, false);
});

test("nenhuma PII", () => {
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  const blob = JSON.stringify(pack);
  assert.ok(!/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(blob));
  assert.ok(!/@gmail\.|@hotmail\./i.test(blob));
  for (const c of pack.cases) {
    assert.strictEqual(c.pii, false);
    assert.ok(!c.order_ids || c.order_ids === "redacted" || String(c.order_token || "").startsWith("ord_"));
  }
  if (fs.existsSync(qualityPath)) {
    const q = JSON.parse(fs.readFileSync(qualityPath, "utf8"));
    assert.ok(!/@gmail\./i.test(JSON.stringify(q)));
  }
});

test("itens pendentes tipados no artefato", () => {
  assert.ok(fs.existsSync(itemsPath));
  const items = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
  assert.ok(items.counts);
  assert.ok(items.n >= 14 || items.n >= 1);
  for (const it of items.items) {
    assert.ok(
      ["production_item", "modifier", "merchandise", "metadata", "promotion", "unknown"].includes(
        it.tipo_sugerido
      )
    );
    if (it.tipo_sugerido !== "production_item") {
      assert.strictEqual(it.entra_carga_produtiva, false);
    }
  }
});

test("validateOperationalPack do arquivo gerado", () => {
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  const v = RV.validateOperationalPack({ cases: pack.cases, counts: pack.counts });
  assert.ok(v.ok, v.errors.join("; "));
});

console.log("\n=== RESULT ===");
console.log(`passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
