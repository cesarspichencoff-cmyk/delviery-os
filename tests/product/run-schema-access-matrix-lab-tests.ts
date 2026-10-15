/**
 * Auditoria do inventario e grants versionados em banco TEMPORARIO.
 * Nunca atinge banco real, credencial de loja ou usuario humano.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient, type PgSqlClient } from "../../src/platform/persistence/sql-client";

const base=(process.env.DELIVERYOS_PG_URL??"").trim();
const temp=(process.env.RUNNER_TEMP??"").trim();
const u=base?new URL(base):null;
if(process.env.GITHUB_ACTIONS!=="true" || !temp ||
   u?.hostname!=="localhost" || u.port!=="55441" ||
   !(u.searchParams.get("host")??"").startsWith(temp+"/operator-pg-socket-")){
  console.error("SCHEMA_MATRIX_LAB_NOT_RUN: private runner owned socket required; NOT GREEN");
  process.exit(78);
}
const schemas=["identity","platform","entregas","sources","orders"];
const classes:Record<string,string>={
 "identity.unit":"direct",
 "identity.actor":"direct",
 "identity.device":"direct",
 "platform.schema_migration":"global",
 "platform.inbox":"direct",
 "platform.event_log":"direct",
 "platform.outbox":"global",
 "platform.job":"global",
 "platform.audit":"global",
 "entregas.trip":"direct",
 "entregas.delivery":"trip_parent",
 "entregas.gps_point":"trip_parent",
 "entregas.occurrence":"direct",
 "entregas.term_acknowledgement":"direct",
 "entregas.handoff":"direct",
 "entregas.rider_state":"direct",
 "entregas.domain_event":"direct",
 "entregas.public_outbox":"direct",
 "entregas.ready_order":"direct",
 "sources.source_event":"direct",
 "orders.order_twin":"direct"
};
type Relation={relation:string;relrowsecurity:boolean;relforcerowsecurity:boolean;unit_column:boolean;trip_column:boolean};
type Priv={relation:string;can_select:boolean;can_insert:boolean;can_update:boolean;can_delete:boolean};
type Count={n:number};
let passed=0;
function check(value:boolean,label:string){assert.ok(value,label);passed++;console.log("ok MATRIX-"+passed+" "+label);}
async function main(){
 const lab=await bancoIsolado(base,undefined,"matrix");
 let pilot:PgSqlClient|null=null;
 try{
  const tables=await lab.cliente.query<Relation>(
   "SELECT n.nspname||'.'||c.relname AS relation,c.relrowsecurity,c.relforcerowsecurity,"+
   "EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='unit_id' AND NOT a.attisdropped) AS unit_column,"+
   "EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='trip_id' AND NOT a.attisdropped) AS trip_column "+
   "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
   "WHERE n.nspname=ANY($1) AND c.relkind IN ('r','p','v','m') ORDER BY relation",[schemas]);
  check(JSON.stringify(tables.map(x=>x.relation))===JSON.stringify(Object.keys(classes).sort()),
    "inventario de 21 tabelas de migrations reconciliado e fechado a objetos nao mapeados");
  check(tables.length===21,"schema possui as 21 relacoes de contrato, nenhuma view nao inventariada");
  check(tables.every(x=>classes[x.relation]==="direct" ? x.unit_column :
    classes[x.relation]==="trip_parent" ? (!x.unit_column&&x.trip_column) :
    classes[x.relation]==="global" ? (!x.unit_column&&!x.trip_column) : false),
    "colunas de escopo: 15 direct, 2 trip_parent, 4 sem unidade");
  const direct=tables.filter(x=>x.unit_column).length;
  const parent=tables.filter(x=>!x.unit_column&&x.trip_column).length;
  check(direct===15&&parent===2&&tables.length-direct-parent===4,
    "contagens de classificacao por tipo de escopo conferidas");
  check(tables.every(x=>!x.relrowsecurity&&!x.relforcerowsecurity),
    "ALERTA: migrations oficiais baseline ainda nao habilitam RLS nessas tabelas");
  const functions=await lab.cliente.query<{name:string;definer:boolean}>(
    "SELECT n.nspname||'.'||p.proname AS name,p.prosecdef AS definer "+
    "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "+
    "WHERE n.nspname=ANY($1) ORDER BY name",[schemas]);
  check(functions.length>0&&functions.every(x=>!x.definer),
    "nenhuma funcao SECURITY DEFINER no schema migrado atual; revisar futuras alteracoes");
  console.log("DB_MATRIX_COUNTS total="+tables.length+" direct="+direct+" parent="+parent+
    " sem_unit="+(tables.length-direct-parent)+" funcs="+functions.length);
  console.log("DB_MATRIX_NO_UNIT "+tables.filter(x=>!x.unit_column&&!x.trip_column).map(x=>x.relation).join(","));

  // Executa o arquivo CANONICO de privileges APENAS no banco criado acima.
  execFileSync("/usr/lib/postgresql/16/bin/psql",[
    "--no-psqlrc","--set","ON_ERROR_STOP=1","--dbname",lab.url,
    "--file",resolve("deploy/sql/papeis_minimos.sql")
  ],{encoding:"utf8",stdio:"pipe",timeout:20000});
  const roles=await lab.cliente.query<Priv>(
   "SELECT n.nspname||'.'||c.relname AS relation,"+
   "has_table_privilege('deliveryos_entregas_pilot',c.oid,'SELECT') AS can_select,"+
   "has_table_privilege('deliveryos_entregas_pilot',c.oid,'INSERT') AS can_insert,"+
   "has_table_privilege('deliveryos_entregas_pilot',c.oid,'UPDATE') AS can_update,"+
   "has_table_privilege('deliveryos_entregas_pilot',c.oid,'DELETE') AS can_delete "+
   "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
   "WHERE n.nspname=ANY($1) AND c.relkind IN ('r','p','v','m') ORDER BY relation",[schemas]);
  check(roles.length===tables.length,"privilegios declarados comparados com todas as 21 tabelas");
  const byName=new Map(roles.map(x=>[x.relation,x]));
  const reads=["entregas.trip","entregas.delivery","entregas.handoff",
    "entregas.occurrence","entregas.rider_state","entregas.domain_event",
    "entregas.public_outbox","entregas.ready_order","platform.schema_migration"];
  check(reads.every(x=>byName.get(x)?.can_select===true),
    "papel declarativo de piloto pode ler oito tabelas operacionais e migracao");
  check(byName.get("entregas.gps_point")?.can_select===false &&
    byName.get("identity.actor")?.can_select===false &&
    byName.get("platform.event_log")?.can_select===false,
    "papel nao tem SELECT de gps_point, actor ou event_log");
  check(byName.get("entregas.delivery")?.can_delete===true &&
    byName.get("entregas.ready_order")?.can_delete===true &&
    byName.get("entregas.trip")?.can_update===true,
    "papel operacional possui DELETE e UPDATE: nao e role de leitura");

  await lab.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim'),('VILA-LAB','Vila Lab')");
  for(const [unit,id] of [["ITAIM","i"],["VILA-LAB","v"]] as const){
    await lab.cliente.query(
      "INSERT INTO entregas.trip(trip_id,unit_id,courier_actor_id,state,created_by,created_at,contract_version) "+
      "VALUES($1,$2,$3,'ativa','LAB_SYNTHETIC',now(),'test@1')",["trip-"+id,unit,"courier-"+id]);
    await lab.cliente.query(
      "INSERT INTO entregas.delivery(delivery_id,trip_id,order_ref,channel,planned_stop_order,state) "+
      "VALUES($1,$2,$3,'LAB_SYNTHETIC',1,'aguardando')",["del-"+id,"trip-"+id,"LAB_ORDER_"+id]);
  }
  const tenantUrl=new URL(lab.url);tenantUrl.username="deliveryos_entregas_pilot";tenantUrl.password="";
  pilot=await createPgClient({url:tenantUrl.toString(),max:1});
  const me=await pilot.query<{username:string;superuser:boolean;bypass:boolean}>(
    "SELECT current_user AS username,rolsuper AS superuser,rolbypassrls AS bypass "+
    "FROM pg_roles WHERE rolname=current_user");
  check(me.length===1&&me[0].username==="deliveryos_entregas_pilot" &&
    !me[0].superuser&&!me[0].bypass,"teste executa como role declarada sem bypass nem superuser");
  const trips=await pilot.query<Count>("SELECT COUNT(*)::int AS n FROM entregas.trip");
  const deliveries=await pilot.query<Count>("SELECT COUNT(*)::int AS n FROM entregas.delivery");
  check(trips[0].n===2&&deliveries[0].n===2,
    "ALERTA: role oficial versionada le viagens E entregas das duas unidades no lab");
  const refs=await pilot.query<{order_ref:string}>("SELECT order_ref FROM entregas.delivery ORDER BY order_ref");
  check(refs.map(x=>x.order_ref).join(",")==="LAB_ORDER_i,LAB_ORDER_v",
    "SELECT sem RLS permite ler order_refs da outra unidade no lab");
  await assert.rejects(pilot.query("SELECT * FROM identity.actor"),
    (e:unknown)=>(e as {code?:string}).code==="42501");
  check(true,"SELECT de tabela nao concedida recebe erro de permissao");
  await assert.rejects(pilot.query("ALTER TABLE entregas.trip DISABLE ROW LEVEL SECURITY"),
    (e:unknown)=>(e as {code?:string}).code==="42501");
  check(true,"role nao pode desabilitar politica RLS");
  console.log("OPERATOR_DB_SCHEMA_ACCESS_MATRIX: "+passed+"/"+passed+
    " PASS (VERSIONED GRANTS EXECUTED ONLY IN EPHEMERAL DB)");
 }finally{
  await pilot?.close();
  await lab.descartar();
 }
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
