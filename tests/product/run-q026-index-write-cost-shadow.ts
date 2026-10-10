/**
 * Q026 SHADOW: extra write/WAL cost of a HYPOTHETICAL cursor index.
 * Two disposable tables copied from original schema incl. original indexes.
 * No migrations, production DB, real data or HTTP.
 *
 * These copied tables intentionally do NOT reproduce all production triggers,
 * contention and hardware. Do not use these numbers as production TPS.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
const url=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!url)throw Error("Q026_WRITES_NEED_DISPOSABLE_POSTGRES");
const rowsPerTrial=10000;
type Measurement={variant:"bare"|"indexed";trial:number;ms:number;wal_bytes:number};
const results:Measurement[]=[];
void(async()=>{
 const b=await bancoIsolado(url,undefined,"q026write");
 try{
  // Including ALL copies PK/UNIQUE, existing indexes, defaults, CHECK etc.
  // CREATE TABLE LIKE never copies TRIGGERS, an explicit limit of the proof.
  await b.cliente.query("CREATE TABLE q026_write_bare (LIKE platform.event_log INCLUDING ALL)");
  await b.cliente.query("CREATE TABLE q026_write_indexed (LIKE platform.event_log INCLUDING ALL)");
  await b.cliente.query(
   "CREATE INDEX q026_write_hypothetical_idx ON q026_write_indexed (unit_id,source_mode,object_type,object_id)"
  );
  const tables={bare:"q026_write_bare",indexed:"q026_write_indexed"} as const;
  const insertTemplate=(table:string)=>[
   "INSERT INTO "+table+" (event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id)",
   "SELECT $1||'-'||g,CASE WHEN g%2=0 THEN 'ITAIM' ELSE 'LAB-BANCADA' END,",
   "'trip','W-'||((g-1)/120)::int,",
   "CASE WHEN g%120=1 THEN 'trip_started' ELSE 'gps_batch_received' END,",
   "'{}'::jsonb,TIMESTAMPTZ '2026-10-09T20:00:00Z'+(g*interval '0.05 second'),",
   "TIMESTAMPTZ '2026-10-09T20:00:00Z'+(g*interval '0.05 second'),",
   "'device',$1||'-key-'||g,",
   "CASE WHEN g%120=1 THEN 'trip_started@1.0.0' ELSE 'gps_batch_received@1.0.0' END,",
   "CASE WHEN g%3=0 THEN 'real' WHEN g%3=1 THEN 'simulated' ELSE 'control' END,",
   "g,'DEV-'||(g%8) FROM generate_series($2::int,$3::int) AS g"
  ].join(" ");
  const statements={bare:insertTemplate(tables.bare),indexed:insertTemplate(tables.indexed)};
  // Alternate order: 4 trials per arm = 80k rows, 8 write measurements.
  const schedule:(readonly ["bare"|"indexed",number])[]=[
   ["bare",0],["indexed",0],["indexed",1],["bare",1],
   ["bare",2],["indexed",2],["indexed",3],["bare",3]
  ];
  for(const [variant,trial] of schedule){
   const [pre]=await b.cliente.query("SELECT pg_current_wal_insert_lsn() AS lsn");
   const t0=performance.now();
   const prefix="q026-"+variant+"-t"+trial;
   const from=trial*rowsPerTrial+1;
   const to=from+rowsPerTrial-1;
   await b.cliente.query(statements[variant],[prefix,from,to]);
   const ms=performance.now()-t0;
   const [post]=await b.cliente.query("SELECT pg_current_wal_insert_lsn() AS lsn");
   const [diff]=await b.cliente.query("SELECT pg_wal_lsn_diff($1::pg_lsn,$2::pg_lsn)::bigint AS bytes",
    [String(post.lsn),String(pre.lsn)]);
   const wal_bytes=Number(diff.bytes);
   assert.ok(Number.isFinite(wal_bytes)&&wal_bytes>0,"WAL not measured");
   results.push({variant,trial,ms:+ms.toFixed(1),wal_bytes});
  }
  for(const variant of ["bare","indexed"] as const){
   const n=Number((await b.cliente.query("SELECT count(*)::int AS n FROM "+tables[variant]))[0].n);
   assert.equal(n,rowsPerTrial*4,"row count mismatch");
  }
  const indexBytes=Number((await b.cliente.query(
   "SELECT pg_relation_size('q026_write_hypothetical_idx'::regclass)::bigint AS bytes"
  ))[0].bytes);
  assert.ok(indexBytes>0);
  const median=(xs:number[])=>xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length/2)-1]+xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length/2)] ;
  // For even 4 samples, use average of middle two. Without floor or overflow.
  const med4=(xs:number[])=>{
   const s=[...xs].sort((a,b)=>a-b);assert.equal(s.length,4);
   return +(0.5*(s[1]+s[2])).toFixed(1);
  };
  const group=(v:"bare"|"indexed")=>{
   const rs=results.filter(r=>r.variant===v);
   assert.equal(rs.length,4);
   return {ms:rs.map(r=>r.ms),wal_bytes:rs.map(r=>r.wal_bytes),
     median_ms:med4(rs.map(r=>r.ms)),median_wal_bytes:med4(rs.map(r=>r.wal_bytes))};
  };
  const bare=group("bare"),indexed=group("indexed");
  const result={rows_per_variant:rowsPerTrial*4,
    measured_trials_per_variant:4,
    original_constraints_indexes_copied:true,
    production_triggers_copied:false,
    bare,indexed,
    hypothetical_index_bytes:indexBytes,
    median_insert_time_overhead_percent:+((indexed.median_ms/bare.median_ms-1)*100).toFixed(1),
    median_wal_overhead_percent:+((indexed.median_wal_bytes/bare.median_wal_bytes-1)*100).toFixed(1),
    caveat:"4 sequential runs with alternating order; synthetic DB, not production write SLA; no causal claim from milliseconds"
  };
  console.log("Q026_INDEX_WRITE_COST_PASS "+JSON.stringify(result));
 }finally{await b.descartar()}
})().catch(e=>{console.error(e);process.exitCode=1});
