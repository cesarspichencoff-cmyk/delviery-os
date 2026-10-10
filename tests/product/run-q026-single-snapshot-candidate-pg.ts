/**
 * Q026 candidate: real independent PostgreSQL writer concurrently commits
 * between SELECTs while lerRealidadeDeEntregas reads exactly one RR snapshot.
 *
 * The regression guard intentionally weakens RR to READ COMMITTED in a
 * test-only adapter and MUST detect contradictory trip/device information.
 * Each test uses a disposable database with real migrations.
 */
import assert from "node:assert/strict";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient, type SqlClient, type SqlRow, type TransactionalSqlClient } from "../../src/platform/persistence/sql-client";
import { lerRealidadeDeEntregas, type RealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";
const base=(process.env.DELIVERYOS_PG_URL??"").trim();
if(!base)throw Error("Q026_SNAPSHOT_PG_REQUIRED");
const NOW=new Date("2026-10-10T15:00:00Z");
const t=(s:number)=>new Date(NOW.getTime()-1000*s).toISOString();
const newer=t(5),older=t(540);
let passed=0;
const good=(m:string)=>{passed++;console.log("  ok SNAP "+passed+" "+m)};
async function event(c:SqlClient,id:string,time:string,seq:number,kind="gps_batch_received"){
 await c.query([
  "INSERT INTO platform.event_log(event_id,unit_id,object_type,object_id,event_type,payload,",
  "occurred_at,recorded_at,origin,idempotency_key,contract_version,device_id,sequence_local,source_mode,clock_trust)",
  "VALUES ($1,'ITAIM','trip','T-1',$2,'{}'::jsonb,$3,$3,'device',$4,$5,'dev-1',$6,'simulated','trusted')"
 ].join(" "),[id,kind,time,"key-"+id,kind+"@1.0.0",seq]);
}
async function seed(c:SqlClient){
 await c.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim')");
 await c.query(
  "INSERT INTO identity.device(device_id,unit_id,label,registered_at,secret_bound_at) VALUES ('dev-1','ITAIM','Moto 01',$1,$1)",
  [t(1000)]);
 await event(c,"created-1",t(1500),1,"trip_created");
 await event(c,"started-1",t(1400),2,"trip_started");
 await event(c,"gps-old",older,3);
}
function facts(r:RealidadeDeEntregas){
 const v=r.projecoes.flatMap(p=>p.viagens).find(v=>v.trip_id==="T-1");
 assert.ok(v,"trip missing");
 const a=r.aparelhos.find(a=>a.device_id==="dev-1");
 assert.ok(a,"device missing");
 const g=v.eventos.filter(id=>id.startsWith("gps-")).length;
 return {tripLast:v.ultima_posicao_em,deviceLast:a.ultimo_lote?.occurred_at,
  tripGps:g,deviceGps:a.fatos_por_modo.simulated};
}
type Injection="afterFacts"|"beforeCount"|"none";
function intercepted(base:TransactionalSqlClient,write:()=>Promise<void>,point:Injection,removeRR=false){
 let done=false,txCount=0,rrSeen=0;
 const wrapped:TransactionalSqlClient={
  query:<R extends SqlRow=SqlRow>(s:string,p?:readonly unknown[])=>base.query<R>(s,p),
  close:()=>Promise.resolve(),
  transaction<T>(fn:(tx:SqlClient)=>Promise<T>):Promise<T>{
   txCount++;
   return base.transaction(async tx=>{
    let rr=false;
    const proxy:SqlClient={
     query:async<R extends SqlRow=SqlRow>(s:string,p?:readonly unknown[])=>{
      if(s.includes("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")){
        rrSeen++;
        rr=true;
        if(removeRR)s="SET TRANSACTION READ ONLY"; // only for negative guard!
      }
      if(!done && point==="beforeCount" && /count\(\*\)/i.test(s)){
        done=true;await write();
      }
      const rows=await tx.query<R>(s,p);
      if(!done && point==="afterFacts" && s.includes("FROM platform.event_log")
        && /event_type\s*=\s*ANY/i.test(s)){
        done=true;await write();
      }
      return rows;
     }
    };
    return fn(proxy);
   })
  }
 };
 return {client:wrapped,stats:()=>({done,txCount,rrSeen})};
}
async function withDb(
 name:string,
 callback:(c:TransactionalSqlClient,write:()=>Promise<void>)=>Promise<void>
){
 const db=await bancoIsolado(base,undefined,"q026rr");
 const writer=await createPgClient({url:db.url,max:1});
 try{
  await seed(db.cliente);
  let count=0;
  const write=async()=>{
   count++;
   assert.equal(count,1,"writer hook fired twice");
   await event(writer,"gps-new",newer,4);
  };
  await callback(db.cliente,write);
 }finally{await writer.close();await db.descartar()}
}
void(async()=>{
 await withDb("baseline",async (client)=>{
  const r=await lerRealidadeDeEntregas(client,{agora:NOW});
  assert.deepEqual(facts(r),{
   tripLast:older,deviceLast:older,tripGps:1,deviceGps:1
  });
  const q=await lerFatosParaReplay(client,TIPOS_DA_OPERACAO_VIVA);
  assert.equal(q.aptos.length,3,"Q016 public replay must still work on its own");
  good("sem escrita, mesmo instantaneo e Q016 publica preservada");
 });
 for(const p of ["afterFacts","beforeCount"] as const){
  await withDb(p,async (client,write)=>{
   const hooked=intercepted(client,write,p);
   const r=await lerRealidadeDeEntregas(hooked.client,{agora:NOW});
   assert.deepEqual(hooked.stats(),{done:true,txCount:1,rrSeen:1},
    "reader must use ONE RR transaction and writer must commit");
   assert.deepEqual(facts(r),{tripLast:older,deviceLast:older,tripGps:1,deviceGps:1},
    "read mixed snapshots");
   const fresh=await lerRealidadeDeEntregas(client,{agora:NOW});
   assert.deepEqual(facts(fresh),{tripLast:newer,deviceLast:newer,tripGps:2,deviceGps:2},
    "subsequent reader must see committed event");
   good("consistencia snapshot com append "+p+" e leitura seguinte atualizada");
  });
  await withDb("mutant-"+p,async(client,write)=>{
   const hooked=intercepted(client,write,p,true);
   const inconsistent=await lerRealidadeDeEntregas(hooked.client,{agora:NOW});
   assert.deepEqual(hooked.stats(),{done:true,txCount:1,rrSeen:1});
   const f=facts(inconsistent);
   assert.equal(f.tripLast,older);
   if(p==="afterFacts"){
     assert.equal(f.deviceLast,newer);
     assert.equal(f.tripGps,1);
     assert.equal(f.deviceGps,2);
   }else{
     assert.equal(f.deviceLast,older);
     assert.equal(f.tripGps,1);
     assert.equal(f.deviceGps,2);
   }
   good("controle NEGATIVO: sem RR regressao de snapshots detectada em "+p);
  });
 }
 console.log("Q026_SINGLE_SNAPSHOT_CANDIDATE_PASS "+JSON.stringify({
  checks:passed,concurrent_writes:true,independent_postgres_sessions:true,
  version:"proposta SHADOW, nao runtime integrado",
  proof:"ONE REPEATABLE READ READ ONLY, consistent trip/device/count",
  q016_public_route:"unchanged contract"
 }));
})().catch(e=>{console.error(e);process.exitCode=1});
