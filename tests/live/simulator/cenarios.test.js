/* Fase 3A — testes 9-20: cada cenário do catálogo termina no estado esperado
 * do núcleo, alimentado exclusivamente pela API pública. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { executarCenario } = require("../../../tools/live/simulator/executor");

const TZ = "America/Sao_Paulo";
const rodar = (id, extras) => executarCenario({
  cenario: id, seed: "seed-cenarios", storeTimeZone: TZ, ...(extras || {})
});

test("9. fluxo_normal termina matched, atualizado e com gate aberto", () => {
  const r = rodar("fluxo_normal");
  assert.equal(r.relatorio.pedidos.matched, 1);
  assert.equal(r.relatorio.pedidos.conflict, 0);
  assert.equal(r.relatorio.quarentena.total, 0);
  assert.equal(r.relatorio.freshness_por_fonte.sim_comanda, "atualizada");
  assert.equal(r.relatorio.freshness_por_fonte.sim_status, "atualizada");
  assert.equal(r.relatorio.gate_staleness.permitir_acao_dominante, true);
  assert.equal(r.snapshot.pedidos.completos[0].status.coluna, "pronto");
});

test("10. status_antes_comanda consolida corretamente", () => {
  const r = rodar("status_antes_comanda");
  assert.equal(r.relatorio.pedidos.matched, 1);
  assert.equal(r.relatorio.pedidos.partial + r.relatorio.pedidos.unmatched, 0);
  assert.ok(Array.isArray(r.snapshot.pedidos.completos[0].comanda.itens)); // itens só da comanda
});

test("11. comanda_antes_status consolida corretamente", () => {
  const r = rodar("comanda_antes_status");
  assert.equal(r.relatorio.pedidos.matched, 1);
  assert.equal(r.snapshot.pedidos.completos[0].status.coluna, "em_preparo");
});

test("12. duplicata não aumenta o log aceito", () => {
  const r = rodar("evento_duplicado");
  assert.equal(r.relatorio.eventos_gerados, 2);
  assert.equal(r.relatorio.eventos_aceitos, 1);
  assert.equal(r.relatorio.duplicados, 1);
  assert.equal(r.relatorio.linhas_log_aceito, 1); // contagem REAL do arquivo
});

test("13. reimpressão não cria segundo pedido", () => {
  const r = rodar("reimpressao");
  assert.equal(r.relatorio.pedidos.matched, 1);
  const p = r.snapshot.pedidos.completos[0];
  assert.equal(p.comanda.vias, 2);
  assert.equal(p.comanda.reimpressao_divergente, false);
});

test("14. cancelamento preserva histórico", () => {
  const r = rodar("cancelamento");
  assert.equal(r.relatorio.pedidos.cancelados, 1);
  const p = r.snapshot.pedidos.cancelados[0];
  const colunas = p.status.historico.map((h) => h.coluna);
  assert.ok(colunas.includes("em_preparo"));
  assert.ok(colunas.includes("cancelado"));
  assert.ok(Array.isArray(p.comanda.itens)); // composição observada permanece
});

test("15. colisão de identificador termina conflict", () => {
  const r = rodar("identificador_em_conflict");
  assert.equal(r.relatorio.pedidos.conflict, 3); // 2 comandas + 1 status
  assert.equal(r.relatorio.pedidos.matched, 0);
  for (const p of r.snapshot.pedidos.conflitos) assert.equal(p.apto_para_decisao, false);
});

test("16. fonte atrasada termina atrasada", () => {
  const r = rodar("fonte_atrasada");
  assert.equal(r.relatorio.freshness_por_fonte.sim_status, "atrasada");
  assert.equal(r.relatorio.freshness_por_fonte.sim_comanda, "atualizada");
  assert.equal(r.relatorio.gate_staleness.permitir_acao_dominante, false); // padrão: bloquear
});

test("17. fonte vencida termina vencida", () => {
  const r = rodar("fonte_vencida");
  assert.equal(r.relatorio.freshness_por_fonte.sim_status, "vencida");
  assert.equal(r.relatorio.freshness_por_fonte.sim_comanda, "atualizada");
  assert.equal(r.relatorio.gate_staleness.permitir_acao_dominante, false);
  assert.equal(r.relatorio.gate_staleness.motivo, "fonte_de_status_vencida_ou_desconectada");
});

test("18. desconexão e reconexão são reproduzíveis", () => {
  const a = rodar("desconexao_reconexao");
  const b = rodar("desconexao_reconexao");
  assert.equal(a.relatorio.hash_resultado, b.relatorio.hash_resultado);
  // evidência de vida posterior reconectou a fonte
  assert.equal(a.relatorio.freshness_por_fonte.sim_status, "atualizada");
  assert.equal(a.snapshot.fontes.sim_status.desconectada_em, null);
});

test("19. evento inválido vai para quarentena sem interromper o cenário", () => {
  const r = rodar("evento_invalido_quarentena");
  assert.equal(r.relatorio.quarentena.total, 1);
  assert.equal(r.relatorio.quarentena.por_motivo.schema_version_ausente, 1);
  assert.equal(r.relatorio.pedidos.matched, 1); // o par válido casou normalmente
});

test("20. reinício e replay geram o mesmo snapshot e a operação continua", () => {
  const r = rodar("reinicio_e_replay");
  assert.equal(r.replay.executado, true);
  assert.equal(r.replay.snapshot_igual, true); // replay reconstruiu o mesmo estado
  assert.ok(r.replay.eventos_relidos >= 2);
  assert.equal(r.relatorio.pedidos.matched, 1);
  assert.equal(r.snapshot.pedidos.completos[0].status.coluna, "pronto"); // pós-reinício
});
