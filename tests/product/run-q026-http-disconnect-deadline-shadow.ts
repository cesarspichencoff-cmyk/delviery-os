/**
 * Q-026 SHADOW ONLY. Exercise REAL localhost HTTP sockets with a proposed
 * request-lifecycle adapter around the real canonical RR reader (PR #45).
 *
 * Demonstrates one possible remedy. It is NOT wired into the actual
 * tools/product_system_server.ts GET /api/entregas handler.
 * No production routes, runtime edits, migrations or external endpoints.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient, type SqlClient,type SqlRow,type TransactionalSqlClient } from "../../src/platform/persistence/sql-client";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";

const URL=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!URL){console.error("Q026_HTTP_ABORT_PG_REQUIRED");process.exit(78)}
const N=Number(process.env.Q026_HTTP_EVENTS??120000);
assert.ok([20000,120000].includes(N),"isolated event counts only");
const sleepMs=10000;
const now=new Date("2026-10-10T18:00:00Z");
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function until(test:()=>Promise<boolean>,maxMs=18000){
 const started=performance.now();
 for(;;){
  if(await test())return;
  if(performance.now()-started>maxMs)throw Error("HTTP_SHADOW_WAIT_TIMEOUT");
  await pause(35);
 }
}
type Case="aborted"|"deadline"|"normal";
type CaseMetric={mode:Case;started:number;finished:number|null;
 pid:number;cancelTime:number|null;errorCode:string|null;stopReason:string|null;
 responseCode:number|null;poolReleased:boolean};
const errCode=(e:unknown)=>
 typeof e==="object"&&e!==null&&"code" in e?String((e as {code:unknown}).code):null;

void(async()=>{
 const db=await bancoIsolado(URL,undefined,"q026httpabort");
 const reader=await createPgClient({url:db.url,max:1,connectionTimeoutMillis:350,statementTimeoutMs:15000});
 const writer=await createPgClient({url:db.url,max:1,statementTimeoutMs:15000});
 const observer=await createPgClient({url:db.url,max:2,statementTimeoutMs:15000});
 let server:http.Server|null=null;
 let inFlight=0,maxObserved=0,denied=0;
 const cases:CaseMetric[]=[];
 try{
  await db.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim synthetic')");
  await db.cliente.query(
   "INSERT INTO identity.device(device_id,unit_id,label,registered_at) "+
   "VALUES ('DEV-HTTP-SHADOW','ITAIM','Fictional','2026-10-09T00:00:00Z')");
  const sql=[
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
   "SELECT 'http-q026-'||g,'ITAIM','trip','TRIP-HTTP-SHADOW','gps_batch_received','{}'::jsonb,",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.01 second'),",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.01 second'),",
   "'device','http-q026-'||g,'gps_batch_received@1.0.0','simulated',g,'DEV-HTTP-SHADOW','trusted'",
   "FROM generate_series($1::integer,$2::integer) g"
  ].join(" ");
  for(let i=1;i<=N;i+=30000)await db.cliente.query(sql,[i,Math.min(N,i+29999)]);
  await db.cliente.query("ANALYZE platform.event_log");

  // Dedicated SHADOW HTTP server, not the product's actual runtime server.
  server=http.createServer((req,res)=>{
   if(req.url==="/health"){
    res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});
    res.end(JSON.stringify({ok:true,read_only:true}));return;
   }
   if(req.url?.startsWith("/shadow/entregas")!==true || req.method!=="GET"){
    res.writeHead(405,{"Content-Type":"application/json","Cache-Control":"no-store"});
    res.end(JSON.stringify({erro:"metodo_nao_permitido"}));return;
   }
   if(inFlight>=1){
    denied++;
    res.writeHead(503,{"Content-Type":"application/json","Cache-Control":"no-store","Retry-After":"1"});
    res.end(JSON.stringify({erro:"leitura_temporariamente_ocupada"}));return;
   }
   inFlight++;maxObserved=Math.max(maxObserved,inFlight);
   const requestUrl=new URL(req.url,"http://localhost");
   const mode=requestUrl.searchParams.get("mode") as Case;
   const hold=mode!=="normal";
   const deadlineMs=mode==="deadline"?4500:15000;
   const entry:CaseMetric={mode,started:performance.now(),finished:null,
     pid:0,cancelTime:null,errorCode:null,stopReason:null,responseCode:null,poolReleased:false};
   cases.push(entry);
   let pendingCancel:Promise<unknown>|null=null;
   const stop=(reason:"disconnect"|"deadline")=>{
    if(entry.stopReason!==null||entry.finished!==null)return;
    entry.stopReason=reason;
    entry.cancelTime=performance.now();
    if(entry.pid>0){
      pendingCancel=observer.query("SELECT pg_cancel_backend($1::int) AS cancelled",[entry.pid])
        .then(rows=>assert.equal(rows[0]?.cancelled,true,"PG backend cancellation refused"));
      void pendingCancel.catch(e=>console.error("SHADOW_CANCEL_ERROR",e));
    }
   };
   const timer=setTimeout(()=>stop("deadline"),deadlineMs);
   res.on("close",()=>{if(!res.writableEnded)stop("disconnect")});
   const tracked:TransactionalSqlClient={
    query:<R extends SqlRow=SqlRow>(sql:string,args?:readonly unknown[])=>reader.query<R>(sql,args),
    close:async()=>undefined,
    transaction:<T>(fn:(tx:SqlClient)=>Promise<T>)=>reader.transaction(async tx=>{
      const spy:SqlClient={query:async<R extends SqlRow=SqlRow>(sql:string,args?:readonly unknown[])=>{
        if(entry.stopReason!==null)throw Error("Q026_ABORT_BEFORE_SQL");
        if(sql.includes("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")){
          const v=await tx.query<R>(sql,args);
          entry.pid=Number((await tx.query("SELECT pg_backend_pid()::int AS pid"))[0].pid);
          assert.ok(entry.pid>0);
          return v;
        }
        const result=await tx.query<R>(sql,args);
        // Delay AFTER first SQL read pinned the RR snapshot. Both the socket
        // and deadline can now cancel a real in-flight PG statement.
        if(hold && sql.includes("FROM platform.event_log") && /event_type\s*=\s*ANY/i.test(sql)){
          await tx.query("SELECT pg_sleep(10)");
        }
        if(entry.stopReason!==null)throw Error("Q026_ABORT_AFTER_SQL");
        return result;
      }};
      return fn(spy);
    })
   };
   void(async()=>{
    try{
      const reality=await lerRealidadeDeEntregas(tracked,{agora:now});
      if(entry.stopReason!==null)throw Error("Q026_DELIVERED_AFTER_ABORT");
      assert.equal(reality.aparelhos.length,1);
      assert.equal(reality.projecoes.flatMap(p=>p.viagens)[0]?.eventos.length,mode==="normal"?N+1:N);
      if(!res.destroyed){entry.responseCode=200;res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});
       res.end(JSON.stringify({ok:true,devices:reality.aparelhos.length,facts:N}));}
    }catch(error){
      entry.errorCode=errCode(error);
      if(entry.stopReason===null)console.error("Q026_HTTP_SHADOW_UNEXPECTED",error);
      if(!res.destroyed){
        entry.responseCode=entry.stopReason==="deadline"?503:500;
        res.writeHead(entry.responseCode,{"Content-Type":"application/json","Cache-Control":"no-store"});
        res.end(JSON.stringify({erro:entry.stopReason==="deadline"?"prazo_total_excedido":"leitura_indisponivel"}));
      }
    }finally{
      clearTimeout(timer);
      if(pendingCancel)await pendingCancel.catch(()=>undefined);
      inFlight--;entry.poolReleased=true;entry.finished=performance.now();
    }
   })();
  });
  await new Promise<void>((resolve,reject)=>{
   server!.once("error",reject);server!.listen(0,"127.0.0.1",resolve);
  });
  const address=server.address();
  assert.ok(address&&typeof address!=="string");
  const port=address.port;
  const httpGet=(path:string):Promise<{code:number;body:string;headers:http.IncomingHttpHeaders}>=>
   new Promise((resolve,reject)=>{
    const rq=http.request({host:"127.0.0.1",port,path,method:"GET",timeout:20000},res=>{
      let body="";res.setEncoding("utf8");res.on("data",(x:string)=>{body+=x});
      res.on("end",()=>resolve({code:res.statusCode??0,body,headers:res.headers}));
    });
    rq.on("error",reject);rq.on("timeout",()=>rq.destroy(Error("HTTP_CLIENT_TIMEOUT")));rq.end();
   });
  const ready=async(m:CaseMetric)=>{
   if(!m.pid)return false;
   const x=await observer.query("SELECT state,backend_xmin::text AS xmin,query FROM pg_stat_activity WHERE pid=$1",[m.pid]);
   return x[0]?.state==="active" && String(x[0]?.query).includes("pg_sleep")
      && x[0]?.xmin!==null;
  };
  const idle=async(pid:number)=>{
    const x=await observer.query("SELECT state,backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[pid]);
    return x[0]?.state==="idle"&&x[0]?.xmin===null;
  };
  const assertReusable=async(metric:CaseMetric)=>{
    await until(async()=>metric.finished!==null,12000);
    assert.ok(metric.poolReleased&&metric.pid>0);
    await until(()=>idle(metric.pid));
    const x=await reader.query("SELECT pg_backend_pid()::int AS pid");
    assert.equal(Number(x[0].pid),metric.pid,"pool failed to reuse canceled session");
  };
  const started=performance.now();
  const canceledClient=http.request({host:"127.0.0.1",port,
    path:"/shadow/entregas?mode=aborted",method:"GET"});
  const ignored=new Promise<void>(resolve=>{canceledClient.on("error",()=>resolve());canceledClient.on("close",()=>resolve())});
  canceledClient.end();
  await until(async()=>cases[0]!==undefined&&ready(cases[0]));
  assert.ok(cases[0].pid>0);
  const crowded=await Promise.all(Array.from({length:6},()=>httpGet("/shadow/entregas?mode=normal")));
  assert.ok(crowded.every(x=>x.code===503 && x.headers["retry-after"]==="1" &&
    JSON.parse(x.body).erro==="leitura_temporariamente_ocupada"));
  const health=await httpGet("/health");assert.equal(health.code,200);
  canceledClient.destroy();await ignored;
  await assertReusable(cases[0]);
  assert.equal(cases[0].stopReason,"disconnect");
  assert.equal(cases[0].errorCode,"57014");
  assert.equal(cases[0].responseCode,null,"aborted client received a fake success");
  assert.ok(cases[0].cancelTime!==null);
  const socketToRollbackMs=+(cases[0].finished!-cases[0].cancelTime!).toFixed(2);
  assert.ok(socketToRollbackMs<8000,"socket abort did not free PG before injected 10s sleep");
  console.log("Q026_HTTP_DISCONNECT_PASS "+JSON.stringify({
    events:N,concurrent_rejected:6,health_while_busy:200,sqlstate:cases[0].errorCode,
    backend_xmin_released:true,same_pg_pid_reused:true,
    abort_to_cleanup_ms:socketToRollbackMs,admission_max:maxObserved
  }));

  const deadlineRequest=httpGet("/shadow/entregas?mode=deadline");
  await until(async()=>cases[1]!==undefined&&ready(cases[1]));
  const d=await deadlineRequest;
  assert.equal(d.code,503);
  assert.equal(JSON.parse(d.body).erro,"prazo_total_excedido");
  await assertReusable(cases[1]);
  assert.equal(cases[1].stopReason,"deadline");
  assert.equal(cases[1].errorCode,"57014");
  assert.ok(cases[1].cancelTime!==null);
  const timeoutToRollbackMs=+(cases[1].finished!-cases[1].cancelTime!).toFixed(2);
  console.log("Q026_HTTP_DEADLINE_PASS "+JSON.stringify({
    events:N,request_budget_ms:4500,server_status:d.code,sqlstate:cases[1].errorCode,
    budget_from_admission:true,backend_xmin_released:true,same_pg_pid_reused:true,
    deadline_to_cleanup_ms:timeoutToRollbackMs,
    request_wall_ms:+(cases[1].finished!-cases[1].started).toFixed(2)
  }));

  // Actual subsequent HTTP response and Q016 forensics must remain fresh.
  await writer.query(
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,"+
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust) "+
   "VALUES ('http-after-cancel','ITAIM','trip','TRIP-HTTP-SHADOW','gps_batch_received','{}'::jsonb,"+
   "'2026-10-10T17:00:00Z','2026-10-10T17:00:00Z','device','http-after-cancel','gps_batch_received@1.0.0',"+
   "'simulated',$1,'DEV-HTTP-SHADOW','trusted')",[N+1]);
  const recovered=await httpGet("/shadow/entregas?mode=normal");
  assert.equal(recovered.code,200);
  const q016=await lerFatosParaReplay(reader,TIPOS_DA_OPERACAO_VIVA);
  assert.equal(q016.aptos.length,N+1);
  assert.equal(inFlight,0);assert.equal(denied,6);assert.equal(maxObserved,1);
  console.log("Q026_HTTP_LIFECYCLE_SHADOW_PASS "+JSON.stringify({
    events:N,scenarios:3,aborted_request_rolled_back:true,
    deadline_request_rolled_back:true,normal_request_after_commit:true,
    q016_aptos:q016.aptos.length,max_active:maxObserved,refusals:denied,
    wall_ms:+(performance.now()-started).toFixed(2),
    boundary:"SHADOW localhost HTTP harness only; real GET /api/entregas has no abort-to-PG wiring yet; not production-ready"
  }));
 }finally{
  if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
  await reader.close();await writer.close();await observer.close();await db.descartar();
 }
})().catch(e=>{console.error("Q026_HTTP_LIFECYCLE_SHADOW_FAILED",e);process.exitCode=1});
