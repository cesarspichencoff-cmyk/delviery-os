/* Fase 3A — testes 1-4, 21-22: determinismo por seed, independência do
 * relógio real e do caminho temporário, limpeza do runtime. */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { executarCenario } = require("../../../tools/live/simulator/executor");
const { criarRelogioSimulado } = require("../../../tools/live/simulator/relogio");
const { criarAleatorio } = require("../../../tools/live/simulator/aleatorio");

const TZ = "America/Sao_Paulo";
const rodar = (opts) => executarCenario({ cenario: "fluxo_normal", seed: "semente-a", storeTimeZone: TZ, ...opts });

test("1. mesma seed gera exatamente os mesmos eventos", () => {
  const a = rodar({});
  const b = rodar({});
  assert.deepEqual(a.eventos, b.eventos); // ordem, ids, timestamps, payloads
});

test("2. mesma seed gera o mesmo snapshot_hash e o mesmo hash_resultado", () => {
  const a = rodar({});
  const b = rodar({});
  assert.equal(a.relatorio.snapshot_hash, b.relatorio.snapshot_hash);
  assert.equal(a.relatorio.hash_resultado, b.relatorio.hash_resultado);
});

test("3. seed diferente pode produzir outra execução válida", () => {
  const a = rodar({});
  const b = rodar({ seed: "semente-b" });
  // outra composição sintética => eventos diferentes, execução ainda válida
  assert.notDeepEqual(a.eventos, b.eventos);
  assert.equal(b.relatorio.pedidos.matched, 1); // válida: continua casando
  // e o PRNG em si é reproduzível
  const r1 = criarAleatorio("semente-x");
  const r2 = criarAleatorio("semente-x");
  assert.deepEqual(
    [r1.proximo(), r1.inteiro(1, 100), r1.escolher(["a", "b", "c"])],
    [r2.proximo(), r2.inteiro(1, 100), r2.escolher(["a", "b", "c"])]
  );
});

test("4. relógio simulado não depende do horário real da máquina", () => {
  const relogio = criarRelogioSimulado("2026-07-11T18:00:00.000Z");
  assert.equal(relogio.agora(), Date.parse("2026-07-11T18:00:00.000Z"));
  relogio.avancar(90_000);
  assert.equal(relogio.agoraIso(), "2026-07-11T18:01:30.000Z");
  assert.throws(() => relogio.avancarPara(0), /relogio_nao_anda_para_tras/);

  // fim a fim: os carimbos simulados são constantes conhecidas do cenário —
  // nunca derivados do "agora" real da máquina
  const r = rodar({});
  assert.equal(r.relatorio.inicio_simulado, "2026-07-11T18:00:00.000Z");
  assert.equal(r.relatorio.fim_simulado, "2026-07-11T18:01:20.000Z");
});

test("21. resultado não depende do caminho temporário", () => {
  const a = rodar({});
  const b = rodar({});
  assert.notEqual(a.runtimeRoot, b.runtimeRoot); // diretórios diferentes…
  assert.equal(a.relatorio.hash_resultado, b.relatorio.hash_resultado); // …mesmo hash
});

test("22. runtime temporário é limpo após a execução", () => {
  const semManter = rodar({});
  assert.ok(!fs.existsSync(semManter.runtimeRoot), "runtime deveria ter sido removido");

  const comManter = rodar({ manterRuntime: true });
  try {
    assert.ok(fs.existsSync(comManter.runtimeRoot)); // opção explícita preserva p/ inspeção
  } finally {
    fs.rmSync(comManter.runtimeRoot, { recursive: true, force: true });
  }
});
