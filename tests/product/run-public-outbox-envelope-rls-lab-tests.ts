/**
 * LAB ONLY: envelopes publicos precisam coincidir com colunas outbox.
 * Coerencia de campos NÃO prova procedencia de dominio/fonte.
 * Guard: PostgreSQL efemero de GitHub Actions em socket runner-owned.
 */
import assert from "node:assert/strict";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient, type PgSqlClient } from "../../src/platform/persistence/sql-client";

const base=(process.env.DELIVERYOS_PG_URL??"").trim();
const root=(process.env.RUNNER_TEMP??"").trim();
const uri=base?new URL(base):null;
if(process.env.GITHUB_ACTIONS!=="true"||!root||uri?.hostname!=="localhost"||
   uri.port!=="55441"||!(uri.searchParams.get("host")??"").startsWith(root+"/operator-pg-socket-")){
  console.error("OUTBOX_ENVELOPE_LAB_NOT_RUN: private GitHub runner PostgreSQL socket required; NOT GREEN");
  process.exit(78);
}
const units=[["ITAIM","i"],["VILA-LAB","v"]] as const;
const suffix=process.pid+"_"+Date.now().toString(36);
const roles={i:"obenv_i_"+suffix,v:"obenv_v_"+suffix};
type Row={outbox_id?:string;n?:number};
let n=0;
function pass(cond:boolean,what:string){assert.ok(cond,what);n++;console.log("ok OUTBOX-"+n+" "+what);}
const denied=(err:unknown)=>(err as {code?:string}).code==="42501";
function envelope(id:string,unit:string,idem:string,overrides:Record<string,unknown>={}){
 return JSON.stringify({event_id:id,unit_id:unit,idempotency_key:idem,
   event_type:"trip_started",source:"entregas",schema_version:"1.0.0",
   source_mode:"simulated",payload:{lab_only:true},...overrides});
}
async function main(){
 const lab=await bancoIsolado(base,undefined,"outboxenvelope");
 const created:string[]=[];
 const policies:{table:string;name:string}[]=[];
 const connections:PgSqlClient[]=[];
 const table="entregas.public_outbox";
 try{
  await lab.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim'),('VILA-LAB','Vila Lab')");
  const count=await lab.cliente.query<{n:number}>(
    "SELECT COUNT(*)::int AS n FROM pg_constraint WHERE conrelid='entregas.public_outbox'::regclass AND contype='f'");
  pass(count[0]?.n===0,"baseline nao tem FK de public_outbox.event_id para domain_event");
  await assert.rejects(lab.cliente.transaction(async tx=>{
    const written=await tx.query<Row>(
      "INSERT INTO entregas.public_outbox(outbox_id,unit_id,event_id,idempotency_key,event,status,created_at) "+
      "VALUES('lab-fake','ITAIM','foreign-event','base-unique',$1::jsonb,'pending',now()) RETURNING outbox_id",
      [envelope("foreign-event","VILA-LAB","base-unique")]);
    assert.equal(written[0]?.outbox_id,"lab-fake");
    throw Error("LAB_OUTBOX_ROLLBACK");
  }),/LAB_OUTBOX_ROLLBACK/);
  pass((await lab.cliente.query<Row>("SELECT COUNT(*)::int AS n FROM entregas.public_outbox"))[0]?.n===0,
    "RISCO: baseline aceita coluna ITAIM com JSON VILA-LAB; rollback remove a fixture");
  for(const [unit,id] of units){
   const role=roles[id];
   assert.match(role,/^[a-z][a-z0-9_]{4,55}$/);
   await lab.cliente.query("CREATE ROLE "+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
   created.push(role);
   await lab.cliente.query("GRANT CONNECT ON DATABASE "+lab.nome+" TO "+role);
   await lab.cliente.query("GRANT USAGE ON SCHEMA entregas TO "+role);
   await lab.cliente.query("GRANT SELECT, INSERT, UPDATE ON entregas.public_outbox TO "+role);
   await lab.cliente.query("GRANT USAGE ON ALL SEQUENCES IN SCHEMA entregas TO "+role);
  }
  await lab.cliente.query("ALTER TABLE entregas.public_outbox ENABLE ROW LEVEL SECURITY");
  for(const [unit,id] of units){
   const role=roles[id],policy="guard_env_"+id;
   const expression="unit_id='"+unit+"'"+
     " AND event->>'unit_id'=unit_id"+
     " AND event->>'event_id'=event_id"+
     " AND event->>'idempotency_key'=idempotency_key"+
     " AND event->>'source'='entregas'";
   await lab.cliente.query("CREATE POLICY "+policy+" ON entregas.public_outbox FOR ALL TO "+role+
     " USING ("+expression+") WITH CHECK ("+expression+")");
   policies.push({table,name:policy});
  }
  for(const [unit,id] of units){
   const other=id==="i"?"VILA-LAB":"ITAIM";
   const dbUrl=new URL(lab.url);dbUrl.username=roles[id];dbUrl.password="";
   const db=await createPgClient({url:dbUrl.toString(),max:1});connections.push(db);
   async function insert(key:string, columnUnit:string, eventUnit:string, opts:Record<string,unknown>={}){
     return db.query<Row>(
       "INSERT INTO entregas.public_outbox(outbox_id,unit_id,event_id,idempotency_key,event,status,created_at) "+
       "VALUES($1,$2,$3,$4,$5::jsonb,'pending',now()) RETURNING outbox_id",
       ["ob-"+key,columnUnit,"ev-"+key,"idem-"+key,envelope("ev-"+key,eventUnit,"idem-"+key,opts)]);
   }
   await assert.rejects(insert(id+"-foreigncol",other,other),denied);
   pass(true,unit+" recusa unidade alheia em coluna e envelope");
   await assert.rejects(insert(id+"-foreignjson",unit,other),denied);
   pass(true,unit+" recusa JSON com unit_id alheio mesmo se coluna da unidade for correta");
   await assert.rejects(insert(id+"-fakeid",unit,unit,{event_id:"wrong-"+id}),denied);
   pass(true,unit+" recusa event_id do JSON divergente da coluna");
   await assert.rejects(insert(id+"-fakeidem",unit,unit,{idempotency_key:"wrong-"+id}),denied);
   pass(true,unit+" recusa idempotency_key do JSON divergente da coluna");
   await assert.rejects(insert(id+"-fakesource",unit,unit,{source:"externo-nao-autorizado"}),denied);
   pass(true,unit+" recusa source JSON diferente de entregas");
   const own=await insert(id+"-valid",unit,unit);
   pass(own[0]?.outbox_id==="ob-"+id+"-valid",unit+" aceita envelope internamente coerente");
   const otherRows=await db.query<Row>("SELECT COUNT(*)::int AS n FROM entregas.public_outbox");
   pass(otherRows[0]?.n===1,unit+" le apenas a propria outbox");
   await assert.rejects(db.query(
     "UPDATE entregas.public_outbox SET event=jsonb_set(event,'{unit_id}',to_jsonb($1::text)) WHERE outbox_id=$2",
     [other,"ob-"+id+"-valid"]),denied);
   pass(true,unit+" recusa UPDATE do unit_id interno do JSON");
   await assert.rejects(db.query(
     "UPDATE entregas.public_outbox SET event=jsonb_set(event,'{event_id}',to_jsonb($1::text)) WHERE outbox_id=$2",
     ["changed-"+id,"ob-"+id+"-valid"]),denied);
   pass(true,unit+" recusa UPDATE que altera id de origem no envelope");
   await assert.rejects(db.query(
     "UPDATE entregas.public_outbox SET unit_id=$1 WHERE outbox_id=$2",
     [other,"ob-"+id+"-valid"]),denied);
   pass(true,unit+" recusa UPDATE para outra unidade pela coluna");
   const changed=await db.query<Row>(
     "UPDATE entregas.public_outbox SET status='published' WHERE outbox_id=$1 RETURNING outbox_id",
     ["ob-"+id+"-valid"]);
   pass(changed[0]?.outbox_id==="ob-"+id+"-valid",unit+" ainda consegue marcar status proprio");
   await db.query("SELECT set_config('deliveryos.unit_scope',$1,false)",[other]);
   pass((await db.query<Row>("SELECT COUNT(*)::int AS n FROM entregas.public_outbox"))[0]?.n===1,
     unit+" nao ultrapassa role RLS fixa ao alterar GUC");
  }
  // AUSENCIA de autenticidade continua demonstravel: um papel autorizado
  // consegue montar um sinal PUBLICO coerente sem domain_event correspondente.
  const it=connections[0];
  const orphan=await it.query<Row>(
    "INSERT INTO entregas.public_outbox(outbox_id,unit_id,event_id,idempotency_key,event,status,created_at) "+
    "VALUES('ob-no-domain','ITAIM','ev-no-domain','idem-no-domain',$1::jsonb,'pending',now()) RETURNING outbox_id",
    [envelope("ev-no-domain","ITAIM","idem-no-domain",{source_mode:"real"})]);
  pass(orphan[0]?.outbox_id==="ob-no-domain",
    "LIMITE: papel autorizado pode inserir envelope coerente marcado real sem dominio correspondente");
  pass((await lab.cliente.query<Row>(
    "SELECT COUNT(*)::int AS n FROM entregas.domain_event WHERE event_id='ev-no-domain'"))[0]?.n===0,
    "LIMITE: somente igualdade de JSON/coluna nao prova origem nem modo real");
  pass((await lab.cliente.query<Row>(
    "SELECT COUNT(*)::int AS n FROM entregas.public_outbox"))[0]?.n===3,
    "duas unidades mais sinal sem dominio permanecem apenas no banco descartavel");
  console.log("ENTREGAS_PUBLIC_OUTBOX_ENVELOPE_LAB: "+n+"/"+n+
    " PASS (COLUMN/JSON INTEGRITY, UNTRUSTED ORIGIN STILL NO_GO, EPHEMERAL ONLY)");
 }finally{
  for(const db of connections.reverse())await db.close();
  for(const p of policies.reverse())await lab.cliente.query("DROP POLICY "+p.name+" ON "+p.table);
  for(const role of created.reverse()){
    await lab.cliente.query("REVOKE SELECT, INSERT, UPDATE ON entregas.public_outbox FROM "+role);
    await lab.cliente.query("REVOKE USAGE ON ALL SEQUENCES IN SCHEMA entregas FROM "+role);
    await lab.cliente.query("REVOKE USAGE ON SCHEMA entregas FROM "+role);
    await lab.cliente.query("REVOKE CONNECT ON DATABASE "+lab.nome+" FROM "+role);
    await lab.cliente.query("DROP ROLE "+role);
  }
  await lab.descartar();
 }
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
