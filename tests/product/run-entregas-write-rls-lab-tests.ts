/**
 * LAB ONLY — contraprova de ESCRITA por unidade em banco descartavel.
 * Usa as migrations oficiais e grants declarados, sem loja, pedidos ou IDs reais.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {bancoIsolado} from "../../src/platform/banco-isolado";
import {createPgClient,type PgSqlClient} from "../../src/platform/persistence/sql-client";

const base=(process.env.DELIVERYOS_PG_URL??"").trim();
const temp=(process.env.RUNNER_TEMP??"").trim();
const uri=base?new URL(base):null;
if(process.env.GITHUB_ACTIONS!=="true"||!temp||
   uri?.hostname!=="localhost"||uri.port!=="55441"||
   !(uri.searchParams.get("host")??"").startsWith(temp+"/operator-pg-socket-")){
  console.error("WRITE_RLS_LAB_NOT_RUN: private runner-owned socket required; NOT GREEN");
  process.exit(78);
}
type One={trip_id?:string;delivery_id?:string;order_ref?:string;event_id?:string; n?:number};
let n=0;
function check(value:boolean,title:string){assert.ok(value,title);n++;console.log("ok WRITE-"+n+" "+title);}
function deniedRls(err:unknown){return (err as {code?:string}).code==="42501";}
const units=[["ITAIM","i"],["VILA-LAB","v"]] as const;

async function main(){
 const lab=await bancoIsolado(base,undefined,"writeboundary");
 const suffix=process.pid+"_"+Date.now().toString(36);
 const roles={i:"write_i_"+suffix,v:"write_v_"+suffix};
 const created:string[]=[];
 const policies:{table:string;name:string}[]=[];
 const clients:PgSqlClient[]=[];
 let pilot:PgSqlClient|null=null;
 try{
  await lab.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim'),('VILA-LAB','Vila')");
  for(const [unit,id] of units){
   await lab.cliente.query(
     "INSERT INTO entregas.trip(trip_id,unit_id,courier_actor_id,state,created_by,created_at,contract_version) VALUES($1,$2,$3,'ativa','LAB_ONLY',now(),'lab@1')",
     ["trip-"+id,unit,"courier-"+id]);
   await lab.cliente.query(
     "INSERT INTO entregas.delivery(delivery_id,trip_id,order_ref,channel,planned_stop_order,state) VALUES($1,$2,$3,'LAB_ONLY',1,'aguardando')",
     ["delivery-"+id,"trip-"+id,"order-"+id]);
   await lab.cliente.query(
     "INSERT INTO entregas.ready_order(unit_id,order_ref,label,created_at) VALUES($1,$2,'LAB_ONLY',now())",
     [unit,"ready-"+id]);
   await lab.cliente.query(
     "INSERT INTO entregas.domain_event(event_id,unit_id,object_type,object_id,event_type,occurred_at,recorded_at,origin,idempotency_key,payload,clock_trust,contract_version) VALUES($1,$2,'trip',$3,'trip_created',now(),now(),'lab',$1,'{}'::jsonb,'trusted','lab@1')",
     ["ev-"+id,unit,"trip-"+id]);
  }
  // Aplica o arquivo do projeto NO BANCO ISOLADO, nunca na loja.
  execFileSync("/usr/lib/postgresql/16/bin/psql",[
   "--no-psqlrc","--set","ON_ERROR_STOP=1","--dbname",lab.url,
   "--file",resolve("deploy/sql/papeis_minimos.sql")
  ],{encoding:"utf8",stdio:"pipe",timeout:20000});
  const pilotUrl=new URL(lab.url);pilotUrl.username="deliveryos_entregas_pilot";pilotUrl.password="";
  pilot=await createPgClient({url:pilotUrl.toString(),max:1});
  await assert.rejects(pilot.transaction(async tx=>{
    const changed=await tx.query<One>(
      "UPDATE entregas.trip SET state='alterada_cross_unit' WHERE trip_id='trip-v' RETURNING trip_id");
    assert.equal(changed[0]?.trip_id,"trip-v");
    const deleted=await tx.query<One>(
      "DELETE FROM entregas.delivery WHERE delivery_id='delivery-v' RETURNING delivery_id");
    assert.equal(deleted[0]?.delivery_id,"delivery-v");
    const ready=await tx.query<One>(
      "INSERT INTO entregas.ready_order(unit_id,order_ref,label,created_at) VALUES('VILA-LAB','insercao-cross','LAB_ONLY',now()) RETURNING order_ref");
    assert.equal(ready[0]?.order_ref,"insercao-cross");
    throw Error("LAB_ROLLBACK_BASELINE_CROSS_UNIT");
  }),/LAB_ROLLBACK_BASELINE_CROSS_UNIT/);
  check(true,"RISCO baseline: role declarada consegue UPDATE e DELETE em outra unidade; transacao revertida");
  const unchanged=await lab.cliente.query<{state:string}>("SELECT state FROM entregas.trip WHERE trip_id='trip-v'");
  check(unchanged[0]?.state==="ativa","ROLLBACK preserva a viagem e entrega sintéticas");
  check((await lab.cliente.query<One>(
    "SELECT COUNT(*)::int AS n FROM entregas.delivery WHERE delivery_id='delivery-v'"))[0]?.n===1,
    "nenhuma exclusao cruzada persistiu apos prova");

  for(const id of ["i","v"] as const){
   const role=roles[id];
   assert.match(role,/^[a-z][a-z0-9_]{4,55}$/);
   await lab.cliente.query("CREATE ROLE "+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
   created.push(role);
   await lab.cliente.query("GRANT CONNECT ON DATABASE "+lab.nome+" TO "+role);
   await lab.cliente.query("GRANT USAGE ON SCHEMA entregas TO "+role);
   await lab.cliente.query("GRANT SELECT,INSERT,UPDATE,DELETE ON entregas.trip,entregas.delivery,entregas.ready_order TO "+role);
   await lab.cliente.query("GRANT SELECT,INSERT ON entregas.domain_event TO "+role);
   await lab.cliente.query("GRANT USAGE ON ALL SEQUENCES IN SCHEMA entregas TO "+role);
  }
  for(const t of ["entregas.trip","entregas.delivery","entregas.ready_order","entregas.domain_event"])
   await lab.cliente.query("ALTER TABLE "+t+" ENABLE ROW LEVEL SECURITY");
  for(const [unit,id] of units){
    const role=roles[id];
    for(const [table,marker] of [
      ["entregas.trip","trip"],["entregas.ready_order","ready"],["entregas.domain_event","event"]
    ] as const){
      const name="w_"+marker+"_"+id;
      const predicate="unit_id='"+unit+"'";
      await lab.cliente.query("CREATE POLICY "+name+" ON "+table+
        " FOR ALL TO "+role+" USING ("+predicate+") WITH CHECK ("+predicate+")");
      policies.push({table,name});
    }
    const table="entregas.delivery",name="w_delivery_"+id;
    const expression="EXISTS (SELECT 1 FROM entregas.trip t WHERE t.trip_id=entregas.delivery.trip_id AND t.unit_id='"+unit+"')";
    await lab.cliente.query("CREATE POLICY "+name+" ON "+table+
      " FOR ALL TO "+role+" USING ("+expression+") WITH CHECK ("+expression+")");
    policies.push({table,name});
  }
  for(const [unit,id] of units){
   const role=roles[id],other=id==="i"?"v":"i";
   const u=new URL(lab.url);u.username=role;u.password="";
   const db=await createPgClient({url:u.toString(),max:1});clients.push(db);
   check((await db.query<One>("SELECT COUNT(*)::int AS n FROM entregas.trip"))[0]?.n===1 &&
      (await db.query<One>("SELECT COUNT(*)::int AS n FROM entregas.delivery"))[0]?.n===1 &&
      (await db.query<One>("SELECT COUNT(*)::int AS n FROM entregas.ready_order"))[0]?.n===1,
      "role "+unit+" le somente viagem, entrega e pronto proprios");
   check((await db.query<One>(
       "UPDATE entregas.trip SET state='cross_unit' WHERE trip_id=$1 RETURNING trip_id",["trip-"+other])).length===0,
      "UPDATE sobre viagem alheia nao atinge linha ("+unit+")");
   check((await db.query<One>(
       "DELETE FROM entregas.delivery WHERE delivery_id=$1 RETURNING delivery_id",["delivery-"+other])).length===0,
      "DELETE sobre entrega alheia nao atinge linha ("+unit+")");
   await assert.rejects(db.query(
       "INSERT INTO entregas.trip(trip_id,unit_id,courier_actor_id,state,created_by,created_at,contract_version) VALUES ($1,$2,'courier-lab','ativa','LAB_ONLY',now(),'lab@1')",
       ["foreign-trip-"+id,id==="i"?"VILA-LAB":"ITAIM"]),deniedRls);
   check(true,"INSERT de viagem alheia falha WITH CHECK ("+unit+")");
   await assert.rejects(db.query(
       "UPDATE entregas.trip SET unit_id=$1 WHERE trip_id=$2",
       [id==="i"?"VILA-LAB":"ITAIM","trip-"+id]),deniedRls);
   check(true,"UPDATE de viagem propria para outra unidade falha WITH CHECK ("+unit+")");
   await assert.rejects(db.query(
       "INSERT INTO entregas.delivery(delivery_id,trip_id,order_ref,channel,planned_stop_order,state) VALUES ($1,$2,'FOREIGN','LAB_ONLY',2,'aguardando')",
       ["foreign-del-"+id,"trip-"+other]),deniedRls);
   check(true,"INSERT de entrega com trip_id alheia falha WITH CHECK correlacionado ("+unit+")");
   await assert.rejects(db.query(
       "UPDATE entregas.delivery SET trip_id=$1 WHERE delivery_id=$2",
       ["trip-"+other,"delivery-"+id]),deniedRls);
   check(true,"mover entrega propria para viagem alheia falha WITH CHECK ("+unit+")");
   await assert.rejects(db.query(
       "INSERT INTO entregas.ready_order(unit_id,order_ref,label,created_at) VALUES($1,$2,'LAB_ONLY',now())",
       [id==="i"?"VILA-LAB":"ITAIM","foreign-ready-"+id]),deniedRls);
   check(true,"fila pronta recusa INSERT de outra unidade ("+unit+")");
   check((await db.query<One>(
       "DELETE FROM entregas.ready_order WHERE order_ref=$1 RETURNING order_ref",["ready-"+other])).length===0,
      "fila pronta nao apaga pedido alheio ("+unit+")");
   await assert.rejects(db.query(
       "INSERT INTO entregas.domain_event(event_id,unit_id,object_type,object_id,event_type,occurred_at,recorded_at,origin,idempotency_key,payload,clock_trust,contract_version) VALUES($1,$2,'trip','trip-lab','trip_created',now(),now(),'lab',$1,'{}'::jsonb,'trusted','lab@1')",
       ["foreign-event-"+id,id==="i"?"VILA-LAB":"ITAIM"]),deniedRls);
   check(true,"domain_event recusa append em unidade alheia ("+unit+")");
   await assert.rejects(db.query(
       "DELETE FROM entregas.domain_event WHERE event_id=$1",["ev-"+id]),
       (e:unknown)=>(e as {code?:string}).code==="42501");
   check(true,"role nao recebe DELETE no log append-only ("+unit+")");
   await assert.rejects(db.query(
       "UPDATE entregas.ready_order SET unit_id=$1 WHERE unit_id=$2 AND order_ref=$3",
       [id==="i"?"VILA-LAB":"ITAIM",unit,"ready-"+id]),deniedRls);
   check(true,"fila pronta recusa UPDATE que transfere pedido para outra unidade ("+unit+")");
   await assert.rejects(db.transaction(async tx=>{
      const moved=await tx.query<One>(
        "UPDATE entregas.trip SET state='lab_em_transito' WHERE trip_id=$1 RETURNING trip_id",["trip-"+id]);
      assert.equal(moved[0]?.trip_id,"trip-"+id);
      const removed=await tx.query<One>(
        "DELETE FROM entregas.delivery WHERE delivery_id=$1 RETURNING delivery_id",["delivery-"+id]);
      assert.equal(removed[0]?.delivery_id,"delivery-"+id);
      throw Error("LAB_ROLLBACK_OWN_WRITES");
   }),/LAB_ROLLBACK_OWN_WRITES/);
   check(true,"UPDATE e DELETE legitimos da propria unidade funcionam, com ROLLBACK ("+unit+")");
   const own=await db.query<One>(
       "INSERT INTO entregas.ready_order(unit_id,order_ref,label,created_at) VALUES($1,$2,'LAB_ONLY',now()) RETURNING order_ref",
       [unit,"own-ready-"+id]);
   check(own[0]?.order_ref==="own-ready-"+id,"INSERT legitimo na propria unidade permanece funcional ("+unit+")");
  }
  check((await pilot.query<One>("SELECT COUNT(*)::int AS n FROM entregas.trip"))[0]?.n===0,
    "role baseline sem policy fica fail-closed quando RLS e habilitado");
  const admin=await lab.cliente.query<One>(
    "SELECT COUNT(*)::int AS n FROM entregas.delivery WHERE delivery_id IN ('delivery-i','delivery-v')");
  check(admin[0]?.n===2,"as duas entregas originais seguem intactas");
  await assert.rejects(lab.cliente.query(
    "UPDATE entregas.domain_event SET event_type='tampered' WHERE event_id='ev-i'"),
    (e:unknown)=>(e as {code?:string}).code==="P0001");
  check(true,"trigger append-only barra UPDATE ate pelo proprietario no banco de LAB");
  console.log("ENTREGAS_WRITE_RLS_LAB: "+n+"/"+n+
    " PASS (USING/WITH CHECK, FK CHILDREN, APPEND-ONLY, EPHEMERAL DB ONLY)");
 }finally{
  for(const client of clients.reverse())await client.close();
  await pilot?.close();
  for(const p of policies.reverse())await lab.cliente.query("DROP POLICY "+p.name+" ON "+p.table);
  for(const role of created.reverse()){
   await lab.cliente.query("REVOKE SELECT,INSERT,UPDATE,DELETE ON entregas.trip,entregas.delivery,entregas.ready_order FROM "+role);
   await lab.cliente.query("REVOKE SELECT,INSERT ON entregas.domain_event FROM "+role);
   await lab.cliente.query("REVOKE USAGE ON ALL SEQUENCES IN SCHEMA entregas FROM "+role);
   await lab.cliente.query("REVOKE USAGE ON SCHEMA entregas FROM "+role);
   await lab.cliente.query("REVOKE CONNECT ON DATABASE "+lab.nome+" FROM "+role);
   await lab.cliente.query("DROP ROLE "+role);
  }
  await lab.descartar();
 }
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
