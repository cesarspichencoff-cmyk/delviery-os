/**
 * LAB-only: RLS on handoff/occurrence/rider_state/public_outbox and
 * cross-unit references not enforced by ordinary unit_id RLS.
 * Run only against owned private GitHub Actions ephemeral PostgreSQL.
 */
import assert from "node:assert/strict";
import {bancoIsolado} from "../../src/platform/banco-isolado";
import {createPgClient, type PgSqlClient} from "../../src/platform/persistence/sql-client";

const base=(process.env.DELIVERYOS_PG_URL??"").trim();
const tmp=(process.env.RUNNER_TEMP??"").trim();
const url=base?new URL(base):null;
if(process.env.GITHUB_ACTIONS!=="true" || !tmp ||
   url?.hostname!=="localhost" || url.port!=="55441" ||
   !(url.searchParams.get("host")??"").startsWith(tmp+"/operator-pg-socket-")){
  console.error("REMAINING_WRITES_LAB_NOT_RUN: owned private runner socket required; NOT GREEN");
  process.exit(78);
}
const units=[["ITAIM","i"],["VILA-LAB","v"]] as const;
const tables=["entregas.trip","entregas.handoff","entregas.occurrence",
 "entregas.rider_state","entregas.public_outbox"] as const;
type Row={n?:number;handoff_id?:string;occurrence_id?:string;rider_id?:string;outbox_id?:string};
let n=0;
function pass(ok:boolean,description:string){assert.ok(ok,description);n++;console.log("ok REMAINING-"+n+" "+description);}
const isRls=(e:unknown)=>(e as {code?:string}).code==="42501";

