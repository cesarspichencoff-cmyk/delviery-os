/**
 * Q026 SHADOW — rollback and MVCC horizon release for the actual
 * lerRealidadeDeEntregas RR reader, interrupted AFTER its first SELECT.
 *
 * Three independent real failure classes:
 * 1) userland thrown error, 2) PG server-side statement_timeout (57014),
 * 3) database READ ONLY write denial (25006).
 * Each uses a real PostgreSQL 16 transaction on a pool of MAX ONE session
 * and independent writer + observer sessions.
 *
 * NO production changes; this is not an HTTP timeout or p95 benchmark.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient, type SqlClient, type SqlRow, type TransactionalSqlClient } from "../../src/platform/persistence/sql-client";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";

const URL=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!URL)throw Error("Q026_ABORT_PG_REQUIRED");
const NOW=new Date("2026-10-10T16:00:00Z");
const BASE=2000;
type FailureMode="js_throw"|"server_timeout"|"read_only_rejection";
const MODES:FailureMode[]=["js_throw","server_timeout","read_only_rejection"];
const results:Record<string,unknown>[]=[];
const eventSql=[
 "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
 "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
 "VALUES ($1,'ITAIM','trip','ABORT-TRIP','gps_batch_received','{}'::jsonb,$2,$2,",
 "'device',$3,'gps_batch_received@1.0.0','simulated',$4,'DEV-ABORT','trusted')"
].join(" ");
function asCode(e:unknown){return typeof e==="object"&&e!==null&&"code" in e?String((e as {code?:unknown}).code):null}
void(async()=>{
 const db=await bancoIsolado(URL,undefined,"q026abort");
 const reader=await createPgClient({url:db.url,max:1,statementTimeoutMs:15000});
 const writer=await createPgClient({url:db.url,max:1,statementTimeoutMs:15000});
 const observer=await createPgClient({url:db.url,max:1,statementTimeoutMs:15000});
 try{
  await db.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim Teste')");
  await db.cliente.query(
   "INSERT INTO identity.device(device_id,unit_id,label,registered_at,secret_bound_at) "+
   "VALUES ('DEV-ABORT','ITAIM','Driver Synthetic','2026-09-01T10:00:00Z','2026-09-01T10:00:00Z')");
  const seed=[
    "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
    "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
    "SELECT 'abort-base-'||g,'ITAIM','trip','ABORT-TRIP','gps_batch_received','{}'::jsonb,",
    "TIMESTAMPTZ '2026-10-09T19:00:00Z'+(g*interval '0.001 second'),",
    "TIMESTAMPTZ '2026-10-09T19:00:00Z'+(g*interval '0.001 second'),",
    "'device','abort-key-'||g,'gps_batch_received@1.0.0','simulated',g,'DEV-ABORT','trusted'",
    "FROM generate_series(1,$1::integer) g"
  ].join(" ");
  await db.cliente.query(seed,[BASE]);
  await db.cliente.query("ANALYZE platform.event_log");
  const baseline=await lerRealidadeDeEntregas(reader,{agora:NOW});
  assert.equal(baseline.projecoes.flatMap(x=>x.viagens)[0]?.eventos.length,BASE);
  assert.equal(baseline.aparelhos[0]?.fatos_por_modo.simulated,BASE);
  for(let i=0;i<MODES.length;i++){
    const mode=MODES[i];
    let pid=0, injected=0, observedXmin:string|null=null,writerCommitted=false;
    const id="q026-abort-external-"+mode;
    const wrapped:TransactionalSqlClient={
      query:<R extends SqlRow=SqlRow>(s:string,p?:readonly unknown[])=>reader.query<R>(s,p),
      close:async()=>undefined,
      transaction<T>(fn:(tx:SqlClient)=>Promise<T>):Promise<T>{
        return reader.transaction(async tx=>{
          const proxied:SqlClient={query:async<R extends SqlRow=SqlRow>(s:string,p?:readonly unknown[])=>{
            if(s.includes("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")){
              const result=await tx.query<R>(s,p);
              const pin=await tx.query("SELECT pg_backend_pid()::int AS pid");
              pid=Number(pin[0].pid);
              return result;
            }
            const r=await tx.query<R>(s,p);
            if(!injected && s.includes("FROM platform.event_log") && /event_type\s*=\s*ANY/i.test(s)){
              injected++;
              assert.ok(pid>0);
              const state=await observer.query(
                "SELECT backend_xmin::text AS xmin, state FROM pg_stat_activity WHERE pid=$1",[pid]
              );
              assert.equal(state.length,1);
              observedXmin=state[0].xmin===null?null:String(state[0].xmin);
              assert.ok(observedXmin,"snapshot not pinned before forced abort");
              await writer.query(eventSql,[id,"2026-10-10T13:00:00.000Z",id+"-key",BASE+i+1]);
              writerCommitted=true;
              if(mode==="js_throw")throw Error("Q026_INJECTED_JS_ERROR");
              if(mode==="server_timeout"){
                // Server aborts the statement and transaction; ONLY driver
                // ROLLBACK should clean the failed transaction state.
                await tx.query("SET LOCAL statement_timeout = '80ms'");
                await tx.query("SELECT pg_sleep(0.30)");
                throw Error("TIMEOUT_DID_NOT_ABORT");
              }
              // This must be rejected by PG with SQLSTATE 25006 because the
              // reader's transaction was opened READ ONLY.
              await tx.query(eventSql,["q026-must-not-write", "2026-10-10T13:00:00.000Z",
                "q026-must-not-write-key",BASE+i+99]);
              throw Error("READ_ONLY_MUTATION_ALLOWED");
            }
            return r;
          }};
          return fn(proxied);
        });
      }
    };
    const started=performance.now();
    let failure:unknown=null;
    try{await lerRealidadeDeEntregas(wrapped,{agora:NOW})}
    catch(e){failure=e}
    assert.ok(failure,"failure was not propagated");
    if(mode==="js_throw")assert.match(String(failure),/Q026_INJECTED_JS_ERROR/);
    if(mode==="server_timeout")assert.equal(asCode(failure),"57014","must be POSTGRES server-side timeout");
    if(mode==="read_only_rejection")assert.equal(asCode(failure),"25006","READ ONLY was not enforced");
    assert.equal(injected,1);
    assert.ok(writerCommitted);
    const released=await observer.query(
      "SELECT backend_xmin::text AS xmin,state FROM pg_stat_activity WHERE pid=$1",[pid]
    );
    assert.equal(released.length,1);
    assert.equal(released[0].xmin,null,"ROLLBACK did not release backend xmin");
    assert.equal(released[0].state,"idle","pool session is stuck in a transaction");
    // Pool size is 1. Same backend PID proves connection released and reused,
    // not merely that a new pool could connect.
    const next=await reader.query("SELECT pg_backend_pid()::int AS pid, current_setting('transaction_isolation') AS level");
    assert.equal(Number(next[0].pid),pid,"pool did not safely reuse connection");
    assert.equal(String(next[0].level),"read committed","transaction isolation leaked into new transaction");
    const nextView=await lerRealidadeDeEntregas(reader,{agora:NOW});
    const expected=BASE+i+1;
    assert.equal(nextView.projecoes.flatMap(p=>p.viagens)[0]?.eventos.length,expected);
    assert.equal(nextView.aparelhos[0]?.fatos_por_modo.simulated,expected);
    const count=await observer.query("SELECT count(*)::int AS n FROM platform.event_log");
    assert.equal(Number(count[0].n),expected,"a write in READ ONLY transaction survived rollback");
    results.push({mode,sqlstate:asCode(failure),snapshot_pinned_during:true,
      released_after_rollback:true,reused_same_backend_pid:true,
      expected_events:expected,post_rollback_fresh:true,
      elapsed_ms:+(performance.now()-started).toFixed(1)});
    console.log("Q026_ABORT_CASE_PASS "+JSON.stringify(results.at(-1)));
  }
  const q016=await lerFatosParaReplay(reader,TIPOS_DA_OPERACAO_VIVA);
  assert.equal(q016.aptos.length,BASE+MODES.length);
  console.log("Q026_ABORT_CLEANUP_SHADOW_PASS "+JSON.stringify({
    scenarios:results.length,failures:results,
    public_q016_unchanged:true,driver_pool_max:1,
    source:"real PostgreSQL 16 rollback after RR, independent writer and observer",
    boundary:"disposable fixtures only; not HTTP disconnect/transport loss/production"
  }));
 }finally{
  await reader.close();await writer.close();await observer.close();await db.descartar();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
