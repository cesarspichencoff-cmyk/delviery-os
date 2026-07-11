/* Testes 1-3 da Fase 2: evento válido · sem schema_version · versão
 * desconhecida. Mais: privacidade do envelope (dado pessoal rejeitado sem
 * ecoar valor). Dados 100% fictícios. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { criarNucleo } = require("../../src/live/nucleo");
const { validarEnvelope } = require("../../src/live/contrato");
const { relogioFixo, eventoComanda } = require("./helpers");

const agora = relogioFixo("2026-07-11T19:10:00.000Z");

test("1. evento válido é aceito e processado", () => {
  const nucleo = criarNucleo({ agora });
  const r = nucleo.receber(eventoComanda());
  assert.equal(r.aceito, true);
  assert.equal(r.destino, "processado");
  assert.equal(r.resultado, "comanda_nova");
  const snap = nucleo.snapshot();
  assert.equal(snap.qualidade.aceitos, 1);
  assert.equal(snap.quarentena.total, 0);
});

test("2. evento sem schema_version vai para quarentena (nunca aceito em silêncio)", () => {
  const nucleo = criarNucleo({ agora });
  const ev = eventoComanda();
  delete ev.schema_version;
  const r = nucleo.receber(ev);
  assert.equal(r.aceito, false);
  assert.equal(r.destino, "quarentena");
  assert.equal(r.motivo, "schema_version_ausente");
  const snap = nucleo.snapshot();
  assert.equal(snap.quarentena.total, 1);
  assert.equal(snap.quarentena.por_motivo.schema_version_ausente, 1);
  // nada entrou no estado operacional
  assert.equal(snap.pedidos.completos.length + snap.pedidos.parciais.length, 0);
});

test("3. schema_version desconhecida vai para quarentena", () => {
  const nucleo = criarNucleo({ agora });
  const r = nucleo.receber(eventoComanda({ schema_version: "9.9" }));
  assert.equal(r.destino, "quarentena");
  assert.equal(r.motivo, "schema_version_desconhecida");
});

test("privacidade: campo proibido rejeita o evento e o motivo não ecoa o valor", () => {
  const ev = eventoComanda();
  ev.payload.telefone = "valor-que-nao-pode-vazar";
  const res = validarEnvelope(ev);
  assert.equal(res.ok, false);
  assert.equal(res.motivo, "dado_pessoal_nao_permitido");
  assert.equal(res.campo, "payload.telefone"); // nome do campo, nunca o valor
  assert.ok(!JSON.stringify(res).includes("valor-que-nao-pode-vazar"));

  const nucleo = criarNucleo({ agora });
  const r = nucleo.receber(ev);
  assert.equal(r.destino, "quarentena");
});

test("identificador essencial ausente vai para quarentena", () => {
  const nucleo = criarNucleo({ agora });
  const ev = eventoComanda();
  ev.correlation.pedido_interno = null;
  delete ev.payload.pedido_interno;
  const r = nucleo.receber(ev);
  assert.equal(r.destino, "quarentena");
  assert.equal(r.motivo, "identificador_essencial_ausente");
});
