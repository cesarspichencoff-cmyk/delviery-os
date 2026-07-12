/* Correção F2-08 — os 15 casos obrigatórios: comanda com itens vazios nunca
 * é complete nem apta; composição válida posterior recupera; alteração para
 * vazio revoga; replay preserva a regra. Dados 100% fictícios. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { criarNucleo } = require("../../src/live/nucleo");
const { criarArmazenamento } = require("../../src/live/persistir");
const { reconstruirDoLog } = require("../../src/live/reconstruir");
const {
  relogioFixo, eventoComanda, eventoStatus, eventoCancelamento,
  eventoReimpresso, eventoAlterado, CONFIG_TESTE
} = require("./helpers");

const agora = relogioFixo("2026-07-11T19:10:00.000Z");
const novoNucleo = (opts) => criarNucleo({ agora, config: CONFIG_TESTE, ...(opts || {}) });
const unicoPedido = (snap) => {
  const todos = [...snap.pedidos.completos, ...snap.pedidos.parciais,
    ...snap.pedidos.conflitos, ...snap.pedidos.cancelados];
  assert.equal(todos.length, 1);
  return todos[0];
};
const assertVaziaNuncaApta = (p) => {
  assert.notEqual(p.qualidade.completeness, "complete");
  assert.equal(p.qualidade.completeness, "suspect");
  assert.ok(p.qualidade.motivos_suspeita.includes("comanda_sem_itens"));
  assert.ok(p.qualidade.fields_missing.includes("itens")); // desconhecido declarado
  assert.equal(p.apto_para_decisao, false);
};

test("1. comanda vazia sem status: suspect, não apta, unmatched", () => {
  const nucleo = novoNucleo();
  nucleo.receber(eventoComanda({ itens: [] }));
  const p = unicoPedido(nucleo.snapshot());
  assert.equal(p.match_state, "unmatched");
  assertVaziaNuncaApta(p);
});

test("2. comanda vazia ANTES do status: matched mas nunca complete/apta", () => {
  const nucleo = novoNucleo();
  nucleo.receber(eventoComanda({ itens: [] }));
  nucleo.receber(eventoStatus());
  const p = unicoPedido(nucleo.snapshot());
  assert.equal(p.match_state, "matched"); // casamento é eixo separado (F3-07)…
  assertVaziaNuncaApta(p);                // …completude/aptidão nunca abrem
});

test("3. comanda vazia DEPOIS do status: mesma regra", () => {
  const nucleo = novoNucleo();
  nucleo.receber(eventoStatus());
  nucleo.receber(eventoComanda({ itens: [] }));
  const p = unicoPedido(nucleo.snapshot());
  assert.equal(p.match_state, "matched");
  assertVaziaNuncaApta(p);
});

test("4. comanda vazia duplicada: dedup segura; regra inalterada", () => {
  const nucleo = novoNucleo();
  const ev = eventoComanda({ event_id: "vazia-dup", itens: [] });
  nucleo.receber(ev);
  const r = nucleo.receber(ev);
  assert.equal(r.destino, "duplicado_ignorado");
  const p = unicoPedido(nucleo.snapshot());
  assert.equal(p.comanda.vias, 1);
  assertVaziaNuncaApta(p);
});

test("5. comanda vazia reimpressa: uma via a mais, nunca segundo pedido, nunca apta", () => {
  const nucleo = novoNucleo();
  nucleo.receber(eventoComanda({ itens: [] }));
  nucleo.receber(eventoStatus());
  const r = nucleo.receber(eventoReimpresso({ itens: [] }));
  assert.equal(r.resultado, "reimpressao_identica");
  const p = unicoPedido(nucleo.snapshot());
  assert.equal(p.comanda.vias, 2);
  assertVaziaNuncaApta(p);
});

test("6. comanda vazia + cancelamento: cancelada, histórico íntegro, aptidão NUNCA reaberta", () => {
  const nucleo = novoNucleo();
  nucleo.receber(eventoComanda({ itens: [] }));
  nucleo.receber(eventoStatus({ captured_at: "2026-07-11T19:01:00.000Z" }));
  nucleo.receber(eventoCancelamento({ captured_at: "2026-07-11T19:02:00.000Z" }));
  const snap = nucleo.snapshot();
  assert.equal(snap.pedidos.cancelados.length, 1);
  const p = snap.pedidos.cancelados[0];
  assert.equal(p.cancelado, true);
  assert.equal(p.apto_para_decisao, false);
  const colunas = p.status.historico.map((h) => h.coluna);
  assert.ok(colunas.includes("em_preparo") && colunas.includes("cancelado"));
  // mesmo se composição válida chegasse depois, cancelado nunca volta a apto
  nucleo.receber(eventoAlterado({
    change_mode: "full_snapshot", revision: 1,
    itens: [{ nome: "Item Valido", quantidade: 1, observacao: null }]
  }));
  const p2 = nucleo.snapshot().pedidos.cancelados[0];
  assert.equal(p2.apto_para_decisao, false);
});

test("7/15. comanda vazia atravessa reinício e replay: regra e projeção idênticas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deliveryos-f208-"));
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    const nucleo = novoNucleo({ armazenamento: arm });
    nucleo.receber(eventoComanda({ itens: [] }));
    nucleo.receber(eventoStatus());
    const antes = nucleo.snapshot();
    assertVaziaNuncaApta(unicoPedido(antes));

    const { nucleo: renascido } = reconstruirDoLog({
      runtimeRoot: dir, agora, config: CONFIG_TESTE
    });
    const depois = renascido.snapshot();
    assertVaziaNuncaApta(unicoPedido(depois)); // replay não reabre aptidão
    const normalizar = (s) => ({ ...s, reconstruido_em: null, recepcao: null });
    assert.deepEqual(normalizar(depois), normalizar(antes)); // projeção reconstruível
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("8. vazia que depois recebe item válido RECUPERA complete e aptidão", () => {
  const nucleo = novoNucleo();
  nucleo.receber(eventoComanda({ itens: [] }));
  nucleo.receber(eventoStatus());
  assertVaziaNuncaApta(unicoPedido(nucleo.snapshot()));

  nucleo.receber(eventoAlterado({
    change_mode: "full_snapshot", revision: 1,
    itens: [{ nome: "Item Valido", quantidade: 1, observacao: null }]
  }));
  const p = unicoPedido(nucleo.snapshot());
  assert.equal(p.qualidade.completeness, "complete"); // recuperação correta
  assert.equal(p.apto_para_decisao, true);
  assert.ok(!p.qualidade.motivos_suspeita.includes("comanda_sem_itens"));
});

test("9. itens válidos que viram vazio por alteração PERDEM completude e aptidão", () => {
  const nucleo = novoNucleo();
  nucleo.receber(eventoComanda()); // itens válidos do helper
  nucleo.receber(eventoStatus());
  const antes = unicoPedido(nucleo.snapshot());
  assert.equal(antes.qualidade.completeness, "complete");
  assert.equal(antes.apto_para_decisao, true);

  nucleo.receber(eventoAlterado({
    change_mode: "items_replacement", revision: 2, itens: []
  }));
  const depois = unicoPedido(nucleo.snapshot());
  assertVaziaNuncaApta(depois); // aptidão anterior NÃO é preservada
});

test("10. comanda sem campo itens: quarentena (payload incompatível)", () => {
  const nucleo = novoNucleo();
  const ev = eventoComanda();
  delete ev.payload.itens;
  const r = nucleo.receber(ev);
  assert.equal(r.destino, "quarentena");
  assert.equal(r.motivo, "payload_incompativel");
  assert.equal(r.campo, "itens");
});

test("11. itens em formato inválido (não-array): quarentena", () => {
  const nucleo = novoNucleo();
  const ev = eventoComanda();
  ev.payload.itens = "nao-e-uma-lista";
  const r = nucleo.receber(ev);
  assert.equal(r.destino, "quarentena");
  assert.equal(r.motivo, "payload_incompativel");
});

test("12. só itens inválidos (sem nome) = composição vazia: suspect, não apta", () => {
  const nucleo = novoNucleo();
  nucleo.receber(eventoComanda({ itens: [{ nome: null, quantidade: 1, observacao: null }] }));
  nucleo.receber(eventoStatus());
  assertVaziaNuncaApta(unicoPedido(nucleo.snapshot()));
  // um item válido no meio de inválidos segue a lógica atual (contrato, caso 4)
  const nucleo2 = novoNucleo();
  nucleo2.receber(eventoComanda({
    pedido_interno: "0000170777", ifood_short: "0770", hash: "misto",
    itens: [{ nome: "Item Valido", quantidade: 1, observacao: null },
      { nome: null, quantidade: null, observacao: null }]
  }));
  nucleo2.receber(eventoStatus({
    ifood_short: "0770", idempotency_key: "status:sim_status:0770:2026-07-11:em_preparo"
  }));
  assert.equal(unicoPedido(nucleo2.snapshot()).qualidade.completeness, "complete");
});

test("13. status duplicado + comanda vazia: carimbo avança, regra inalterada", () => {
  const nucleo = novoNucleo();
  nucleo.receber(eventoComanda({ itens: [] }));
  nucleo.receber(eventoStatus({ event_id: "sta-v1", captured_at: "2026-07-11T19:01:00.000Z" }));
  const r = nucleo.receber(eventoStatus({ event_id: "sta-v2", captured_at: "2026-07-11T19:03:00.000Z" }));
  assert.equal(r.destino, "observacao_repetida");
  const p = unicoPedido(nucleo.snapshot());
  assert.equal(p.status.visto_por_ultimo_em, "2026-07-11T19:03:00.000Z");
  assertVaziaNuncaApta(p);
});

test("14. comanda vazia com status fora de ordem: coluna não regride, regra inalterada", () => {
  const nucleo = novoNucleo();
  nucleo.receber(eventoComanda({ itens: [] }));
  nucleo.receber(eventoStatus({
    coluna: "pronto", occurred_at: "2026-07-11T19:05:00.000Z",
    captured_at: "2026-07-11T19:05:10.000Z",
    idempotency_key: "status:sim_status:0724:2026-07-11:pronto"
  }));
  const r = nucleo.receber(eventoStatus({
    coluna: "em_preparo", occurred_at: "2026-07-11T19:02:00.000Z", // mais velho
    captured_at: "2026-07-11T19:06:00.000Z"
  }));
  assert.equal(r.resultado, "status_fora_de_ordem");
  const p = unicoPedido(nucleo.snapshot());
  assert.equal(p.status.coluna, "pronto"); // não regrediu
  assertVaziaNuncaApta(p);
});
