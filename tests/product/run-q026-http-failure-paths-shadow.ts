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

const base=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!base){console.error("Q026_FAILURE_PATH_PG_REQUIRED");process.exit(78)}
const CASE=process.env.Q026_FAILURE_PATH_CASE;
assert.ok(CASE==="cancel_denied"||CASE==="pool_saturated");
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
  if(CASE==="cancel_denied"){
   await db.cliente.query("CREATE ROLE q026_fault_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION");
   await db.cliente.query(`GRANT CONNECT ON DATABASE ${db.nome} TO q026_fault_reader`);
   await db.cliente.query("GRANT USAGE ON SCHEMA platform,identity TO q026_fault_reader");
   await db.cliente.query("GRANT SELECT ON platform.event_log,identity.device TO q026_fault_reader");
   // This revokes execute on PG's built-in *only within disposable CI cluster*.
   // No effect on operational DB. Tests that a denied external cancel cannot
   // be mistaken for a successful cancel.
   await db.cliente.query("REVOKE EXECUTE ON FUNCTION pg_catalog.pg_cancel_backend(integer) FROM PUBLIC");
   const priv=await db.cliente.query(
    "SELECT has_function_privilege($1,'pg_catalog.pg_cancel_backend(integer)','EXECUTE') AS grant",[role]);
   assert.equal(priv[0].grant,false,"cancel function EXECUTE must be revoked");
   const parsed=new URL(db.url);parsed.username=role;runtimeUrl=parsed.toString();
   const r=await createPgClient({url:runtimeUrl,max:1});
   try{
    assert.equal((await r.query("SELECT current_user AS u"))[0].u,role);
    let deny:unknown=null;
    try{await r.query("SELECT pg_cancel_backend(pg_backend_pid())")}catch(e){deny=e}
    assert.equal((deny as {code?:string}|null)?.code,"42501",
     "test role unexpectedly may execute cancel");
   }finally{await r.close()}
  }
  process.env.DELIVERYOS_DATABASE_URL=runtimeUrl;
  process.env.DELIVERYOS_ENTREGAS_RR_DEADLINE_MS=String(BUDGET_MS);
  process.env.DELIVERYOS_ENTREGAS_MAX_INFLIGHT=CASE==="pool_saturated"?"4":"1";
  const {criarServidor}=await import("../../tools/product_system_server");
  srv=await criarServidor();
  await new Promise<void>((resolve,reject)=>{srv!.once("error",reject);srv!.listen(0,"127.0.0.1",resolve)});
  const addr=srv.address();assert.ok(addr&&typeof addr!=="string");const port=addr.port;
  const initial=await get(port,"/api/entregas?unidade=ITAIM");
  assert.equal(initial.status,200);assert.equal(initial.body.leitura.disponivel,true);
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
  }else{
    const readers=Array.from({length:4},()=>get(port,path));
    await deadline(async()=>await countWaiting()>=2?true:null);
    const over=await get(port,path);
    assert.equal(over.status,503);
    assert.equal(over.body.erro,"leitura_temporariamente_ocupada");
    assert.equal(over.headers["retry-after"],"1");
    const health=await get(port,"/api/health");assert.equal(health.status,200);
    const statuses=await Promise.all(readers);
    assert.deepEqual(statuses.map(x=>x.status).sort(),[503,503,503,503]);
    assert.ok(statuses.every(x=>x.body.erro==="prazo_total_excedido"),"only deliberate deadlines expected");
    // Pool maximum is 2, whereas 4 are admitted; a waiter may outlive its
    // HTTP deadline until the pool's default 5s acquisition timeout.
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
      pool_max:2,admission_max:4,simultaneous_admitted:4,
      admission_rejections:1,statuses:statuses.map(x=>x.status),
      request_wall_ms:statuses.map(x=>x.wall_ms),
      health:health.status,post_recovery_status:firstRecover.status,
      server_active_event_reads_after_cleanup:Number(active[0].n),
      boundary:"pool checkout is not strictly limited by HTTP deadline"
    }));
  }
 }finally{
  release();if(held)await held.catch(()=>undefined);
  if(srv)await new Promise<void>(resolve=>srv!.close(()=>resolve()));
  await obs.close();await db.descartar();
 }
})().catch(e=>{console.error("Q026_HTTP_FAILURE_PATH_SHADOW_FAILED",e);process.exitCode=1});
