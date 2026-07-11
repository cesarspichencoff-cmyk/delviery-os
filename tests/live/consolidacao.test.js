/* Testes 7-12 e 29 da Fase 2: ordem comanda/status · parciais honestos ·
 * matched por identificador forte · conflict em colisão · proibição de merge
 * por proximidade temporal · parcial nunca exposto como completo. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { criarNucleo } = require("../../src/live/nucleo");
const { relogioFixo, eventoComanda, eventoStatus, CONFIG_TESTE } = require("./helpers");

const agora = relogioFixo("2026-07-11T19:10:00.000Z");

test("7. comanda antes do status: parcial primeiro, matched depois", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  nucleo.receber(eventoComanda());
  let snap = nucleo.snapshot();
  assert.equal(snap.pedidos.parciais.length, 1);
  assert.equal(snap.pedidos.parciais[0].match_state, "unmatched");

  nucleo.receber(eventoStatus());
  snap = nucleo.snapshot();
  assert.equal(snap.pedidos.completos.length, 1);
  assert.equal(snap.pedidos.completos[0].match_state, "matched");
});

test("8. status antes da comanda: preserva status/tempo sem inventar itens", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  nucleo.receber(eventoStatus());
  let snap = nucleo.snapshot();
  const p = snap.pedidos.parciais[0];
  assert.equal(p.match_state, "unmatched");
  assert.equal(p.comanda, null);               // nenhuma composição inventada
  assert.equal(p.status.coluna, "em_preparo"); // o que foi observado, preservado

  nucleo.receber(eventoComanda());
  snap = nucleo.snapshot();
  assert.equal(snap.pedidos.completos.length, 1);
});

test("9. pedido parcial: status sem comanda fica partial com fields_missing explícito", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  nucleo.receber(eventoStatus({ ifood_short: "0901" }));
  const snap = nucleo.snapshot();
  const p = snap.pedidos.parciais[0];
  assert.equal(p.qualidade.completeness, "partial");
  assert.ok(p.qualidade.fields_missing.includes("itens"));
  assert.equal(p.qualidade.source_partial, true);
  assert.equal(p.apto_para_decisao, false);
});

test("10. casamento matched por identificador forte (ifood_short único no dia)", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  nucleo.receber(eventoComanda({ pedido_interno: "0000170001", ifood_short: "0777" }));
  nucleo.receber(eventoStatus({ ifood_short: "0777" }));
  const snap = nucleo.snapshot();
  const p = snap.pedidos.completos[0];
  assert.equal(p.match_state, "matched");
  assert.equal(p.correlacao.motivo, "identificador_forte_unico_no_dia");
  assert.equal(p.comanda.pedido_interno, "0000170001");
  assert.equal(p.status.coluna, "em_preparo");
});

test("11. colisão de curto no dia vira conflict: nada apto, eventos preservados", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  nucleo.receber(eventoComanda({ pedido_interno: "0000170001", ifood_short: "0724", hash: "h1" }));
  nucleo.receber(eventoComanda({ pedido_interno: "0000170002", ifood_short: "0724", hash: "h2" }));
  nucleo.receber(eventoStatus({ ifood_short: "0724" }));
  const snap = nucleo.snapshot();
  assert.equal(snap.pedidos.completos.length, 0);
  assert.equal(snap.pedidos.conflitos.length, 3); // 2 comandas + 1 status
  for (const p of snap.pedidos.conflitos) {
    assert.equal(p.match_state, "conflict");
    assert.equal(p.apto_para_decisao, false);
    assert.equal(p.correlacao.motivo, "multiplos_candidatos_com_mesmo_identificador");
    assert.equal(p.correlacao.candidatos.length, 2); // registrados para diagnóstico
  }
  assert.equal(snap.qualidade.pedidos_em_conflito, 3);
});

test("12. proibido merge por proximidade temporal: o candidato 'mais próximo' NÃO é escolhido", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  // comanda A emitida no MESMO minuto do status; comanda B três horas antes.
  // Se alguém casasse por proximidade, escolheria A — o contrato exige conflict.
  nucleo.receber(eventoComanda({
    pedido_interno: "0000170010", ifood_short: "0555", hash: "hA",
    emissao: "2026-07-11T19:01:00.000Z", captured_at: "2026-07-11T19:01:00.000Z"
  }));
  nucleo.receber(eventoComanda({
    pedido_interno: "0000170011", ifood_short: "0555", hash: "hB",
    emissao: "2026-07-11T16:00:00.000Z", captured_at: "2026-07-11T16:00:05.000Z"
  }));
  nucleo.receber(eventoStatus({ ifood_short: "0555", captured_at: "2026-07-11T19:01:10.000Z" }));
  const snap = nucleo.snapshot();
  assert.equal(snap.pedidos.completos.length, 0); // ninguém casou "por estar perto"
  assert.equal(snap.pedidos.conflitos.length, 3);
  const comEventos = snap.pedidos.conflitos.filter((p) => p.comanda || p.status);
  assert.equal(comEventos.length, 3); // eventos originais preservados
});

test("29. pedido parcial nunca é exposto como completo no snapshot", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  nucleo.receber(eventoStatus({ ifood_short: "0888" }));
  nucleo.receber(eventoComanda({ pedido_interno: "0000170020", ifood_short: null }));
  const snap = nucleo.snapshot();
  assert.equal(snap.pedidos.completos.length, 0);
  assert.equal(snap.pedidos.parciais.length, 2);
  for (const p of snap.pedidos.parciais) {
    assert.notEqual(p.qualidade.completeness, "complete");
    assert.equal(p.apto_para_decisao, false);
  }
  // comanda sem identificador de casamento é partial (não unmatched)
  const soComanda = snap.pedidos.parciais.find((p) => p.comanda);
  assert.equal(soComanda.match_state, "partial");
});
