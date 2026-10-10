/**
 * Q-026 load / concurrent reads, real PG16 but TEMPORARY migrations and
 * FICTIONAL test data only.  Two dataset sizes; 1/4/8 simultaneous readers.
 *
 * Assertions = data integrity, 1 MVCC transaction per request, no leaked
 * borrowed connections/transaction snapshots. Latency + memory are OBSERVED,
 * NEVER an invented SLO or evidence of production performance.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient, type SqlClient, type SqlRow, type TransactionalSqlClient } from "../../src/platform/persistence/sql-client";
import { lerRealidadeDeEntregas, type RealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";

const adminUrl=(process.env.DELIVERYOS_PG_URL||"").trim();
if(!adminUrl){
 console.error("PULADO: DELIVERYOS_PG_URL ausente; nenhum teste de carga foi executado");
 process.exit(78);
}
const NOW=new Date("2026-10-10T15:00:00.000Z");
const DEVICES=8,INITIAL_EACH=250,FINAL_EACH=2000;
type RoundResult={
 total_events:number;concurrent_readers:number;pool_max:number;
 wall_ms:number;latency_min_ms:number;latency_median_ms:number;
 latency_p95_ms:number;latency_max_ms:number;
 mvcc_transaction_max_ms:number;max_active_transactions:number;
 heap_after_mb:number;rss_after_mb:number;heap_delta_mb:number;
 projected_trips:number;projected_events_each_read:number;
};
const roundTo=(n:number)=>Math.round(n*100)/100;
const mb=(n:number)=>roundTo(n/1024/1024);
const percentile=(xs:number[],p:number)=>{
 const sorted=[...xs].sort((a,b)=>a-b);
 return sorted[Math.ceil(sorted.length*p)-1]??0;
};
async function seedDevices(db:SqlClient){
 await db.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim'),('LAB','Unidade teste')");
 await db.query(`INSERT INTO identity.device
 (device_id,unit_id,label,registered_at,secret_bound_at,last_session_at)
 SELECT 'fixture-dev-'||g, CASE WHEN g<=4 THEN 'ITAIM' ELSE 'LAB' END,
        'Device synthetic '||g, '2026-10-10T14:00:00Z'::timestamptz,
        '2026-10-10T14:00:00Z'::timestamptz,
        '2026-10-10T14:00:00Z'::timestamptz
 FROM generate_series(1,$1::int) AS g`,[DEVICES]);
}
async function seedRange(db:SqlClient,first:number,last:number){
 // Eight trip scopes, equally divided between simulated and control.
 // No fake real-world 'real' events or production customer identities.
 await db.query(`INSERT INTO platform.event_log
 (event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,
  recorded_at,origin,idempotency_key,contract_version,device_id,
  sequence_local,source_mode,clock_trust)
 SELECT 'q026-load-d'||d||'-e'||n,
        CASE WHEN d<=4 THEN 'ITAIM' ELSE 'LAB' END,
        'trip','Q026-TEST-TRIP-'||d,
        CASE WHEN n=1 THEN 'trip_created' WHEN n=2 THEN 'trip_started' ELSE 'gps_batch_received' END,
        '{}'::jsonb,
        '2026-10-10T14:10:00Z'::timestamptz + (n*5||' milliseconds')::interval,
        '2026-10-10T14:10:00Z'::timestamptz + (n*5||' milliseconds')::interval,
        'device','q026-load-key-d'||d||'-e'||n,
        CASE WHEN n=1 THEN 'trip_created@1.0.0'
             WHEN n=2 THEN 'trip_started@1.0.0'
             ELSE 'gps_batch_received@1.0.0' END,
        'fixture-dev-'||d,n,
        CASE WHEN d<=4 THEN 'simulated' ELSE 'control' END,
        'trusted'
 FROM generate_series(1,$1::int) AS d
 CROSS JOIN generate_series($2::int,$3::int) AS n`,
 [DEVICES,first,last]);
}
function checkData(v:RealidadeDeEntregas,perDevice:number){
 assert.equal(v.fonte,"postgresql");
 assert.equal(v.aparelhos.length,DEVICES);
 assert.equal(v.projecoes.length,4,
  "source_mode and units must remain independent (2 units x 2 modes)");
 const trips=v.projecoes.flatMap(p=>p.viagens);
 assert.equal(trips.length,DEVICES);
 for(const [i,t] of trips.entries()){
  assert.equal(t.eventos.length,perDevice,"trip event count must not be lost");
  assert.ok(t.trip_id.startsWith("Q026-TEST-TRIP-"));
 }
 for(let d=1;d<=DEVICES;d++){
  const a=v.aparelhos.find(a=>a.device_id==="fixture-dev-"+d);
  assert.ok(a,"missing fixture device");
  const mode=d<=4?"simulated":"control";
  assert.equal(a.fatos_por_modo[mode],perDevice-2);
  assert.equal(a.fatos_por_modo[d<=4?"control":"simulated"],0);
  assert.ok(a.ultimo_lote,"GPS not visible");
 }
 assert.equal(v.historico_sem_modo,0);
}
function instrument(base:TransactionalSqlClient,observe:{active:number;peak:number;txMs:number[]}){
 return {
  query:<R extends SqlRow=SqlRow>(q:string,p?:readonly unknown[])=>base.query<R>(q,p),
  close:async()=>undefined,
  async transaction<T>(f:(tx:SqlClient)=>Promise<T>):Promise<T>{
   observe.active++;observe.peak=Math.max(observe.peak,observe.active);
   const start=performance.now();
   try{return await base.transaction(f)}
   finally{observe.txMs.push(performance.now()-start);observe.active--;}
  },
 } as TransactionalSqlClient;
}
async function runRound(pool:TransactionalSqlClient,observer:SqlClient,total:number,
  simultaneous:number):Promise<RoundResult>{
 const obs={active:0,peak:0,txMs:[] as number[]};
 const reader=instrument(pool,obs);
 const heapBefore=process.memoryUsage().heapUsed;
 const wallStart=performance.now();
 const latencies=await Promise.all(Array.from({length:simultaneous},async()=>{
  const start=performance.now();
  const data=await lerRealidadeDeEntregas(reader,{agora:NOW});
  checkData(data,total/DEVICES);
  return performance.now()-start;
 }));
 const wall=performance.now()-wallStart;
 assert.equal(obs.active,0,"borrowed transaction not released after Promise.all");
 assert.equal(obs.txMs.length,simultaneous,"reader opened unexpected number of transactions");
 assert.ok(obs.peak>=1&&obs.peak<=simultaneous);
 const [{stillOpen}]=await observer.query<{stillOpen:number}>(`
 SELECT count(*)::int AS "stillOpen" FROM pg_stat_activity
 WHERE datname=current_database()
   AND pid<>pg_backend_pid()
   AND (state LIKE 'idle in transaction%' OR backend_xmin IS NOT NULL)
 `);
 assert.equal(stillOpen,0,"PG MVCC snapshot or idle transaction leaked after readers");
 const mem=process.memoryUsage();
 return{
  total_events:total,concurrent_readers:simultaneous,pool_max:4,
  wall_ms:roundTo(wall),
  latency_min_ms:roundTo(Math.min(...latencies)),
  latency_median_ms:roundTo(percentile(latencies,0.5)),
  latency_p95_ms:roundTo(percentile(latencies,0.95)),
  latency_max_ms:roundTo(Math.max(...latencies)),
  mvcc_transaction_max_ms:roundTo(Math.max(...obs.txMs)),
  max_active_transactions:obs.peak,
  heap_after_mb:mb(mem.heapUsed),rss_after_mb:mb(mem.rss),
  heap_delta_mb:mb(mem.heapUsed-heapBefore),
  projected_trips:DEVICES,projected_events_each_read:total,
 };
}
void(async()=>{
 const fixture=await bancoIsolado(adminUrl,undefined,"q026stress");
 const pool=await createPgClient({url:fixture.url,max:4,
  connectionTimeoutMillis:10000,statementTimeoutMs:20000});
 const observer=await createPgClient({url:fixture.url,max:1});
 let passed=0;
 const results:RoundResult[]=[];
 try{
  await seedDevices(fixture.cliente);
  await seedRange(fixture.cliente,1,INITIAL_EACH);
  for(const [count,fan] of [[2000,1],[2000,4]] as const){
   const r=await runRound(pool,observer,count,fan);
   results.push(r);passed++;
   console.log("PASS "+passed+" snapshot "+count+" events x "+fan+" reads");
  }
  await seedRange(fixture.cliente,INITIAL_EACH+1,FINAL_EACH);
  for(const [count,fan] of [[16000,1],[16000,4],[16000,8]] as const){
   const r=await runRound(pool,observer,count,fan);
   results.push(r);passed++;
   console.log("PASS "+passed+" snapshot "+count+" events x "+fan+" reads");
  }
  assert.deepEqual(results.map(r=>[r.total_events,r.concurrent_readers]),
   [[2000,1],[2000,4],[16000,1],[16000,4],[16000,8]]);
  passed++;console.log("PASS "+passed+" exact fixture scope and load matrix");
  console.log("Q026_STRESS_OBSERVATIONS "+JSON.stringify({
   source:"SYNTHETIC_DISPOSABLE_PG16",
   data_shape:"8 trips x 2 units x 2 source_modes",
   test_dimensions:results,
   memory_baseline:"NODE_HEAP_OBSERVED_WITH_GC_NOISE_NO_AB_COMPARISON",
   production_slo:"UNKNOWN",vacuum_under_load:"UNMEASURED",
   operational_representativeness:"NOT_ESTABLISHED",
  }));
  console.log("Q026_READ_CONCURRENCY: "+passed+"/6 PASS");
 }finally{
  await observer.close();await pool.close();await fixture.descartar();
 }
})().catch(e=>{console.error("Q026_READ_CONCURRENCY_FAILED",e);process.exitCode=1});
