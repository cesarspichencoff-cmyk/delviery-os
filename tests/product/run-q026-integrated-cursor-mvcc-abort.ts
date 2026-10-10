/**
 * Q-026: real reusable RR cursor reader must preserve one MVCC snapshot
 * while another PostgreSQL session commits during FETCH; deliberate abort
 * must roll back and release backend_xmin. Ephemeral PG16 only.
 */
import assert from "node:assert/strict";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient,type SqlClient,type SqlRow,type TransactionalSqlClient } from "../../src/platform/persistence/sql-client";
import { lerRealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { lerRealidadeDeEntregasIncremental } from "../../src/platform/leitura/realidade-de-entregas-incremental";
import { leitorRrCancelavel } from "../../src/platform/leitura/leitor-rr-cancelavel";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";

const url=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!url){console.error("Q026_CURSOR_MVCC_PG_REQUIRED");process.exit(78)}
const N=20000,agora=new Date("2026-10-10T19:00:00Z");
const pause=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
const until=async(check:()=>Promise<boolean>,limit=10000)=>{
 const start=Date.now();while(!(await check())){
  if(Date.now()-start>limit)throw Error("Q026_BACKEND_CLEANUP_NOT_PROVEN");
  await pause(40);
 }
};
function normalize(r:Awaited<ReturnType<typeof lerRealidadeDeEntregas>>){
 return {
  versao:r.versao,fonte:r.fonte,lida_em:r.lida_em,
  aparelhos:r.aparelhos,historico_sem_modo:r.historico_sem_modo,
  projecoes:r.projecoes.map(s=>({
   unit_id:s.unit_id,source_mode:s.source_mode,
   viagens:s.viagens.map(v=>({
    trip_id:v.trip_id,unit_id:v.unit_id,estado:v.estado,
    device_id:v.device_id,ultimo_fato_em:v.ultimo_fato_em,
    ocorrencias_abertas:v.ocorrencias_abertas,source_mode:v.source_mode,
    numero_fatos:v.eventos.length,
    ultima_posicao_em:v.ultima_posicao_em,frescor:v.frescor
   }))
  }))
 };
}
void(async()=>{
 const b=await bancoIsolado(url,undefined,"q026mvccinc");
 const writer=await createPgClient({url:b.url,max:1,statementTimeoutMs:20000});
 const observer=await createPgClient({url:b.url,max:1,statementTimeoutMs:20000});
 const cancel=await createPgClient({url:b.url,max:1,statementTimeoutMs:2000,connectionTimeoutMillis:1000});
 try{
  await b.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Synthetic')");
  await b.cliente.query("INSERT INTO identity.device(device_id,unit_id,label,registered_at) VALUES ('Q026-MVCC-DEVICE','ITAIM','Synthetic','2026-10-09T00:00:00Z')");
  const insert=[
   "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
   "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust)",
   "SELECT 'q026-mvcc-'||g,'ITAIM','trip','Q026-MVCC-TRIP','gps_batch_received','{}'::jsonb,",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.01 second'),",
   "TIMESTAMPTZ '2026-10-09T18:00:00Z'+(g*interval '0.01 second'),",
   "'device','q026-mvcc-'||g,'gps_batch_received@1.0.0','simulated',g,'Q026-MVCC-DEVICE','trusted'",
   "FROM generate_series(1,$1::int) AS g"
  ].join(" ");
  await b.cliente.query(insert,[N]);
  const options={agora};
  const baseline=await lerRealidadeDeEntregas(b.cliente,options);
  let fetches=0,writerCommitted=false,pinnedPid=0;
  function instrument(hook:(tx:SqlClient)=>Promise<void>):TransactionalSqlClient{
   return {
    query:<R extends SqlRow=SqlRow>(sql:string,args?:readonly unknown[])=>b.cliente.query<R>(sql,args),
    close:async()=>{},
    transaction:<T>(fn:(tx:SqlClient)=>Promise<T>):Promise<T>=>
      b.cliente.transaction(async tx=>fn({
       query:async<R extends SqlRow=SqlRow>(sql:string,args?:readonly unknown[]):Promise<R[]>=>{
        const rows=await tx.query<R>(sql,args);
        if(sql.startsWith("FETCH FORWARD")&&rows.length>0)await hook(tx);
        return rows;
       }
      }))
   };
  }
  const controlled=instrument(async tx=>{
   if(++fetches!==1)return;
   pinnedPid=Number((await tx.query("SELECT pg_backend_pid()::int AS pid"))[0].pid);
   const pinned=await observer.query(
    "SELECT backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[pinnedPid]);
   assert.ok(pinned[0]?.xmin,"RR snapshot not pinned while cursor reads");
   await writer.query(
    "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,"+
    "occurred_at,recorded_at,origin,idempotency_key,contract_version,source_mode,sequence_local,device_id,clock_trust) "+
    "VALUES ('q026-mvcc-late','ITAIM','trip','Q026-MVCC-TRIP','gps_batch_received','{}',"+
    "'2026-10-10T17:00:00Z','2026-10-10T17:00:00Z','device','q026-mvcc-late','gps_batch_received@1.0.0',"+
    "'simulated',$1,'Q026-MVCC-DEVICE','trusted')",[N+1]);
   writerCommitted=true;
  });
  const snapshot=await lerRealidadeDeEntregasIncremental(controlled,options);
  assert.ok(writerCommitted&&fetches>=2);
  assert.deepEqual(normalize(snapshot),normalize(baseline),
    "incremental FETCH mixed a later write into one RR snapshot");
  await until(async()=>{
   const p=await observer.query("SELECT state,backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[pinnedPid]);
   return p[0]?.state==="idle" && p[0]?.xmin===null;
  });
  const after=await lerRealidadeDeEntregasIncremental(b.cliente,options);
  assert.equal(after.projecoes.flatMap(p=>p.viagens).reduce((n,v)=>n+v.eventos.length,0),N+1);
  assert.notDeepEqual(normalize(after),normalize(baseline),
   "new RR read did not observe concurrent commit");
  const forensic=await lerFatosParaReplay(b.cliente,TIPOS_DA_OPERACAO_VIVA);
  assert.equal(forensic.aptos.length,N+1);
  console.log("Q026_INCREMENTAL_MVCC_CONCURRENT_COMMIT_PASS "+JSON.stringify({
   initial_facts:N,concurrent_writer_committed:true,
   cursor_batches:fetches,same_snapshot_as_canonical:true,
   post_transaction_backend_xmin_released:true,
   next_snapshot_facts:N+1,q016_forensic_facts:forensic.aptos.length
  }));

  const controller=new AbortController();
  let abortedPid=0,abortFetches=0;
  const injecting=instrument(async tx=>{
   if(++abortFetches!==1)return;
   abortedPid=Number((await tx.query("SELECT pg_backend_pid()::int AS pid"))[0].pid);
   controller.abort();
  });
  const guarded=leitorRrCancelavel(injecting,{
   signal:controller.signal,prazoAbsolutoMs:Date.now()+15000,cancelador:cancel
  });
  let abortError:unknown=null;
  try{await lerRealidadeDeEntregasIncremental(guarded,options)}catch(e){abortError=e}
  assert.ok(abortError instanceof Error,"aborted FETCH was incorrectly returned successful");
  assert.ok((abortError as Error).message.includes("Q026_READ_ABORTED")||
   (abortError as {code?:string}).code==="57014",
   "abort produced unknown failure "+String(abortError));
  assert.equal(controller.signal.aborted,true);
  await until(async()=>{
   const p=await observer.query("SELECT state,backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid=$1",[abortedPid]);
   return p[0]?.state==="idle"&&p[0]?.xmin===null;
  });
  const recovered=await lerRealidadeDeEntregasIncremental(b.cliente,options);
  assert.equal(recovered.projecoes.flatMap(p=>p.viagens).reduce((n,v)=>n+v.eventos.length,0),N+1);
  console.log("Q026_INCREMENTAL_FETCH_ABORT_ROLLBACK_PASS "+JSON.stringify({
   aborted_after_fetches:abortFetches,signal_aborted:true,
   sql_rollback_released_backend_xmin:true,recovery_facts:N+1,
   backend_reusable:true,read_only:true
  }));
 }finally{await cancel.close();await observer.close();await writer.close();await b.descartar()}
})().catch(e=>{console.error("Q026_INCREMENTAL_MVCC_ABORT_FAILED",e);process.exitCode=1});
