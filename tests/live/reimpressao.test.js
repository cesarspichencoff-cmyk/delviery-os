/* Testes 14-15 da Fase 2: reimpressão idêntica (idempotente, sem segundo
 * pedido) e reimpressão divergente (registrada, nunca substitui em silêncio). */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { criarNucleo } = require("../../src/live/nucleo");
const { hashCanonicoItens } = require("../../src/live/normalizar");
const { relogioFixo, eventoComanda, eventoReimpresso } = require("./helpers");

const agora = relogioFixo("2026-07-11T19:10:00.000Z");
const ITENS = [{ nome: "Uramaki Ficticio Especial", quantidade: 1, observacao: null }];
const ITENS_OUTROS = [{ nome: "Temaki Exemplo", quantidade: 2, observacao: null }];

test("14. reimpressão idêntica: uma via a mais, nunca segundo pedido, idempotente", () => {
  const nucleo = criarNucleo({ agora });
  nucleo.receber(eventoComanda({ itens: ITENS, hash: hashCanonicoItens(ITENS) }));
  // mesma comanda impressa de novo => mesma idempotency_key, novo event_id
  const r = nucleo.receber(eventoComanda({
    itens: ITENS, hash: hashCanonicoItens(ITENS), captured_at: "2026-07-11T19:06:00.000Z"
  }));
  assert.equal(r.destino, "observacao_repetida");
  const snap = nucleo.snapshot();
  const todos = [...snap.pedidos.completos, ...snap.pedidos.parciais];
  assert.equal(todos.length, 1);           // nunca vira segundo pedido
  assert.equal(todos[0].comanda.vias, 2);  // a via nova fica registrada
  assert.equal(todos[0].comanda.reimpressao_divergente, false);
  assert.equal(todos[0].qualidade.completeness, "partial"); // sem status ainda
});

test("14b. evento explícito pedido_reimpresso idêntico é idempotente", () => {
  const nucleo = criarNucleo({ agora });
  nucleo.receber(eventoComanda({ itens: ITENS, hash: hashCanonicoItens(ITENS) }));
  const r = nucleo.receber(eventoReimpresso({ itens: ITENS }));
  assert.equal(r.resultado, "reimpressao_identica");
  const snap = nucleo.snapshot();
  const todos = [...snap.pedidos.completos, ...snap.pedidos.parciais];
  assert.equal(todos.length, 1);
  assert.equal(todos[0].comanda.vias, 2);
});

test("15. reimpressão divergente: registrada como possível alteração, itens NÃO substituídos", () => {
  const nucleo = criarNucleo({ agora });
  nucleo.receber(eventoComanda({ itens: ITENS, hash: hashCanonicoItens(ITENS) }));
  const r = nucleo.receber(eventoComanda({
    itens: ITENS_OUTROS, hash: hashCanonicoItens(ITENS_OUTROS),
    captured_at: "2026-07-11T19:07:00.000Z"
  }));
  assert.equal(r.resultado, "reimpressao_divergente");
  const snap = nucleo.snapshot();
  const p = [...snap.pedidos.completos, ...snap.pedidos.parciais][0];
  assert.equal(p.comanda.reimpressao_divergente, true);
  // NÃO presumir equivalência: itens atuais continuam os da via original
  assert.equal(p.comanda.itens[0].nome, "Uramaki Ficticio Especial");
  // o conteúdo divergente fica preservado para diagnóstico
  assert.equal(p.comanda.conteudos_divergentes.length, 1);
  assert.equal(p.comanda.conteudos_divergentes[0].itens[0].nome, "Temaki Exemplo");
  // incerteza vira qualidade: suspect, nunca silêncio
  assert.equal(p.qualidade.completeness, "suspect");
  assert.ok(p.qualidade.motivos_suspeita.includes("reimpressao_divergente"));
  assert.equal(p.apto_para_decisao, false);
});
