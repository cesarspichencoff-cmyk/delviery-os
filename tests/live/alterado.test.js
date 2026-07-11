/* Testes 16-18 da Fase 2: pedido_alterado full_snapshot · partial_delta ·
 * revisão fora de ordem. Mais: delta sem base fica pendente; ausência em
 * delta não remove; conflito de revisão preserva e sinaliza; alias do
 * Addendum §13 é normalizado. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { criarNucleo } = require("../../src/live/nucleo");
const { hashCanonicoItens } = require("../../src/live/normalizar");
const { relogioFixo, eventoComanda, eventoAlterado, CONFIG_TESTE } = require("./helpers");

const agora = relogioFixo("2026-07-11T19:10:00.000Z");
const ITENS = [
  { nome: "Uramaki Ficticio Especial", quantidade: 1, observacao: null },
  { nome: "Temaki Exemplo", quantidade: 1, observacao: null }
];

function nucleoComComanda() {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  nucleo.receber(eventoComanda({ itens: ITENS, hash: hashCanonicoItens(ITENS) }));
  return nucleo;
}

const pedidoDe = (snap) => [...snap.pedidos.completos, ...snap.pedidos.parciais][0];

test("16. pedido_alterado full_snapshot substitui a composição e registra revisão", () => {
  const nucleo = nucleoComComanda();
  const novos = [{ nome: "Combinado Trocado", quantidade: 1, observacao: null }];
  const r = nucleo.receber(eventoAlterado({ change_mode: "full_snapshot", revision: 2, itens: novos }));
  assert.equal(r.resultado, "alteracao_aplicada");
  const p = pedidoDe(nucleo.snapshot());
  assert.equal(p.comanda.itens.length, 1);
  assert.equal(p.comanda.itens[0].nome, "Combinado Trocado");
  assert.equal(p.comanda.revision_atual, 2);
  // a via impressa original permanece registrada (histórico nunca some)
  assert.equal(p.comanda.itens_impressos.length, 2);
});

test("17. partial_delta: upsert do que veio; ausência NÃO remove item", () => {
  const nucleo = nucleoComComanda();
  const r = nucleo.receber(eventoAlterado({
    change_mode: "partial_delta", revision: 2,
    itens: [{ nome: "Temaki Exemplo", quantidade: 3, observacao: null }] // só o alterado
  }));
  assert.equal(r.resultado, "alteracao_aplicada");
  const p = pedidoDe(nucleo.snapshot());
  assert.equal(p.comanda.itens.length, 2); // o Uramaki ausente do delta CONTINUA
  const temaki = p.comanda.itens.find((i) => i.nome === "Temaki Exemplo");
  assert.equal(temaki.quantidade, 3);
});

test("17b. remoção só quando explícita (itens_removidos)", () => {
  const nucleo = nucleoComComanda();
  nucleo.receber(eventoAlterado({
    change_mode: "partial_delta", revision: 2, itens: [], itens_removidos: ["Temaki Exemplo"]
  }));
  const p = pedidoDe(nucleo.snapshot());
  assert.equal(p.comanda.itens.length, 1);
  assert.equal(p.comanda.itens[0].nome, "Uramaki Ficticio Especial");
});

test("17c. delta sem base confiável NÃO é aplicado: pendente e suspeito", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE }); // nenhuma comanda antes
  const r = nucleo.receber(eventoAlterado({
    pedido_interno: "0000179999", ifood_short: "0999",
    change_mode: "partial_delta", revision: 2,
    itens: [{ nome: "Item Fantasma", quantidade: 1, observacao: null }]
  }));
  assert.equal(r.resultado, "alteracao_pendente_sem_base");
  const p = pedidoDe(nucleo.snapshot());
  assert.equal(p.comanda.itens, null); // nada reconstruído por adivinhação
  assert.equal(p.alteracao_pendente_sem_base, true);
  assert.equal(p.qualidade.completeness, "suspect");
  assert.ok(p.qualidade.motivos_suspeita.includes("alteracao_sem_base_confiavel"));
});

test("18. revisão fora de ordem: a antiga não regride o estado, mas fica preservada", () => {
  const nucleo = nucleoComComanda();
  nucleo.receber(eventoAlterado({
    change_mode: "full_snapshot", revision: 3,
    itens: [{ nome: "Estado Rev3", quantidade: 1, observacao: null }],
    occurred_at: "2026-07-11T19:06:00.000Z"
  }));
  const r = nucleo.receber(eventoAlterado({
    change_mode: "full_snapshot", revision: 2,
    itens: [{ nome: "Estado Rev2 Atrasado", quantidade: 1, observacao: null }],
    occurred_at: "2026-07-11T19:04:00.000Z", captured_at: "2026-07-11T19:08:00.000Z"
  }));
  assert.equal(r.resultado, "alteracao_fora_de_ordem"); // última chegada ≠ mais nova
  const p = pedidoDe(nucleo.snapshot());
  assert.equal(p.comanda.itens[0].nome, "Estado Rev3");
  assert.equal(p.comanda.revision_atual, 3);
  const naoAplicada = p.comanda.alteracoes.find((a) => a.revision === 2);
  assert.equal(naoAplicada.aplicada, false);
  assert.equal(naoAplicada.motivo, "revisao_antiga_recebida_depois");
});

test("18b. conflito de revisão (mesma revision, conteúdo diferente): preserva e sinaliza", () => {
  const nucleo = nucleoComComanda();
  // fatos DIVERGENTES com a mesma revision: chaves distintas (conteúdos distintos)
  nucleo.receber(eventoAlterado({
    change_mode: "full_snapshot", revision: 2,
    idempotency_key: "alter:0000170512:rev=2:conteudo-a",
    itens: [{ nome: "Versao A", quantidade: 1, observacao: null }]
  }));
  const r = nucleo.receber(eventoAlterado({
    change_mode: "full_snapshot", revision: 2,
    idempotency_key: "alter:0000170512:rev=2:conteudo-b",
    itens: [{ nome: "Versao B", quantidade: 1, observacao: null }]
  }));
  assert.equal(r.resultado, "conflito_de_revisao");
  const p = pedidoDe(nucleo.snapshot());
  assert.equal(p.conflito_revisao, true);
  assert.equal(p.comanda.itens[0].nome, "Versao A"); // nenhuma escolha silenciosa
  assert.equal(p.qualidade.completeness, "suspect");
});

test("alias do Addendum §13 (snapshot_completo) é normalizado com aviso", () => {
  const nucleo = nucleoComComanda();
  const r = nucleo.receber(eventoAlterado({
    change_mode: "snapshot_completo", revision: 2,
    itens: [{ nome: "Via Alias", quantidade: 1, observacao: null }]
  }));
  assert.equal(r.resultado, "alteracao_aplicada");
  const p = pedidoDe(nucleo.snapshot());
  assert.equal(p.comanda.itens[0].nome, "Via Alias");
});

test("change_mode desconhecido vai para quarentena", () => {
  const nucleo = nucleoComComanda();
  const r = nucleo.receber(eventoAlterado({ change_mode: "modo_inventado", revision: 2 }));
  assert.equal(r.destino, "quarentena");
  assert.equal(r.motivo, "change_mode_desconhecido");
});

test("alteração sem revision e sem occurred_at não é aplicada (ordem desconhecida)", () => {
  const nucleo = nucleoComComanda();
  const r = nucleo.receber(eventoAlterado({
    change_mode: "full_snapshot", revision: null, occurred_at: null,
    idempotency_key: "alter:0000170512:sev=obs-1",
    itens: [{ nome: "Sem Ordem", quantidade: 1, observacao: null }]
  }));
  assert.equal(r.resultado, "alteracao_ordem_desconhecida");
  const p = pedidoDe(nucleo.snapshot());
  assert.equal(p.comanda.itens[0].nome, "Uramaki Ficticio Especial"); // intocado
});
