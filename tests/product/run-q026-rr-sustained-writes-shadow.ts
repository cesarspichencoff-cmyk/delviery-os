/**
 * Q-026 SHADOW. Paired ABBA reads of ACTUAL Entregas RR implementation.
 * PostgreSQL 16 disposable; writer in independent connection commits 30
 * individually paced events while the snapshot is open (25-70/sec synthetic).
 * Quiet control uses identical read path. 120k and 300k separate CI runners.
 *
 * This is NOT throughput/p95/p99 for actual restaurant: one synthetic trip,
 * a handful of samples, no real Android/API, and artificially paced INSERTs.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient, type TransactionalSqlClient, type SqlClient, type SqlRow } from "../../src/platform/persistence/sql-client";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";

const URL=(process.env.DELIVERYOS_PG_URL??"").trim();
const OUT=(process.env.Q026_RR_SCALE_RESULT??"").trim();
const N=Number(process.env.Q026_RR_SCALE_EVENTS);
if(!URL||!OUT||![120000,300000].includes(N))throw Error("Q026_RR_SCALE_ENV_REQUIRED");
const NOW=new Date("2026-10-10T16:00:00Z");
const WRITES=30;
const PACING_S=0.012;
const INITIAL="2026-10-09T19:00:00.000Z";
const SEQUENCE:["quiet"|"paced",boolean][]=[
  ["quiet",true],["paced",true], // warmup
  ["quiet",false],["paced",false],["paced",false],["quiet",false],
  ["paced",false],["quiet",false],["quiet",false],["paced",false]
];
type Sample={
  arm:"quiet"|"paced";iter:number;start_count:number;
  rr_wall_ms:number;mvcc_upper_ms:number;writer_ms:number;
  writer_commits:number;event_select_ms:number;latest_select_ms:number;
  counts_select_ms:number;max_rss_mib:number;peak_heap_mib:number;
  end_count:number;
};
const recorded:Sample[]=[];
const round=(v:number)=>+(v.toFixed(2));
const median=(values:number[])=>{
  assert.ok(values.length>0);
  const a=[...values].sort((x,y)=>x-y);
  return round((a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2);
};
void(async()=>{
 const db=await bancoIsolado(URL,undefined,"q026rrscale");
 const writer=await createPgClient({url:db.url,max:1,statementTimeoutMs:60000});
 const inspector=await createPgClient({url:db.url,max:1,statementTimeoutMs:60000});
 try {
  await db.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','synthetic')");
  await db.cliente.query(
   "INSERT INTO identity.device(device_id,unit_id,label,registered_at,secret_bound_at)"+
   " VALUES ('DEV1','ITAIM','synthetic','2026-09-01T10:00:00Z','2026-09-01T10:00:00Z')");
  const seed=[
    "INSERT INTO platform.event_log (event_id,unit_id,object_type,object_id,event_type,payload,",
    "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
    "SELECT 'rrscale-'||g,'ITAIM','trip','ONE-LONG','gps_batch_received','{}'::jsonb,",
    "TIMESTAMPTZ '"+INITIAL+"'+(g*interval '0.001 second'),",
    "TIMESTAMPTZ '"+INITIAL+"'+(g*interval '0.001 second'),",
    "'device','rrscale-k-'||g,'gps_batch_received@1.0.0','simulated',g,'DEV1','trusted'",
    "FROM generate_series($1::int,$2::int) g"
  ].join(" ");
  for(let first=1;first<=N;first+=25000){
   await db.cliente.query(seed,[first,Math.min(N,first+24999)]);
  }
  await db.cliente.query("ANALYZE platform.event_log");
  let cumulative=0;
  for(let iter=0;iter<SEQUENCE.length;iter++){
   const [arm,warmup]=SEQUENCE[iter];
   const before=N+cumulative;
   const s:Sample={arm,iter,start_count:before,rr_wall_ms:0,mvcc_upper_ms:0,
    writer_ms:0,writer_commits:0,event_select_ms:0,latest_select_ms:0,
    counts_select_ms:0,max_rss_mib:0,peak_heap_mib:0,end_count:0};
   let readerPid=0,readEvents=0,startedFacts=0,pinnedXmin:string|null=null;
   const writerHandle={current:null as Promise<void>|null};
   let writerError:unknown=null,writerFinishedAt=0;
   const startWrites=()=>{
     const w0=performance.now();
     writerHandle.current=(async()=>{
       for(let k=0;k<WRITES;k++){
         const id="paced-"+iter+"-"+k;
         // One autocommitted INSERT per event on a DIFFERENT PostgreSQL
         // connection. Slow down only the writer, not the reader.
         await writer.query(
           "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,"+
           "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)"+
           " VALUES ($1,'ITAIM','trip','ONE-LONG','gps_batch_received','{}'::jsonb,$2,$2,'device',$3,"+
           "'gps_batch_received@1.0.0','simulated',$4,'DEV1','trusted')",
           [id,"2026-10-10T13:00:00.000Z",id+"-key",N+cumulative+k+1]
         );
         s.writer_commits++;
         await writer.query("SELECT pg_sleep($1)",[PACING_S]);
       }
       s.writer_ms=round(performance.now()-w0);
       writerFinishedAt=performance.now();
     })().catch(e=>{writerError=e;throw e});
   };
   let rrCompleteAt=0;
   const intercept:TransactionalSqlClient={
    query:<R extends SqlRow=SqlRow>(sql:string,args?:readonly unknown[])=>db.cliente.query<R>(sql,args),
    close:async()=>undefined,
    transaction:async<T>(fn:(tx:SqlClient)=>Promise<T>):Promise<T>=>{
      const begun=performance.now();
      const result=await db.cliente.transaction(async tx=>{
        const tracked:SqlClient={query:async<R extends SqlRow=SqlRow>(sql:string,args?:readonly unknown[])=>{
          if(sql.includes("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")){
            const rows=await tx.query<R>(sql,args);
            const pid=await tx.query("SELECT pg_backend_pid()::int AS pid");
            readerPid=Number(pid[0].pid);
            return rows;
          }
          const eventSelect=sql.includes("FROM platform.event_log")&&/event_type\s*=\s*ANY/i.test(sql);
          const lastSelect=sql.includes("DISTINCT ON (device_id)");
          const countSelect=sql.includes("GROUP BY device_id, source_mode");
          if(eventSelect)startedFacts=performance.now();
          // Wait for all paced external commits BEFORE the last count SELECT;
          // the original RR snapshot must exclude them nonetheless.
          if(countSelect && writerHandle.current)await writerHandle.current;
          if(writerError)throw writerError;
          const t0=performance.now();
          const rows=await tx.query<R>(sql,args);
          const delta=performance.now()-t0;
          if(eventSelect)s.event_select_ms=round(delta);
          if(lastSelect)s.latest_select_ms=round(delta);
          if(countSelect)s.counts_select_ms=round(delta);
          if(eventSelect){
            readEvents++;
            assert.equal(readEvents,1);
            assert.ok(readerPid>0);
            const r=await inspector.query("SELECT backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[readerPid]);
            assert.equal(r.length,1);
            pinnedXmin=r[0].xmin===null?null:String(r[0].xmin);
            assert.ok(pinnedXmin,"RR did not pin xmin");
            if(arm==="paced")startWrites();
          }
          return rows;
        }};
        return fn(tracked);
      });
      rrCompleteAt=performance.now();
      s.rr_wall_ms=round(rrCompleteAt-begun);
      s.mvcc_upper_ms=round(rrCompleteAt-startedFacts);
      const r=await inspector.query("SELECT backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[readerPid]);
      assert.equal(r.length,1);
      assert.equal(r[0].xmin,null,"backend xmin not released after COMMIT");
      return result;
    }
   };
   try{
     const reality=await lerRealidadeDeEntregas(intercept,{agora:NOW});
     if(writerHandle.current)await writerHandle.current;
     assert.equal(readEvents,1);
     const trip=reality.projecoes.flatMap(p=>p.viagens).find(v=>v.trip_id==="ONE-LONG");
     assert.ok(trip);
     assert.equal(trip.eventos.length,before,"trip observed post-snapshot writer");
     const device=reality.aparelhos.find(v=>v.device_id==="DEV1");
     assert.ok(device);
     assert.equal(device.fatos_por_modo.simulated,before,"device count mixed snapshots");
     const out=await inspector.query("SELECT count(*)::int AS n FROM platform.event_log");
     const expectedOut=before+(arm==="paced"?WRITES:0);
     assert.equal(Number(out[0].n),expectedOut,"commits not all visible to observer");
     s.end_count=expectedOut;
     if(arm==="paced"){
       assert.equal(s.writer_commits,WRITES);
       assert.ok(writerFinishedAt>startedFacts&&writerFinishedAt<=rrCompleteAt,
         "writer not committed entirely inside RR lifetime");
       assert.ok(s.writer_ms>=WRITES*PACING_S*1000*0.7,
         "paced writer did not really run over sustained interval");
     }else{
       assert.equal(s.writer_commits,0);
     }
     s.max_rss_mib=round(process.memoryUsage().rss/1048576);
     s.peak_heap_mib=round(process.memoryUsage().heapUsed/1048576);
     assert.ok(s.rr_wall_ms>0&&s.mvcc_upper_ms>0);
     if(!warmup)recorded.push(s);
     cumulative+=s.writer_commits;
     console.log("Q026_RR_SCALE_SAMPLE "+JSON.stringify({...s,warmup}));
   }finally{
     // Don't silently leave the writer pending if a reader validation fails.
     if(writerHandle.current)await writerHandle.current.catch(()=>undefined);
   }
   global.gc?.();
  }
  assert.equal(recorded.length,8);
  for(const arm of ["quiet","paced"] as const){
    assert.equal(recorded.filter(r=>r.arm===arm).length,4);
  }
  const table=(arm:"quiet"|"paced")=>{
    const rows=recorded.filter(s=>s.arm===arm);
    return {samples:rows.length,
      median_wall_ms:median(rows.map(s=>s.rr_wall_ms)),
      max_wall_ms:round(Math.max(...rows.map(s=>s.rr_wall_ms))),
      median_mvcc_upper_ms:median(rows.map(s=>s.mvcc_upper_ms)),
      median_event_select_ms:median(rows.map(s=>s.event_select_ms)),
      median_latest_select_ms:median(rows.map(s=>s.latest_select_ms)),
      median_writer_ms:median(rows.map(s=>s.writer_ms)),
      max_rss_mib:round(Math.max(...rows.map(s=>s.max_rss_mib)))
    };
  };
  const proof={
    N, arm_quiet:table("quiet"),arm_paced:table("paced"),
    warmups:2,measured:8,external_insert_commits:cumulative,
    all_snapshots_consistent:true,all_backend_xmin_released:true,
    writer_events_per_paced_read:WRITES,writer_sleep_between_events_ms:12,
    samples:recorded,
    limits:["ABBA order not randomized; four observations per arm are not p95/p99",
      "paced 30 independent autocommit INSERTs with artificial 12ms delay",
      "single huge trip+unit; synthetic, not production concurrency/throughput",
      "pg buffers and autovacuum impact not measured",
      "the default reader still replays full history; not the compact design"]
  };
  writeFileSync(OUT,JSON.stringify(proof,null,2));
  console.log("Q026_RR_SUSTAINED_WRITES_SHADOW_PASS "+JSON.stringify({...proof,samples:undefined}));
 }finally{await writer.close();await inspector.close();await db.descartar()}
})().catch(e=>{console.error(e);process.exitCode=1});
