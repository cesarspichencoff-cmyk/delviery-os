/**
 * Q-026: bounded transaction-life proof with a moderate disposable data volume.
 * NOT a performance benchmark or a production load extrapolation.
 */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient, type SqlClient, type SqlRow, type TransactionalSqlClient } from "../../src/platform/persistence/sql-client";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";

const base=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!base){
 console.error("PULADO: DELIVERYOS_PG_URL ausente — teste de custo nao executado");
 process.exit(78);
}
const SIZE=1800,now=new Date("2026-10-10T15:00:00.000Z");
let tests=0;
const test=async(name:string,fn:()=>Promise<void>)=>{await fn();tests++;console.log("PASS "+tests+" "+name)};
void(async()=>{
 const banco=await bancoIsolado(base,undefined,"q026window");
 const observer=await createPgClient({url:banco.url,max:1});
 try{
  const sql=banco.cliente;
  await sql.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim')");
  await sql.query(`INSERT INTO identity.device
    (device_id,unit_id,label,registered_at,secret_bound_at,last_session_at)
    VALUES ('dev-window','ITAIM','Q026 load test',$1,$1,$1)`,["2026-10-10T14:00:00Z"]);
  await sql.query(`INSERT INTO platform.event_log
    (event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,recorded_at,origin,
      idempotency_key,contract_version,device_id,sequence_local,source_mode,clock_trust)
    SELECT 'window-e-'||g,'ITAIM','trip','TRIP-WINDOW',
      CASE WHEN g=1 THEN 'trip_created' WHEN g=2 THEN 'trip_started'
      ELSE 'gps_batch_received' END, '{}'::jsonb,
      '2026-10-10T14:30:00Z'::timestamptz + (g||' milliseconds')::interval,
      '2026-10-10T14:30:00Z'::timestamptz + (g||' milliseconds')::interval,
      'device','window-key-'||g,
      CASE WHEN g=1 THEN 'trip_created' WHEN g=2 THEN 'trip_started'
      ELSE 'gps_batch_received' END || '@1.0.0',
      'dev-window',g,'simulated','trusted'
    FROM generate_series(1,$1::int) AS g`,[SIZE]);
  let beforeCommitRawOnly=false;
  let heldDuring=false, releasedAfter=false, transacted=0;
  let msTx=0,msWhole=0,connectionPid=0;
  const reader:TransactionalSqlClient={
   query:<T extends SqlRow=SqlRow>(query:string,params?:readonly unknown[])=>sql.query<T>(query,params),
   close:async()=>undefined,
   async transaction<T>(fn:(tx:SqlClient)=>Promise<T>):Promise<T>{
    transacted++;
    const start=performance.now();
    const result=await sql.transaction(async tx=>{
     const traced:SqlClient={query:async <R extends SqlRow=SqlRow>(
       statement:string,params?:readonly unknown[]):Promise<R[]>=>{
       const values=await tx.query<R>(statement,params);
       if(statement.includes("count(*)")){
         const [p]=await tx.query<{pid:number}>("SELECT pg_backend_pid()::int AS pid");
         connectionPid=p.pid;
         const [state]=await observer.query<{xmin_held:boolean}>(
           "SELECT backend_xmin IS NOT NULL AS xmin_held FROM pg_stat_activity WHERE pid=$1",
           [connectionPid]);
         heldDuring=state.xmin_held;
       }
       return values;
      }};
     const value=await fn(traced);
     // The callback must return MATERIALIZED SQL DATA ONLY. Any projected
     // view here holds the MVCC transaction open over CPU-intensive rendering.
     const v=value as Record<string,unknown>;
     beforeCommitRawOnly=["leitura","linhas","ultimos","contagens"]
       .every(key=>Object.hasOwn(v,key))&&!Object.hasOwn(v,"projecoes")
       &&!Object.hasOwn(v,"aparelhos");
     return value;
    });
    msTx=performance.now()-start;
    const [state]=await observer.query<{released:boolean}>(
       "SELECT backend_xmin IS NULL AS released FROM pg_stat_activity WHERE pid=$1",
       [connectionPid]);
    releasedAfter=state.released;
    return result;
   },
  };
  await test("01 fixed-size 1800 facts plus native device are projected",async()=>{
   const t=performance.now();
   const r=await lerRealidadeDeEntregas(reader,{agora:now});
   msWhole=performance.now()-t;
   assert.equal(transacted,1);
   assert.equal(r.aparelhos.length,1);
   assert.equal(r.projecoes.length,1);
   assert.equal(r.projecoes[0].viagens.length,1);
   assert.equal(r.projecoes[0].viagens[0].eventos.length,SIZE);
   assert.equal(r.aparelhos[0].fatos_por_modo.simulated,SIZE-2);
  });
  await test("02 snapshot observed while open and released before CPU projection",async()=>{
   assert.ok(connectionPid>0);
   assert.equal(heldDuring,true,"snapshot backend_xmin absent during active read");
   assert.equal(releasedAfter,true,"backend_xmin leaked after transaction");
   assert.equal(beforeCommitRawOnly,true,"projected view returned from DB transaction");
  });
  await test("03 measured nonproduction timeline has no invented cost threshold",async()=>{
   assert.ok(Number.isFinite(msTx)&&msTx>0);
   assert.ok(Number.isFinite(msWhole)&&msWhole>=msTx);
   console.log("Q026_WINDOW_TIMING_FIXTURE "+JSON.stringify({
    facts:SIZE,transaction_ms:Math.round(msTx*100)/100,
    full_reader_ms:Math.round(msWhole*100)/100,
    observation:"ONE_DISPOSABLE_PG16_SAMPLE_NOT_A_PERFORMANCE_SLA",
    vacuum_effect:"NOT_MEASURED",production_cost:"UNKNOWN"
   }));
  });
  console.log("Q026_TRANSACTION_WINDOW: "+tests+"/3 PASS");
 }finally{await observer.close();await banco.descartar();}
})().catch(e=>{console.error("Q026_TRANSACTION_WINDOW_FAILED",e);process.exitCode=1});
