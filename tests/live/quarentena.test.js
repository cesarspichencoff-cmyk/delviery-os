/* Teste 26 da Fase 2: quarentena preserva o bruto quando seguro, registra
 * motivo, nunca interrompe os eventos seguintes, nunca alimenta o snapshot
 * operacional, nunca vaza dado pessoal em mensagem. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { criarNucleo } = require("../../src/live/nucleo");
const { criarQuarentena } = require("../../src/live/quarentena");
const { relogioFixo, eventoComanda, eventoStatus, CONFIG_TESTE } = require("./helpers");

const agora = relogioFixo("2026-07-11T19:10:00.000Z");

test("26. evento inválido vai para quarentena e o fluxo segue processando", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  const invalido = eventoComanda({ schema_version: "9.9" });
  const valido = eventoStatus();

  assert.equal(nucleo.receber(invalido).destino, "quarentena");
  const r2 = nucleo.receber(valido); // o seguinte NÃO é interrompido
  assert.equal(r2.aceito, true);

  const snap = nucleo.snapshot();
  assert.equal(snap.quarentena.total, 1);
  assert.equal(snap.quarentena.por_motivo.schema_version_desconhecida, 1);
  // quarentena NÃO entra no estado operacional de pedidos
  const todos = [...snap.pedidos.completos, ...snap.pedidos.parciais,
    ...snap.pedidos.conflitos, ...snap.pedidos.cancelados];
  assert.equal(todos.length, 1); // só o evento válido
});

test("26b. o evento bruto é preservado quando seguro (redigido por nome de campo)", () => {
  const q = criarQuarentena(null);
  const bruto = eventoComanda({ schema_version: "9.9" });
  const reg = q.registrar(bruto, "schema_version_desconhecida", {}, "2026-07-11T19:10:00.000Z");
  // clone redigido: sem campos proibidos, conteúdo operacional preservado
  assert.deepEqual(reg.evento_bruto, bruto); // nada proibido aqui => cópia fiel
  assert.deepEqual(reg.campos_redigidos, []);
  assert.equal(reg.motivo, "schema_version_desconhecida");
});

test("26d. evento malformado COM PII aninhada vai à quarentena redigido (F2-01)", () => {
  const q = criarQuarentena(null);
  const bruto = eventoComanda({ schema_version: "9.9" });
  bruto.payload.entrega = { endereco: "marcador-endereco-9871", bairro_zona: "ok" };
  const reg = q.registrar(bruto, "schema_version_desconhecida", {}, "2026-07-11T19:10:00.000Z");
  assert.ok(reg.campos_redigidos.includes("payload.entrega.endereco"));
  assert.ok(!JSON.stringify(reg).includes("marcador-endereco-9871")); // valor morto
  assert.equal(reg.evento_bruto.payload.entrega.bairro_zona, "ok"); // resto preservado
});

test("26c. rejeição por dado pessoal NÃO preserva o bruto nem ecoa o valor", () => {
  const q = criarQuarentena(null);
  const bruto = eventoComanda();
  bruto.payload.telefone = "valor-sensivel-ficticio";
  const reg = q.registrar(bruto, "dado_pessoal_nao_permitido",
    { campo: "payload.telefone" }, "2026-07-11T19:10:00.000Z");
  assert.equal(reg.evento_bruto, null); // não é seguro guardar
  assert.equal(reg.campo, "payload.telefone"); // só o NOME do campo
  assert.ok(!JSON.stringify(reg).includes("valor-sensivel-ficticio"));
});
