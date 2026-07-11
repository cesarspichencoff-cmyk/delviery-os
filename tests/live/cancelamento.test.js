/* Teste 13 da Fase 2: cancelamento — só da fonte de status, preserva
 * histórico, aceita chegar antes ou depois da composição, nunca apaga nada. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { criarNucleo } = require("../../src/live/nucleo");
const { relogioFixo, eventoComanda, eventoStatus, eventoCancelamento, CONFIG_TESTE } = require("./helpers");

const agora = relogioFixo("2026-07-11T19:10:00.000Z");

test("13a. cancelamento depois do status: marca cancelado e preserva histórico", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  nucleo.receber(eventoComanda());
  nucleo.receber(eventoStatus({ captured_at: "2026-07-11T19:01:00.000Z" }));
  nucleo.receber(eventoCancelamento({ captured_at: "2026-07-11T19:02:00.000Z" }));
  const snap = nucleo.snapshot();
  assert.equal(snap.pedidos.cancelados.length, 1);
  assert.equal(snap.pedidos.completos.length, 0); // cancelado sai da lista operacional
  const p = snap.pedidos.cancelados[0];
  assert.equal(p.cancelado, true);
  // histórico anterior NÃO foi apagado: em_preparo continua registrado
  const colunas = p.status.historico.map((h) => h.coluna);
  assert.ok(colunas.includes("em_preparo"));
  assert.ok(colunas.includes("cancelado"));
  // a composição observada permanece (nada some do registro)
  assert.ok(Array.isArray(p.comanda.itens));
});

test("13b. cancelamento pode chegar ANTES da composição (status-first)", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  nucleo.receber(eventoCancelamento({ ifood_short: "0640" }));
  let snap = nucleo.snapshot();
  assert.equal(snap.pedidos.cancelados.length, 1);
  assert.equal(snap.pedidos.cancelados[0].comanda, null); // sem itens inventados

  nucleo.receber(eventoComanda({ pedido_interno: "0000170030", ifood_short: "0640" }));
  snap = nucleo.snapshot();
  assert.equal(snap.pedidos.cancelados.length, 1);
  assert.ok(snap.pedidos.cancelados[0].comanda); // metade da comanda casou depois
  assert.equal(snap.pedidos.cancelados[0].cancelado, true);
});

test("13c. cancelamento nunca é inferido: sem evento, nada é cancelado", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  nucleo.receber(eventoComanda());
  // pedido some da fonte de status? silêncio NÃO cancela.
  const snap = nucleo.snapshot();
  assert.equal(snap.pedidos.cancelados.length, 0);
});
