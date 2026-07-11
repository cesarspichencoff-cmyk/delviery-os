/* Testes 19-23 da Fase 2: os cinco estados de freshness (atualizada,
 * atrasada, vencida, desconectada, desconhecida) + contrato F3-03 de
 * "atrasada" + critério de aceite do Addendum §4: fonte de status vencida
 * NUNCA permite ação dominante nova — independente do que confComp diria. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { classificarFonte, avaliarGateStaleness } = require("../../src/live/freshness");
const { criarConfig } = require("../../src/live/config");
const { criarNucleo } = require("../../src/live/nucleo");
const { relogioFixo, eventoComanda, eventoStatus, eventoFonte, CONFIG_TESTE } = require("./helpers");

const cfg = criarConfig(); // atrasada >= 90s · vencida >= 5min (chutes de dev declarados)
const AGORA = Date.parse("2026-07-11T19:10:00.000Z");
const isoAtras = (ms) => new Date(AGORA - ms).toISOString();

test("19. fonte com evento recente é 'atualizada'", () => {
  const c = classificarFonte({ ultimo_evento_em: isoAtras(10_000) }, AGORA, cfg.freshness);
  assert.equal(c.freshness_state, "atualizada");
  assert.equal(c.aparenta_atual, true);
  assert.equal(c.confianca_temporal, "plena");
});

test("20. fonte entre os limiares é 'atrasada' — contrato F3-03", () => {
  const c = classificarFonte({ ultimo_evento_em: isoAtras(120_000) }, AGORA, cfg.freshness);
  assert.equal(c.freshness_state, "atrasada");
  assert.equal(c.freshness_age_ms, 120_000); // idade explícita, fato preservado
  assert.equal(c.aparenta_atual, false);     // não pode parecer plenamente atual
  assert.equal(c.confianca_temporal, "reduzida");
  assert.equal(c.pode_participar_do_snapshot, true); // fatos observados não somem

  // comportamento padrão (conservador): recomendações sensíveis a tempo bloqueadas
  const gate = avaliarGateStaleness({ status: c, composicao: classificarFonte({ ultimo_evento_em: isoAtras(5_000) }, AGORA, cfg.freshness) }, cfg.freshness);
  assert.equal(gate.permitir_acao_dominante, false);
  assert.equal(gate.motivo, "fonte_atrasada_comportamento_bloquear");

  // comportamento alternativo configurável: permite com marca de não confiável
  const cfgMarcar = criarConfig({ freshness: { comportamentoAtrasada: "marcar_nao_confiavel" } });
  const gate2 = avaliarGateStaleness({ status: c, composicao: c }, cfgMarcar.freshness);
  assert.equal(gate2.permitir_acao_dominante, true);
  assert.equal(gate2.acao_dominante_confiavel, false); // nunca parece plena
});

test("21. fonte além do limite é 'vencida' e não sustenta recomendação nova", () => {
  const c = classificarFonte({ ultimo_evento_em: isoAtras(600_000) }, AGORA, cfg.freshness);
  assert.equal(c.freshness_state, "vencida");
  assert.equal(c.confianca_temporal, "nenhuma");
});

test("22. fonte desconectada: estado explícito com horário registrado", () => {
  const c = classificarFonte({
    ultimo_evento_em: isoAtras(30_000),
    desconectada_em: isoAtras(20_000)
  }, AGORA, cfg.freshness);
  assert.equal(c.freshness_state, "desconectada");
  assert.equal(c.freshness_reason, "fonte_declarou_desconexao");
});

test("23. sem evidência suficiente: 'desconhecida' (ex.: boot)", () => {
  const c = classificarFonte({}, AGORA, cfg.freshness);
  assert.equal(c.freshness_state, "desconhecida");
  assert.equal(c.freshness_age_ms, null); // idade não inventada
});

test("critério de aceite Addendum §4: status vencida ⇒ nenhuma ação dominante nova (fim a fim)", () => {
  // eventos antigos; relógio avança além do vencimento — caminho completo via núcleo
  const nucleo = criarNucleo({ agora: relogioFixo("2026-07-11T19:30:00.000Z"), config: CONFIG_TESTE });
  nucleo.receber(eventoComanda({ captured_at: "2026-07-11T19:29:30.000Z" })); // composição atualizada
  nucleo.receber(eventoStatus({ captured_at: "2026-07-11T19:00:00.000Z" }));  // status: 30 min atrás
  const snap = nucleo.snapshot();
  assert.equal(snap.fontes.sim_status.freshness_state, "vencida");
  assert.equal(snap.fontes.sim_comanda.freshness_state, "atualizada");
  assert.equal(snap.gate_staleness.permitir_acao_dominante, false);
  assert.equal(snap.gate_staleness.motivo, "fonte_de_status_vencida_ou_desconectada");
  // composição segue como dado observado (parcialidade declarada, não sumiço)
  assert.equal(snap.gate_staleness.permitir_decisao_composicao, true);
});

test("fonte_desconectada via evento: snapshot expõe desconexão; evento novo reconecta por evidência", () => {
  const nucleo = criarNucleo({ agora: relogioFixo("2026-07-11T19:10:00.000Z"), config: CONFIG_TESTE });
  nucleo.receber(eventoStatus({ captured_at: "2026-07-11T19:08:00.000Z" }));
  nucleo.receber(eventoFonte("fonte_desconectada", {
    source: "sim_status", captured_at: "2026-07-11T19:09:00.000Z"
  }));
  let snap = nucleo.snapshot();
  assert.equal(snap.fontes.sim_status.freshness_state, "desconectada");
  assert.equal(snap.gate_staleness.permitir_acao_dominante, false);

  nucleo.receber(eventoStatus({
    ifood_short: "0725", captured_at: "2026-07-11T19:09:30.000Z",
    idempotency_key: "status:sim_status:0725:2026-07-11:em_preparo"
  }));
  snap = nucleo.snapshot();
  assert.equal(snap.fontes.sim_status.freshness_state, "atualizada"); // vida observada
});

test("ambas vencidas ⇒ nenhuma recomendação nova; último snapshot confiável preservado", () => {
  const nucleo = criarNucleo({ agora: relogioFixo("2026-07-11T20:00:00.000Z"), config: CONFIG_TESTE });
  nucleo.receber(eventoComanda({ captured_at: "2026-07-11T19:00:05.000Z" }));
  nucleo.receber(eventoStatus({ captured_at: "2026-07-11T19:01:00.000Z" }));
  const snap = nucleo.snapshot();
  assert.equal(snap.gate_staleness.permitir_acao_dominante, false);
  assert.equal(snap.gate_staleness.permitir_acompanhar_tempo, false);
  assert.equal(snap.gate_staleness.motivo, "fontes_vencidas_ou_desconectadas");
  // os fatos observados continuam no snapshot, com estado das fontes explícito
  assert.equal(snap.pedidos.completos.length, 1);
});
