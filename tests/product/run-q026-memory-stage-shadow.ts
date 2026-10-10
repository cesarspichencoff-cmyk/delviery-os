/**
 * Q-026 memory SHADOW: measures live V8 heap, native RSS and peak per phase.
 *
 * The real read path (lerFatosParaReplay -> projetar ->
 * lerRealidadeDeEntregas) reads only a database that THIS test created and
 * will dispose. No production credentials, no writes to production, no API.
 *
 * Results are diagnostics, NOT proof that memory is fixed or bounded in prod.
 * Run with NODE_OPTIONS=--expose-gc, otherwise fail (not a fake green).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { projetar } from "../../src/platform/projections/operacao-viva";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";

const url = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const N = Number(process.env.Q026_EVENTS ?? 100000);
if (!url) { console.error("PULADO: DELIVERYOS_PG_URL ausente"); process.exit(78); }
assert.ok(typeof global.gc === "function", "NODE_OPTIONS=--expose-gc obrigatorio");
assert.ok(Number.isSafeInteger(N) && N >= 1000 && N <= 1_030_000 && N % 1000 === 0);
const K = 1024 * 1024;
const AGORA = new Date();
function memoria() {
  const m = process.memoryUsage();
  return {
    rss_mib: +(m.rss / K).toFixed(1),
    heap_used_mib: +(m.heapUsed / K).toFixed(1),
    heap_total_mib: +(m.heapTotal / K).toFixed(1),
    external_mib: +(m.external / K).toFixed(1),
    array_buffers_mib: +(m.arrayBuffers / K).toFixed(1),
    peak_rss_mib: +(process.resourceUsage().maxRSS / 1024).toFixed(1),
  };
}
function registrar(stage: string, extras: Record<string, unknown> = {}) {
  console.log("Q026_MEMORY_STAGE " + JSON.stringify({ n: N, stage, ...memoria(), ...extras }));
}
async function coletar() {
  // Explicit GC is for retained object accounting; in production GC will be
  // triggered by the runtime at its own pace. OS RSS need not fall after GC.
  for (let i = 0; i < 3; i++) {
    global.gc?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
async function semear(q: { query(sql: string, params?: readonly unknown[]): Promise<unknown> }) {
  await q.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim Shadow')");
  const sql = [
    "INSERT INTO platform.event_log",
    "(event_id,unit_id,object_type,object_id,event_type,payload,",
    "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode)",
    "SELECT 'q026mem-'||g,'ITAIM','trip','Q026-M-'||((g-1)/1000)::integer,",
    "CASE WHEN (g-1)%1000=0 THEN 'trip_started' ELSE 'gps_batch_received' END,",
    "'{}'::jsonb, now()-(($1::bigint-g)::double precision*interval '0.1 seconds'),",
    "now(),'device','q026mem-key-'||g,",
    "CASE WHEN (g-1)%1000=0 THEN 'trip_started@1.0.0'",
    "ELSE 'gps_batch_received@1.0.0' END,",
    "'simulated' FROM generate_series($2::integer,$3::integer) AS g",
  ].join(" ");
  for (let a = 1; a <= N; a += 50000) {
    await q.query(sql, [N, a, Math.min(a + 49999, N)]);
  }
}
void (async () => {
  const b = await bancoIsolado(url, undefined, "q026mem");
  try {
    const tSeed = performance.now();
    await semear(b.cliente);
    const count = await b.cliente.query<{n: string}>("SELECT count(*) AS n FROM platform.event_log");
    assert.equal(Number(count[0].n), N);
    await coletar();
    registrar("seeded", { seed_ms: Math.round(performance.now() - tSeed) });

    // Read stage / materialization. This uses the REAL Q-016 decoder.
    async function perfReplay() {
      const inicio = performance.now();
      const leitura = await lerFatosParaReplay(b.cliente, TIPOS_DA_OPERACAO_VIVA);
      assert.equal(leitura.aptos.length, N);
      assert.equal(leitura.sem_modo, 0);
      await coletar();
      registrar("decoded-event-log", {
        read_ms: Math.round(performance.now() - inicio),
        event_count: leitura.aptos.length,
      });
      const t2 = performance.now();
      const resultado = projetar(leitura.aptos, {
        agora: AGORA, unit_id: "ITAIM", source_mode: "simulated",
      });
      assert.equal(resultado.viagens.length, N / 1000);
      const fatos = resultado.viagens.reduce((x, v) => x + v.eventos.length, 0);
      assert.equal(fatos, N);
      const digest = createHash("sha256")
        .update(JSON.stringify(resultado.viagens.map(v => [v.trip_id,v.estado,v.eventos.length])))
        .digest("hex");
      await coletar();
      registrar("decoded-and-projected", {
        projection_ms: Math.round(performance.now() - t2),
        trips: resultado.viagens.length, facts: fatos, digest,
      });
      return digest;
    }
    const digest = await perfReplay();
    await coletar();
    registrar("replay-returned-and-gc");

    // Original Entregas read path: collect multiple independent GET-equivalent
    // calls, WITHOUT retaining any result. Deliberately exercises retention.
    const heapHeld: number[] = [];
    const heapReleased: number[] = [];
    async function executarLeitura(i: number) {
      const t = performance.now();
      const result = await lerRealidadeDeEntregas(b.cliente, { agora: AGORA });
      assert.equal(result.projecoes.length, 1);
      assert.equal(result.projecoes[0].viagens.length, N / 1000);
      const soma = result.projecoes[0].viagens.reduce((s,v) => s+v.eventos.length,0);
      assert.equal(soma,N);
      await coletar();
      registrar("read-result-held", { iteration:i, read_ms:Math.round(performance.now()-t), trips:N/1000 });
      heapHeld.push(memoria().heap_used_mib);
    }
    for (let i = 1; i <= 3; i++) {
      await executarLeitura(i);
      await coletar();
      registrar("read-result-released-and-gc", { iteration:i });
      heapReleased.push(memoria().heap_used_mib);
    }
    registrar("after-three-results-and-gc", { heap_held_mib:heapHeld,heap_released_mib:heapReleased });
    console.log("Q026_MEMORY_PASS "+JSON.stringify({n:N,digest,three_reads:true,diagnostic_only:true}));
  } finally { await b.descartar(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
