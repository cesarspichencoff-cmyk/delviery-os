/**
 * E7 runner-only child: true Product System HTTP and pg, with one deterministic
 * synchronous event-loop stall immediately AFTER an event-log SQL result has
 * returned but BEFORE the transaction can send its next statement/COMMIT.
 * Never import this fixture into runtime code.
 */
import http from "node:http";
import {performance} from "node:perf_hooks";
const variant=process.env.Q026_E7_VARIANT;
if(variant!=="canonical"&&variant!=="incremental")throw Error("Q026_E7_CHILD_VARIANT");
const pg=require("pg") as {Pool:{prototype:{connect:(...a:unknown[])=>unknown}}};
type Borrowed={processID:number;query:(...a:unknown[])=>Promise<unknown>};
const proto=pg.Pool.prototype;
const original=proto.connect;
let armed=false,frozen=false;
proto.connect=function(this:{options?:{max?:number}},...args:unknown[]):unknown{
 if(typeof args[0]==="function")return original.apply(this,args);
 const result=original.apply(this,args) as Promise<Borrowed>;
 return result.then(client=>{
  if(this.options?.max!==2)return client;
  const old=client.query.bind(client);
  client.query=async(...q:unknown[]):Promise<unknown>=>{
   const result=await old(...q);
   const sql=typeof q[0]==="string"?q[0]:"";
   const shouldBlock=variant==="incremental"
    ? /^\s*FETCH FORWARD\s+/i.test(sql)
    : /FROM\s+platform\.event_log/i.test(sql);
   if(armed&&!frozen&&shouldBlock){
    frozen=true;
    process.send?.({type:"frozen",pid:client.processID,variant,sql_kind:variant==="incremental"?"FETCH":"SELECT"});
    const until=performance.now()+8000;
    while(performance.now()<until){} // deliberately simulate an unresponsive event loop
    process.send?.({type:"unfrozen",pid:client.processID});
   }
   return result;
  };
  return client;
 });
};
void(async()=>{
 process.env.DELIVERYOS_ENTREGAS_MAX_INFLIGHT="1";
 process.env.DELIVERYOS_ENTREGAS_RR_DEADLINE_MS="5000";
 if(variant==="incremental")process.env.DELIVERYOS_ENTREGAS_INCREMENTAL_RR="1";
 else delete process.env.DELIVERYOS_ENTREGAS_INCREMENTAL_RR;
 const {criarServidor}=await import("../../tools/product_system_server");
 const server:http.Server=await criarServidor();
 await new Promise<void>((resolve,reject)=>{
  server.once("error",reject);server.listen(0,"127.0.0.1",resolve);
 });
 const address=server.address();
 if(!address||typeof address==="string")throw Error("Q026_E7_NO_SERVER_PORT");
 process.on("message",(msg:{type?:string})=>{
  if(msg?.type==="arm"){armed=true;process.send?.({type:"armed"});}
  if(msg?.type==="stop"){
   server.closeAllConnections?.();
   server.close();
   setTimeout(()=>process.exit(0),100);
  }
 });
 process.send?.({type:"ready",port:address.port,pid:process.pid});
})().catch(e=>{console.error("Q026_E7_CHILD_ERROR",e);process.exit(2)});
