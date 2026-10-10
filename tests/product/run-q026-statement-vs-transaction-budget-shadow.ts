/**
 * Q026 SHADOW: statement_timeout is PER COMMAND, not a deadline for the
 * single REPEATABLE READ snapshot / transaction / HTTP reader.
 *
 * Runs ACTUAL lerRealidadeDeEntregas against disposable PostgreSQL 16,
 * with 4 independent pg_sleep commands (<150ms each) injected AFTER its
 * first replay SELECT. The same snapshot remains pinned across all of them.
 * The full read succeeds even when a transaction exceeds 2 * 150ms.
 *
 * This is a RISK demonstration, not an intended production delay,
 * a performance benchmark, a recommended timeout, or a runtime edit.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient, type SqlClient, type SqlRow, type TransactionalSqlClient } from "../../src/platform/persistence/sql-client";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";

const url=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!url)throw Error("Q026_AGGREGATE_TIMEOUT_REQUIRES_DISPOSABLE_PG");
const limitMs=150,sqlSleeps=4,sleepS=0.09;
const targetSleepMs=sqlSleeps*sleepS*1000;
const NOW=new Date("2026-10-10T16:00:00Z");
void(async()=>{
 const b=await bancoIsolado(url,undefined,"q026agg");
 const observer=await createPgClient({url:b.url,max:1});
 try {
  await b.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Synthetic')");
  await b.cliente.query("INSERT INTO identity.device(device_id,unit_id,label,registered_at,secret_bound_at)"+
   " VALUES ('D-1','ITAIM','test','2026-10-10T12:00:00Z','2026-10-10T12:00:00Z')");
  await b.cliente.query([
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
   "SELECT 'agg-'||g,'ITAIM','trip','T-ONE','gps_batch_received','{}'::jsonb,",
   "TIMESTAMPTZ '2026-10-10T12:00:00Z'+g*interval '0.01 second',",
   "TIMESTAMPTZ '2026-10-10T12:00:00Z'+g*interval '0.01 second',",
   "'device','agg-key-'||g,'gps_batch_received@1.0.0','simulated',g,'D-1','trusted'",
   "FROM generate_series(1,500) g"
  ].join(" "));
  let pid=0,hooked=0,commandsPassed=0;
  let xminAtStart:string|null=null,lastXmin:string|null=null;
  let sqlTimeSum=0;
  const wrapped:TransactionalSqlClient={
   query:<R extends SqlRow=SqlRow>(sql:string,params?:readonly unknown[])=>b.cliente.query<R>(sql,params),
   close:async()=>undefined,
   transaction<T>(callback:(tx:SqlClient)=>Promise<T>):Promise<T>{
    return b.cliente.transaction(async tx=>{
     const intercept:SqlClient={query:async<R extends SqlRow=SqlRow>(sql:string,params?:readonly unknown[])=>{
      if(sql.includes("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")){
       const rows=await tx.query<R>(sql,params);
       // SET LOCAL cannot be mistaken for a global production config.
       await tx.query("SET LOCAL statement_timeout = '150ms'");
       const backend=await tx.query("SELECT pg_backend_pid()::int AS pid");
       pid=Number(backend[0].pid);
       return rows;
      }
      const rows=await tx.query<R>(sql,params);
      if(!hooked && /FROM platform\.event_log/.test(sql)&&/event_type\s*=\s*ANY/i.test(sql)){
       hooked++;
       assert.ok(pid>0);
       const [first]=await observer.query("SELECT backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[pid]);
       xminAtStart=first?.xmin==null?null:String(first.xmin);
       assert.ok(xminAtStart,"snapshot not pinned before delays");
       for(let i=0;i<sqlSleeps;i++){
        const started=performance.now();
        // Each statement takes about 90ms (<150ms limit) even though the
        // combined RR transaction will far exceed 150ms.
        await tx.query("SELECT pg_sleep($1)",[sleepS]);
        const elapsed=performance.now()-started;
        // Must exceed the configured budget in aggregate: tested below.
        assert.ok(elapsed>=sleepS*1000-15,"sleep was not executed");
        sqlTimeSum+=elapsed;
        commandsPassed++;
        const [current]=await observer.query(
         "SELECT backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[pid]);
        lastXmin=current?.xmin==null?null:String(current.xmin);
        assert.equal(lastXmin,xminAtStart,"snapshot changed across separate statements");
       }
      }
      return rows;
     }};
     return callback(intercept);
    });
   }
  };
  const beginning=performance.now();
  const response=await lerRealidadeDeEntregas(wrapped,{agora:NOW});
  const wholeMs=performance.now()-beginning;
  const trip=response.projecoes.flatMap(p=>p.viagens).find(v=>v.trip_id==="T-ONE");
  assert.equal(trip?.eventos.length,500);
  assert.equal(response.aparelhos.find(d=>d.device_id==="D-1")?.fatos_por_modo.simulated,500);
  assert.equal(hooked,1);
  assert.equal(commandsPassed,sqlSleeps);
  assert.ok(sqlTimeSum>limitMs*2,
   "proof invalid: command-duration aggregate never exceeded twice statement_timeout");
  assert.ok(wholeMs>=sqlTimeSum);
  const [after]=await observer.query(
   "SELECT state,backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[pid]);
  assert.equal(after?.xmin,null);
  assert.equal(after?.state,"idle");
  console.log("Q026_PER_STATEMENT_TIMEOUT_NOT_TX_BUDGET_PASS "+JSON.stringify({
   statements_completed:commandsPassed,sql_statement_timeout_ms:limitMs,
   each_sleep_target_ms:sleepS*1000,
   combined_sleep_actual_ms:+sqlTimeSum.toFixed(1),
   reader_total_wall_ms:+wholeMs.toFixed(1),
   total_exceeded_twice_statement_timeout:true,
   snapshot_xmin_pinned_during_all:true,backend_xmin_after_commit:after?.xmin,
   complete_result_events:trip?.eventos.length,
   only_disposable_db:true,
   caveat:"synthetic SQL pauses; no production transaction/HTTP deadline configured"
  }));
 }finally{await observer.close();await b.descartar();}
})().catch(e=>{console.error(e);process.exitCode=1});
