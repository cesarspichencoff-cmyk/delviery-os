/* D4A — adaptador projeção→interface: os cenários obrigatórios, a soberania do
 * núcleo (nada é recalculado), F2-08 preservado na janela, unknowns declarados,
 * IDs/razões/evidências transportados, campos ausentes nunca inventados. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { montarJanela, montarPayloadInterface } = require("../../src/live/interface/adaptador");
const { executarCenario } = require("../../tools/live/simulator/executor");
const { executarCasosF208 } = require("../../tools/live/simulator/campanha/f208");
const ev = require("../../tools/live/simulator/eventos");

const TZ = "America/Sao_Paulo";
const rodar = (cenario, seed) => executarCenario({ cenario, seed: seed || "d4a-adap", storeTimeZone: TZ });
const payload = (cenario, seed) => montarPayloadInterface({
  snapshot: rodar(cenario, seed).snapshot, storeTimeZone: TZ, origem: "simulator"
});

// cenários D4A locais para F2-08 na interface — com status, para exercitar a
// entrada/saída da JANELA (o catálogo f208 mede o núcleo, não o casamento).
const INICIO = "2026-08-01T18:00:00.000Z";
const seg = (n) => n * 1000;
const ts = (ctx, em) => new Date(ctx.inicioMs + em).toISOString();
const vazio = (ctx) => ({ ifood: ctx.ids.proximoIfood(), interno: ctx.ids.proximoInterno(), job: ctx.ids.proximoJob(), itens: [] });
const CEN_VAZIA_COM_STATUS = {
  id: "d4a_vazia_com_status", inicio: INICIO, fim_ms: seg(80),
  passos(ctx) { const p = vazio(ctx); return [
    { em_ms: 0, evento: ev.eventoComanda(ctx, ts(ctx, 0), p) },
    { em_ms: seg(40), evento: ev.eventoStatus(ctx, ts(ctx, seg(40)), p, "em_preparo") }
  ]; }
};
const CEN_VAZIA_RECUPERA = {
  id: "d4a_vazia_recupera", inicio: INICIO, fim_ms: seg(100),
  passos(ctx) { const p = vazio(ctx); const itens = [{ nome: "Item Sintetico Alfa", quantidade: 1, observacao: null }];
    return [
      { em_ms: 0, evento: ev.eventoComanda(ctx, ts(ctx, 0), p) },
      { em_ms: seg(30), evento: ev.eventoStatus(ctx, ts(ctx, seg(30)), p, "em_preparo") },
      { em_ms: seg(60), evento: ev.eventoAlteracao(ctx, ts(ctx, seg(60)), p, { revision: 1, itens }) }
    ]; }
};
const CEN_VALIDA_REVOGADA = {
  id: "d4a_valida_revogada", inicio: INICIO, fim_ms: seg(100),
  passos(ctx) { const p = { ifood: ctx.ids.proximoIfood(), interno: ctx.ids.proximoInterno(), job: ctx.ids.proximoJob(),
      itens: [{ nome: "Item Sintetico Beta", quantidade: 2, observacao: null }] };
    return [
      { em_ms: 0, evento: ev.eventoComanda(ctx, ts(ctx, 0), p) },
      { em_ms: seg(30), evento: ev.eventoStatus(ctx, ts(ctx, seg(30)), p, "em_preparo") },
      { em_ms: seg(60), evento: ev.eventoAlteracao(ctx, ts(ctx, seg(60)), p, { change_mode: "items_replacement", revision: 2, itens: [] }) }
    ]; }
};

test("1. operação normal: pedido apto entra na janela com tempos do núcleo", () => {
  const pl = payload("fluxo_normal");
  assert.equal(pl.source_status, "ready");
  assert.ok(pl.janela);
  assert.equal(pl.janela.NIGHT.length, 1);
  const o = pl.janela.NIGHT[0];
  assert.ok(o.r !== null);        // recebido (minuto local)
  assert.ok(o.p !== null);        // pronto observado
  assert.equal(o.s, null);        // saiu: não observado => NUNCA inventado
  assert.equal(o.e, null);        // entregue: idem
  assert.ok(pl.janela.rows.length >= 1); // itens transportados
  assert.match(o.curto, /^SIM-IFOOD-/); // ID preservado
});

test("2/3. status antes / comanda antes: ambos apto quando casam", () => {
  for (const c of ["status_antes_comanda", "comanda_antes_status"]) {
    const pl = payload(c);
    assert.equal(pl.janela.NIGHT.length, 1, c);
    assert.equal(pl.janela.rows.length >= 1, true, c);
  }
});

test("4/5. duplicidade e reimpressão: um pedido só, sem duplicar", () => {
  // evento_duplicado: comanda + comanda repetida, SEM status => parcial
  // (unmatched), não apto: não entra na janela, mas é UM só em excluidos.
  const dup = payload("evento_duplicado");
  assert.equal(dup.janela, null);
  assert.equal(dup.pedidos_excluidos.length, 1); // nunca duplica
  // reimpressão idêntica (com status): apto, um pedido só na janela
  const reimp = payload("reimpressao");
  assert.equal(reimp.janela.NIGHT.length, 1);
});

test("6. cancelamento: fora da janela apta, com tempo de cancelamento (c)", () => {
  const pl = payload("cancelamento");
  // status fresco (cancelamento recente) => ready; cancelado entra com c
  assert.equal(pl.source_status, "ready");
  const cancelados = pl.janela.NIGHT.filter((o) => o.c !== null);
  assert.equal(cancelados.length, 1);
  assert.equal(pl.janela.rows.length, 0); // sem itens de cancelado alimentando praça
});

test("7. conflito: NUNCA entra na janela; declarado em unknowns/excluidos", () => {
  const pl = payload("identificador_em_conflict");
  assert.equal(pl.janela, null); // nenhum apto neste cenário
  assert.equal(pl.unknowns.conflitos, 3);
  const conflitos = pl.pedidos_excluidos.filter((e) => e.match_state === "conflict");
  assert.equal(conflitos.length, 3);
  for (const c of conflitos) assert.equal(c.apto_para_decisao, false);
});

test("8/9. evento atrasado / fonte stale: janela protegida, freshness do núcleo", () => {
  const atrasada = payload("fonte_atrasada");
  assert.equal(atrasada.source_status, "stale");
  assert.equal(atrasada.janela, null);
  assert.equal(atrasada.freshness.sim_status.freshness_state, "atrasada");
  const vencida = payload("fonte_vencida");
  assert.equal(vencida.source_status, "stale");
  assert.equal(vencida.freshness.sim_status.freshness_state, "vencida");
});

test("10/11. desconexão e reconexão: reconectada => ready de novo", () => {
  const pl = payload("desconexao_reconexao");
  // o cenário termina com evidência de vida => fonte reconectada
  assert.equal(pl.freshness.sim_status.freshness_state, "atualizada");
  assert.equal(pl.source_status, "ready");
});

test("12. evento inválido em quarentena: contado em unknowns, não na janela", () => {
  const pl = payload("evento_invalido_quarentena");
  assert.equal(pl.source_status, "ready");
  assert.equal(pl.unknowns.quarentena.total, 1);
  assert.equal(pl.unknowns.quarentena.por_motivo.schema_version_ausente, 1);
  assert.equal(pl.janela.NIGHT.length, 1); // o par válido casou e é apto
});

test("13/14. reinício e replay: projeção final publica janela apta", () => {
  const r = rodar("reinicio_e_replay");
  assert.equal(r.replay.executado, true);
  assert.equal(r.replay.snapshot_igual, true);
  const pl = montarPayloadInterface({ snapshot: r.snapshot, storeTimeZone: TZ, origem: "simulator" });
  assert.equal(pl.janela.NIGHT.length, 1); // término do replay => estado final apto
});

test("soberania: adaptador não decide, não recalcula, não inventa — só transporta", () => {
  const r = rodar("fluxo_normal");
  const { janela } = montarJanela(r.snapshot, { storeTimeZone: TZ });
  // o adaptador não produz mode/calmo/ambiente/foco/score/prioridade
  const bruto = JSON.stringify(janela).toLowerCase();
  for (const proibido of ["calmo", "ambiente", "\"foco\"", "score", "prioridade", "confianca"]) {
    assert.ok(!bruto.includes(proibido), `janela nao pode conter ${proibido}`);
  }
  // shape idêntico ao que o gerador histórico produz (NIGHT/rows) — motor consome igual
  assert.deepEqual(Object.keys(janela.NIGHT[0]).sort(), ["c", "curto", "e", "id", "p", "r", "s"]);
  assert.deepEqual(Object.keys(janela.rows[0]).sort(), ["item_nome", "observacao", "pedido_id", "quantidade"]);
});

test("15. F2-08 na interface: comanda vazia casada NUNCA entra apta; suspect visível", () => {
  const pl = montarPayloadInterface({
    snapshot: executarCenario({ cenario: CEN_VAZIA_COM_STATUS, seed: "d4a-f208", storeTimeZone: TZ }).snapshot,
    storeTimeZone: TZ, origem: "simulator"
  });
  assert.equal(pl.source_status, "ready"); // status fresco…
  assert.equal(pl.janela, null);           // …mas vazia nunca é apta
  const susp = pl.pedidos_excluidos.find((e) => e.motivos_suspeita.includes("comanda_sem_itens"));
  assert.ok(susp, "suspect comanda_sem_itens visível/inspecionável em excluidos");
  assert.equal(susp.completeness, "suspect");
  assert.equal(susp.apto_para_decisao, false);
  assert.ok(susp.fields_missing.includes("itens"));
});

test("16. F2-08 na interface: composição válida posterior atualiza a interface (entra na janela)", () => {
  const pl = montarPayloadInterface({
    snapshot: executarCenario({ cenario: CEN_VAZIA_RECUPERA, seed: "d4a-f208", storeTimeZone: TZ }).snapshot,
    storeTimeZone: TZ, origem: "simulator"
  });
  assert.ok(pl.janela, "composição válida posterior deve tornar o pedido apto");
  assert.equal(pl.janela.NIGHT.length, 1);
  assert.equal(pl.janela.rows.length, 1); // o item recuperado é transportado
  assert.equal(pl.pedidos_excluidos.length, 0);
});

test("17. F2-08 na interface: composição válida revogada para vazia sai da janela", () => {
  const pl = montarPayloadInterface({
    snapshot: executarCenario({ cenario: CEN_VALIDA_REVOGADA, seed: "d4a-f208", storeTimeZone: TZ }).snapshot,
    storeTimeZone: TZ, origem: "simulator"
  });
  assert.equal(pl.janela, null); // perdeu aptidão => saiu da janela
  const susp = pl.pedidos_excluidos.find((e) => e.motivos_suspeita.includes("comanda_sem_itens"));
  assert.ok(susp, "revogada para vazia vira suspect e sai da janela");
  assert.equal(susp.apto_para_decisao, false);
});

test("18. ausência total de dados: janela null, unknowns zerados, nada inventado", () => {
  const nucleoVazio = require("../../src/live/nucleo").criarNucleo({
    config: require("../../src/live/config").criarConfig({ storeTimeZone: TZ }),
    agora: () => Date.parse("2026-08-01T14:00:00.000Z")
  });
  const pl = montarPayloadInterface({ snapshot: nucleoVazio.snapshot(), storeTimeZone: TZ, origem: "simulator" });
  assert.equal(pl.janela, null);
  assert.equal(pl.unknowns.conflitos, 0);
  assert.equal(pl.unknowns.parciais, 0);
  assert.equal(pl.operational_day_key, null); // sem dado => sem dia inventado
  // ready, mas sem pedidos aptos — a interface trata isso como "sem foco",
  // NUNCA fabrica Calmo (o motor decide Calmo, não o adaptador)
  assert.equal(pl.source_status, "ready");
});

test("unknowns e evidências preservados: razões do núcleo transportadas intactas", () => {
  const pl = payload("identificador_em_conflict");
  for (const c of pl.pedidos_excluidos) {
    assert.ok(typeof c.match_state === "string");
    assert.ok(Array.isArray(c.motivos_suspeita));
    assert.ok(Array.isArray(c.fields_missing));
  }
});
