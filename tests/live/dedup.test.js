/* Testes 4-6 da Fase 2: event_id duplicado · idempotency_key duplicada ·
 * status duplicado com captured_at diferente (mesmo fato => carimbo avança,
 * fato não duplica). Também: F3-04 — chave de status com horário é rejeitada. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { criarNucleo } = require("../../src/live/nucleo");
const { chaveStatus, verificarChaveDeStatus } = require("../../src/live/idempotencia");
const { relogioFixo, eventoComanda, eventoStatus, CONFIG_TESTE } = require("./helpers");

const agora = relogioFixo("2026-07-11T19:10:00.000Z");

test("4. event_id duplicado é ignorado (mesma observação relida)", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  const ev = eventoComanda({ event_id: "com-fixo-1" });
  assert.equal(nucleo.receber(ev).destino, "processado");
  const r2 = nucleo.receber(ev);
  assert.equal(r2.aceito, false);
  assert.equal(r2.destino, "duplicado_ignorado");
  const snap = nucleo.snapshot();
  assert.equal(snap.recepcao.duplicados_event_id, 1);
  // não virou segundo pedido nem segunda via
  const todos = [...snap.pedidos.completos, ...snap.pedidos.parciais];
  assert.equal(todos.length, 1);
  assert.equal(todos[0].comanda.vias, 1);
});

test("5. idempotency_key duplicada (novo event_id) não cria fato novo", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  nucleo.receber(eventoComanda({ event_id: "com-a" }));
  const r = nucleo.receber(eventoComanda({ event_id: "com-b" })); // mesma chave de fato
  assert.equal(r.aceito, true);
  assert.equal(r.destino, "observacao_repetida");
  const snap = nucleo.snapshot();
  assert.equal(snap.recepcao.observacoes_repetidas, 1);
  const todos = [...snap.pedidos.completos, ...snap.pedidos.parciais];
  assert.equal(todos.length, 1); // um fato, um pedido
});

test("6. status duplicado com captured_at diferente: mesmo fato, carimbo avança, nada duplica", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  nucleo.receber(eventoStatus({ event_id: "sta-a", captured_at: "2026-07-11T19:01:00.000Z" }));
  const r = nucleo.receber(eventoStatus({ event_id: "sta-b", captured_at: "2026-07-11T19:03:00.000Z" }));
  assert.equal(r.destino, "observacao_repetida"); // mesma chave: sem tempo na identidade
  const snap = nucleo.snapshot();
  const parciais = snap.pedidos.parciais;
  assert.equal(parciais.length, 1);
  assert.equal(parciais[0].status.visto_por_ultimo_em, "2026-07-11T19:03:00.000Z");
});

test("F3-04: chave de status construída pelo módulo não carrega horário", () => {
  const chave = chaveStatus({
    source: "sim_status", ifood_short: "0724", dia: "2026-07-11", coluna: "pronto"
  });
  assert.equal(chave, "status:sim_status:0724:2026-07-11:pronto");
  assert.equal(verificarChaveDeStatus({ event_type: "status_ifood", idempotency_key: chave }).ok, true);
});

test("F3-04: status com idempotency_key embutindo captured_at vai para quarentena", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  const r = nucleo.receber(eventoStatus({
    idempotency_key: "status:0724:2026-07-11:pronto:2026-07-11T19:01" // horário embutido: proibido
  }));
  assert.equal(r.destino, "quarentena");
  assert.equal(r.motivo, "idempotency_key_de_status_com_horario");
});

test("F3-04: revision entra na chave quando a fonte fornece", () => {
  const chave = chaveStatus({
    source: "sim_status", ifood_short: "0724", dia: "2026-07-11", coluna: "pronto", revision: 3
  });
  assert.equal(chave, "status:sim_status:0724:2026-07-11:pronto:rev=3");
});