async function main(){
 const lab=await bancoIsolado(base,undefined,"remainingwrites");
 const suffix=process.pid+"_"+Date.now().toString(36);
 const roles={i:"remain_i_"+suffix,v:"remain_v_"+suffix};
 const created:string[]=[];
 const policies:{table:string;name:string}[]=[];
 const clients:PgSqlClient[]=[];
 try{
  await lab.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim'),('VILA-LAB','Vila')");
  for(const [unit,id] of units){
   await lab.cliente.query(
    "INSERT INTO entregas.trip(trip_id,unit_id,courier_actor_id,state,created_by,created_at,contract_version) "+
    "VALUES($1,$2,$3,'ativa','LAB_ONLY',now(),'lab@1')",["trip-"+id,unit,"courier-"+id]);
   await lab.cliente.query(
    "INSERT INTO entregas.handoff(handoff_id,unit_id,external_order_ref,state,courier_verified,confirmed,contract_version,version) "+
    "VALUES($1,$2,$3,'aguardando',false,false,'lab@1',0)",["h-"+id,unit,"LAB_ORDER_"+id]);
   await lab.cliente.query(
    "INSERT INTO entregas.occurrence(occurrence_id,unit_id,trip_id,kind,state,opened_at,opened_by,version) "+
    "VALUES($1,$2,$3,'LAB_ONLY','aberta',now(),'lab',0)",["o-"+id,unit,"trip-"+id]);
   await lab.cliente.query(
    "INSERT INTO entregas.rider_state(rider_id,unit_id,availability,occurrence_blocking_availability,active_trip_id,version,updated_at) "+
    "VALUES($1,$2,'disponivel',false,$3,0,now())",["r-"+id,unit,"trip-"+id]);
   await lab.cliente.query(
    "INSERT INTO entregas.public_outbox(outbox_id,unit_id,event_id,idempotency_key,event,status,created_at) "+
    "VALUES($1,$2,$3,$1,'{}'::jsonb,'pending',now())",["p-"+id,unit,"ev-"+id]);
  }
  const roleNames={i:roles.i,v:roles.v};
  for(const id of ["i","v"] as const){
   const role=roleNames[id];
   assert.match(role,/^[a-z][a-z0-9_]{4,55}$/);
   await lab.cliente.query("CREATE ROLE "+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
   created.push(role);
   await lab.cliente.query("GRANT CONNECT ON DATABASE "+lab.nome+" TO "+role);
   await lab.cliente.query("GRANT USAGE ON SCHEMA entregas TO "+role);
   await lab.cliente.query("GRANT SELECT ON entregas.trip TO "+role);
   await lab.cliente.query("GRANT SELECT, INSERT, UPDATE ON entregas.handoff, entregas.occurrence, entregas.rider_state, entregas.public_outbox TO "+role);
   await lab.cliente.query("GRANT USAGE ON ALL SEQUENCES IN SCHEMA entregas TO "+role);
  }
  for(const table of tables) await lab.cliente.query("ALTER TABLE "+table+" ENABLE ROW LEVEL SECURITY");
  for(const [unit,id] of units){
   const role=roleNames[id];
   for(const [table,short] of [["entregas.trip","t"],["entregas.handoff","h"],["entregas.occurrence","o"],["entregas.rider_state","r"],["entregas.public_outbox","p"]] as const){
    const name="guard_"+short+"_"+id;
    await lab.cliente.query("CREATE POLICY "+name+" ON "+table+" FOR ALL TO "+role+
      " USING (unit_id='"+unit+"') WITH CHECK (unit_id='"+unit+"')");
    policies.push({table,name});
   }
  }
  for(const [unit,id] of units){
   const other=id==="i"?"v":"i";
   const u=new URL(lab.url);u.username=roleNames[id];u.password="";
   const db=await createPgClient({url:u.toString(),max:1});clients.push(db);
   for(const [table,pk,prefix] of [
    ["entregas.handoff","handoff_id","h"],
    ["entregas.occurrence","occurrence_id","o"],
    ["entregas.rider_state","rider_id","r"],
    ["entregas.public_outbox","outbox_id","p"]
   ] as const){
    const result=await db.query<Row>("SELECT COUNT(*)::int AS n FROM "+table);
    pass(result[0]?.n===1,unit+" ve somente seu registro "+table);
    const updated=await db.query<Row>(
      "UPDATE "+table+" SET unit_id=$1 WHERE "+pk+"=$2 RETURNING "+pk,
      [unit,prefix+"-"+other]);
    pass(updated.length===0,unit+" nao atualiza linha alheia em "+table);
    await assert.rejects(db.query(
      "UPDATE "+table+" SET unit_id=$1 WHERE "+pk+"=$2",
      [id==="i"?"VILA-LAB":"ITAIM",prefix+"-"+id]),isRls);
    pass(true,unit+" nao transfere linha propria de "+table+" por WITH CHECK");
   }
   await assert.rejects(db.query(
    "INSERT INTO entregas.handoff(handoff_id,unit_id,external_order_ref,state,courier_verified,confirmed,contract_version,version) "+
    "VALUES($1,$2,'LAB','aguardando',false,false,'lab@1',0)",["foreign-h-"+id,id==="i"?"VILA-LAB":"ITAIM"]),isRls);
   pass(true,unit+" nao insere handoff alheio");
   await assert.rejects(db.query(
    "INSERT INTO entregas.public_outbox(outbox_id,unit_id,event_id,idempotency_key,event,status,created_at) "+
    "VALUES($1,$2,$3,$1,'{}'::jsonb,'pending',now())",
    ["foreign-p-"+id,id==="i"?"VILA-LAB":"ITAIM","foreign-event-"+id]),isRls);
   pass(true,unit+" nao insere public_outbox alheio");
   const own=await db.query<Row>(
    "UPDATE entregas.handoff SET state='conferindo' WHERE handoff_id=$1 RETURNING handoff_id",["h-"+id]);
   pass(own[0]?.handoff_id==="h-"+id,unit+" consegue atualizar handoff da propria unidade");
   const ownO=await db.query<Row>(
    "UPDATE entregas.public_outbox SET attempts=attempts+1 WHERE outbox_id=$1 RETURNING outbox_id",["p-"+id]);
   pass(ownO[0]?.outbox_id==="p-"+id,unit+" consegue atualizar outbox da propria unidade");
  }
  // A relation key e um segundo dominio de autorizacao. Apenas RLS
  // unit_id no registro NAO valida que a viagem associada tenha a mesma unidade.
  const it=clients[0];
  const forgedOccurrence=await it.query<Row>(
   "INSERT INTO entregas.occurrence(occurrence_id,unit_id,trip_id,kind,state,opened_at,opened_by,version) "+
   "VALUES('crosslink-o','ITAIM','trip-v','LAB_ONLY','aberta',now(),'lab',0) RETURNING occurrence_id");
  pass(forgedOccurrence[0]?.occurrence_id==="crosslink-o",
   "RISCO: policy so de unit_id aceita occurrence ITAIM ligada a trip VILA-LAB");
  const forgedState=await it.query<Row>(
   "INSERT INTO entregas.rider_state(rider_id,unit_id,availability,occurrence_blocking_availability,active_trip_id,version,updated_at) "+
   "VALUES('crosslink-r','ITAIM','em_rota',false,'trip-v',0,now()) RETURNING rider_id");
  pass(forgedState[0]?.rider_id==="crosslink-r",
   "RISCO: policy so de unit_id aceita rider_state ITAIM com active_trip_id VILA-LAB");
  await lab.cliente.query("DELETE FROM entregas.occurrence WHERE occurrence_id='crosslink-o'");
  await lab.cliente.query("DELETE FROM entregas.rider_state WHERE rider_id='crosslink-r'");
  // Contraprova: policy amarra FK/vinculo de viagem do registro a unit_id.
  for(const [unit,id] of units){
   for(const [table,short,field] of [
     ["entregas.occurrence","o","trip_id"],
     ["entregas.rider_state","r","active_trip_id"]
   ] as const){
    const oldName="guard_"+short+"_"+id;
    await lab.cliente.query("DROP POLICY "+oldName+" ON "+table);
    policies.splice(policies.findIndex(p=>p.table===table&&p.name===oldName),1);
    const newName="guard_bound_"+short+"_"+id;
    const predicate="unit_id='"+unit+"' AND ("+field+" IS NULL OR EXISTS "+
      "(SELECT 1 FROM entregas.trip t WHERE t.trip_id="+table+"."+field+" AND t.unit_id='"+unit+"'))";
    await lab.cliente.query("CREATE POLICY "+newName+" ON "+table+" FOR ALL TO "+roleNames[id]+
      " USING ("+predicate+") WITH CHECK ("+predicate+")");
    policies.push({table,name:newName});
   }
  }
  for(const [unit,id] of units){
   const db=clients[id==="i"?0:1],other=id==="i"?"v":"i";
   await assert.rejects(db.query(
    "INSERT INTO entregas.occurrence(occurrence_id,unit_id,trip_id,kind,state,opened_at,opened_by,version) "+
    "VALUES($1,$2,$3,'LAB_ONLY','aberta',now(),'lab',0)",
    ["blocked-o-"+id,unit,"trip-"+other]),isRls);
   pass(true,unit+" recusa nova occurrence ligada a viagem alheia");
   await assert.rejects(db.query(
    "UPDATE entregas.occurrence SET trip_id=$1 WHERE occurrence_id=$2",
    ["trip-"+other,"o-"+id]),isRls);
   pass(true,unit+" recusa troca de trip_id em occurrence existente");
   await assert.rejects(db.query(
    "INSERT INTO entregas.rider_state(rider_id,unit_id,availability,occurrence_blocking_availability,active_trip_id,version,updated_at) "+
    "VALUES($1,$2,'em_rota',false,$3,0,now())",
    ["blocked-r-"+id,unit,"trip-"+other]),isRls);
   pass(true,unit+" recusa rider_state com active_trip_id alheia");
   await assert.rejects(db.query(
    "UPDATE entregas.rider_state SET active_trip_id=$1 WHERE rider_id=$2",
    ["trip-"+other,"r-"+id]),isRls);
   pass(true,unit+" recusa troca de active_trip_id para viagem alheia");
   const goodOcc=await db.query<Row>(
    "INSERT INTO entregas.occurrence(occurrence_id,unit_id,trip_id,kind,state,opened_at,opened_by,version) "+
    "VALUES($1,$2,$3,'LAB_ONLY','aberta',now(),'lab',0) RETURNING occurrence_id",
    ["good-o-"+id,unit,"trip-"+id]);
   pass(goodOcc[0]?.occurrence_id==="good-o-"+id,unit+" preserva occurrence legitima");
  }
  // Outbox de dominio possui event_id, mas nao possui FK para
  // domain_event: auditoria da procedencia do payload e etapa separada.
  const fks=await lab.cliente.query<{name:string}>(
   "SELECT conname AS name FROM pg_constraint WHERE conrelid='entregas.public_outbox'::regclass AND contype='f'");
  pass(fks.length===0,"public_outbox nao tem FK de event_id e exige verificacao de proveniencia em outra etapa");
  console.log("ENTREGAS_REMAINING_WRITE_RLS_LAB: "+n+"/"+n+
   " PASS (FOUR TABLES, CROSS-LINK WITNESS, LAB ONLY)");
 } finally {
  for(const client of clients.reverse()) await client.close();
  for(const policy of policies.reverse()) await lab.cliente.query("DROP POLICY "+policy.name+" ON "+policy.table);
  for(const role of created.reverse()){
   await lab.cliente.query("REVOKE SELECT,INSERT,UPDATE ON entregas.handoff, entregas.occurrence, entregas.rider_state, entregas.public_outbox FROM "+role);
   await lab.cliente.query("REVOKE SELECT ON entregas.trip FROM "+role);
   await lab.cliente.query("REVOKE USAGE ON ALL SEQUENCES IN SCHEMA entregas FROM "+role);
   await lab.cliente.query("REVOKE USAGE ON SCHEMA entregas FROM "+role);
   await lab.cliente.query("REVOKE CONNECT ON DATABASE "+lab.nome+" FROM "+role);
   await lab.cliente.query("DROP ROLE "+role);
  }
  await lab.descartar();
 }
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
