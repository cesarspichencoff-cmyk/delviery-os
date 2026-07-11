/* F2-03 — CAPTURED_AT NO FUTURO: um relógio adiantado não pode manter a fonte
 * artificialmente atualizada. Comparação determinística captured_at ×
 * received_at; tolerância configurável (chute de dev declarado); idade nunca
 * negativa; replay independe do horário real da máquina. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { criarNucleo } = require("../../src/live/nucleo");
const { criarArmazenamento } = require("../../src/live/persistir");
const { reconstruirDoLog } = require("../../src/live/reconstruir");
const { classificarFonte } = require("../../src/live/freshness");
const { relogioFixo, eventoComanda, eventoStatus, CONFIG_TESTE } = require("./helpers");

const AGORA = "2026-07-11T19:10:00.000Z";
const agora = relogioFixo(AGORA);
const AGORA_MS = Date.parse(AGORA);
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "deliveryos-live-skew-"));
const limpar = (dir) => fs.rmSync(dir, { recursive: true, force: true });

test("F2-03: skew pequeno dentro da tolerância não penaliza (fonte atualizada)", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  // 30s à frente do received_at — dentro da tolerância de dev (2min)
  const r = nucleo.receber(eventoComanda({ captured_at: "2026-07-11T19:10:30.000Z" }));
  assert.equal(r.aceito, true);
  const snap = nucleo.snapshot();
  assert.equal(snap.fontes.sim_comanda.freshness_state, "atualizada");
  const p = snap.pedidos.parciais[0];
  assert.ok(!p.parsing_warnings.includes("relogio_inconsistente_captured_at_futuro"));
});

test("F2-03: skew acima da tolerância — suspect, warning, fonte não fica fresca", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  // 10 minutos no futuro
  const r = nucleo.receber(eventoComanda({ captured_at: "2026-07-11T19:20:00.000Z" }));
  assert.equal(r.aceito, true); // o fato observado não é descartado…
  const snap = nucleo.snapshot();
  const p = snap.pedidos.parciais[0];
  assert.equal(p.qualidade.completeness, "suspect"); // …mas nunca parece confiável
  assert.ok(p.qualidade.parsing_warnings.includes("relogio_inconsistente_captured_at_futuro"));
  // a fonte NÃO é classificada como atualizada por causa do carimbo futuro
  assert.notEqual(snap.fontes.sim_comanda.freshness_state, "atualizada");
  assert.equal(snap.fontes.sim_comanda.last_trusted_at, null); // nunca avança
  assert.equal(snap.fontes.sim_comanda.ultimo_evento_em, null);
});

test("F2-03: timestamp muito no futuro (1h) — mesmo tratamento, sem exceção", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  nucleo.receber(eventoStatus({ captured_at: "2026-07-11T20:10:00.000Z" }));
  const snap = nucleo.snapshot();
  assert.notEqual(snap.fontes.sim_status.freshness_state, "atualizada");
  assert.equal(snap.fontes.sim_status.last_trusted_at, null);
  // sem status confiável, o gate segue fechado
  assert.equal(snap.gate_staleness.permitir_acao_dominante, false);
});

test("F2-03: freshness_age_ms nunca é negativo", () => {
  // dentro da tolerância: idade trunca em 0, nunca negativa
  const dentro = classificarFonte(
    { ultimo_evento_em: "2026-07-11T19:10:30.000Z" }, AGORA_MS, CONFIG_TESTE.freshness);
  assert.equal(dentro.freshness_age_ms, 0);
  assert.ok(dentro.freshness_age_ms >= 0);
  // além da tolerância: desconhecida com motivo explícito, idade ainda >= 0
  const alem = classificarFonte(
    { ultimo_evento_em: "2026-07-11T20:10:00.000Z" }, AGORA_MS, CONFIG_TESTE.freshness);
  assert.equal(alem.freshness_state, "desconhecida");
  assert.equal(alem.freshness_reason, "relogio_inconsistente_carimbo_no_futuro");
  assert.ok(alem.freshness_age_ms >= 0);
});

test("F2-03: status futuro sem occurred_at não ordena a coluna vigente", () => {
  const nucleo = criarNucleo({ agora, config: CONFIG_TESTE });
  nucleo.receber(eventoStatus({ coluna: "em_preparo", captured_at: "2026-07-11T19:05:00.000Z" }));
  // "pronto" com relógio 10min à frente: registrado, mas não vira verdade de ordem
  nucleo.receber(eventoStatus({
    coluna: "pronto", captured_at: "2026-07-11T19:20:00.000Z",
    idempotency_key: "status:sim_status:0724:2026-07-11:pronto"
  }));
  const snap = nucleo.snapshot();
  const p = snap.pedidos.parciais[0];
  assert.equal(p.status.coluna, "em_preparo"); // coluna vigente não avança no escuro
  const suspeito = p.status.historico.find((h) => h.coluna === "pronto");
  assert.equal(suspeito.carimbo_suspeito, true); // mas a observação fica registrada
});

test("F2-03: replay produz o MESMO veredito de skew, independente do relógio da máquina", () => {
  const dir = tempDir();
  try {
    const arm = criarArmazenamento({ runtimeRoot: dir });
    const nucleo = criarNucleo({ armazenamento: arm, agora, config: CONFIG_TESTE });
    nucleo.receber(eventoComanda({ captured_at: "2026-07-11T19:20:00.000Z" })); // skew 10min
    nucleo.receber(eventoStatus({ captured_at: "2026-07-11T19:09:00.000Z" }));  // normal
    const antes = nucleo.snapshot();

    // reconstrução com o relógio 2 horas depois: a decisão de skew é a mesma
    // porque compara captured_at × received_at PERSISTIDO, não o agora.
    const { nucleo: renascido } = reconstruirDoLog({
      runtimeRoot: dir, agora: relogioFixo("2026-07-11T21:10:00.000Z"), config: CONFIG_TESTE
    });
    const depois = renascido.snapshot();
    assert.deepEqual(depois.pedidos, antes.pedidos); // mesmo suspect, mesmos avisos
    assert.equal(depois.fontes.sim_comanda.last_trusted_at, null);
  } finally { limpar(dir); }
});
