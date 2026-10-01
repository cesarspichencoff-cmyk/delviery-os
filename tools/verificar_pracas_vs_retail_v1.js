"use strict";

const assert = require("node:assert/strict");
const { normalizeName, auditPlazas } = require("./auditar_pracas_vs_retail_v1.js");

assert.equal(normalizeName("COMB EXEC SALMÃO 1 P"), "combinado executivo salmao 1 pessoa");
assert.equal(normalizeName("Tuna Shissô Tartar"), "tuna shiso tartar");

const seed = {
  itens: [
    {
      id: "sushi_a",
      nome: "Sushi A",
      praca_principal: "duplas",
      pracas_dependentes: [],
      confianca_classificacao: "alta",
      revisao_manual: false,
    },
    {
      id: "sushi_b",
      nome: "Sushi B",
      praca_principal: "duplas",
      pracas_dependentes: [],
      confianca_classificacao: "alta",
      revisao_manual: false,
    },
    {
      id: "tartar",
      nome: "Tartar de Atum Spicy",
      praca_principal: "duplas",
      pracas_dependentes: [],
      confianca_classificacao: "inferido_com_baixa_confianca",
      revisao_manual: true,
    },
    {
      id: "miso",
      nome: "Missoshiro",
      praca_principal: "cozinha_quentes",
      pracas_dependentes: [],
      confianca_classificacao: "inferido_com_baixa_confianca",
      revisao_manual: true,
    },
    {
      id: "missing",
      nome: "Sem Correspondencia",
      praca_principal: "montagem_outros",
      pracas_dependentes: [],
      confianca_classificacao: "alta",
      revisao_manual: false,
    },
  ],
};

const catalog = {
  schema: "deliveryos.retail.product-catalog.v1",
  store: "0001 - TATA ITAIM",
  captured_date: "2026-09-30",
  products: [
    { product_code: "9.01.00.001.00", product_name: "SUSHI A", printer_codes: ["00009", "00003"] },
    { product_code: "9.01.00.002.00", product_name: "SUSHI B", printer_codes: ["00009", "00003"] },
    { product_code: "9.10.05.040.00", product_name: "TARTAR DE ATUM SPICY", printer_codes: ["00006"] },
    { product_code: "9.00.00.020.00", product_name: "MISSOSHIRO", printer_codes: ["00002"] },
    { product_code: "9.75.00.020.00", product_name: "MISSOSHIRO ", printer_codes: ["00002"] },
  ],
};

const report = auditPlazas(seed, catalog);

assert.deepEqual(report.coverage, {
  seed_items: 5,
  retail_products: 5,
  unique_matches: 3,
  ambiguous_matches: 1,
  unmatched_seed_items: 1,
});

const duplas = report.profiles.find((x) => x.plaza === "duplas");
assert.ok(duplas);
assert.equal(duplas.dominant_route_signature, "00009+00003");
assert.equal(duplas.dominant_count, 2);
assert.deepEqual(
  duplas.outliers.map((x) => [x.seed_name, x.route_signature, x.manual_review]),
  [["Tartar de Atum Spicy", "00006", true]],
);

assert.equal(report.review_candidates.length, 1);
assert.equal(report.review_candidates[0].seed_name, "Tartar de Atum Spicy");
assert.equal(report.review_candidates[0].disposition, "REVIEW_CANDIDATE_NOT_AUTO_CORRECTION");

assert.equal(report.ambiguous.length, 1);
assert.equal(report.ambiguous[0].seed_name, "Missoshiro");
assert.equal(report.ambiguous[0].disposition, "AMBIGUOUS_SAME_ROUTE");

assert.equal(report.unmatched.length, 1);
assert.equal(report.effects.seed_write, false);
assert.equal(report.effects.teknisa_write, false);

console.log("plaza-vs-retail-audit-v1: ok");
