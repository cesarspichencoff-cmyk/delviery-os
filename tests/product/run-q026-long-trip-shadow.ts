/**
 * Q-026 — teste adversarial de cauda longa: UMA viagem com 120 mil eventos.
 *
 * Demonstra que FETCH 4096 NAO limita a memoria se a unidade de agrupamento
 * inteira for retida ate aparecer a proxima viagem. Compara ViagemProjetada
 * inteira com a funcao canonica. Nenhum runtime alterado.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { envelopeDaMensagem } from "../../src/platform/projections/consumidor";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { projetar } from "../../src/platform/projections/operacao-viva";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";
import type { EventEnvelope } from "../../src/platform/contracts/event-catalog";

const url=(process.env.DELIVERYOS_PG_URL??"").trim();
const N=Number(process.env.Q026_LONG_TRIP_EVENTS??120000);
if(!url){console.error("PULADO: DELIVERYOS_PG_URL ausente");process.exit(78)}
assert.ok(Number.isSafeInteger(N)&&N>=10000&&N<=300000);
assert.equal(typeof global.gc,"function","GC explicito necessario para diagnostico");
const K=1024*1024;
const snap=()=>{
  const u=process.memoryUsage();
  return {rss_mib:+(u.rss/K).toFixed(1),heap_used_mib:+(u.heapUsed/K).toFixed(1),
    peak_rss_mib:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
};
const agora=new Date("2026-10-09T22:00:00.000Z");
void(async()=>{
  const b=await bancoIsolado(url,undefined,"q026lng");
  try{
    await b.cliente.query("INSERT INTO identity.unit (unit_id,display_name) VALUES ('ITAIM','Itaim Bench')");
    const sql=[
      "INSERT INTO platform.event_log (event_id,unit_id,object_type,object_id,event_type,payload,",
      "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode)",
      "SELECT 'q026long-'||g,'ITAIM','trip','ONE-LONG',",
      "CASE WHEN g=1 THEN 'trip_started' ELSE 'gps_batch_received' END,",
      "'{}', TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.05 seconds'),",
      "TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.05 seconds'),",
      "'device','q026long-key-'||g,",
      "CASE WHEN g=1 THEN 'trip_started@1.0.0' ELSE 'gps_batch_received@1.0.0' END,",
      "'simulated' FROM generate_series($1::integer,$2::integer) g"
    ].join(" ");
    for(let ini=1;ini<=N;ini+=30000)await b.cliente.query(sql,[ini,Math.min(N,ini+29999)]);

    let batches=0;
    const events:EventEnvelope[]=[];
    const t=performance.now();
    await b.cliente.transaction(async(tx)=>{
      await tx.query("SET TRANSACTION READ ONLY");
      await tx.query([
        "DECLARE q026long NO SCROLL CURSOR FOR",
        "SELECT event_id,unit_id,object_type,object_id,event_type,occurred_at,origin,device_id,",
        "sequence_local,idempotency_key,contract_version,source_mode,recorded_at,clock_trust",
        "FROM platform.event_log ORDER BY unit_id,source_mode,object_type,object_id"
      ].join(" "));
      for(;;){
        const rows=await tx.query("FETCH FORWARD 4096 FROM q026long");
        if(!rows.length)break;
        batches++;
        for(const l of rows){
          const time=(x:unknown)=>x instanceof Date?x.toISOString():new Date(String(x)).toISOString();
          const e=envelopeDaMensagem({
            outbox_id:"long:"+String(l.event_id),kind:String(l.event_type),
            idempotency_key:String(l.idempotency_key),
            payload:{
              event_id:l.event_id,event_type:l.event_type,event_version:l.contract_version,
              unit_id:l.unit_id,trip_id:l.object_id,occurred_at:time(l.occurred_at),
              received_at:time(l.recorded_at),clock_trust:l.clock_trust,
              source_mode:l.source_mode,origin:l.origin
            }
          });
          assert.ok(e);
          events.push(e);
        }
      }
      await tx.query("CLOSE q026long");
    });
    assert.equal(events.length,N);
    assert.ok(batches>=Math.ceil(N/4096));
    const before=snap();
    const result=projetar(events,{agora,unit_id:"ITAIM",source_mode:"simulated"});
    assert.equal(result.viagens.length,1);
    assert.equal(result.viagens[0].eventos.length,N);
    const after=snap();
    console.log("Q026_LONG_TRIP_SHADOW "+JSON.stringify({n:N,fetch_size:4096,batches,
      max_group_events:events.length,phase:"group-and-project",
      ms:Math.round(performance.now()-t),before,after}));
    const canonical=await lerFatosParaReplay(b.cliente,TIPOS_DA_OPERACAO_VIVA);
    assert.equal(canonical.aptos.length,N);
    const full=projetar(canonical.aptos,{agora,unit_id:"ITAIM",source_mode:"simulated"});
    assert.deepEqual(result.viagens,full.viagens,"uma viagem longa diverge do replay");
    console.log("Q026_LONG_TRIP_PASS "+JSON.stringify({n:N,trip_json_equivalent:true,
      conclusion:"fetch_size != max_group; one trip forces buffering N events",
      not_proven:"bounded memory for arbitrarily long trips"}));
  }finally{await b.descartar()}
})().catch(e=>{console.error(e);process.exitCode=1});
