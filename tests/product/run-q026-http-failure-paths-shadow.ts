/**
 * Q026 SHADOW: adversarial tests on the ACTUAL Product System HTTP route.
 * 1. PostgreSQL self-cancel denied: server-side SET LOCAL statement_timeout
 *    must release borrowed RR connection even if pg_cancel_backend fails.
 * 2. HTTP admitted requests > reader pool: no unbounded queue or stale read.
 *
 * PostgreSQL 16 CI service only; disposable isolated DB. The explicit
 * candidate guard is enabled ONLY in this Node test process.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient } from "../../src/platform/persistence/sql-client";
import { foiTimeoutNaFilaDoPoolPg } from "../../src/platform/persistence/pg-pool-backpressure";

const base=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!base){console.error("Q026_FAILURE_PATH_PG_REQUIRED");process.exit(78)}
const CASE=process.env.Q026_FAILURE_PATH_CASE;
assert.ok(CASE==="cancel_denied"||CASE==="pool_saturated"||CASE==="pool_checkout_fast"||CASE==="permission_denied");
assert.equal(foiTimeoutNaFilaDoPoolPg(new Error("timeout exceeded when trying to connect")),true);
assert.equal(foiTimeoutNaFilaDoPoolPg(Object.assign(new Error("timeout exceeded when trying to connect"),{code:"42501"})),false);
assert.equal(foiTimeoutNaFilaDoPoolPg(new Error("Connection terminated due to connection timeout")),false);
assert.equal(foiTimeoutNaFilaDoPoolPg(new Error("getaddrinfo ENOTFOUND")),false);
assert.equal(foiTimeoutNaFilaDoPoolPg(null),false);
const BUDGET_MS=3000;
const pause=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
const deadline=async<T>(poll:()=>Promise<T|null>,max=16000):Promise<T>=>{
 const start=performance.now();
 for(;;){
  const x=await poll();
  if(x!==null)return x;
  if(performance.now()-start>max)throw Error("Q026_SHADOW_POLL_TIMEOUT");
  await pause(40);
 }
};
type Resp={status:number;body:any;headers:http.IncomingHttpHeaders;raw:string;wall_ms:number};
function get(port:number,path:string):Promise<Resp>{
 const start=performance.now();
 return new Promise((resolve,reject)=>{
  const request=http.request({host:"127.0.0.1",port,path,method:"GET",timeout:20000},response=>{
   let raw="";
   response.setEncoding("utf8");
   response.on("data",(v:string)=>raw+=v);
   response.on("end",()=>{
    try{resolve({status:response.statusCode??0,body:JSON.parse(raw),
      headers:response.headers,raw,wall_ms:+(performance.now()-start).toFixed(2)})}
    catch(e){reject(Error("Q026_NON_JSON_HTTP_RESPONSE "+String(e)))}
   });
  });
  request.on("error",reject);
  request.on("timeout",()=>request.destroy(Error("Q026_CLIENT_TIMEOUT")));
  request.end();
 });
}
void(async()=>{
 const db=await bancoIsolado(base,undefined,"q026failure");
 const obs=await createPgClient({url:db.url,max:3,statementTimeoutMs:20000});
 let srv:http.Server|null=null;
 let release:()=>void=()=>undefined;
 let held:Promise<unknown>|null=null;
 try{
  await db.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim synthetic')");
  await db.cliente.query(
   "INSERT INTO identity.device(device_id,unit_id,label,registered_at) VALUES "+
   "('Q026-FAULT-PHONE','ITAIM','Only test','2026-10-09T00:00:00Z')");
  await db.cliente.query([
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
   "SELECT 'q026-fault-'||g,'ITAIM','trip','FAULT-TRIP','gps_batch_received','{}'::jsonb,",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.01 second'),",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.01 second'),",
   "'device','q026-fault-'||g,'gps_batch_received@1.0.0','simulated',g,'Q026-FAULT-PHONE','trusted'",
   "FROM generate_series(1,12000) g"
  ].join(" "));
  const role="q026_fault_reader";
  let runtimeUrl=db.url;
  if(CASE==="cancel_denied"||CASE==="permission_denied"){
   await db.cliente.query("CREATE ROLE q026_fault_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION");
   await db.cliente.query(`GRANT CONNECT ON DATABASE ${db.nome} TO q026_fault_reader`);
   await db.cliente.query("GRANT USAGE ON SCHEMA platform,identity TO q026_fault_reader");
   await db.cliente.query("GRANT SELECT ON platform.event_log,identity.device TO q026_fault_reader");
   // This revokes execute on PG's built-in *only within disposable CI cluster*.
   // No effect on operational DB. Tests that a denied external cancel cannot
   // be mistaken for a successful cancel.
   if(CASE==="cancel_denied"){
     await db.cliente.query("REVOKE EXECUTE ON FUNCTION pg_catalog.pg_cancel_backend(integer) FROM PUBLIC");
     const priv=await db.cliente.query(
       "SELECT has_function_privilege($1,'pg_catalog.pg_cancel_backend(integer)','EXECUTE') AS grant",[role]);
     assert.equal(priv[0].grant,false,"cancel function EXECUTE must be revoked");
   }
   const parsed=new URL(db.url);parsed.username=role;runtimeUrl=parsed.toString();
   const r=await createPgClient({url:runtimeUrl,max:1});
   try{
    assert.equal((await r.query("SELECT current_user AS u"))[0].u,role);
    if(CASE==="cancel_denied"){
      let deny:unknown=null;
      try{await r.query("SELECT pg_cancel_backend(pg_backend_pid())")}catch(e){deny=e}
      assert.equal((deny as {code?:string}|null)?.code,"42501",
        "test role unexpectedly may execute cancel");
    }
   }finally{await r.close()}
  }
  process.env.DELIVERYOS_DATABASE_URL=runtimeUrl;
  process.env.DELIVERYOS_ENTREGAS_RR_DEADLINE_MS=String(BUDGET_MS);
  process.env.DELIVERYOS_ENTREGAS_MAX_INFLIGHT=(CASE==="cancel_denied"||CASE==="permission_denied")?"1":"4";
  const {criarServidor}=await import("../../tools/product_system_server");
  srv=await criarServidor();
  await new Promise<void>((resolve,reject)=>{srv!.once("error",reject);srv!.listen(0,"127.0.0.1",resolve)});
  const addr=srv.address();assert.ok(addr&&typeof addr!=="string");const port=addr.port;
  const initial=await get(port,"/api/entregas?unidade=ITAIM");
  assert.equal(initial.status,200);assert.equal(initial.body.leitura.disponivel,true);
  if(CASE==="permission_denied"){
    // Real SQLSTATE 42501 remains an unavailable DATA BLOCK, not overload.
    await db.cliente.query("REVOKE SELECT ON platform.event_log FROM q026_fault_reader");
    const forbidden=await get(port,"/api/entregas?unidade=ITAIM");
    assert.equal(forbidden.status,200);
    assert.equal(forbidden.body.leitura.disponivel,false);
    assert.equal(forbidden.body.leitura.motivo,"indisponivel");
    assert.equal(forbidden.headers["retry-after"],undefined);
    assert.ok(!forbidden.raw.includes("42501"));
    assert.ok(!forbidden.raw.includes(runtimeUrl));
    await db.cliente.query("GRANT SELECT ON platform.event_log TO q026_fault_reader");
    const restored=await get(port,"/api/entregas?unidade=ITAIM");
    assert.equal(restored.status,200);
    assert.equal(restored.body.leitura.disponivel,true);
    console.log("Q026_PERMISSION_DENIED_DISTINCT_PASS "+JSON.stringify({
      sqlstate_class:"42501",http_unavailable:forbidden.status,
      never_fake_503:true,recovery_status:restored.status,
      no_internal_error_leak:true
    }));
    return;
  }
  let unblock:()=>void=()=>undefined;
  const gate=new Promise<void>(r=>{unblock=r});release=unblock;
  let holding:()=>void=()=>undefined;
  const entered=new Promise<void>(r=>{holding=r});
  held=db.cliente.transaction(async tx=>{
   await tx.query("LOCK TABLE platform.event_log IN ACCESS EXCLUSIVE MODE");
   holding();await gate;
  });
  await entered;
  const path="/api/entregas?unidade=ITAIM";
  const countWaiting=async()=> {
    const x=await obs.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() "+
      "AND wait_event_type='Lock' AND query LIKE '%platform.event_log%' AND pid<>pg_backend_pid()");
    return Number(x[0].n);
  };
  if(CASE==="cancel_denied"){
    const running=get(port,path);
    await deadline(async()=>await countWaiting()>=1?true:null);
    const duplicate=await get(port,path);
    assert.equal(duplicate.status,503);assert.equal(duplicate.body.erro,"leitura_temporariamente_ocupada");
    const response=await running;
    assert.equal(response.status,503,"deadline must not report healthy 200 on cancel denial");
    assert.equal(response.body.erro,"prazo_total_excedido");
    await deadline(async()=> {
      const x=await obs.query(
       "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() "+
       "AND state='active' AND wait_event_type='Lock' AND query LIKE '%platform.event_log%'");
      return Number(x[0].n)===0?true:null;
    },8000);
    // The original PG statements get SET LOCAL statement_timeout capped by
    // remaining budget. With external cancel denied, DB must still terminate.
    const stillBlocked=await countWaiting();
    assert.equal(stillBlocked,0,"PG statement was left pinned by denied cancel");
    const health=await get(port,"/api/health");assert.equal(health.status,200);
    release();await held;
    const fresh=await deadline(async()=>{
      const x=await get(port,path);
      return x.status===200&&x.body.leitura.disponivel===true?x:null;
    },7000);
    assert.equal(fresh.body.leitura.aparelhos.length,1);
    console.log("Q026_CANCEL_DENIED_FALLBACK_PASS "+JSON.stringify({
      cancel_execute_denied_sqlstate:"42501",status:response.status,
      elapsed_ms:response.wall_ms,postgresql_lock_wait_cleared:true,
      next_http_status:fresh.status,health:health.status,
      boundary:"disposable PG16 built-in grant revoked; test role only"
    }));
  }else if(CASE==="pool_checkout_fast"){
    // Two GETs acquire the two PG connections and block on the real table
    // lock; another two wait for pg-pool checkout. The candidate's 1000ms
    // connectionTimeoutMillis must REMOVE both queued waiters. The old
    // five-second default would keep them outstanding past HTTP deadline.
    const readers=Array.from({length:4},()=>get(port,path));
    await deadline(async()=>await countWaiting()>=2?true:null);
    const over=await get(port,path);
    assert.equal(over.status,503);
    assert.deepEqual(over.body,{erro:"leitura_temporariamente_ocupada"});
    const results=await Promise.all(readers);
    const fast=results.filter(x=>x.wall_ms<2000);
    const slow=results.filter(x=>x.wall_ms>=2500 && x.wall_ms<5000);
    assert.equal(fast.length,2,
      "exactly two waiting pool.connect() must settle before HTTP deadline");
    assert.equal(slow.length,2,"exactly two active blocked SQL reads must hit HTTP deadline");
    for(const x of fast){
      assert.equal(x.status,503,"explicit guarded queue saturation must signal overload");
      assert.deepEqual(x.body,{erro:"leitura_temporariamente_ocupada"});
      assert.equal(x.headers["retry-after"],"1");
      assert.equal(x.raw.includes(db.url),false);
    }
    for(const x of slow){
      assert.equal(x.status,503);
      assert.deepEqual(x.body,{erro:"prazo_total_excedido"});
    }
    const health=await get(port,"/api/health");assert.equal(health.status,200);
    release();await held;
    const recovered=await get(port,path);
    assert.equal(recovered.status,200);
    assert.equal(recovered.body.leitura.disponivel,true);
    const active=await obs.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() "+
      "AND state IN ('active','idle in transaction') AND query LIKE '%platform.event_log%' "+
      "AND pid<>pg_backend_pid()");
    assert.equal(Number(active[0].n),0,"no orphan session after timed-out checkout");
    console.log("Q026_POOL_CHECKOUT_FAST_PASS "+JSON.stringify({
      pool_max:2,admitted_http:4,checkout_limit_ms:1000,
      fast_pool_overload:fast.length,fast_wall_ms:fast.map(x=>x.wall_ms),
      blocked_deadline:slow.length,blocked_wall_ms:slow.map(x=>x.wall_ms),
      fifth_status:over.status,health:health.status,
      recovered_status:recovered.status,no_orphan_sql:true,
      boundary:"opt-in pool wait cap 1s, not proof of strict end-to-end deadline"
    }));
  }else{
    // Eight parallel callers compete for FOUR HTTP admission slots, but
    // only TWO PostgreSQL connections. Two will be rejected immediately by
    // admission, plus others once the first four fill; exact counts must
    // be grounded in the batch rather than hidden behind a successful retry.
    const readers=Array.from({length:8},()=>get(port,path));
    await deadline(async()=>await countWaiting()>=2?true:null);
    const health=await get(port,"/api/health");assert.equal(health.status,200);
    const statuses=await Promise.all(readers);
    const rejected=statuses.filter(x=>x.status===503&&
      x.body.erro==="leitura_temporariamente_ocupada"&&x.wall_ms<300);
    const checkout=statuses.filter(x=>x.status===503&&
      x.body.erro==="leitura_temporariamente_ocupada"&&x.wall_ms>=700);
    const timeouts=statuses.filter(x=>x.status===503&&
      x.body.erro==="prazo_total_excedido");
    assert.equal(rejected.length,4,
      "admission must cap at 4 even when eight requests arrive");
    assert.equal(checkout.length,2,
      "two pg-pool waiters must settle with retryable 503 before HTTP deadline");
    assert.equal(timeouts.length,2,
      "two active PG reads should terminate by HTTP deadline");
    assert.ok(checkout.every(x=>x.wall_ms<2000 && x.headers["retry-after"]==="1"),
      "checkout wait exceeded 2 seconds or lost Retry-After");
    assert.ok(timeouts.every(x=>x.wall_ms>=2500&&x.wall_ms<5000),
      "active reader exceeded guarded HTTP deadline");
    release();await held;
    const firstRecover=await deadline(async()=>{
      const x=await get(port,path);
      return x.status===200&&x.body.leitura.disponivel===true?x:null;
    },12000);
    const active=await obs.query(
     "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() "+
     "AND state IN ('active','idle in transaction') AND query LIKE '%platform.event_log%' "+
     "AND pid<>pg_backend_pid()");
    assert.equal(Number(active[0].n),0);
    console.log("Q026_POOL_CONTENTION_PASS "+JSON.stringify({
      pool_max:2,admission_max:4,total_simultaneous:8,
      admission_rejections:rejected.length,
      fast_checkout_retryable_503:checkout.length,
      active_read_deadlines:timeouts.length,
      request_wall_ms:statuses.map(x=>x.wall_ms),
      health:health.status,post_recovery_status:firstRecover.status,
      server_active_event_reads_after_cleanup:Number(active[0].n),
      boundary:"pg pool checkout capped to 1s with opt-in, not end-to-end SLA"
    }));
  }
 }finally{
  release();if(held)await held.catch(()=>undefined);
  if(srv)await new Promise<void>(resolve=>srv!.close(()=>resolve()));
  await obs.close();await db.descartar();
 }
})().catch(e=>{console.error("Q026_HTTP_FAILURE_PATH_SHADOW_FAILED",e);process.exitCode=1});
