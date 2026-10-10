/**
 * Q026 SHADOW — PostgreSQL server statement_timeout inside the ACTUAL
 * single-snapshot Entregas reader. Two deliberate cancellations:
 * after the first event SELECT (snapshot already pinned), and before COUNT.
 *
 * The same conn must leave transaction via ROLLBACK; no partial result,
 * backend_xmin MUST disappear, and the original client must recover.
 * Disposable real migrations. NEVER change production runtime settings here.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient, type SqlClient, type SqlRow, type TransactionalSqlClient } from "../../src/platform/persistence/sql-client";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";

const url=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!url)throw Error("Q026_TIMEOUT_REQUIRES_EXPLICIT_DISPOSABLE_PG");
const NOW=new Date("2026-10-10T16:00:00Z");
type At="after-facts"|"before-count";
let proofs=0;
void(async()=>{
 const b=await bancoIsolado(url,undefined,"q026timeout");
 const obs=await createPgClient({url:b.url,max:1});
 try{
  await b.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Synthetic')");
  await b.cliente.query("INSERT INTO identity.device(device_id,unit_id,label,registered_at,secret_bound_at)"+
   " VALUES ('DEV-1','ITAIM','test','2026-10-10T12:00:00Z','2026-10-10T12:00:00Z')");
  await b.cliente.query([
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
   "SELECT 'time-'+g,'ITAIM','trip','T-SAFE','gps_batch_received','{}'::jsonb,",
   "TIMESTAMPTZ '2026-10-10T12:00:00Z'+g*interval '0.01 second',",
   "TIMESTAMPTZ '2026-10-10T12:00:00Z'+g*interval '0.01 second',",
   "'device','time-key-'||g,'gps_batch_received@1.0.0','simulated',g,'DEV-1','trusted'",
   "FROM generate_series(1,500) g"
  ].join(" "));

  async function active(pid:number){
   const a=await obs.query("SELECT state,backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[pid]);
   assert.equal(a.length,1,"transaction backend disappeared; cannot verify resource boundary");
   return {state:String(a[0].state),xmin:a[0].xmin};
  }
  for(const at of ["after-facts","before-count"] as const){
   let backend=0,timeoutSet=0,injections=0,xminDuring:string|null=null;
   const wrapped:TransactionalSqlClient={
    query:<R extends SqlRow=SqlRow>(s:string,p?:readonly unknown[])=>b.cliente.query<R>(s,p),
    close:async()=>undefined,
    transaction<T>(fn:(tx:SqlClient)=>Promise<T>):Promise<T>{
     return b.cliente.transaction(async tx=>{
      const proxy:SqlClient={
       query:async<R extends SqlRow=SqlRow>(sql:string,params?:readonly unknown[])=>{
        if(sql.includes("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")){
         const r=await tx.query<R>(sql,params);
         await tx.query("SET LOCAL statement_timeout = '60ms'");
         const pid=await tx.query("SELECT pg_backend_pid() AS pid");
         backend=Number(pid[0].pid);
         timeoutSet++;
         return r;
        }
        const isFacts=/FROM platform\.event_log/.test(sql)&&/event_type\s*=\s*ANY/i.test(sql);
        const isCount=/GROUP BY device_id, source_mode/i.test(sql);
        const shouldCancel=(at==="after-facts"&&sql.includes("FROM identity.device"))||
         (at==="before-count"&&isCount);
        const rowsToReturn=await (async()=>{
          if(isFacts){
            const rows=await tx.query<R>(sql,params);
            const probe=await active(backend);
            assert.ok(probe.xmin,"expected pinned snapshot after materialized facts");
            xminDuring=String(probe.xmin);
            return rows;
          }
          if(shouldCancel){
            injections++;
            assert.equal(injections,1);
            const probe=await active(backend);
            assert.equal(String(probe.xmin),xminDuring);
            // Server-side timeout with REAL pg_sleep; no fake error.
            await tx.query("SELECT pg_sleep(0.15)");
            throw Error("UNREACHABLE: pg_sleep unexpectedly bypassed statement_timeout");
          }
          return tx.query<R>(sql,params);
        })();
        return rowsToReturn;
       }
      };
      return fn(proxy);
     });
    }
   };
   const started=performance.now();
   let caught:unknown=null;
   try{
    await lerRealidadeDeEntregas(wrapped,{agora:NOW});
   }catch(e){caught=e}
   const failedInMs=performance.now()-started;
   assert.ok(caught,"reader delivered partial success after timed out SQL");
   assert.equal((caught as {code?:string}).code,"57014","must be actual PostgreSQL query_canceled");
   assert.equal(timeoutSet,1);
   assert.equal(injections,1);
   assert.ok(backend>0&&xminDuring);
   const after=await active(backend);
   assert.equal(after.xmin,null,"backend_xmin still pinned after timeout/ROLLBACK");
   assert.equal(after.state,"idle","transaction connection not returned to idle pool");
   assert.ok(failedInMs<5000,"timeout did not stop query promptly in disposable PG");
   proofs++;
   console.log("Q026_TIMEOUT_ROLLBACK_CHECK "+JSON.stringify({
    at,code:(caught as {code?:string}).code,elapsed_ms:+failedInMs.toFixed(1),
    backend_xmin_during:!!xminDuring,backend_xmin_after:after.xmin,
    connection_state:after.state
   }));
   const normal=await lerRealidadeDeEntregas(b.cliente,{agora:NOW});
   const trip=normal.projecoes.flatMap(p=>p.viagens).find(v=>v.trip_id==="T-SAFE");
   assert.equal(trip?.eventos.length,500,"healthy reader failed after aborted transaction");
   assert.equal(normal.aparelhos.find(d=>d.device_id==="DEV-1")?.fatos_por_modo.simulated,500);
   proofs++;
  }
  assert.equal(proofs,4);
  console.log("Q026_RR_TIMEOUT_RECOVERY_PASS "+JSON.stringify({
    checks:proofs,server_error:"57014",backend_xmin_released:true,partial_result:false,
    recovered_after_both_abort_points:true,
    limit:"test-only SET LOCAL timeout; no production timeout decisions"
  }));
 }finally{await obs.close();await b.descartar();}
})().catch(e=>{console.error(e);process.exitCode=1});
