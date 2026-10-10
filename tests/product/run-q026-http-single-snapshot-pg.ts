/**
 * DeliveryOS Q-026: exercise the ACTUAL GET /api/entregas HTTP handler.
 * A disposable migrated PostgreSQL database is the ONLY database.
 * DELIVERYOS_PG_URL is the ADMINISTRATIVE fixture URL, never used by the
 * server. The server is given the explicit ephemeral database URL instead.
 */
import assert from "node:assert/strict";
import type http from "node:http";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import type { SqlClient } from "../../src/platform/persistence/sql-client";

const base=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!base){
 console.error("PULADO: DELIVERYOS_PG_URL ausente — nenhum teste HTTP+PG executado");
 process.exit(78);
}
const ago=(sec:number)=>new Date(Date.now()-sec*1000).toISOString();
async function addEvent(c:SqlClient,id:string,t:string,seconds:number,seq:number){
 const at=ago(seconds);
 await c.query(`INSERT INTO platform.event_log
   (event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,recorded_at,
    origin,idempotency_key,contract_version,device_id,sequence_local,source_mode,clock_trust)
   VALUES ($1,'ITAIM','trip','TRIP-HTTP-Q026',$2,'{}'::jsonb,$3,$3,'device',$4,$5,'dev-q026-http',$6,'simulated','trusted')`,
  [id,t,at,"idempotent-"+id,t+"@1.0.0",seq]);
}
function jsonResponse(server:http.Server,path:string,method="GET"):Promise<{status:number;body:any;raw:string}>{
 const address=server.address();
 if(!address||typeof address==="string")throw Error("HTTP server has no local port");
 return new Promise((resolve,reject)=>{
  const req=require("node:http").request({
   hostname:"127.0.0.1",port:address.port,path,method,
   timeout:15000,
  },(res:http.IncomingMessage)=>{
   let s="";
   res.setEncoding("utf8");
   res.on("data",(chunk:string)=>{s+=chunk});
   res.on("end",()=>{
    try{resolve({status:res.statusCode||0,body:JSON.parse(s),raw:s})}
    catch(e){reject(new Error("Non-JSON HTTP response"))}
   });
  });
  req.on("timeout",()=>req.destroy(new Error("HTTP fixture timeout")));
  req.on("error",reject);
  req.end();
 });
}
let n=0;const test=async(name:string,fn:()=>Promise<void>)=>{
 await fn();n++;console.log("PASS "+n+" "+name);
};
void(async()=>{
 const b=await bancoIsolado(base,undefined,"q026http");
 let s:http.Server|null=null;
 let discarded=false;
 try{
  const c=b.cliente;
  await c.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim')");
  await c.query(`INSERT INTO identity.device
  (device_id,unit_id,label,registered_at,secret_bound_at,last_session_at)
  VALUES ('dev-q026-http','ITAIM','Aparelho ficticio',$1,$1,$2)`,
  [ago(86400),ago(1200)]);
  await addEvent(c,"q026-http-trip-created","trip_created",1500,1);
  await addEvent(c,"q026-http-trip-started","trip_started",1400,2);
  await addEvent(c,"q026-http-gps-old","gps_batch_received",540,3);
  // Imported only AFTER providing the explicitly isolated runtime DB URL.
  // The application reads DELIVERYOS_DATABASE_URL at module initialization.
  process.env.DELIVERYOS_DATABASE_URL=b.url;
  const { criarServidor }=await import("../../tools/product_system_server");
  s=await criarServidor();
  await new Promise<void>((resolve,reject)=>{
   s!.once("error",reject);
   s!.listen(0,"127.0.0.1",resolve);
  });
  const server=s;
  await test("01 /api/health recognizes only read-only server data",async()=>{
   const r=await jsonResponse(server,"/api/health");
   assert.equal(r.status,200);
   assert.equal(r.body.leitura_do_servidor,true);
   assert.equal(r.body.somente_leitura,true);
   assert.equal(r.body.acao_operacional,false);
  });
  await test("02 initial /api/entregas reads a real fixture device and trip",async()=>{
   const r=await jsonResponse(server,"/api/entregas?unidade=ITAIM");
   assert.equal(r.status,200);
   assert.equal(r.body.leitura.disponivel,true);
   const d=r.body.leitura.aparelhos.find((a:any)=>a.device_id==="dev-q026-http");
   assert.ok(d,"HTTP endpoint did not use configured disposable PostgreSQL");
   assert.equal(d.ultima_posicao.observado,true);
   assert.ok(d.ultima_posicao.segundos>=510,"first GPS should be about 9 minutes old");
   assert.ok(r.body.leitura.viagens.na_rua.some((x:any)=>x.viagem_id==="TRIP-HTTP-Q026"));
  });
  await test("03 following POSTGRESQL commit, next HTTP GET uses a NEW snapshot",async()=>{
   const before=await jsonResponse(server,"/api/entregas?unidade=ITAIM");
   const old=before.body.leitura.aparelhos.find((a:any)=>a.device_id==="dev-q026-http");
   assert.ok(old?.ultima_posicao.observado);
   await addEvent(c,"q026-http-gps-new","gps_batch_received",5,4);
   const after=await jsonResponse(server,"/api/entregas?unidade=ITAIM");
   const updated=after.body.leitura.aparelhos.find((a:any)=>a.device_id==="dev-q026-http");
   assert.equal(after.status,200);
   assert.equal(after.body.leitura.disponivel,true);
   assert.ok(updated?.ultima_posicao.observado);
   assert.ok(updated.ultima_posicao.segundos<old.ultima_posicao.segundos,
    "new HTTP response failed to observe committed GPS");
   const v=after.body.leitura.viagens.na_rua.find((x:any)=>x.viagem_id==="TRIP-HTTP-Q026");
   assert.ok(v,"trip missing after update");
   // Both are derived from the same snapshot; no contradiction after commit.
   assert.equal(v.posicao.observado,true);
  });
  await test("04 unit filter never silently widens to all units",async()=>{
   const r=await jsonResponse(server,"/api/entregas?unidade=INEXISTENTE");
   assert.equal(r.status,200);
   assert.equal(r.body.leitura.disponivel,true);
   assert.equal(r.body.leitura.unidade_encontrada,false);
   assert.equal(r.body.leitura.aparelhos.length,0);
  });
  await test("05 HTTP POST is rejected before any database mutation",async()=>{
   const [{n:before}]=await c.query<{n:number}>("SELECT count(*)::int AS n FROM platform.event_log");
   const r=await jsonResponse(server,"/api/entregas","POST");
   assert.equal(r.status,405);
   assert.equal(r.body.erro,"metodo_nao_permitido");
   const [{n:after}]=await c.query<{n:number}>("SELECT count(*)::int AS n FROM platform.event_log");
   assert.equal(after,before);
  });
  await test("06 discarded fixture database results in unavailable, not fake zero",async()=>{
   await b.descartar();discarded=true;
   const r=await jsonResponse(server,"/api/entregas?unidade=ITAIM");
   assert.equal(r.status,200);
   assert.equal(r.body.leitura.disponivel,false);
   assert.equal(r.body.leitura.motivo,"indisponivel");
   assert.equal(r.raw.includes(b.url),false,"leaked database connection URL");
   assert.equal(r.raw.includes("password"),false);
  });
  console.log("Q026_HTTP_SINGLE_SNAPSHOT: "+n+"/6 PASS");
 }finally{
  if(s)await new Promise<void>(resolve=>s!.close(()=>resolve()));
  if(!discarded)await b.descartar();
 }
})().catch(e=>{console.error("Q026_HTTP_SINGLE_SNAPSHOT_FAILED",e);process.exitCode=1});
