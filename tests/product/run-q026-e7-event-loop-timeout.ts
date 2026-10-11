/**
 * E7 regression on the combined reader+PG-fix candidate.
 * Parent checks pg_stat_activity while a DIFFERENT Node process blocks its
 * event loop for 8s within a read-only RR transaction (HTTP budget 5s).
 * PostgreSQL16 is disposable. The timeout is set only on that NEW database,
 * never an existing role, other database or operational environment.
 */
import assert from "node:assert/strict";
import http from "node:http";
import {spawn} from "node:child_process";
import {join} from "node:path";
import {performance} from "node:perf_hooks";
import {bancoIsolado} from "../../src/platform/banco-isolado";

const pgUrl=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!pgUrl){console.error("Q026_E7_PG_REQUIRED");process.exit(78);}
const variant=process.env.Q026_E7_VARIANT;
const mode=process.env.Q026_E7_TIMEOUT_MODE;
assert.ok(variant==="canonical"||variant==="incremental","reader required");
assert.ok(mode==="baseline"||mode==="mitigated","baseline or mitigated required");
const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
type Response={status:number;body:{leitura?:{disponivel?:boolean;motivo?:string};erro?:string}};
function get(port:number,path:string):Promise<Response>{
 return new Promise((resolve,reject)=>{
  const req=http.request({host:"127.0.0.1",port,path,method:"GET",timeout:25000},res=>{
   let body="";res.setEncoding("utf8");res.on("data",(chunk:string)=>body+=chunk);
   res.on("end",()=>{try{resolve({status:res.statusCode??0,body:JSON.parse(body)})}
    catch(e){reject(new Error("Q026_E7_BAD_HTTP_JSON "+String(e)))}});res.on("error",reject);
  });
  req.on("timeout",()=>req.destroy(new Error("Q026_E7_HTTP_TIMEOUT")));
  req.on("error",reject);req.end();
 });
}
void(async()=>{
 const db=await bancoIsolado(pgUrl,undefined,"q026e7");
 let child:ReturnType<typeof spawn>|null=null;
 try{
  await db.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','E7 simulated unit')");
  await db.cliente.query(
   "INSERT INTO identity.device(device_id,unit_id,label,registered_at,secret_bound_at,last_session_at) "+
   "VALUES ('Q026-E7-DEV','ITAIM','Simulated','2026-10-09T00:00:00Z','2026-10-09T00:00:00Z','2026-10-09T18:00:00Z')");
  await db.cliente.query(
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,"+
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust) "+
   "SELECT 'q026-e7-'||g,'ITAIM','trip','E7-SIM','gps_batch_received','{}'::jsonb,"+
   "TIMESTAMPTZ '2026-10-10T16:00:00Z'+(g*interval '0.1 second'),"+
   "TIMESTAMPTZ '2026-10-10T16:00:00Z'+(g*interval '0.1 second'),"+
   "'device','q026-e7-'||g,'gps_batch_received@1.0.0','simulated',g,'Q026-E7-DEV','trusted' "+
   "FROM generate_series(1,5000) AS g");
  if(mode==="mitigated"){
   // Database created by this process; change applies ONLY to connections to it.
   await db.cliente.query(`ALTER DATABASE ${db.nome} SET idle_in_transaction_session_timeout = '1500ms'`);
  }
  const file=join(__dirname,"q026-e7-http-child.ts");
  child=spawn(process.execPath,[...process.execArgv,file],{
   env:{...process.env,DELIVERYOS_DATABASE_URL:db.url,DELIVERYOS_PG_URL:"",
    Q026_E7_VARIANT:variant},
   stdio:["ignore","pipe","pipe","ipc"]
  });
  const proc=child;
  let stderr="";
  proc.stderr!.on("data",(x:Buffer)=>{stderr+=(x.toString());if(stderr.length>3000)stderr=stderr.slice(-3000)});
  const received:Array<{type?:string;port?:number;pid?:number}>=[];
  const listeners=new Set<(m:{type?:string;port?:number;pid?:number})=>void>();
  proc.on("message",x=>{const m=x as {type?:string;port?:number;pid?:number};
   received.push(m);for(const cb of [...listeners])cb(m);
  });
  let exitCode:number|null|undefined=undefined;
  proc.on("exit",code=>{exitCode=code});
  const wait=(type:string,ms=15000)=>new Promise<{type?:string;port?:number;pid?:number}>((resolve,reject)=>{
   const prev=received.find(m=>m.type===type);if(prev)return resolve(prev);
   const timeout=setTimeout(()=>{listeners.delete(callback);reject(new Error("Q026_E7_NO_"+type+" "+stderr.slice(-600)))},ms);
   const callback=(m:{type?:string;port?:number;pid?:number})=>{
    if(m.type!==type)return;clearTimeout(timeout);listeners.delete(callback);resolve(m);
   };listeners.add(callback);
  });
  const ready=await wait("ready",30000);const port=Number(ready.port);
  assert.ok(Number.isSafeInteger(port)&&port>0,"child did not expose HTTP port");
  assert.equal((await get(port,"/api/health")).status,200);
  const before=await get(port,"/api/entregas?unidade=ITAIM");
  assert.equal(before.status,200);
  assert.equal(before.body.leitura?.disponivel,true);
  proc.send?.({type:"arm"});await wait("armed");
  const started=performance.now();
  const pending=get(port,"/api/entregas?unidade=ITAIM");
  const freeze=await wait("frozen",20000);
  const pid=Number(freeze.pid);assert.ok(Number.isSafeInteger(pid)&&pid>0);
  const states=await db.cliente.query<{state:string;xmin:boolean}>(
   "SELECT state,backend_xmin IS NOT NULL AS xmin FROM pg_stat_activity WHERE pid=$1",[pid]);
  assert.equal(states[0]?.state,"idle in transaction","positive control: transaction not idle");
  assert.equal(states[0]?.xmin,true,"positive control: no live snapshot to protect");
  const tFreeze=performance.now();
  await sleep(2700);
  const after=await db.cliente.query<{state:string}>(
   "SELECT state FROM pg_stat_activity WHERE pid=$1",[pid]);
  const gone=after.length===0;
  assert.equal(gone,mode==="mitigated",
   "DB-side timeout did not distinguish mitigated from baseline");
  const response=await pending;
  const elapsed=performance.now()-started;
  assert.ok(elapsed>=7500,"8-second event-loop stall was not actually exercised");
  assert.equal(exitCode,undefined,"Node HTTP process unexpectedly exited");
  if(mode==="mitigated"){
   assert.ok(response.status===503||(response.status===200&&response.body.leitura?.disponivel===false),
    "terminated transaction produced apparently confirmed HTTP reality");
  }
  assert.equal((await get(port,"/api/health")).status,200);
  let recovered=false;
  for(let i=0;i<12;i++){
   const next=await get(port,"/api/entregas?unidade=ITAIM");
   if(next.status===200&&next.body.leitura?.disponivel===true){recovered=true;break}
   await sleep(150);
  }
  assert.ok(recovered,"HTTP server did not recover after event-loop stall");
  console.log("Q026_E7_EVENT_LOOP_TEST_PASS "+JSON.stringify({
   variant,mode,blocked_ms:8000,http_budget_ms:5000,
   idle_timeout_ms:mode==="mitigated"?1500:null,
   snapshot_observed:true,backend_removed_during_block:gone,
   failed_request_status:response.status,failed_request_available:response.body.leitura?.disponivel??null,
   request_elapsed_ms:Math.round(elapsed),process_alive:true,next_read_available:true,
   conclusion:mode==="baseline"?"expected_negative_control_http_budget_does_not_bound_pg_snapshot":"db_idle_timeout_releases_pg_session_despite_stalled_node",
   boundary:"runner-local disposable PG16; no operational settings"
  }));
  proc.send?.({type:"stop"});
  await new Promise<void>(resolve=>{
   if(proc.exitCode!==null)return resolve();
   proc.once("exit",()=>resolve());setTimeout(()=>{proc.kill("SIGKILL");resolve()},3000).unref();
  });
 }finally{
  if(child?.exitCode===null)child.kill("SIGKILL");
  await db.descartar();
 }
})().catch(e=>{console.error("Q026_E7_EVENT_LOOP_TEST_FAIL",e);process.exitCode=1});
