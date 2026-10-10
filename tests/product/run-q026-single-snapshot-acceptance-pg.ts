/**
 * Q-026 — acceptance of the ACTUAL canonical Deliveries reader, never a
 * simulated replacement. Disposable PG16 database, real migrations, second
 * writer session, deterministic intercepts. No production access.
 *
 * DELIVERYOS_PG_URL must explicitly point at disposable PG. No DB = exit 78.
 */
import assert from "node:assert/strict";
import { bancoIsolado, type BancoIsolado } from "../../src/platform/banco-isolado";
import {
  createPgClient, type SqlClient, type SqlRow, type TransactionalSqlClient,
} from "../../src/platform/persistence/sql-client";
import {
  lerRealidadeDeEntregas, type RealidadeDeEntregas,
} from "../../src/platform/leitura/realidade-de-entregas";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";
import { entregasVM } from "../../src/product/viewmodels/entregas-vm";
import { montarEntregasDemo } from "../../src/product/demo/seed-demonstracao";

const url=(process.env.DELIVERYOS_PG_URL||"").trim();
if (!url) {
 console.error("PULADO: DELIVERYOS_PG_URL ausente — nenhum teste em PostgreSQL foi executado");
 process.exit(78);
}
const NOW=new Date("2026-10-10T15:00:00.000Z");
const ago=(secs:number)=>new Date(NOW.getTime()-secs*1000).toISOString();
const fresh=(id:string)=>({event_id:id,occurred_at:ago(5),recorded_at:ago(5),sequence:4});
async function event(sql:SqlClient,id:string,type:string,occurred:string,seq:number,received=occurred){
 await sql.query(`INSERT INTO platform.event_log
   (event_id,unit_id,object_type,object_id,event_type,payload,occurred_at,recorded_at,
    origin,idempotency_key,contract_version,device_id,sequence_local,source_mode,clock_trust)
   VALUES ($1,'ITAIM','trip','T-1',$2,'{}'::jsonb,$3,$4,'device',$5,$6,'dev-1',$7,'simulated','trusted')`,
   [id,type,occurred,received,"key-"+id,type+"@1.0.0",seq]);
}
async function seed(sql:SqlClient){
 await sql.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim')");
 await sql.query(`INSERT INTO identity.device
 (device_id,unit_id,label,registered_at,secret_bound_at,last_session_at)
 VALUES ('dev-1','ITAIM','Aparelho de teste',$1,$1,$2)`,[ago(86400),ago(600)]);
 await event(sql,"ini-1","trip_created",ago(1500),1);
 await event(sql,"ini-2","trip_started",ago(1400),2);
 await event(sql,"gps-1","gps_batch_received",ago(540),3,ago(538));
}
function trip(r:RealidadeDeEntregas){
 const v=r.projecoes.flatMap(x=>x.viagens).find(v=>v.trip_id==="T-1");
 assert.ok(v,"trip not projected");return v;
}
function device(r:RealidadeDeEntregas){
 const a=r.aparelhos.find(d=>d.device_id==="dev-1");
 assert.ok(a,"device not returned");return a;
}
function consistency(r:RealidadeDeEntregas,expected:number){
 const v=trip(r),d=device(r);
 assert.equal(v.ultima_posicao_em,d.ultimo_lote?.occurred_at);
 assert.equal(v.eventos.filter(x=>x.startsWith("gps-")).length,expected);
 assert.equal(d.fatos_por_modo.simulated,expected);
 assert.equal(r.historico_sem_modo,0);
 return v;
}
type Probe={transactions:number;commands:string[];hooks:number};
function instrument(
  original:TransactionalSqlClient,
  before:(sql:string,tx:SqlClient)=>Promise<void>=async()=>{},
  rewrite:(sql:string)=>string=s=>s,
):{reader:TransactionalSqlClient;proof:Probe}{
 const proof:Probe={transactions:0,commands:[],hooks:0};
 const reader:TransactionalSqlClient={
  query:<R extends SqlRow=SqlRow>(sql:string,params?:readonly unknown[])=>original.query<R>(sql,params),
  close:async()=>undefined,
  async transaction<T>(body:(tx:SqlClient)=>Promise<T>):Promise<T>{
   proof.transactions++;
   return original.transaction(async tx=>{
    const hooked:SqlClient={query:async <R extends SqlRow=SqlRow>(
      sql:string,params?:readonly unknown[]):Promise<R[]>=>{
       proof.commands.push(sql.trim());
       await before(sql,tx);
       return tx.query<R>(rewrite(sql),params);
    }};
    return body(hooked);
   });
  },
 };
 return {reader,proof};
}
let passed=0;
async function test(label:string,body:()=>Promise<void>){
 await body();passed++;console.log("PASS "+passed+" "+label);
}
async function isolated(body:(b:BancoIsolado)=>Promise<void>){
 const b=await bancoIsolado(url,undefined,"q026single");
 try {await body(b);}finally{await b.descartar();}
}
async function withWriter(b:BancoIsolado,body:(w:TransactionalSqlClient)=>Promise<void>){
 const w=await createPgClient({url:b.url,max:1});
 try{await body(w);}finally{await w.close();}
}

