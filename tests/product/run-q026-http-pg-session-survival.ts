/**
 * Adversarial integration: the actual /api/entregas route must survive a
 * PostgreSQL session terminated DURING a blocked transaction, then recover.
 * One disposable DB per run, localhost only, simulated event data.
 * Run twice in independent processes: Q026_HTTP_KILL_READER=canonical|incremental.
 * No DELIVERYOS_PG_URL -> exit 78, never a green test without DB.
 */
import assert from "node:assert/strict";
import http from "node:http";
import {performance} from "node:perf_hooks";
import {bancoIsolado} from "../../src/platform/banco-isolado";
import {createPgClient} from "../../src/platform/persistence/sql-client";

const adminUrl=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!adminUrl){console.error("Q026_HTTP_PG_KILL_REQUIRED");process.exit(78);}
const variant=process.env.Q026_HTTP_KILL_READER;
assert.ok(variant==="canonical"||variant==="incremental","reader variant must be explicit");
const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
type Response={status:number;body:{leitura?:{disponivel?:boolean;motivo?:string};erro?:string}};
function get(port:number,path:string):Promise<Response>{
 return new Promise((resolve,reject)=>{
  const req=http.request({host:"127.0.0.1",port,path,method:"GET",timeout:20000},res=>{
   let body="";res.setEncoding("utf8");res.on("data",(part:string)=>body+=part);
   res.on("end",()=>{try{resolve({status:res.statusCode??0,body:JSON.parse(body)})}
    catch(err){reject(new Error("Q026_HTTP_NON_JSON "+String(err)))}});res.on("error",reject);
  });
  req.on("timeout",()=>req.destroy(new Error("Q026_HTTP_TIMEOUT")));
  req.on("error",reject);req.end();
 });
}
async function poll<T>(fn:()=>Promise<T|null>,timeMs=12000):Promise<T>{
 const started=performance.now();
 for(;;){const x=await fn();if(x!==null)return x;
  if(performance.now()-started>timeMs)throw new Error("Q026_HTTP_DB_KILL_POLL_EXPIRED");
  await sleep(25);
 }
}
void(async()=>{
 const db=await bancoIsolado(adminUrl,undefined,"q026killhttp");
 const locker=await createPgClient({url:db.url,max:1});
 let server:http.Server|null=null;
 let unlock!:()=>void;const release=new Promise<void>(r=>{unlock=r});
 let locked!:()=>void;const acquired=new Promise<void>(r=>{locked=r});
 let held:Promise<unknown>|null=null;
 try{
  await db.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Synthetic Q026 unit')");
  await db.cliente.query(
   "INSERT INTO identity.device(device_id,unit_id,label,registered_at,secret_bound_at,last_session_at) "+
   "VALUES ('Q026-KILL-DEV','ITAIM','Synthetic', '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z', '2026-10-09T18:00:00Z')");
  await db.cliente.query(
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,"+
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust) "+
   "SELECT 'q026-kill-'||g,'ITAIM','trip','TRIP-KILL','gps_batch_received','{}'::jsonb,"+
   "TIMESTAMPTZ '2026-10-10T16:00:00Z'+(g*interval '0.1 second'),"+
   "TIMESTAMPTZ '2026-10-10T16:00:00Z'+(g*interval '0.1 second'),"+
   "'device','q026-kill-'||g,'gps_batch_received@1.0.0','simulated',g,'Q026-KILL-DEV','trusted' "+
   "FROM generate_series(1,2500) AS g");
  process.env.DELIVERYOS_DATABASE_URL=db.url;
  process.env.DELIVERYOS_ENTREGAS_MAX_INFLIGHT="1";
  process.env.DELIVERYOS_ENTREGAS_RR_DEADLINE_MS="15000";
  if(variant==="incremental")process.env.DELIVERYOS_ENTREGAS_INCREMENTAL_RR="1";
  else delete process.env.DELIVERYOS_ENTREGAS_INCREMENTAL_RR;
  const {criarServidor}=await import("../../tools/product_system_server");
  server=await criarServidor();
  await new Promise<void>((resolve,reject)=>{
   server!.once("error",reject);server!.listen(0,"127.0.0.1",resolve);
  });
  const address=server.address();assert.ok(address&&typeof address!=="string");
  const port=address.port;
  const before=await get(port,"/api/entregas?unidade=ITAIM");
  assert.equal(before.status,200);assert.equal(before.body.leitura?.disponivel,true);
  assert.equal((await get(port,"/api/health")).status,200);

  // A separate leased connection owns the lock; the admin pool remains free
  // to observe pg_stat_activity and terminate exactly the blocked backend.
  held=locker.transaction(async tx=>{
   await tx.query("LOCK TABLE platform.event_log IN ACCESS EXCLUSIVE MODE");
   locked();await release;
  });
  await acquired;
  const inFlight=get(port,"/api/entregas?unidade=ITAIM");
  const pid=await poll(async()=>{
   const rows=await db.cliente.query<{pid:number}>(
    "SELECT pid FROM pg_stat_activity WHERE datname=current_database() "+
    "AND wait_event_type='Lock' AND query LIKE '%platform.event_log%' "+
    "AND pid<>pg_backend_pid() ORDER BY pid DESC LIMIT 1");
   return rows.length?Number(rows[0]!.pid):null;
  });
  assert.ok(Number.isSafeInteger(pid)&&pid>0);
  const hit=await db.cliente.query<{terminated:boolean}>(
   "SELECT pg_terminate_backend($1::int) AS terminated",[pid]);
  assert.equal(hit[0]?.terminated,true);
  const response=await inFlight;
  assert.equal(response.status,200,"error must become an unavailable block, not socket reset");
  assert.equal(response.body.leitura?.disponivel,false);
  assert.equal(response.body.leitura?.motivo,"indisponivel");
  assert.equal((await get(port,"/api/health")).status,200);

  unlock();await held;held=null;
  const after=await poll(async()=>{
   const x=await get(port,"/api/entregas?unidade=ITAIM");
   return x.status===200&&x.body.leitura?.disponivel===true?x:null;
  },12000);
  assert.equal(after.body.leitura?.disponivel,true);
  const sessions=await db.cliente.query<{n:string}>(
   "SELECT count(*)::text AS n FROM pg_stat_activity "+
   "WHERE datname=current_database() AND pid=$1",[pid]);
  assert.equal(Number(sessions[0]?.n),0,"terminated connection must not be reused");
  console.log("Q026_REAL_HTTP_PG_SESSION_SURVIVAL_PASS "+JSON.stringify({
   reader:variant,killed_backend:pid,terminated:true,
   failed_read_status:response.status,failed_read_availability:false,
   next_read_status:200,next_read_available:true,health:200,
   terminated_backend_removed:true,fixture:"disposable_pg16_2500_simulated_events",
   note:"CI integration only; no hosted preview or production proof"
  }));
 }finally{
  unlock();
  if(held)await held.catch(()=>undefined);
  if(server){server.closeAllConnections?.();await new Promise<void>(r=>server!.close(()=>r()));}
  await locker.close().catch(()=>undefined);
  await db.descartar();
 }
})().catch(e=>{console.error("Q026_REAL_HTTP_PG_SESSION_SURVIVAL_FAIL",e);process.exitCode=1});
