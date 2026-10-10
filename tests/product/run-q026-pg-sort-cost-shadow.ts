/** Q026 SHADOW: PostgreSQL sort cost. DB disposable; no runtime changes. */
import assert from "node:assert/strict";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import type { SqlRow } from "../../src/platform/persistence/sql-client";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";
const url=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!url)throw Error("Q026_PLANNER_NEEDS_DISPOSABLE_PG");
const LONG=120000,OTHERS=12000,N=LONG+OTHERS;
const query=[
 "SELECT event_id,unit_id,object_type,object_id,event_type,occurred_at,origin,",
 "device_id,sequence_local,idempotency_key,contract_version,source_mode,recorded_at,clock_trust",
 "FROM platform.event_log WHERE event_type = ANY($1)",
 "ORDER BY unit_id,source_mode NULLS LAST,object_type,object_id"
].join(" ");
type Plan={
 "Node Type"?:string; "Actual Rows"?:number; "Sort Method"?:string;
 "Sort Space Type"?:string; "Sort Space Used"?:number;
 "Temp Read Blocks"?:number;"Temp Written Blocks"?:number;
 "Index Name"?:string;Plans?:Plan[];
};
function visit(p:Plan,acc:Plan[]=[]):Plan[]{
 acc.push(p);for(const c of p.Plans??[])visit(c,acc);return acc;
}
function parse(r:SqlRow[]){
 assert.equal(r.length,1);
 const raw=r[0]["QUERY PLAN"] as unknown;
 const v:unknown=typeof raw==="string"?JSON.parse(raw):raw;
 assert.ok(Array.isArray(v)&&v.length===1,"EXPLAIN response invalid");
 const e=v[0] as Record<string,unknown>,p=e.Plan as Plan;
 assert.ok(p && typeof p==="object");
 assert.equal(p["Actual Rows"],N,"did not execute all rows");
 const nodes=visit(p), ms=Number(e["Execution Time"]);
 assert.ok(Number.isFinite(ms)&&ms>0);
 return {
  ms:+ms.toFixed(1),rows:p["Actual Rows"],top:p["Node Type"],
  sorts:nodes.filter(n=>n["Sort Method"]).map(n=>({
   method:n["Sort Method"],space_type:n["Sort Space Type"],space_kib:n["Sort Space Used"]
  })),
  temp_read_blocks:Math.max(0,...nodes.map(n=>Number(n["Temp Read Blocks"]??0))),
  temp_written_blocks:Math.max(0,...nodes.map(n=>Number(n["Temp Written Blocks"]??0))),
  indexes:nodes.map(n=>n["Index Name"]).filter(Boolean)
 };
}
void(async()=>{
 const b=await bancoIsolado(url,undefined,"q026sort");
 try{
  await b.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim Teste'),('LAB-BANCADA','Lab Teste')");
  const longSql=[
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id)",
   "SELECT 'q026pg-long-'||g,'ITAIM','trip','ONE-LONG',",
   "CASE WHEN g=1 THEN 'trip_started' ELSE 'gps_batch_received' END,",
   "'{}'::jsonb,TIMESTAMPTZ '2026-10-09T20:00:00Z'+(g*interval '0.05 second'),",
   "TIMESTAMPTZ '2026-10-09T20:00:00Z'+(g*interval '0.05 second'),",
   "'device','pg-sort-long-'||g,",
   "CASE WHEN g=1 THEN 'trip_started@1.0.0' ELSE 'gps_batch_received@1.0.0' END,",
   "'simulated',g,'DEV-01' FROM generate_series($1::int,$2::int) g"
  ].join(" ");
  for(let lo=1;lo<=LONG;lo+=30000)await b.cliente.query(longSql,[lo,Math.min(LONG,lo+29999)]);
  const otherSql=[
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id)",
   "SELECT 'q026pg-other-'||g,CASE WHEN g%2=0 THEN 'ITAIM' ELSE 'LAB-BANCADA' END,",
   "'trip','SHORT-'||((g-1)/60)::int,",
   "CASE WHEN g%60=1 THEN 'trip_started' ELSE 'gps_batch_received' END,",
   "'{}'::jsonb,TIMESTAMPTZ '2026-10-09T20:00:00Z'+(g*interval '0.01 second'),",
   "TIMESTAMPTZ '2026-10-09T20:00:00Z'+(g*interval '0.01 second'),",
   "'device','pg-sort-short-'||g,",
   "CASE WHEN g%60=1 THEN 'trip_started@1.0.0' ELSE 'gps_batch_received@1.0.0' END,",
   "CASE WHEN g%3=0 THEN 'real' WHEN g%3=1 THEN 'simulated' ELSE 'control' END,",
   "g,'DEV-02' FROM generate_series(1,$1::int) g"
  ].join(" ");
  await b.cliente.query(otherSql,[OTHERS]);
  // Verify UNIQUE(idempotency_key) with actual conflicting insert, NOT just a
  // comment in the schema. The duplicate must leave the event log unchanged.
  const dup=await b.cliente.query([
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id)",
   "SELECT 'q026pg-DUPLICATE',unit_id,object_type,object_id,event_type,payload,occurred_at,",
   "recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id",
   "FROM platform.event_log WHERE event_id='q026pg-long-1'",
   "ON CONFLICT (idempotency_key) DO NOTHING RETURNING event_id"
  ].join(" "));
  assert.equal(dup.length,0,"event_log accepted duplicate idempotency_key");
  const sizeCheck=await b.cliente.query("SELECT count(*)::int AS n FROM platform.event_log");
  assert.equal(Number(sizeCheck[0].n),N);
  await b.cliente.query("ANALYZE platform.event_log");
  async function explain(){
   return b.cliente.transaction(async tx=>{
    await tx.query("SET TRANSACTION READ ONLY");
    await tx.query("SET LOCAL work_mem='64kB'");
    return parse(await tx.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+query,[TIPOS_DA_OPERACAO_VIVA]));
   });
  }
  const beforeTrials=[await explain(),await explain(),await explain()];
  for(const b of beforeTrials){assert.equal(b.rows,N);assert.ok(b.sorts.length>0||b.indexes.length>0)}
  const before=beforeTrials[1];
  const size0=Number((await b.cliente.query(
   "SELECT pg_total_relation_size('platform.event_log'::regclass)::bigint AS size"
  ))[0].size);
  await b.cliente.query(
   "CREATE INDEX q026_shadow_cursor_idx ON platform.event_log (unit_id,source_mode,object_type,object_id)"
  );
  await b.cliente.query("ANALYZE platform.event_log");
  const afterTrials=[await explain(),await explain(),await explain()];
  for(const a of afterTrials)assert.equal(a.rows,N);
  const after=afterTrials[1];
  const indexSize=Number((await b.cliente.query(
   "SELECT pg_relation_size('platform.q026_shadow_cursor_idx'::regclass)::bigint AS size"
  ))[0].size);
  const size1=Number((await b.cliente.query(
   "SELECT pg_total_relation_size('platform.event_log'::regclass)::bigint AS size"
  ))[0].size);
  assert.equal(after.rows,N);
  assert.ok(indexSize>0&&size1>=size0);
  assert.ok(Math.abs(size1-size0-indexSize)<=8192,"table size grew unexpectedly");
  const result={events:N,long_trip:LONG,work_mem_kib:64,
   before,after,
   before_trials_ms:beforeTrials.map(x=>x.ms),
   after_trials_ms:afterTrials.map(x=>x.ms),
   before_median_ms:[...beforeTrials.map(x=>x.ms)].sort((a,b)=>a-b)[1],
   after_median_ms:[...afterTrials.map(x=>x.ms)].sort((a,b)=>a-b)[1],
   before_all_external_disk:beforeTrials.every(x=>x.sorts.some(s=>s.space_type==='Disk')),
   after_all_without_temp:afterTrials.every(x=>x.sorts.length===0&&x.temp_written_blocks===0),
   index_size_bytes:indexSize,
   table_before_bytes:size0,table_after_bytes:size1,
   postgres_rss_measured:false,
   note:"PG EXPLAIN three sequential measurements per variant; temp blocks not server RSS; not production p95"};
  console.log("Q026_PG_SORT_COST_PASS "+JSON.stringify(result));
 }finally{await b.descartar()}
})().catch(e=>{console.error(e);process.exitCode=1});
