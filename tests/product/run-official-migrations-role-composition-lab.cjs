// LAB isolado: aplica SQLs OFICIAIS 0001-0010 + papeis_minimos.sql.
// Nao executa 0011, nao usa dados reais, nao prova runtime operacional.
// Roda apenas em cluster efemero GitHub Actions com Unix socket privado.
"use strict";
const assert=require("node:assert/strict");
const {readdirSync,existsSync}=require("node:fs");
const {join}=require("node:path");
const {spawnSync}=require("node:child_process");
const {randomBytes}=require("node:crypto");
const root=process.cwd(),tmp=process.env.RUNNER_TEMP||"";
let url;
try {url=new URL(process.env.DELIVERYOS_PG_URL||"");}catch{}
const sock=url?.searchParams.get("host")||"";
if(process.env.GITHUB_ACTIONS!=="true"||!tmp
 || !sock.startsWith(tmp+"/deliveryos-sock-")
 || url?.hostname!=="localhost"||url?.port!=="55434"
 || url?.pathname!=="/postgres") {
  console.error("LAB_DENIED: exige PostgreSQL efemero e socket privado");
  process.exit(78);
}
const bin="/usr/lib/postgresql/16/bin/psql";
const env={...process.env,PGHOST:sock,PGPORT:"55434",
  PGUSER:decodeURIComponent(url.username),PGDATABASE:"postgres",PGPASSWORD:""};
