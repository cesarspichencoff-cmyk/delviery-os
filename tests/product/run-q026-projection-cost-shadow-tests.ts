/**
 * Q-026: perfil SHADOW do custo de preservar a lista de event_ids da viagem.
 * Nao edita a projecao real. Sem banco, API, rede ou efeito real.
 * Times sao diagnósticos em CI: NAO criterium de aceite (hardware varia).
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import type { EventEnvelope } from "../../src/platform/contracts/event-catalog";
import { projetar } from "../../src/platform/projections/operacao-viva";

const AGORA = new Date("2026-10-09T19:00:00.000Z");
function eventos(qtd: number): EventEnvelope[] {
  const result: EventEnvelope[] = [];
  for (let i = 0; i < qtd; i++) {
    result.push({
      event_id: "q026-" + i,
      event_type: i === 0 ? "trip_started" : "gps_batch_received",
      event_version: (i === 0 ? "trip_started" : "gps_batch_received") + "@1.0.0",
      unit_id: "ITAIM",
      trip_id: "UNICA-VIAGEM",
      device_id: "DEV-1",
      occurred_at: new Date(AGORA.getTime() - (qtd-i) * 1000).toISOString(),
      origin: "device",
      source_mode: "simulated",
      idempotency_key: "key-" + i,
      payload: {},
    });
  }
  return result;
}
function clone(n: number): string[] {
  let a: string[] = [];
  for (let i = 0; i < n; i++) a = [...a, "e" + i];
  return a;
}
function append(n: number): string[] {
  const a: string[] = [];
  for (let i = 0; i < n; i++) a.push("e" + i);
  return a;
}
function medir(fn: () => unknown): number {
  const inicio = performance.now();
  fn();
  return Math.round((performance.now() - inicio) * 100) / 100;
}

let total = 0;
for (const n of [500, 1000, 2000, 4000, 8000]) {
  const entrada = eventos(n);
  const original = medir(() => {
    const p = projetar(entrada, { agora: AGORA, unit_id: "ITAIM", source_mode: "simulated" });
    assert.equal(p.viagens.length, 1);
    assert.equal(p.viagens[0].estado, "em_rota");
    assert.equal(p.viagens[0].eventos.length, n);
    assert.equal(p.viagens[0].eventos[0], "q026-0");
    assert.equal(p.viagens[0].eventos[n - 1], "q026-" + (n - 1));
  });
  const msClone = medir(() => clone(n));
  const msAppend = medir(() => append(n));
  assert.deepEqual(clone(n), append(n), "micro-otimizacao muda conteudo");
  const nCopias = n * (n - 1) / 2; // elementos antigos copiados no padrao [...array, id]
  total += 1;
  console.log("Q026_PROJECTION_COST n=" + n +
    " elements_copied=" + nCopias +
    " real_project_ms=" + original +
    " clone_ms=" + msClone +
    " append_ms=" + msAppend);
}
assert.equal(total, 5);
console.log("Q026_PROJECTION_COST: 5/5 PASS (perfil, nao prova de ganho em producao).");
