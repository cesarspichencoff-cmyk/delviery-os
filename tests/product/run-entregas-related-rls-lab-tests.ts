/**
 * LAB ONLY: prova adversarial do RLS em tabelas filhas SEM unit_id proprio.
 * A coluna de unidade deve ser obtida pela trip pai.
 * Role de piloto/regras produtivas NAO sao modificados.
 */
import assert from "node:assert/strict";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient, type PgSqlClient } from "../../src/platform/persistence/sql-client";

const base=(process.env.DELIVERYOS_PG_URL??"").trim();
const tmp=(process.env.RUNNER_TEMP??"").trim();
const url=base?new URL(base):null;
if (process.env.GITHUB_ACTIONS!=="true" || !tmp ||
    url?.hostname!=="localhost" || url.port!=="55441" ||
    !(url.searchParams.get("host")??"").startsWith(tmp+"/operator-pg-socket-")) {
  console.error("RELATED_RLS_LAB_NOT_RUN: private runner-owned socket required; NOT GREEN");
  process.exit(78);
}
const suffix=process.pid+"_"+Date.now().toString(36);
const roles={
  unsafe:"rel_u_"+suffix,
  itaim:"rel_i_"+suffix,
  vila:"rel_v_"+suffix,
};
for(const x of Object.values(roles))assert.match(x,/^[a-z][a-z0-9_]{3,55}$/);
const tables=["entregas.trip","entregas.delivery","entregas.gps_point"] as const;
type Count={n:number};
type Detail={order_ref:string};
let n=0;
function check(cond:boolean,title:string){assert.ok(cond,title);n++;console.log("ok RELATED-"+n+" "+title);}
async function rows(db:PgSqlClient,table:string):Promise<number>{
  if(!tables.includes(table as typeof tables[number]))throw Error("TABLE_NOT_ALLOWED");
  const r=await db.query<Count>("SELECT COUNT(*)::int AS n FROM "+table);
  return r[0].n;
}
async function main(){
  const lab=await bancoIsolado(base,undefined,"relatedrls");
  const created:string[]=[];
  const policies:{table:string;name:string}[]=[];
  const clients:PgSqlClient[]=[];
  async function asRole(role:string):Promise<PgSqlClient>{
    const u=new URL(lab.url);u.username=role;u.password="";
    const cli=await createPgClient({url:u.toString(),max:1});clients.push(cli);return cli;
  }
  try{
    await lab.cliente.query("INSERT INTO identity.unit(unit_id,display_name) VALUES ('ITAIM','Itaim'),('VILA-LAB','Vila')");
    const hasColumn=await lab.cliente.query<{table_name:string;column_name:string}>(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='entregas' AND table_name=ANY($1) AND column_name='unit_id' ORDER BY table_name",
      [["trip","delivery","gps_point"]]);
    check(hasColumn.length===1 && hasColumn[0].table_name==="trip",
      "schema real: trip tem unit_id; delivery e gps_point herdam unidade por trip_id");
    const effectiveColumns=await lab.cliente.query<{table_name:string;column_name:string}>(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='entregas' AND table_name=ANY($1) AND column_name='trip_id' ORDER BY table_name",
      [["delivery","gps_point"]]);
    check(effectiveColumns.length===2,"duas tabelas filhas possuem referencia ao pai");
    for(const [unit,short] of [["ITAIM","i"],["VILA-LAB","v"]] as const){
      await lab.cliente.query(
        "INSERT INTO entregas.trip(trip_id,unit_id,courier_actor_id,state,created_by,created_at,contract_version) VALUES ($1,$2,$3,'ativa','LAB_SYNTHETIC',now(),'test@1')",
        ["trip-"+short,unit,"courier-"+short]);
      await lab.cliente.query(
        "INSERT INTO entregas.delivery(delivery_id,trip_id,order_ref,channel,planned_stop_order,state) VALUES ($1,$2,$3,'LAB_SYNTHETIC',1,'aguardando')",
        ["delivery-"+short,"trip-"+short,"LAB_ORDER_"+short]);
      await lab.cliente.query(
        "INSERT INTO entregas.gps_point(point_id,idempotency_key,trip_id,device_id,latitude,longitude,accuracy_m,occurred_at,source,quality,clock_trust,schema_version) VALUES ($1,$1,$2,$3,0,0,1,now(),'LAB_SYNTHETIC','sample','trusted','test@1')",
        ["point-"+short,"trip-"+short,"device-"+short]);
    }
    check((await lab.cliente.query<Count>("SELECT COUNT(*)::int AS n FROM entregas.delivery"))[0].n===2,
      "base descartavel contem duas entregas sinteticas, nenhuma real");
    for(const role of Object.values(roles)){
      await lab.cliente.query("CREATE ROLE "+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
      created.push(role);
      await lab.cliente.query("GRANT CONNECT ON DATABASE "+lab.nome+" TO "+role);
      await lab.cliente.query("GRANT USAGE ON SCHEMA entregas TO "+role);
      await lab.cliente.query("GRANT SELECT ON entregas.trip, entregas.delivery, entregas.gps_point TO "+role);
    }
    const unsafe=await asRole(roles.unsafe);
    check(await rows(unsafe,"entregas.trip")===2 &&
      await rows(unsafe,"entregas.delivery")===2 &&
      await rows(unsafe,"entregas.gps_point")===2,
      "RISCO: concessao SELECT sem RLS revela pai, pedido e GPS de ambas unidades");
    const evidence=await unsafe.query<Detail>("SELECT order_ref FROM entregas.delivery ORDER BY order_ref");
    check(evidence.map(x=>x.order_ref).join(",")==="LAB_ORDER_i,LAB_ORDER_v",
      "RISCO: order_ref de segunda unidade e legivel sem regra da tabela filha");
    await lab.cliente.query("ALTER TABLE entregas.trip ENABLE ROW LEVEL SECURITY");
    const grants=[["itaim","ITAIM"],["vila","VILA-LAB"]] as const;
    for(const [key,unit] of grants){
      const name="p_trip_"+key;
      await lab.cliente.query("CREATE POLICY "+name+" ON entregas.trip FOR SELECT TO "+
        roles[key]+" USING (unit_id='"+unit+"')");
      policies.push({table:"entregas.trip",name});
    }
    check(await rows(unsafe,"entregas.trip")===0,"sem policy, papel comum nao le viagens");
    check(await rows(unsafe,"entregas.delivery")===2 &&
      await rows(unsafe,"entregas.gps_point")===2,
      "RISCO: proteger SOMENTE trip nao protege SELECT direto em delivery ou gps_point");
    await lab.cliente.query("ALTER TABLE entregas.delivery ENABLE ROW LEVEL SECURITY");
    await lab.cliente.query("ALTER TABLE entregas.gps_point ENABLE ROW LEVEL SECURITY");
    for(const [key,unit] of grants){
      for(const [table,abbr] of [["entregas.delivery","d"],["entregas.gps_point","g"]] as const){
        const name="p_"+abbr+"_"+key;
        await lab.cliente.query("CREATE POLICY "+name+" ON "+table+" FOR SELECT TO "+
          roles[key]+" USING (EXISTS (SELECT 1 FROM entregas.trip t WHERE t.trip_id = "+
          table+".trip_id AND t.unit_id = '"+unit+"'))");
        policies.push({table,name});
      }
    }
    const it=await asRole(roles.itaim),vl=await asRole(roles.vila);
    for(const [db,unit,other] of [[it,"ITAIM","VILA-LAB"],[vl,"VILA-LAB","ITAIM"]] as const){
      check(await rows(db,"entregas.trip")===1 &&
        await rows(db,"entregas.delivery")===1 &&
        await rows(db,"entregas.gps_point")===1,
        "role "+unit+" le somente sua viagem, entrega e GPS por policy propria");
      const id=unit==="ITAIM"?"i":"v";
      const order=await db.query<Detail>("SELECT order_ref FROM entregas.delivery");
      check(order.length===1 && order[0].order_ref==="LAB_ORDER_"+id,
        "role "+unit+" nao publica pedido sintético de "+other);
      const ids=await db.query<{point_id:string}>("SELECT point_id FROM entregas.gps_point");
      check(ids.length===1 && ids[0].point_id==="point-"+id,
        "role "+unit+" nao publica GPS de "+other);
      await db.query("SELECT set_config('deliveryos.unit_scope',$1,false)",[other]);
      check(await rows(db,"entregas.delivery")===1 && await rows(db,"entregas.gps_point")===1,
        "GUC adversa nao aumenta a unidade autorizada para "+unit);
    }
    check(await rows(unsafe,"entregas.trip")===0 &&
      await rows(unsafe,"entregas.delivery")===0 &&
      await rows(unsafe,"entregas.gps_point")===0,
      "apos politicas, papel sem policy nao recebe nenhuma linha");
    const concurrent=await Promise.all([
      rows(it,"entregas.delivery"),rows(vl,"entregas.delivery"),
      rows(it,"entregas.gps_point"),rows(vl,"entregas.gps_point")
    ]);
    check(concurrent.every(x=>x===1),"roles distintas continuam isoladas em consultas concorrentes");
    await assert.rejects(it.query("SET ROLE "+roles.vila),
      (e:unknown)=>(e as {code?:string}).code==="42501");
    check(true,"role Itaim nao herda role Vila-Lab");
    await assert.rejects(it.query("ALTER TABLE entregas.delivery DISABLE ROW LEVEL SECURITY"),
      (e:unknown)=>(e as {code?:string}).code==="42501");
    check(true,"role nao desliga RLS da tabela filha");
    const triggerFn=await lab.cliente.query<{proname:string;security_definer:boolean}>(
      "SELECT p.proname,p.prosecdef AS security_definer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='entregas' ORDER BY p.proname");
    check(triggerFn.every(x=>!x.security_definer),
      "funcoes atuais no schema entregas nao sao SECURITY DEFINER no banco de LAB");
    console.log("ENTREGAS_RELATED_RLS_LAB: "+n+"/"+n+
      " PASS (SCHEMA-LIMITED SYNTHETIC, NOT PRODUCT ROLE OR DEPLOY)");
  }finally{
    for(const client of clients.reverse()) await client.close();
    for(const p of policies.reverse()) await lab.cliente.query("DROP POLICY "+p.name+" ON "+p.table);
    for(const role of created.reverse()){
      await lab.cliente.query("REVOKE SELECT ON entregas.trip, entregas.delivery, entregas.gps_point FROM "+role);
      await lab.cliente.query("REVOKE USAGE ON SCHEMA entregas FROM "+role);
      await lab.cliente.query("REVOKE CONNECT ON DATABASE "+lab.nome+" FROM "+role);
      await lab.cliente.query("DROP ROLE "+role);
    }
    await lab.descartar();
  }
}
void main().catch(e=>{console.error(e);process.exitCode=1});
