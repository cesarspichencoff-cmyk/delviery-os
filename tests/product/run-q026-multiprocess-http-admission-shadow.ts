/**
 * Q026 SHADOW: two ACTUAL independent Product System Node processes share
 * the same disposable PostgreSQL16 database. Demonstrates that
 * DELIVERYOS_ENTREGAS_MAX_INFLIGHT is per PROCESS, not a global cluster gate.
 *
 * Hard safety boundary: no operational database, migration, deployment,
 * or daemon changes; no fake HTTP. Rows are wholly synthetic.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { fork, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient } from "../../src/platform/persistence/sql-client";

const base=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!base){console.error("Q026_MULTIPROCESS_PG_REQUIRED");process.exit(78)}
const LIMIT=1,DEADLINE_MS=3000;
const pause=(n:number)=>new Promise<void>(r=>setTimeout(r,n));
type Reply={status:number;body:any;headers:http.IncomingHttpHeaders;ms:number};
const get=(port:number,path:string):Promise<Reply>=>{
 const begin=performance.now();
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:"127.0.0.1",port,path,method:"GET",timeout:15000},res=>{
   let body="";res.setEncoding("utf8");
   res.on("data",(v:string)=>body+=v);
   res.on("end",()=>{
    try{resolve({status:res.statusCode??0,body:JSON.parse(body),
      headers:res.headers,ms:+(performance.now()-begin).toFixed(2)})}
    catch(e){reject(Error("Q026_EXPECTED_JSON "+String(e)))}
   });
  });
  req.on("error",reject);req.on("timeout",()=>req.destroy(Error("Q026_HTTP_TIMEOUT")));req.end();
 });
};
async function eventually<T>(probe:()=>Promise<T|null>,limit=16000):Promise<T>{
 const begin=performance.now();
 for(;;){
  const value=await probe();
  if(value!==null)return value;
  if(performance.now()-begin>limit)throw Error("Q026_MULTIPROCESS_PROBE_TIMEOUT");
  await pause(45);
 }
}
type Worker={child:ChildProcess;port:number;pid:number};
async function startWorker(url:string):Promise<Worker>{
 const child=fork(resolve("tests/product/q026-multiprocess-server-child.ts"),[],{
  execArgv:["--import","tsx"],
  stdio:["ignore","pipe","pipe","ipc"],
  env:{...process.env,DELIVERYOS_DATABASE_URL:url,
    DELIVERYOS_ENTREGAS_MAX_INFLIGHT:String(LIMIT),
    DELIVERYOS_ENTREGAS_RR_DEADLINE_MS:String(DEADLINE_MS),
    DELIVERYOS_ENTREGAS_INCREMENTAL_RR:"1",
    Q026_MULTIPROCESS_CHILD:"1"}
 });
 let captured="";
 child.stderr?.on("data",(v:Buffer)=>{captured+=String(v);});
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{
   child.kill("SIGKILL");reject(Error("CHILD_START_TIMEOUT "+captured.slice(-800)));
  },15000);
  const failed=(e:unknown)=>{clearTimeout(timer);reject(Error("CHILD_FAILED "+String(e)+" "+captured.slice(-700)))};
  child.once("error",failed);
  child.once("exit",(code)=>failed("exit="+code));
  child.on("message",(m:unknown)=>{
   if(!m || typeof m!=="object")return;
   const msg=m as {ready?:boolean;port?:number;pid?:number;error?:string};
   if(msg.ready===false)return failed(msg.error);
   if(msg.ready && Number.isInteger(msg.port) && Number.isInteger(msg.pid)){
    clearTimeout(timer);
    child.removeListener("error",failed);
    child.removeAllListeners("exit");
    resolve({child,port:msg.port!,pid:msg.pid!});
   }
  });
 });
}
async function stopWorker(w:Worker){
 if(w.child.exitCode!==null)return;
 await new Promise<void>(resolve=>{
  const timer=setTimeout(()=>{w.child.kill("SIGKILL");resolve()},5000);
  w.child.once("exit",()=>{clearTimeout(timer);resolve()});
  w.child.send({op:"stop"});
 });
}
void(async()=>{
 const db=await bancoIsolado(base,undefined,"q026multiprocess");
 const observer=await createPgClient({url:db.url,max:3});
 const workers:Worker[]=[];
 let unlock:()=>void=()=>undefined;
 let holding:Promise<unknown>|null=null;
 try{
  await db.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Synthetic')");
  await db.cliente.query(
   "INSERT INTO identity.device(device_id,unit_id,label,registered_at) VALUES "+
   "('Q026-CLUSTER-DEVICE','ITAIM','Synthetic','2026-10-09T00:00:00Z')");
  const insert=[
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
   "SELECT 'cluster-'||g,'ITAIM','trip','CLUSTER-TRIP','gps_batch_received','{}'::jsonb,",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.01 second'),",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.01 second'),",
   "'device','cluster-key-'||g,'gps_batch_received@1.0.0','simulated',g,'Q026-CLUSTER-DEVICE','trusted'",
   "FROM generate_series(1,2000) AS g"
  ].join(" ");
  await db.cliente.query(insert);
  await db.cliente.query("ANALYZE platform.event_log");
  workers.push(await startWorker(db.url),await startWorker(db.url));
  assert.notEqual(workers[0].pid,workers[1].pid);
  const baseline=await Promise.all(workers.map(w=>get(w.port,"/api/entregas?unidade=ITAIM")));
  assert.ok(baseline.every(x=>x.status===200&&x.body.leitura.disponivel===true));
  const health=await Promise.all(workers.map(w=>get(w.port,"/api/health")));
  assert.ok(health.every(x=>x.status===200));
  let locked:()=>void=()=>undefined;
  const entered=new Promise<void>(r=>{locked=r});
  const gate=new Promise<void>(r=>{unlock=r});
  holding=db.cliente.transaction(async tx=>{
   await tx.query("LOCK TABLE platform.event_log IN ACCESS EXCLUSIVE MODE");
   locked();
   await gate;
  });
  await entered;
  const blocked=workers.map(w=>get(w.port,"/api/entregas?unidade=ITAIM"));
  const activeCount=await eventually(async()=>{
   const rows=await observer.query(
    "SELECT pid FROM pg_stat_activity WHERE datname=current_database() "+
    "AND wait_event_type='Lock' AND query LIKE '%platform.event_log%' "+
    "AND pid<>pg_backend_pid()");
   return rows.length>=2?rows.length:null;
  });
  assert.equal(activeCount,2,
    "Two separate processes must each admit one SQL query even with configured max=1");
  const rejected=await Promise.all(workers.map(w=>get(w.port,"/api/entregas?unidade=ITAIM")));
  for(const x of rejected){
   assert.equal(x.status,503);
   assert.deepEqual(x.body,{erro:"leitura_temporariamente_ocupada"});
   assert.equal(x.headers["retry-after"],"1");
   assert.ok(x.ms<1000);
  }
  const healthBusy=await Promise.all(workers.map(w=>get(w.port,"/api/health")));
  assert.ok(healthBusy.every(x=>x.status===200));
  const expired=await Promise.all(blocked);
  for(const x of expired){
   assert.equal(x.status,503);
   assert.deepEqual(x.body,{erro:"prazo_total_excedido"});
   assert.ok(x.ms>=DEADLINE_MS-400&&x.ms<DEADLINE_MS+3000);
  }
  await eventually(async()=>{
   const rows=await observer.query(
    "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() "+
    "AND wait_event_type='Lock' AND query LIKE '%platform.event_log%' "+
    "AND pid<>pg_backend_pid()");
   return Number(rows[0].n)===0?true:null;
  });
  unlock();await holding;
  // Backend SQL can finish before the async route's finally frees its
  // admission slot. Do not mistake that race for permanent leakage, and do
  // not permit unbounded retries: every worker must recover within 8s.
  const recoveryStart=performance.now();
  const recoveryAttempts:number[]=[];
  const recovered=await Promise.all(workers.map(async w=>{
    let attempts=0;
    const good=await eventually(async()=>{
      attempts++;
      const x=await get(w.port,"/api/entregas?unidade=ITAIM");
      if(x.status===200 && x.body.leitura.disponivel===true)return x;
      if(x.status!==503 || !["leitura_temporariamente_ocupada","prazo_total_excedido"].includes(x.body.erro))
        throw Error("Q026_UNEXPECTED_RECOVERY_HTTP "+JSON.stringify({status:x.status,body:x.body}));
      return null;
    },8000);
    recoveryAttempts.push(attempts);
    return good;
  }));
  const recoveryWaitMs=+(performance.now()-recoveryStart).toFixed(2);
  assert.ok(recovered.every(x=>x.status===200&&x.body.leitura.disponivel===true));
  console.log("Q026_MULTIPROCESS_ADMISSION_SHADOW_PASS "+JSON.stringify({
   process_count:workers.length,distinct_node_pids:workers.map(w=>w.pid),
   per_process_max_inflight:LIMIT,global_active_sql_during_block:activeCount,
   reject_additional_requests:rejected.map(x=>x.status),
   active_query_deadlines:expired.map(x=>({status:x.status,ms:x.ms})),
   health_during_block:healthBusy.map(x=>x.status),
   recovered_after_rollback:recovered.map(x=>x.status),
   recovery_attempts:recoveryAttempts,recovery_wait_ms:recoveryWaitMs,
   boundary:"per-process admission != global cluster limit; isolated PG16 only"
  }));
 }finally{
  unlock();if(holding)await holding.catch(()=>undefined);
  await Promise.allSettled(workers.map(stopWorker));
  await observer.close();await db.descartar();
 }
})().catch(e=>{console.error("Q026_MULTIPROCESS_ADMISSION_SHADOW_FAILED",e);process.exitCode=1});
