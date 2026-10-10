/**
 * Q-026 SHADOW — observe event-loop fairness while the ACTUAL Product System
 * executes concurrent full-model RR reads. This is a diagnostic, not a
 * latency guarantee and not a change to runtime behavior.
 *
 * All facts fictional, throwaway PostgreSQL16, localhost HTTP port 0.
 * Do not infer p95/p99 SLAs from a single CI run.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";

const admin=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!admin){console.error("Q026_EVENT_LOOP_PG_REQUIRED");process.exit(78)}
const N=Number(process.env.Q026_EVENT_LOOP_EVENTS??20000);
assert.ok([20000,120000].includes(N),"fixture constrained");
const pause=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
type Response={status:number;body:any;wall_ms:number};
function get(port:number,path:string):Promise<Response>{
 const t=performance.now();
 return new Promise((resolve,reject)=>{
  const q=http.request({host:"127.0.0.1",port,path,method:"GET",timeout:30000},res=>{
   let text="";res.setEncoding("utf8");res.on("data",(x:string)=>text+=x);
   res.on("end",()=>{
    try{resolve({status:res.statusCode??0,body:JSON.parse(text),
      wall_ms:+(performance.now()-t).toFixed(2)})}
    catch(e){reject(Error("NON_JSON_RESPONSE "+String(e)))}
   });
  });
  q.on("error",reject);q.on("timeout",()=>q.destroy(Error("Q026_HTTP_PROBE_TIMED_OUT")));
  q.end();
 });
}
function percentile(values:number[],fraction:number):number{
 if(!values.length)return 0;
 const v=[...values].sort((a,b)=>a-b);
 return +v[Math.min(v.length-1,Math.ceil(v.length*fraction)-1)].toFixed(2);
}
void(async()=>{
 const db=await bancoIsolado(admin,undefined,"q026loop");
 let srv:http.Server|null=null;
 try{
  await db.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Fictional Itaim')");
  await db.cliente.query(
   "INSERT INTO identity.device(device_id,unit_id,label,registered_at,secret_bound_at,last_session_at) "+
   "VALUES ('Q026-LOOP-DEVICE','ITAIM','Fictional','2026-10-09T00:00:00Z','2026-10-09T00:00:00Z','2026-10-09T18:00:00Z')");
  const insert=[
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
   "SELECT 'q026-loop-'||g,'ITAIM','trip','TRIP-LOOP','gps_batch_received','{}'::jsonb,",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.01 second'),",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.01 second'),",
   "'device','loop-key-'||g,'gps_batch_received@1.0.0','simulated',g,'Q026-LOOP-DEVICE','trusted'",
   "FROM generate_series($1::int,$2::int) g"
  ].join(" ");
  for(let i=1;i<=N;i+=30000)await db.cliente.query(insert,[i,Math.min(N,i+29999)]);
  await db.cliente.query("ANALYZE platform.event_log");
  process.env.DELIVERYOS_DATABASE_URL=db.url;
  process.env.DELIVERYOS_ENTREGAS_MAX_INFLIGHT="2";
  process.env.DELIVERYOS_ENTREGAS_RR_DEADLINE_MS="15000";
  const {criarServidor}=await import("../../tools/product_system_server");
  srv=await criarServidor();
  await new Promise<void>((resolve,reject)=>{
   srv!.once("error",reject);srv!.listen(0,"127.0.0.1",resolve);
  });
  const address=srv.address();assert.ok(address&&typeof address!=="string");
  const port=address.port;
  const baseHealth=await get(port,"/api/health");
  assert.equal(baseHealth.status,200);
  const d=monitorEventLoopDelay({resolution:10});
  d.enable();await pause(75);
  const rssBeforeMiB=+(process.memoryUsage().rss/1048576).toFixed(2);
  const healthTimes:number[]=[];
  const probePending:Promise<void>[]=[];
  const pendingLimit=4;
  let pulses=0,missed=0;
  const at=performance.now();
  let lastTick=at;
  const timer=setInterval(()=>{
    const now=performance.now();
    pulses++;
    const intervalDelay=now-lastTick-30;
    if(intervalDelay>100)missed++;
    lastTick=now;
    if(probePending.length>pulses+pendingLimit)return;
    const p=get(port,"/api/health").then(r=>{
      assert.equal(r.status,200);
      healthTimes.push(r.wall_ms);
    });
    // Each probe stays accounted; no hidden unhandled request failure.
    probePending.push(p);
  },30);
  const two=await Promise.all([
   get(port,"/api/entregas?unidade=ITAIM"),
   get(port,"/api/entregas?unidade=ITAIM"),
  ]);
  clearInterval(timer);
  await Promise.all(probePending);
  d.disable();
  const rssAfterMiB=+(process.memoryUsage().rss/1048576).toFixed(2);
  assert.equal(two.length,2);
  for(const x of two){
   // A full-model read may be limited by guard at higher scale; that is a
   // degraded result, never "empty". The purpose here is to measure fairness.
   assert.ok(x.status===200||x.status===503,"unexpected HTTP status");
   if(x.status===200)assert.equal(x.body.leitura.disponivel,true);
   else assert.ok(x.body.erro==="prazo_total_excedido"||
     x.body.erro==="leitura_temporariamente_ocupada");
  }
  assert.ok(healthTimes.length>=1,"health probe did not run at all");
  const metrics={
   events:N,concurrent_entregas:2,
   entregas_http_statuses:two.map(x=>x.status),
   entregas_wall_ms:two.map(x=>x.wall_ms),
   health_probe_count:healthTimes.length,
   health_probe_p50_ms:percentile(healthTimes,.50),
   health_probe_p95_sample_ms:percentile(healthTimes,.95),
   health_probe_p99_sample_ms:percentile(healthTimes,.99),
   health_probe_max_ms:+Math.max(...healthTimes).toFixed(2),
   event_loop_delay_p95_ms:+(d.percentile(95)/1e6).toFixed(2),
   event_loop_delay_p99_ms:+(d.percentile(99)/1e6).toFixed(2),
   event_loop_delay_max_ms:+(d.max/1e6).toFixed(2),
   delayed_ticks_over_100ms:missed,tick_count:pulses,
   rss_before_mib:rssBeforeMiB,rss_after_mib:rssAfterMiB,
   boundary:"single CI sample, synthetic PostgreSQL16 and same-process health; no SLA"
  };
  console.log("Q026_EVENT_LOOP_HTTP_SHADOW_MEASURED "+JSON.stringify(metrics));
 }finally{
  if(srv)await new Promise<void>(r=>srv!.close(()=>r()));
  await db.descartar();
 }
})().catch(e=>{console.error("Q026_EVENT_LOOP_HTTP_SHADOW_FAILED",e);process.exitCode=1});
