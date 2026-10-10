/**
 * Q-026 SHADOW: duration of the ACTUAL one-snapshot RR Entregas reader
 * with a real concurrent PostgreSQL writer and large synthetic event log.
 *
 * One disposable DB per job (120k or 300k), 1 warmup + 4 measured reads.
 * The writer commits ONE event after the first event_log SELECT has already
 * established RR snapshot, but before device-last and device-count queries.
 * The test compares RR transaction wall against full reader wall, statement
 * timing, backend_xmin while active and release on return.
 *
 * No production data, no schema/runtime migrations; samples are NOT p95/p99
 * of the real restaurant, nor a PostgreSQL server memory benchmark.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient,type SqlClient,type SqlRow,type TransactionalSqlClient } from "../../src/platform/persistence/sql-client";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";

const url=(process.env.DELIVERYOS_PG_URL??"").trim();
const path=(process.env.Q026_DURATION_RESULT??"").trim();
const N=Number(process.env.Q026_DURATION_N);
const MEASURED=N>=1000000?1:4, WARMUPS=N>=1000000?0:1, TOTAL=MEASURED+WARMUPS;
if(!url||!path||![120000,300000,1030000].includes(N))throw Error("Q026_DURATION_PARAMETERS_MISSING_OR_INVALID");
const NOW=new Date("2026-10-10T16:00:00Z");
const baseMoment="2026-10-09T20:00:00Z";
const round=(x:number)=>+(x.toFixed(2));
const quantile=(xs:number[],p:number)=>[...xs].sort((a,b)=>a-b)[Math.max(0,Math.ceil(xs.length*p)-1)];
type Sample={rep:number;wall_ms:number;total_reader_ms:number;post_commit_ms:number;query_ms:number;writer_ms:number;xmin_age_ms:number;snapshot_upper_ms:number;
  event_read_ms:number;devices_ms:number;latest_ms:number;counts_ms:number;
  events:number;rss_mib:number};
const data:Sample[]=[];
void(async()=>{
const db=await bancoIsolado(url,undefined,"q026rrdur");
const writer=await createPgClient({url:db.url,max:1,statementTimeoutMs:60000});
const observer=await createPgClient({url:db.url,max:1,statementTimeoutMs:60000});
try{
  await db.cliente.query(
    "INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim - Synthetic')");
  await db.cliente.query(
    "INSERT INTO identity.device(device_id,unit_id,label,registered_at,secret_bound_at) "+
    "VALUES ('DEV-1','ITAIM','Synthetic device','2026-09-01T10:00:00Z','2026-09-01T10:00:00Z')");
  // All rows belong to one trip: costs of the current O(N) replay and
  // projecting an unbounded trip are included, unlike compact-shadow tests.
  const seed=[
    "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
    "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
    "SELECT 'duration-'||g,'ITAIM','trip','T-LONG','gps_batch_received','{}'::jsonb,",
    "TIMESTAMPTZ '"+baseMoment+"'+(g*interval '0.01 second'),",
    "TIMESTAMPTZ '"+baseMoment+"'+(g*interval '0.01 second'),",
    "'device','duration-key-'||g,'gps_batch_received@1.0.0','simulated',g,'DEV-1','trusted'",
    "FROM generate_series($1::integer,$2::integer) g"
  ].join(" ");
  for(let start=1;start<=N;start+=20000){
    await db.cliente.query(seed,[start,Math.min(N,start+19999)]);
  }
  await db.cliente.query("ANALYZE platform.event_log");
  for(let rep=0;rep<TOTAL;rep++){
    let pid=0,hooked=0,xminSeen=false,writerMs=NaN,xminAt=0,afterXmin=0,firstFactsAt=0;
    const segments={events:0,devices:0,latest:0,counts:0,total:0};
    let txEndedAt=0;
    const writerId="q026-duration-append-"+rep;
    const expected=N+rep;
    const intercepted:TransactionalSqlClient={
      query:<R extends SqlRow=SqlRow>(s:string,p?:readonly unknown[])=>db.cliente.query<R>(s,p),
      close:async()=>undefined,
      transaction:async<T>(fn:(tx:SqlClient)=>Promise<T>):Promise<T>=>{
        const started=performance.now();
        const result=await db.cliente.transaction(async tx=>{
          const proxy:SqlClient={query:async<R extends SqlRow=SqlRow>(s:string,p?:readonly unknown[])=>{
            if(s.includes("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")){
              const rows=await tx.query<R>(s,p);
              const backend=await tx.query("SELECT pg_backend_pid()::int AS pid");
              pid=Number(backend[0].pid);
              return rows;
            }
            const tag=s.includes("FROM platform.event_log")&&/event_type\s*=\s*ANY/i.test(s)?"events":
              s.includes("FROM identity.device")?"devices":
              s.includes("DISTINCT ON (device_id)")?"latest":
              s.includes("GROUP BY device_id, source_mode")?"counts":"other";
            const t0=performance.now();
            if(tag==="events")firstFactsAt=t0;
            const rows=await tx.query<R>(s,p);
            const dt=performance.now()-t0;
            if(tag==="events"||tag==="devices"||tag==="latest"||tag==="counts")segments[tag]+=dt;
            segments.total+=dt;
            if(tag==="events"&&hooked===0){
              hooked++;
              assert.ok(pid>0,"missing real RR backend PID");
              const state=await observer.query("SELECT backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[pid]);
              assert.equal(state.length,1);
              assert.ok(state[0].xmin,"RR backend_xmin not pinned after first SELECT");
              xminSeen=true;
              xminAt=performance.now();
              const w0=performance.now();
              await writer.query(
                "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,"+
                "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust) "+
                "VALUES ($1,'ITAIM','trip','T-LONG','gps_batch_received','{}'::jsonb,$2,$2,'device',$3,"+
                "'gps_batch_received@1.0.0','simulated',$4,'DEV-1','trusted')",
                [writerId,"2026-10-10T13:00:00.000Z",writerId+"-key",N+rep+1]
              );
              writerMs=performance.now()-w0;
              const again=await observer.query("SELECT backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[pid]);
              assert.equal(again.length,1);
              assert.equal(String(again[0].xmin),String(state[0].xmin),"xmin changed inside one RR");
            }
            return rows;
          }};
          return fn(proxy);
        });
        afterXmin=performance.now(); // immediately AFTER COMMIT, BEFORE out-of-band observer
        txEndedAt=afterXmin;
        const wall=afterXmin-started;
        const observed=await observer.query("SELECT backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[pid]);
        assert.equal(observed.length,1);
        assert.equal(observed[0].xmin,null,"backend_xmin still pinned after reader committed");
        // wall excludes the post-COMMIT observer call, but includes COMMIT
        const row=sample!;row.wall_ms=wall;
        return result;
      }
    };
    let sample:Sample|null={
      rep,wall_ms:0,total_reader_ms:0,post_commit_ms:0,query_ms:0,writer_ms:0,xmin_age_ms:0,snapshot_upper_ms:0,
      event_read_ms:0,devices_ms:0,latest_ms:0,counts_ms:0,
      events:0,rss_mib:0
    };
    const readerStartedAt=performance.now();
    const reality=await lerRealidadeDeEntregas(intercepted,{agora:NOW});
    const readerFinishedAt=performance.now();
    assert.ok(txEndedAt>readerStartedAt&&readerFinishedAt>=txEndedAt);
    assert.ok(sample);
    sample.total_reader_ms=round(readerFinishedAt-readerStartedAt);
    sample.post_commit_ms=round(readerFinishedAt-txEndedAt);
    assert.equal(hooked,1,"writer hook did not fire exactly once");
    assert.ok(xminSeen&&Number.isFinite(writerMs));
    assert.equal(reality.historico_sem_modo,0);
    assert.equal(reality.projecoes.length,1);
    const trip=reality.projecoes[0].viagens.find(v=>v.trip_id==="T-LONG");
    assert.ok(trip,"trip disappeared");
    assert.equal(trip.eventos.length,expected,"RR saw append committed AFTER first read");
    const device=reality.aparelhos.find(d=>d.device_id==="DEV-1");
    assert.ok(device);
    assert.equal(device.fatos_por_modo.simulated,expected,"device count and trip from different snapshots");
    const [count]=await observer.query("SELECT count(*)::int AS n FROM platform.event_log");
    assert.equal(Number(count.n),expected+1,"writer failed to commit to event log");
    assert.ok(sample&&sample.wall_ms>0);
    sample.query_ms=round(segments.total);
    assert.ok(sample.total_reader_ms>=sample.wall_ms, "full reader finished before transaction");
    sample.writer_ms=round(writerMs);
    sample.xmin_age_ms=round(afterXmin-xminAt);
    assert.ok(firstFactsAt>0);
    sample.snapshot_upper_ms=round(afterXmin-firstFactsAt);
    sample.event_read_ms=round(segments.events);
    sample.devices_ms=round(segments.devices);
    sample.latest_ms=round(segments.latest);
    sample.counts_ms=round(segments.counts);
    sample.events=expected;
    sample.rss_mib=round(process.memoryUsage().rss/1048576);
    sample.wall_ms=round(sample.wall_ms);
    if(rep>=WARMUPS)data.push(sample);
    if(rep===0||rep===TOTAL-1)console.log("Q026_RR_DURATION_CHECKPOINT "+JSON.stringify(sample));
    sample=null;
  }
  assert.equal(data.length,MEASURED);
  const stats=(key:keyof Sample)=>{
    const nums=data.map(x=>Number(x[key]));
    assert.ok(nums.every(Number.isFinite));
    return {min:round(Math.min(...nums)),median:round(quantile(nums,0.5)),
      p95_sample:round(quantile(nums,0.95)),p99_sample:round(quantile(nums,0.99)),
      max:round(Math.max(...nums))};
  };
  const report={
    N,warmups:WARMUPS,measured:MEASURED,committed_append_events:TOTAL,
    wall_ms:stats("wall_ms"),total_reader_ms:stats("total_reader_ms"),
    post_commit_ms:stats("post_commit_ms"),xmin_age_ms:stats("xmin_age_ms"),
    snapshot_upper_ms:stats("snapshot_upper_ms"),
    event_query_ms:stats("event_read_ms"),device_query_ms:stats("devices_ms"),
    latest_query_ms:stats("latest_ms"),count_query_ms:stats("counts_ms"),
    writer_ms:stats("writer_ms"),node_rss_mib:stats("rss_mib"),
    all_reads_snapshot_consistent:true,backend_xmin_released_each_read:true,
    results:data,
    caveats:["1 observation for 1.03M; 4 for smaller sizes; not production p95/p99 SLOs",
      "synthetic one-unit one-trip data; one independent append per read",
      "wall_ms is transaction incl COMMIT; total_reader_ms includes CPU projection after COMMIT",
      "snapshot_upper_ms from before first event SELECT through COMMIT; xmin_age_ms after event SELECT through COMMIT",
      "no production server resources or sustained mixed writer workload measured"]
  };
  writeFileSync(path,JSON.stringify(report,null,2));
  console.log("Q026_RR_SHORT_WINDOW_PASS "+JSON.stringify({...report,results:undefined}));
}finally{
 await writer.close();await observer.close();await db.descartar();
}
})().catch(e=>{console.error(e);process.exitCode=1});
