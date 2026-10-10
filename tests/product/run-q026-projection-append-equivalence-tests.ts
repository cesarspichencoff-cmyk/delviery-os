/**
 * Q-026 EXPERIMENTO: compara a projecao alterada com a versao publicada na
 * integracao validada d0716fd. Otimizar nao implica equivalencia.
 *
 * A baseline vem de git show no commit pinado e e carregada temporariamente
 * na pasta de origem para manter imports relativos. Removida ao final.
 * SOMENTE CI isolado. Sem banco, API ou ambiente operacional.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type { EventEnvelope, SourceMode } from "../../src/platform/contracts/event-catalog";
import { projetar as projetarOtimizada } from "../../src/platform/projections/operacao-viva";

const BASE_SHA = "d0716fda380fc66cecfd791593cb6cc8c017b37a";
const TEMP = resolve(process.cwd(), "src/platform/projections/__q026_baseline_generated.ts");
const instante = new Date("2026-10-09T20:00:00.000Z");
let identificador = 0;
function fato(n: number, seed: number): EventEnvelope {
  const idx = identificador++;
  const tipos = [
    "trip_created", "trip_started", "gps_batch_received", "arrival_detected",
    "delivery_confirmed", "trip_return_started", "trip_returned",
    "trip_closed", "occurrence_created",
  ] as const;
  const tipo = tipos[(n + seed * 3) % tipos.length];
  const modo: SourceMode = n % 13 === 0 ? "real" : n % 11 === 0 ? "control" : "simulated";
  const unidade = n % 7 === 0 ? "OUTRA-UNIDADE" : "ITAIM";
  return {
    event_id: "eq-" + idx,
    event_type: tipo,
    event_version: tipo + "@1.0.0",
    unit_id: unidade,
    trip_id: "T-" + ((n + seed) % 8),
    occurred_at: new Date(instante.getTime() - ((n * 131 + seed * 41) % 86400000)).toISOString(),
    received_at: new Date(instante.getTime() - ((n * 17 + seed * 19) % 86400000)).toISOString(),
    origin: "device",
    source_mode: modo,
    idempotency_key: (n % 19 === 0 ? "duplicate-" + seed + "-" + (n % 3) : "key-" + idx),
    device_id: "DEV-" + (n % 8),
    clock_trust: n % 11 === 0 ? "suspect" : "trusted",
    payload: {},
    sequence: n % 5 === 0 ? n : undefined,
  };
}
function relatorioTempo(fn: () => unknown) {
  const t = performance.now();
  const result = fn();
  return { ms: Math.round((performance.now() - t) * 100) / 100, result };
}
void (async () => {
  assert.ok(!existsSync(TEMP), "arquivo temporario preexistente — nao sobrescrever");
  const baselineSource = execFileSync("git", ["show", BASE_SHA + ":src/platform/projections/operacao-viva.ts"], {encoding:"utf8"});
  assert.ok(baselineSource.includes("eventos: [...atual.eventos, ev.event_id]"), "a baseline mudou: abortar");
  writeFileSync(TEMP, baselineSource);
  try {
    const legado = require(TEMP) as { projetar: typeof projetarOtimizada };
    assert.equal(typeof legado.projetar, "function");
    let provas = 0;
    for (let seed = 0; seed < 25; seed++) {
      const lista = Array.from({length: 180 + seed * 7}, (_,n) => fato(n, seed));
      for (const modo of ["real","simulated","control"] as const) {
        const opts={agora:instante,unit_id:"ITAIM",source_mode:modo};
        const esperado=legado.projetar(lista,opts);
        const recebido=projetarOtimizada(lista,opts);
        assert.deepEqual(recebido,esperado,"divergencia seed "+seed+" modo "+modo);
        const segundo=projetarOtimizada(lista,opts);
        assert.deepEqual(segundo,esperado);
        provas++;
      }
    }
    for (const n of [1000, 4000, 8000, 16000]) {
      const lista: EventEnvelope[] = Array.from({length:n}, (_,k) => ({
        event_id: "volume-"+k, event_type: k===0?"trip_started":"gps_batch_received",
        event_version:k===0?"trip_started@1.0.0":"gps_batch_received@1.0.0",
        unit_id:"ITAIM",trip_id:"LONGA",origin:"device",source_mode:"simulated",
        idempotency_key:"volume-key-"+k, payload:{},
        occurred_at:new Date(instante.getTime()-(n-k)*1000).toISOString(),
        received_at:new Date(instante.getTime()-(n-k)*1000).toISOString(),
      }));
      const op={agora:instante,unit_id:"ITAIM",source_mode:"simulated" as SourceMode};
      const antigo=relatorioTempo(()=>legado.projetar(lista,op));
      const novo=relatorioTempo(()=>projetarOtimizada(lista,op));
      assert.deepEqual(novo.result,antigo.result,"divergencia em volume "+n);
      provas++;
      console.log("Q026_APPEND_COMPARE fatos="+n+" baseline_ms="+antigo.ms+" optimized_ms="+novo.ms+
        " exact_equivalence=true");
    }
    assert.equal(provas,79);
    console.log("Q026_APPEND_EQUIVALENCE: "+provas+"/79 PASS; no production effects.");
  } finally {
    unlinkSync(TEMP);
  }
})().catch((e)=>{ console.error(e); process.exitCode=1; });
