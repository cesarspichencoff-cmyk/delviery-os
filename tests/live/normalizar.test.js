/* Hash canônico de itens (Addendum §13) e normalização: ordem de itens não
 * muda o hash; acento/caixa/espaço não mudam a identidade; conteúdo diferente
 * muda. diaDe extrai o dia da chave. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizarTexto, hashCanonicoItens, diaDe, normalizarChangeMode
} = require("../../src/live/normalizar");

test("normalizarTexto: caixa, acento e espaços não mudam a identidade", () => {
  assert.equal(normalizarTexto("  Uramaki   ESPECIAL  "), "uramaki especial");
  assert.equal(normalizarTexto("Batê-papo à Missô"), "bate-papo a misso");
  assert.equal(normalizarTexto(null), null); // ausente nunca vira texto
});

test("hashCanonicoItens: ordem dos itens não altera o hash", () => {
  const a = [
    { nome: "Uramaki Especial", quantidade: 1, observacao: null },
    { nome: "Temaki Exemplo", quantidade: 2, observacao: "sem gergelim" }
  ];
  const b = [a[1], a[0]];
  assert.equal(hashCanonicoItens(a), hashCanonicoItens(b));
});

test("hashCanonicoItens: conteúdo diferente => hash diferente; sem itens => null", () => {
  const a = [{ nome: "Uramaki Especial", quantidade: 1, observacao: null }];
  const b = [{ nome: "Uramaki Especial", quantidade: 2, observacao: null }];
  assert.notEqual(hashCanonicoItens(a), hashCanonicoItens(b));
  assert.equal(hashCanonicoItens(undefined), null);
});

test("diaDe extrai o dia; inválido vira null (nunca inventado)", () => {
  assert.equal(diaDe("2026-07-11T19:00:05.000Z"), "2026-07-11");
  assert.equal(diaDe("nao-e-data"), null);
  assert.equal(diaDe(null), null);
});

test("normalizarChangeMode: canônicos passam; aliases do Addendum viram canônico; desconhecido é null", () => {
  assert.deepEqual(normalizarChangeMode("full_snapshot"), { modo: "full_snapshot", alias: false });
  assert.deepEqual(normalizarChangeMode("delta_parcial"), { modo: "partial_delta", alias: true });
  assert.deepEqual(normalizarChangeMode("correcao_campo"), { modo: "field_correction", alias: true });
  assert.deepEqual(normalizarChangeMode("substituicao_itens"), { modo: "items_replacement", alias: true });
  assert.deepEqual(normalizarChangeMode("qualquer_coisa"), { modo: null, alias: false });
});
