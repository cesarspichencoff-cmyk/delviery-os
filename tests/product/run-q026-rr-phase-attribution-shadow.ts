/**
 * Q-026 SHADOW: attribute full canonical RR reader wall time between
 * PostgreSQL transaction and post-transaction projection/mapping.
 * No production code change; disposable PG16, synthetic events only.
 *
 * Do not call post-transaction duration "pure CPU": it may include GC and
 * JS scheduling. This measures phases, not causal microprofiling.
 */
import assert from "node:assert/strict";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import type { SqlClient, SqlRow, TransactionalSqlClient } from "../../src/platform/persistence/sql-client";

const base=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!base){console.error("Q026_PHASE_PROBE_PG_REQUIRED");process.exit(78)}
const N=Number(process.env.Q026_PHASE_PROBE_EVENTS??120000);
assert.ok([120000,300000].includes(N),"only tested synthetic volumes");
const round=(n:number)=>+n.toFixed(2);
const delay=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
const kind=(sql:string)=>{
 if(sql.includes("SET TRANSACTION"))return "rr_setup";
 if(sql.includes("pg_backend_pid"))return "pid";
 if(sql.includes("FROM identity.device"))return "devices";
 if(sql.includes("SELECT DISTINCT ON"))return "last_gps";
 if(sql.includes("GROUP BY device_id"))return "gps_counts";
 if(sql.includes("FROM platform.event_log"))return "full_event_replay";
 return "other";
};
type QueryStat={kind:string;wall_ms:number;rows:number};
void(async()=>{
 const b=await bancoIsolado(base,undefined,"q026phase");
 try{
  await b.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Synthetic')");
  await b.cliente.query(
   "INSERT INTO identity.device(device_id,unit_id,label,registered_at) "+
   "VALUES ('Q026-PHASE-DEVICE','ITAIM','Synthetic','2026-10-09T00:00:00Z')");
  const insert=[
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
   "SELECT 'phase-'||g,'ITAIM','trip','TRIP-PHASE','gps_batch_received','{}'::jsonb,",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.01 second'),",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.01 second'),",
   "'device','phase-key-'||g,'gps_batch_received@1.0.0','simulated',g,'Q026-PHASE-DEVICE','trusted'",
   "FROM generate_series($1::int,$2::int) g"
  ].join(" ");
  for(let i=1;i<=N;i+=30000)await b.cliente.query(insert,[i,Math.min(i+29999,N)]);
  await b.cliente.query("ANALYZE platform.event_log");
  const queries:QueryStat[]=[];
  let transactionMs=0;
  let queryTotalMs=0;
  let txStartAt=0;
  let txEndedAt=0;
  const tracked:TransactionalSqlClient={
   query:<R extends SqlRow=SqlRow>(sql:string,p?:readonly unknown[])=>b.cliente.query<R>(sql,p),
   close:async()=>{},
   transaction:<T>(fn:(tx:SqlClient)=>Promise<T>):Promise<T>=>{
    txStartAt=performance.now();
    return b.cliente.transaction(async(tx:SqlClient)=>{
      const wrapped:SqlClient={
       query:async<R extends SqlRow=SqlRow>(sql:string,params?:readonly unknown[]):Promise<R[]>=>{
        const t=performance.now();
        const rows=await tx.query<R>(sql,params);
        const elapsed=performance.now()-t;
        queryTotalMs+=elapsed;
        queries.push({kind:kind(sql),wall_ms:round(elapsed),rows:rows.length});
        return rows;
       }
      };
      return fn(wrapped);
    }).finally(()=>{
      txEndedAt=performance.now();
      transactionMs=txEndedAt-txStartAt;
    });
   }
  };
  const e=monitorEventLoopDelay({resolution:10});
  e.enable();await delay(50);
  const rssBefore=process.memoryUsage().rss/1048576;
  const t=performance.now();
  const reality=await lerRealidadeDeEntregas(tracked,{agora:new Date("2026-10-10T18:00:00Z")});
  const finished=performance.now();
  await delay(40);e.disable();
  assert.equal(reality.aparelhos.length,1);
  assert.ok(reality.projecoes.length>=1);
  assert.ok(txStartAt>0&&txEndedAt>txStartAt);
  const duration=finished-t;
  const projected=finished-txEndedAt;
  assert.ok(projected>=0&&projected<=duration);
  assert.ok(queries.some(x=>x.kind==="full_event_replay"&&x.rows===N),
    "canonical replay did not materialize all synthetic facts");
  console.log("Q026_RR_PHASE_ATTRIBUTION_SHADOW_MEASURED "+JSON.stringify({
    synthetic_events:N,projection_groups:reality.projecoes.length,
    reader_wall_ms:round(duration),
    transaction_wall_ms:round(transactionMs),
    sql_statements_total_ms:round(queryTotalMs),
    post_transaction_model_ms:round(projected),
    post_transaction_fraction_pct:round(100*projected/duration),
    query_stats:queries,
    event_loop_max_ms:round(e.max/1e6),
    rss_before_mib:round(rssBefore),
    rss_after_mib:round(process.memoryUsage().rss/1048576),
    boundary:"single-process synthetic PG16, post phase includes GC/scheduling, not production"
  }));
 }finally{await b.descartar()}
})().catch(e=>{console.error("Q026_RR_PHASE_ATTRIBUTION_SHADOW_FAILED",e);process.exitCode=1});
