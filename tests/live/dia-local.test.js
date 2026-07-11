/* F2-02 — DIA OPERACIONAL E FUSO DA LOJA: localDayKey converte para o fuso
 * IANA explícito da loja; virada de dia respeita a meia-noite LOCAL; sem
 * timezone válido não há casamento automático dependente de dia (UTC nunca é
 * assumido em silêncio). America/Sao_Paulo é exemplo DE TESTE (UTC-3 fixo). */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { localDayKey } = require("../../src/live/normalizar");
const { criarNucleo } = require("../../src/live/nucleo");
const { criarConfig } = require("../../src/live/config");
const { relogioFixo, eventoComanda, eventoStatus, CONFIG_TESTE } = require("./helpers");

const TZ = "America/Sao_Paulo";
const agora = relogioFixo("2026-07-11T19:10:00.000Z");

test("F2-02: antes da meia-noite local ainda é o dia anterior da loja", () => {
  // 02:59Z = 23:59 do dia 10 em BRT
  assert.equal(localDayKey("2026-07-11T02:59:00.000Z", TZ), "2026-07-10");
});

test("F2-02: depois da meia-noite local vira o dia seguinte da loja", () => {
  // 03:01Z = 00:01 do dia 11 em BRT
  assert.equal(localDayKey("2026-07-11T03:01:00.000Z", TZ), "2026-07-11");
});

test("F2-02: timestamp UTC que pertence ao dia ANTERIOR no Brasil", () => {
  // prefixo ISO diria 2026-07-11; a loja ainda vive 2026-07-10
  assert.equal(localDayKey("2026-07-11T01:30:00.000Z", TZ), "2026-07-10");
  // mesmo instante físico escrito com offset -03:00: mesmo dia local
  assert.equal(localDayKey("2026-07-10T22:30:00-03:00", TZ), "2026-07-10");
});

test("F2-02: timestamp UTC que pertence ao dia SEGUINTE no fuso local (leste)", () => {
  // 22:00Z do dia 11 já é 07:00 do dia 12 em Tóquio
  assert.equal(localDayKey("2026-07-11T22:00:00.000Z", "Asia/Tokyo"), "2026-07-12");
});

test("F2-02: timezone ausente ou inválido => null, nunca UTC silencioso", () => {
  assert.equal(localDayKey("2026-07-11T12:00:00.000Z", undefined), null);
  assert.equal(localDayKey("2026-07-11T12:00:00.000Z", ""), null);
  assert.equal(localDayKey("2026-07-11T12:00:00.000Z", "Fuso/Inexistente"), null);
  assert.equal(localDayKey("nao-e-data", TZ), null);
});

test("F2-02: mesmo curto em DIAS LOCAIS diferentes não casa", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  // comanda emitida 23:30 local do dia 10 (02:30Z do dia 11)
  nucleo.receber(eventoComanda({
    occurred_at: "2026-07-11T02:30:00.000Z", captured_at: "2026-07-11T02:30:05.000Z"
  }));
  // status do MESMO curto, mas já no dia local 11
  nucleo.receber(eventoStatus({ captured_at: "2026-07-11T12:00:00.000Z" }));
  const snap = nucleo.snapshot();
  assert.equal(snap.pedidos.completos.length, 0); // dias locais diferentes: sem casamento
  assert.equal(snap.pedidos.parciais.length, 2);
});

test("F2-02: mesmo dia LOCAL atravessando a fronteira do dia UTC casa normalmente", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  // 22:00 local do dia 10 (01:00Z do dia 11) e 23:30 local do dia 10 (02:30Z)
  nucleo.receber(eventoStatus({
    captured_at: "2026-07-11T01:00:00.000Z", dia: "2026-07-10"
  }));
  nucleo.receber(eventoComanda({
    occurred_at: "2026-07-11T02:30:00.000Z", captured_at: "2026-07-11T02:30:05.000Z"
  }));
  const snap = nucleo.snapshot();
  assert.equal(snap.pedidos.completos.length, 1); // mesmo dia da loja: matched
  assert.equal(snap.pedidos.completos[0].comanda.dia, "2026-07-10");
});

test("F2-02: sem storeTimeZone o núcleo NÃO casa por dia — parciais honestos", () => {
  const nucleo = criarNucleo({ agora, config: criarConfig() }); // sem fuso
  nucleo.receber(eventoComanda());
  nucleo.receber(eventoStatus());
  const snap = nucleo.snapshot();
  assert.equal(snap.pedidos.completos.length, 0);
  assert.equal(snap.pedidos.parciais.length, 2);
  for (const p of snap.pedidos.parciais) {
    assert.equal(p.correlacao.motivo, "sem_dia_operacional_confiavel");
    assert.equal(p.apto_para_decisao, false);
  }
});

test("F2-02: timezone INVÁLIDO comporta-se como ausente (sem casamento)", () => {
  const nucleo = criarNucleo({
    agora, config: criarConfig({ storeTimeZone: "Fuso/Inexistente" })
  });
  nucleo.receber(eventoComanda());
  nucleo.receber(eventoStatus());
  const snap = nucleo.snapshot();
  assert.equal(snap.pedidos.completos.length, 0);
  assert.equal(snap.pedidos.parciais.length, 2);
});