function query(db,sql,user=env.PGUSER) {
 return spawnSync(bin,["-X","-q","-At","-v","ON_ERROR_STOP=1","-d",db],
   {input:sql,encoding:"utf8",timeout:20000,env:{...env,PGUSER:user}});
}
function file(db,path) {
 return spawnSync(bin,["-X","-q","-At","-v","ON_ERROR_STOP=1","-d",db,"-f",path],
   {encoding:"utf8",timeout:30000,env});
}
function good(r,label) {
 assert.equal(r.status,0,label+": "+String(r.stderr).slice(0,460));
 return String(r.stdout).trim();
}
function bad(r,fragment,label) {
 assert.notEqual(r.status,0,label+": operacao indevida foi aceita");
 assert.ok(String(r.stderr).includes(fragment),label+": "+String(r.stderr).slice(0,460));
}
let count=0;
function pass(s){console.log("OFFICIAL_ROLE_PASS "+(++count)+" "+s);}
const datadir=good(query("postgres","SHOW data_directory;"),"identity cluster");
assert.ok(datadir.startsWith(tmp+"/deliveryos-pg-"),"cluster nao foi criado no diretorio do runner");
pass("data_directory pertence ao laboratorio do GitHub Actions");
const mdir=join(root,"src/platform/migrations");
const candidates=readdirSync(mdir).filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();
assert.equal(candidates.length,10,"quantidade inesperada de migrations; fail closed");
assert.deepEqual(candidates.map(x=>x.slice(0,4)),["0001","0002","0003","0004","0005","0006","0007","0008","0009","0010"]);
assert.ok(!existsSync(join(mdir,"0011_entregas_inbound_receipt.sql")),"0011 nao pode entrar no runner automatico");
pass("conjunto exato 0001-0010, 0011 nao promovida");
const db="lab_official_"+randomBytes(6).toString("hex");
let made=false,hasRoles=false;
try {
 good(query("postgres","CREATE DATABASE "+db+";"),"database create");
 made=true;
 for(const name of candidates) {
  good(file(db,join(mdir,name)),"migration "+name);
  pass("migration original "+name.slice(0,4));
 }
 const tables=good(query(db,"SELECT to_regclass('platform.producer_key') IS NOT NULL,"+
   "to_regclass('platform.producer_admission') IS NOT NULL,"+
   "to_regclass('entregas.inbound_receipt') IS NULL;"),"schema final 0010");
 assert.equal(tables,"t|t|t");
 pass("0010 aplicada, tabela futura 0011 ausente");
 const rolesFile=join(root,"deploy/sql/papeis_minimos.sql");
 good(file(db,rolesFile),"papeis oficiais primeira aplicacao");
 hasRoles=true;
 pass("papeis_minimos.sql completo aplicado apos 0010");
 good(file(db,rolesFile),"papeis oficiais reaplicacao");
 pass("papeis oficiais reexecutados sem drift");
 const roleFlags=good(query(db,"SELECT count(*) FROM pg_roles WHERE rolname IN ("+
   "'deliveryos_critical','deliveryos_async','deliveryos_source_ingest','deliveryos_entregas_pilot')"+
   " AND rolsuper=false AND rolbypassrls=false;"),"flags");
 assert.equal(roleFlags,"4");
 pass("quatro roles sem superuser ou BYPASSRLS");
 const producerRights=good(query(db,
   "SELECT has_table_privilege('deliveryos_source_ingest','platform.producer_key','SELECT'),"+
   "has_table_privilege('deliveryos_source_ingest','platform.producer_key','INSERT'),"+
   "has_table_privilege('deliveryos_source_ingest','platform.producer_admission','SELECT'),"+
   "has_table_privilege('deliveryos_source_ingest','platform.producer_admission','INSERT'),"+
   "has_table_privilege('deliveryos_source_ingest','platform.producer_admission','UPDATE');"),"0010 rights");
 assert.equal(producerRights,"t|f|t|t|f");
 pass("concessoes 0010: chave apenas leitura e admissao append-only");
 const pilot=good(query(db,
   "SELECT has_table_privilege('deliveryos_entregas_pilot','entregas.trip','SELECT'),"+
   "has_table_privilege('deliveryos_entregas_pilot','entregas.domain_event','INSERT'),"+
   "has_table_privilege('deliveryos_entregas_pilot','entregas.domain_event','DELETE');"),"pilot");
 assert.equal(pilot,"t|t|f");
 pass("papel operacional tem privilegios esperados, sem DELETE de evento");
 good(query(db,"INSERT INTO identity.unit (unit_id,display_name) VALUES "+
   "('ITAIM','fixture Itaim'),('VILA-LAB','fixture Vila');"),"seed unit");
 bad(query(db,"INSERT INTO platform.producer_key "+
   "(producer_id,key_id,unit_id,public_key,allowed_event_types,allowed_modes,"+
   "not_before,not_after,registered_by) VALUES "+
   "('lab','key1','ITAIM',decode(repeat('ab',32),'hex'),"+
   "ARRAY['trip_created'],ARRAY['real'],now(),now()+interval '1 day','fixture');"),
   "violates check constraint","modo real proibido");
 pass("migration 0010 recusa produtor com modo real");
 good(query(db,"INSERT INTO platform.producer_admission "+
   "(decision,reason,envelope_sha256,source_ref,received_at) VALUES "+
   "('quarantined','source_unverified',repeat('a',64),'LAB:1',now());"),"admission fixture");
 bad(query(db,"UPDATE platform.producer_admission SET reason='changed' WHERE source_ref='LAB:1';"),
   "append-only","admission update");
 bad(query(db,"TRUNCATE platform.producer_admission;"),
   "append-only","admission truncate");
 pass("admissao real 0010 nao aceita UPDATE nem TRUNCATE");
 const units=good(query(db,"SELECT string_agg(unit_id,',' ORDER BY unit_id) FROM identity.unit;",
   "deliveryos_entregas_pilot"),"pilot cross-unit fixture");
 assert.equal(units,"ITAIM,VILA-LAB");
 pass("contra-prova: papel compartilhado ainda le duas unidades, NO_GO multiunidade");
 console.log("OFFICIAL_MIGRATIONS_ROLE_COMPOSITION="+count+"/"+count+" PASS");
 console.log("0011 NOT_RUN; cross-unit LIVE RLS NOT_PROVEN; DRAFT/HOLD/NO_GO");
}finally{
 if(made) {
  const x=query("postgres","DROP DATABASE IF EXISTS "+db+" WITH (FORCE);");
  assert.equal(x.status,0,"cleanup database: "+String(x.stderr).slice(0,200));
 }
 if(hasRoles) {
  const x=query("postgres","DROP ROLE IF EXISTS deliveryos_critical,"+
    "deliveryos_async,deliveryos_source_ingest,deliveryos_entregas_pilot;");
  assert.equal(x.status,0,"cleanup role: "+String(x.stderr).slice(0,300));
 }
}
