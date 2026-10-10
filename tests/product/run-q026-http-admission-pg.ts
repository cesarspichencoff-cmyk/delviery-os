/**
 * Q-026 opt-in admission gate, REAL HTTP Product System and throwaway PG16.
 * 16,000 fictional facts make the work overlap: 10 parallel GETs exercise
 * configured in-flight capacity 2, fail-fast 503, and recovery on completion.
 * No production endpoint, no operational DB, no deployment.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { bancoIsolado } from "../../src/platform/banco-isolado";
const url=(process.env.DELIVERYOS_PG_URL||"").trim();
if(!url){
 console.error("PULADO: DELIVERYOS_PG_URL ausente; nenhum ensaio HTTP realizado");
 process.exit(78);
}
type Response={status:number;headers:http.IncomingHttpHeaders;body:any;raw:string};
function get(s:http.Server,path:string,method="GET"):Promise<Response>{
 const addr=s.address();
 if(!addr||typeof addr==="string")throw Error("no local address");
 return new Promise((resolve,reject)=>{
  const q=http.request({host:"127.0.0.1",port:addr.port,path,method,timeout:15000},r=>{
   let raw="";
   r.setEncoding("utf8");r.on("data",(x:string)=>raw+=x);
   r.on("end",()=>{
    try{resolve({status:r.statusCode||0,headers:r.headers,body:JSON.parse(raw),raw})}
    catch{reject(Error("HTTP_NON_JSON"))}
   });
  });
  q.on("error",reject);
  q.on("timeout",()=>q.destroy(Error("HTTP_TEST_TIMEOUT")));
  q.end();
 });
}
let passed=0;
async function test(name:string,f:()=>Promise<void>){
 await f();passed++;console.log("PASS "+passed+" "+name);
}
void(async()=>{
 const b=await bancoIsolado(url,undefined,"q026admit");
 let s:http.Server|null=null,discarded=false;
 try{
  await b.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim')");
  await b.cliente.query(`INSERT INTO identity.device
    (device_id,unit_id,label,registered_at,secret_bound_at,last_session_at)
    VALUES ('dev-admission','ITAIM','Fictional phone',now(),now(),now())`);
  await b.cliente.query(`INSERT INTO platform.event_log
    (event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,
     recorded_at,origin,idempotency_key,contract_version,device_id,
     sequence_local,source_mode,clock_trust)
    SELECT 'admit-event-'||g,'ITAIM','trip','TRIP-ADMIT',
      CASE WHEN g=1 THEN 'trip_created' WHEN g=2 THEN 'trip_started'
       ELSE 'gps_batch_received' END,'{}'::jsonb,
      now()-(16001-g)*interval '1 millisecond',
      now()-(16001-g)*interval '1 millisecond',
      'device','admit-key-'||g,
      CASE WHEN g=1 THEN 'trip_created@1.0.0'
       WHEN g=2 THEN 'trip_started@1.0.0'
       ELSE 'gps_batch_received@1.0.0' END,
      'dev-admission',g,'simulated','trusted'
    FROM generate_series(1,16000) AS g`);
  process.env.DELIVERYOS_DATABASE_URL=b.url; // explicitly isolated DB URL
  process.env.DELIVERYOS_ENTREGAS_MAX_INFLIGHT="2"; // opt-in only in this test
  const {criarServidor}=await import("../../tools/product_system_server");
  s=await criarServidor();
  await new Promise<void>((resolve,reject)=>{
   s!.once("error",reject);s!.listen(0,"127.0.0.1",resolve);
  });
  const server=s;
  await test("01 admission: concurrent HTTP reads return success or deliberate 503 only",async()=>{
   const rr=await Promise.all(Array.from({length:10},()=>get(server,"/api/entregas?unidade=ITAIM")));
   const ok=rr.filter(r=>r.status===200),busy=rr.filter(r=>r.status===503);
   assert.ok(ok.length>=1&&ok.length<=2,
      "HTTP read-admission limit of 2 not enforced");
   assert.ok(busy.length>=8,"expected fail-fast HTTP backpressure");
   assert.equal(ok.length+busy.length,10,"unexpected silent HTTP failure");
   for(const r of ok){
    assert.equal(r.body.leitura.disponivel,true);
    assert.ok(r.body.leitura.aparelhos.some((a:any)=>a.device_id==="dev-admission"));
   }
   for(const r of busy){
    assert.equal(r.headers["retry-after"],"1");
    assert.equal(r.headers["cache-control"],"no-store");
    assert.deepEqual(r.body,{erro:"leitura_temporariamente_ocupada"});
    assert.equal(r.raw.includes(b.url),false);
    assert.equal(r.raw.includes("TRIP-ADMIT"),false);
   }
  });
  await test("02 admitted slots are released after all promises settle",async()=>{
   const r=await get(server,"/api/entregas?unidade=ITAIM");
   assert.equal(r.status,200);
   assert.equal(r.body.leitura.disponivel,true);
  });
  await test("03 other endpoints stay available during admission enforcement",async()=>{
   const health=await get(server,"/api/health");
   assert.equal(health.status,200);assert.equal(health.body.somente_leitura,true);
   const write=await get(server,"/api/entregas","POST");
   assert.equal(write.status,405);
  });
  await test("04 outage remains unavailable, does not cause permanent admission lock",async()=>{
   await b.descartar();discarded=true;
   const first=await get(server,"/api/entregas");
   const second=await get(server,"/api/entregas");
   for(const response of [first,second]){
    assert.equal(response.status,200);
    assert.equal(response.body.leitura.disponivel,false);
    assert.equal(response.body.leitura.motivo,"indisponivel");
   }
  });
  console.log("Q026_HTTP_OPT_IN_ADMISSION: "+passed+"/4 PASS");
 }finally{
  if(s)await new Promise<void>(resolve=>s!.close(()=>resolve()));
  if(!discarded)await b.descartar();
 }
})().catch(e=>{console.error("Q026_HTTP_OPT_IN_ADMISSION_FAILED",e);process.exitCode=1});