void (async()=>{
 await test("01 canonical Q-016 replay still has its autonomous READ ONLY boundary",async()=>{
  await isolated(async b=>{
   await seed(b.cliente);
   const {reader,proof}=instrument(b.cliente);
   const replay=await lerFatosParaReplay(reader,TIPOS_DA_OPERACAO_VIVA);
   assert.equal(replay.sem_modo,0);
   assert.equal(replay.aptos.length,3);
   assert.equal(proof.transactions,1);
   assert.equal(proof.commands[0],"SET TRANSACTION READ ONLY");
  });
 });
 await test("02 baseline reader uses exactly one RR, READ ONLY transaction",async()=>{
  await isolated(async b=>{
   await seed(b.cliente);
   const {reader,proof}=instrument(b.cliente);
   const result=await lerRealidadeDeEntregas(reader,{agora:NOW});
   consistency(result,1);
   assert.equal(proof.transactions,1);
   assert.equal(proof.commands[0],"SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
   assert.equal(proof.commands.filter(s=>s.startsWith("SET TRANSACTION")).length,1);
   assert.ok(proof.commands.some(s=>s.includes("FROM identity.device")));
   assert.ok(proof.commands.some(s=>s.includes("FROM platform.event_log")));
   assert.ok(proof.commands.some(s=>s.includes("count(*)")));
  });
 });
 await test("03 concurrent GPS commit after facts cannot contradict device and VM",async()=>{
  await isolated(async b=>withWriter(b,async w=>{
   await seed(b.cliente);
   let fired=false;
   const {reader,proof}=instrument(b.cliente,async sql=>{
    if(!fired&&sql.includes("FROM identity.device")){
     fired=true;await event(w,"gps-2","gps_batch_received",ago(5),4);
     proof.hooks++;
    }
   });
   const before=await lerRealidadeDeEntregas(reader,{agora:NOW});
   assert.equal(fired,true);
   consistency(before,1);
   assert.equal(trip(before).ultima_posicao_em,ago(540));
   assert.equal(proof.transactions,1);
   const demo=await montarEntregasDemo();
   const vm=entregasVM(await demo.snapshot(),NOW.toISOString(),demo.getPolicyMaxStops(),
     {disponivel:true,realidade:before},{});
   assert.equal(vm.leitura.disponivel,true);
   const v=vm.leitura.disponivel?vm.leitura.conferir.find(c=>c.chave==="viagem:T-1"):null;
   const d=vm.leitura.disponivel?vm.leitura.aparelhos.find(x=>x.device_id==="dev-1"):null;
   assert.ok(v?.titulo.includes("9 min"));
   assert.ok(d&&d.ultima_posicao.observado===true);
   if(d?.ultima_posicao.observado)assert.equal(d.ultima_posicao.segundos,540);
   const after=await lerRealidadeDeEntregas(b.cliente,{agora:NOW});
   consistency(after,2);
   assert.equal(trip(after).ultima_posicao_em,ago(5));
  }));
 });
 await test("04 commit between last GPS and count is invisible until next snapshot",async()=>{
  await isolated(async b=>withWriter(b,async w=>{
   await seed(b.cliente);
   let fired=false;
   const {reader}=instrument(b.cliente,async sql=>{
    if(!fired&&sql.includes("count(*)")){
     fired=true;await event(w,"gps-2","gps_batch_received",ago(5),4);
    }
   });
   const first=await lerRealidadeDeEntregas(reader,{agora:NOW});
   assert.ok(fired);consistency(first,1);
   assert.equal(device(first).ultimo_lote?.occurred_at,ago(540));
   const after=await lerRealidadeDeEntregas(b.cliente,{agora:NOW});
   consistency(after,2);
  }));
 });
 await test("05 adversarial downgrade to READ COMMITTED reproduces contradiction",async()=>{
  await isolated(async b=>withWriter(b,async w=>{
   await seed(b.cliente);
   let fired=false;
   const {reader}=instrument(b.cliente,async sql=>{
    if(!fired&&sql.includes("count(*)")){
     fired=true;await event(w,"gps-2","gps_batch_received",ago(5),4);
    }
   },sql=>sql==="SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"
      ?"SET TRANSACTION ISOLATION LEVEL READ COMMITTED, READ ONLY":sql);
   const r=await lerRealidadeDeEntregas(reader,{agora:NOW});
   assert.equal(fired,true);
   assert.equal(device(r).ultimo_lote?.occurred_at,ago(540));
   assert.equal(device(r).fatos_por_modo.simulated,2);
   assert.equal(trip(r).ultima_posicao_em,ago(540));
  }));
 });
 await test("06 database rejects injected write in live reader transaction and rolls back",async()=>{
  await isolated(async b=>{
   await seed(b.cliente);
   let probe=false;
   const {reader}=instrument(b.cliente,async(sql,tx)=>{
    if(!probe&&sql.includes("FROM platform.event_log")){
     probe=true;
     // Attempt in same transaction before first SELECT: PostgreSQL must reject.
     await tx.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('FORBIDDEN','FORBIDDEN')");
    }
   });
   await assert.rejects(
    lerRealidadeDeEntregas(reader,{agora:NOW}),
    (e:unknown)=>(e as {code?:string}).code==="25006",
   );
   assert.equal(probe,true);
   const [{n}]=await b.cliente.query<{n:number}>(
    "SELECT count(*)::int AS n FROM identity.unit WHERE unit_id='FORBIDDEN'");
   assert.equal(n,0);
  });
 });
 console.log("Q026_SINGLE_SNAPSHOT_ACCEPTANCE: "+passed+"/6 PASS");
})().catch(e=>{console.error("Q026_SINGLE_SNAPSHOT_BLOCKED",e);process.exitCode=1});
