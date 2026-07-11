/* Teste 24 da Fase 2 + F3-07: completeness "suspect" quando há
 * parsing_warnings; match_state exposto SEPARADO de completeness;
 * matched ≠ complete; complete ≠ atualizada; rasura nunca vira certeza. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { criarNucleo } = require("../../src/live/nucleo");
const { normalizarQualityDeEvento, calcularQualidadeConsolidado } = require("../../src/live/qualidade");
const { relogioFixo, eventoComanda, eventoStatus } = require("./helpers");

const agora = relogioFixo("2026-07-11T19:10:00.000Z");

test("24. parsing_warnings no evento de comanda tornam o consolidado 'suspect'", () => {
  const nucleo = criarNucleo({ agora });
  const ev = eventoComanda();
  ev.quality.parsing_warnings = ["linha_de_item_ilegivel"];
  nucleo.receber(ev);
  nucleo.receber(eventoStatus());
  const snap = nucleo.snapshot();
  // matched, mas NUNCA maquiado de completo: F3-07
  assert.equal(snap.pedidos.completos.length, 0);
  const p = snap.pedidos.parciais[0];
  assert.equal(p.match_state, "matched");            // casamento é um eixo…
  assert.equal(p.qualidade.completeness, "suspect"); // …completude é outro
  assert.ok(p.qualidade.motivos_suspeita.includes("parsing_warnings"));
  assert.equal(p.apto_para_decisao, false);
});

test("F3-07: matched não implica complete (status sem itens não completa nada)", () => {
  const pedido = {
    comanda: null,
    status: { coluna: "em_preparo" },
    parsing_warnings: [],
    conflito_revisao: false,
    alteracao_pendente_sem_base: false
  };
  const q = calcularQualidadeConsolidado(pedido);
  assert.equal(q.completeness, "partial");
  assert.ok(q.fields_missing.includes("itens"));
});

test("F3-07: complete não implica atualizada — freshness mora nas fontes, não na completude", () => {
  const nucleo = criarNucleo({ agora: relogioFixo("2026-07-11T20:00:00.000Z") });
  nucleo.receber(eventoComanda({ captured_at: "2026-07-11T19:00:05.000Z" }));
  nucleo.receber(eventoStatus({ captured_at: "2026-07-11T19:01:00.000Z" }));
  const snap = nucleo.snapshot();
  const p = snap.pedidos.completos[0];
  assert.equal(p.qualidade.completeness, "complete"); // dado completo…
  assert.equal(snap.fontes.sim_status.freshness_state, "vencida"); // …e vencido
  assert.equal(snap.gate_staleness.permitir_acao_dominante, false);
});

test("rasura: manual_correction_detected é null (não sabemos), nunca 'não houve'", () => {
  const q = normalizarQualityDeEvento({ completeness: "complete" });
  assert.equal(q.manual_correction_detected, null);
  assert.equal(q.manual_correction_possible, true);
  assert.equal(q.digital_state_may_differ_from_paper, true);

  const consolidado = calcularQualidadeConsolidado({
    comanda: { itens: [] }, status: { coluna: "pronto" },
    parsing_warnings: [], conflito_revisao: false, alteracao_pendente_sem_base: false
  });
  assert.equal(consolidado.manual_correction_detected, null);
});

test("quality ausente no evento vira 'unknown' com aviso — nunca certeza inventada", () => {
  const q = normalizarQualityDeEvento(undefined);
  assert.equal(q.completeness, "unknown");
  assert.ok(q.parsing_warnings.includes("quality_ausente_no_evento"));
});
