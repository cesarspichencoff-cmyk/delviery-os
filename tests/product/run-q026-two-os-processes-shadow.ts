/** Q-026 SHADOW multi-OS-process product HTTP concurrency, PG16 throwaway. */
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient } from "../../src/platform/persistence/sql-client";

const admin=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!admin){console.error("Q026_MULTIPROCESS_PG_REQUIRED");process.exit(78)}
if(process.env.Q026_MULTIPROCESS_CHILD==="1"){
 void(async()=>{
  const {criarServidor}=await import("../../tools/product_system_server");
  const srv=await criarServidor();
  srv.listen(0,"127.0.0.1",()=>{
   const a=srv.address();
   assert.ok(a&&typeof a!=="string");
   process.stdout.write("Q026_CHILD_READY "+JSON.stringify({port:a.port,pid:process.pid})+"\n");
  });
 })().catch(e=>{console.error("Q026_CHILD_FAILED",e);process.exit(1)});
}else{
 type Resp={status:number;body:any;ms:number};
 const pause=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
 async function get(port:number,path:string):Promise<Resp>{
  const start=performance.now();
  return new Promise((resolve,reject)=>{
   const req=http.request({host:"127.0.0.1",port,path,timeout:15000},res=>{
    let body="";res.setEncoding("utf8");res.on("data",(v:string)=>body+=v);
    res.on("end",()=>{
     try{resolve({status:res.statusCode??0,body:JSON.parse(body),ms:+(performance.now()-start).toFixed(2)})}
     catch(e){reject(Error("invalid JSON from actual Product HTTP "+String(e)))}
    });
   });
   req.on("error",reject);req.on("timeout",()=>req.destroy(Error("Q026_HTTP_TIMEOUT")));
   req.end();
  });
 }
 const until=async(check:()=>Promise<boolean>,timeout=15000)=>{
  const start=Date.now();
  while(!(await check())){
   if(Date.now()-start>timeout)throw Error("Q026_CONCURRENT_SQL_NOT_VISIBLE");
   await pause(40);
  }
 };
 type Worker={process:ChildProcessWithoutNullStreams;port:number;pid:number};
 function startWorker(dbUrl:string):Promise<Worker>{
  return new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,["--import","tsx",process.argv[1]],{
    cwd:process.cwd(),env:{...process.env,Q026_MULTIPROCESS_CHILD:"1",
     DELIVERYOS_DATABASE_URL:dbUrl,DELIVERYOS_ENTREGAS_INCREMENTAL_RR:"1",
     DELIVERYOS_ENTREGAS_RR_DEADLINE_MS:"3000",DELIVERYOS_ENTREGAS_MAX_INFLIGHT:"1"},
    stdio:["pipe","pipe","pipe"]
   });
   let log="",err="",resolved=false;
   const fail=(e:Error)=>{if(!resolved){resolved=true;reject(e)}};
   const watchdog=setTimeout(()=>fail(Error("Q026_WORKER_BOOT_TIMEOUT "+err)),20000);
   child.stdout.on("data",(buf:Buffer)=>{
    log+=buf.toString("utf8");
    let line:number;
    while((line=log.indexOf("\n"))>=0){
     const fragment=log.slice(0,line).trim();log=log.slice(line+1);
     if(fragment.startsWith("Q026_CHILD_READY ")){
      if(resolved)return;
      resolved=true;clearTimeout(watchdog);
      const x=JSON.parse(fragment.slice("Q026_CHILD_READY ".length));
      resolve({process:child,port:x.port,pid:x.pid});
     }
    }
   });
   child.stderr.on("data",(buf:Buffer)=>{err+=buf.toString().slice(0,4000)});
   child.on("error",fail);
   child.on("exit",code=>{clearTimeout(watchdog);fail(Error("Q026_WORKER_EARLY_EXIT "+code+" "+err.slice(-1000)))});
  });
 }
 void(async()=>{
  const db=await bancoIsolado(admin,undefined,"q026workers");
  const obs=await createPgClient({url:db.url,max:1});
  const workers:Worker[]=[];
  let unlock:()=>void=()=>undefined,hold:Promise<unknown>|null=null;
  try{
   await db.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Synthetic')");
   await db.cliente.query("INSERT INTO identity.device(device_id,unit_id,label,registered_at) VALUES ('Q026-MULTIPROC-DEVICE','ITAIM','Synthetic','2026-10-09T00:00:00Z')");
   await db.cliente.query([
    "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
    "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
    "SELECT 'q026-multi-'||g,'ITAIM','trip','TRIP-MULTI','gps_batch_received','{}'::jsonb,",
    "TIMESTAMPTZ '2026-10-10T15:00:00Z'+(g*interval '0.1 second'),",
    "TIMESTAMPTZ '2026-10-10T15:00:00Z'+(g*interval '0.1 second'),",
    "'device','q026-multi-'||g,'gps_batch_received@1.0.0','simulated',g,'Q026-MULTIPROC-DEVICE','trusted'",
    "FROM generate_series(1,2000) g"
   ].join(" "));
   workers.push(await startWorker(db.url));
   workers.push(await startWorker(db.url));
   assert.notEqual(workers[0].pid,workers[1].pid);
   for(const w of workers){
    const r=await get(w.port,"/api/entregas?unidade=ITAIM");
    assert.equal(r.status,200);
    assert.equal(r.body.leitura.disponivel,true);
   }
   let ready:()=>void=()=>undefined;
   const held=new Promise<void>(r=>{unlock=r});
   const entered=new Promise<void>(r=>{ready=r});
   hold=db.cliente.transaction(async tx=>{
    await tx.query("LOCK TABLE platform.event_log IN ACCESS EXCLUSIVE MODE");
    ready();await held;
   });
   await entered;
   const running=workers.map(w=>get(w.port,"/api/entregas?unidade=ITAIM"));
   await until(async()=>{
    const r=await obs.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() "+
      "AND wait_event_type='Lock' AND query LIKE '%platform.event_log%' "+
      "AND pid<>pg_backend_pid()");
    return Number(r[0].n)>=2;
   });
   const overflow=await Promise.all(workers.map(w=>get(w.port,"/api/entregas?unidade=ITAIM")));
   assert.ok(overflow.every(x=>x.status===503&&x.body.erro==="leitura_temporariamente_ocupada"&&x.ms<500));
   const health=await Promise.all(workers.map(w=>get(w.port,"/api/health")));
   assert.ok(health.every(x=>x.status===200));
   const timed=await Promise.all(running);
   assert.ok(timed.every(x=>x.status===503&&x.body.erro==="prazo_total_excedido"));
   unlock();await hold;
   const recovered=await Promise.all(workers.map(w=>get(w.port,"/api/entregas?unidade=ITAIM")));
   assert.ok(recovered.every(x=>x.status===200&&x.body.leitura.disponivel===true));
   const pinned=await obs.query(
    "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() "+
    "AND state IN ('active','idle in transaction') AND query LIKE '%platform.event_log%' AND pid<>pg_backend_pid()");
   assert.equal(Number(pinned[0].n),0);
   console.log("Q026_TWO_OS_PROCESSES_HTTP_PASS "+JSON.stringify({
     os_processes:2,distinct_pids:true,local_admission_limit_each:1,
     total_concurrent_sql_reads:2,extra_rejected:overflow.length,
     health_response_statuses:health.map(x=>x.status),
     guarded_deadline_response_statuses:timed.map(x=>x.status),
     recovered_statuses:recovered.map(x=>x.status),
     no_active_reader_sql_after_cleanup:true,
     limitation:"per-process admission sum across processes, NOT globally shared limit"
   }));
  }finally{
   unlock();if(hold)await hold.catch(()=>undefined);
   for(const w of workers){w.process.kill("SIGKILL")}
   await obs.close();await db.descartar();
  }
 })().catch(e=>{console.error("Q026_TWO_OS_PROCESSES_FAILED",e);process.exitCode=1});
}
