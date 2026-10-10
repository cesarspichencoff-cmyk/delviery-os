/**
 * Q-026 CANARY: actual tools/product_system_server.ts handler, no fake router.
 * Only a disposable PostgreSQL 16 database, local HTTP port 0, synthetic facts.
 * Test compares explicit opt-in deadline versus default-off behavior in
 * separate Node processes to avoid cached server module globals.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import type { SqlRow } from "../../src/platform/persistence/sql-client";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";

const url=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!url){console.error("Q026_ACTUAL_HTTP_PG_REQUIRED");process.exit(78)}
const mode=process.env.Q026_ACTUAL_HTTP_MODE;
assert.ok(mode==="enabled"||mode==="disabled","mode must be enabled or disabled");
const ms=3000;
const pause=(m:number)=>new Promise<void>(resolve=>setTimeout(resolve,m));
const started=performance.now();
const until=async<T>(check:()=>Promise<T|null>,budget=12000):Promise<T>=>{
  const start=performance.now();
  for(;;){
    const v=await check();
    if(v!==null)return v;
    if(performance.now()-start>budget)throw Error("Q026_ACTUAL_HTTP_WAIT_EXPIRED");
    await pause(40);
  }
};
type Resp={status:number;body:any;raw:string;headers:http.IncomingHttpHeaders};
function get(port:number,path:string):Promise<Resp>{
 return new Promise((resolve,reject)=>{
  const req=http.request({host:"127.0.0.1",port,path,method:"GET",timeout:15000},res=>{
   let raw="";res.setEncoding("utf8");res.on("data",(b:string)=>raw+=b);
   res.on("end",()=>{try{resolve({status:res.statusCode??0,body:JSON.parse(raw),raw,headers:res.headers})}
    catch(e){reject(Error("Q026_HTTP_INVALID_JSON "+String(e)))}});
  });
  req.on("timeout",()=>req.destroy(Error("Q026_HTTP_TIMEOUT")));
  req.on("error",reject);req.end();
 });
}
void(async()=>{
 const db=await bancoIsolado(url,undefined,"q026actualhttp");
 let server:http.Server|null=null;
 let unlock:()=>void=()=>undefined;
 let lockedResolve:()=>void=()=>undefined;
 const locked=new Promise<void>(r=>{lockedResolve=r});
 const release=new Promise<void>(r=>{unlock=r});
 let hold:Promise<unknown>|null=null;
 try{
  await db.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim synthetic')");
  await db.cliente.query(
   "INSERT INTO identity.device(device_id,unit_id,label,registered_at,secret_bound_at,last_session_at) "+
   "VALUES ('Q026-HTTP-DEVICE','ITAIM','Synthetic device','2026-10-09T00:00:00Z','2026-10-09T00:00:00Z','2026-10-10T18:00:00Z')");
  await db.cliente.query([
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
   "SELECT 'q026-real-route-'||g,'ITAIM','trip','HTTP-LOCK-TRIP','gps_batch_received','{}'::jsonb,",
   "TIMESTAMPTZ '2026-10-10T16:00:00Z'+(g*interval '0.2 second'),",
   "TIMESTAMPTZ '2026-10-10T16:00:00Z'+(g*interval '0.2 second'),",
   "'device','q026-real-route-'||g,'gps_batch_received@1.0.0','simulated',g,'Q026-HTTP-DEVICE','trusted'",
   "FROM generate_series(1,2500) AS g"
  ].join(" "));
  process.env.DELIVERYOS_DATABASE_URL=db.url;
  if(mode==="enabled"){
   process.env.DELIVERYOS_ENTREGAS_MAX_INFLIGHT="1";
   process.env.DELIVERYOS_ENTREGAS_RR_DEADLINE_MS=String(ms);
  }else{
   delete process.env.DELIVERYOS_ENTREGAS_MAX_INFLIGHT;
   delete process.env.DELIVERYOS_ENTREGAS_RR_DEADLINE_MS;
  }
  const {criarServidor}=await import("../../tools/product_system_server");
  server=await criarServidor();
  await new Promise<void>((resolve,reject)=>{
   server!.once("error",reject);server!.listen(0,"127.0.0.1",resolve);
  });
  const addr=server.address();assert.ok(addr&&typeof addr!=="string");
  const port=addr.port;
  const initial=await get(port,"/api/entregas?unidade=ITAIM");
  assert.equal(initial.status,200);
  assert.equal(initial.body.leitura.disponivel,true);
  const beforeDevice=initial.body.leitura.aparelhos.find((x:any)=>x.device_id==="Q026-HTTP-DEVICE");
  assert.ok(beforeDevice);
  assert.equal(beforeDevice.ultima_posicao.observado,true);
  const health=await get(port,"/api/health");
  assert.equal(health.status,200);
  if(mode==="enabled"){
   hold=db.cliente.transaction(async tx=>{
    await tx.query("LOCK TABLE platform.event_log IN ACCESS EXCLUSIVE MODE");
    lockedResolve();await release;
   });
   await locked;
   const abortedReq=http.request({host:"127.0.0.1",port,
    path:"/api/entregas?unidade=ITAIM",method:"GET"});
   const finishedSocket=new Promise<void>(resolve=>{
    abortedReq.on("error",()=>resolve());abortedReq.on("close",()=>resolve());
   });
   abortedReq.end();
   const active=async()=>await until(async()=>{
    const p=await db.cliente.query<SqlRow>(
     "SELECT pid,state,backend_xmin::text AS xmin FROM pg_stat_activity "+
     "WHERE datname=current_database() AND wait_event_type='Lock' "+
     "AND query LIKE '%platform.event_log%' AND pid<>pg_backend_pid() ORDER BY pid DESC LIMIT 1"
    );
    return p.length?Number(p[0].pid):null;
   },15000);
   const pid=await active();
   assert.ok(pid>0,"real handler did not issue blocked event-log query");
   const busy=await Promise.all(Array.from({length:6},
    ()=>get(port,"/api/entregas?unidade=ITAIM")));
   assert.equal(busy.filter(x=>x.status===503).length,6);
   for(const b of busy){
    assert.deepEqual(b.body,{erro:"leitura_temporariamente_ocupada"});
    assert.equal(b.headers["retry-after"],"1");
   }
   assert.equal((await get(port,"/api/health")).status,200);
   const disconnectAt=performance.now();
   abortedReq.destroy();await finishedSocket;
   await until(async()=>{
    const p=await db.cliente.query<SqlRow>(
     "SELECT state,backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[pid]);
    return p[0]?.state==="idle"&&p[0]?.xmin===null?true:null;
   });
   const disconnectToIdle=+(performance.now()-disconnectAt).toFixed(2);
   console.log("Q026_ACTUAL_HTTP_DISCONNECT_PASS "+JSON.stringify({
    pid,requests_rejected:busy.length,backend_xmin_released:true,
    socket_to_idle_ms:disconnectToIdle,health_while_locked:200
   }));
   const deadlineAt=performance.now();
   const timed=get(port,"/api/entregas?unidade=ITAIM");
   const pidNext=await active();
   assert.equal(pidNext,pid,"real route should reuse old PG backend");
   const timeoutResponse=await timed;
   assert.equal(timeoutResponse.status,503);
   assert.deepEqual(timeoutResponse.body,{erro:"prazo_total_excedido"});
   const responseMs=+(performance.now()-deadlineAt).toFixed(2);
   assert.ok(responseMs>ms-500&&responseMs<ms+2000,"HTTP deadline did not respond near budget");
   await until(async()=>{
    const p=await db.cliente.query<SqlRow>(
     "SELECT state,backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[pid]);
    return p[0]?.state==="idle"&&p[0]?.xmin===null?true:null;
   });
   console.log("Q026_ACTUAL_HTTP_DEADLINE_PASS "+JSON.stringify({
    request_ms:ms,response_status:timeoutResponse.status,response_ms:responseMs,
    backend_xmin_released:true,pid_reused:true
   }));
   unlock();await hold;
  }
  await db.cliente.query(
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,"+
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust) "+
   "VALUES ('q026-after-real-route','ITAIM','trip','HTTP-LOCK-TRIP','gps_batch_received','{}'::jsonb,"+
   "'2026-10-10T17:30:00Z','2026-10-10T17:30:00Z','device','q026-after-real-route','gps_batch_received@1.0.0',"+
   "'simulated',2501,'Q026-HTTP-DEVICE','trusted')");
  const fresh=await get(port,"/api/entregas?unidade=ITAIM");
  assert.equal(fresh.status,200);
  assert.equal(fresh.body.leitura.disponivel,true);
  const dev=fresh.body.leitura.aparelhos.find((x:any)=>x.device_id==="Q026-HTTP-DEVICE");
  assert.ok(dev);
  assert.equal(dev.ultima_posicao.observado,true);
  assert.notEqual(dev.ultima_posicao.em,beforeDevice.ultima_posicao.em,
    "real HTTP response did not observe committed new GPS");
  // Scope remains read-only regardless of opt-in.
  const denied=await new Promise<number>((resolve,reject)=>{
   const req=http.request({host:"127.0.0.1",port,path:"/api/entregas",method:"POST"},res=>{
    res.resume();res.on("end",()=>resolve(res.statusCode??0));
   });req.on("error",reject);req.end();
  });
  assert.equal(denied,405);
  const fatosQ016=await lerFatosParaReplay(db.cliente,TIPOS_DA_OPERACAO_VIVA);
  assert.equal(fatosQ016.aptos.length,2501,
    "Q016 forensic replay was mutated after HTTP abort/deadline");
  console.log("Q026_ACTUAL_HTTP_GUARD_"+mode.toUpperCase()+"_PASS "+JSON.stringify({
   mode,server:"actual tools/product_system_server.ts",first_http_status:initial.status,
   after_commit_http_status:fresh.status,new_gps_visible:true,
   writes_still_rejected:true,q016_replay_count:fatosQ016.aptos.length,elapsed_ms:+(performance.now()-started).toFixed(2),
   boundary:"disabled by default / branch-only candidate, not deployed"
  }));
 }finally{
  unlock();if(hold)await hold.catch(()=>undefined);
  if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
  await db.descartar();
 }
})().catch(e=>{console.error("Q026_ACTUAL_HTTP_GUARD_FAILED",e);process.exitCode=1});
