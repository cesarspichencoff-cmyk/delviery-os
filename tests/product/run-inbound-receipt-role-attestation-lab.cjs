// Gate de revisao: PostgreSQL16 efemero do runner. Nunca aplica migration 0011.
// A tabela abaixo e uma FIXTURE, nao a proposta real de migration.
// Gera provas de permissao e protecao fail-closed, NAO aprova multiunidade.
"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");

let url;
try { url = new URL(process.env.DELIVERYOS_PG_URL || ""); } catch {}
const socket = url?.searchParams.get("host") || "";
const runnerTemp = process.env.RUNNER_TEMP || "";
if (process.env.GITHUB_ACTIONS !== "true" || !runnerTemp
    || !socket.startsWith(runnerTemp + "/deliveryos-sock-")
    || url?.hostname !== "localhost" || url?.port !== "55434"
    || url?.pathname !== "/postgres") {
  console.error("LAB_DENIED: exige cluster privado e socket GitHub Actions");
  process.exit(78);
}
const roleSQL = readFileSync(join(process.cwd(),"deploy/sql/papeis_minimos.sql"),"utf8");
const migration0010 = readFileSync(join(process.cwd(),"src/platform/migrations/0010_producer_attestation.sql"),"utf8");
const block = roleSQL.match(/DO \$entregas_receipt_role\$[\s\S]*?\$entregas_receipt_role\$;/);
assert.ok(block, "bloco SQL de recibos ausente");
const sql = block[0];
assert.ok(roleSQL.includes("GRANT SELECT ON platform.producer_key TO deliveryos_source_ingest;"),"0010: produtor perdido");
assert.ok(roleSQL.includes("GRANT SELECT, INSERT ON platform.producer_admission TO deliveryos_source_ingest;"),"0010: admissao perdida");
assert.ok(migration0010.includes("ARRAY['simulated','control']::TEXT[]"),"0010: proibicao de real perdida");
assert.ok(sql.includes("c.relrowsecurity") && sql.includes("c.relforcerowsecurity"),"RLS/FORCE faltando");
assert.ok(sql.includes("rolbypassrls") && sql.includes("has_any_column_privilege"),"guarda de privilegios faltando");
assert.equal((sql.match(/GRANT SELECT, INSERT ON entregas.inbound_receipt/g)||[]).length,0);
assert.ok(sql.includes("'SELECT'") && sql.includes("'INSERT'"),"shared role grant policy must cover read and write");
const env = {...process.env,
  PGHOST:socket, PGPORT:"55434", PGUSER:decodeURIComponent(url.username),
  PGDATABASE:"postgres", PGPASSWORD:""};
delete env.DELIVERYOS_SOURCE_SECRET;
const psqlBin="/usr/lib/postgresql/16/bin/psql";
function execSQL(db,input) {
  return spawnSync(psqlBin, ["-X","-q","-v","ON_ERROR_STOP=1","-d",db,"-At"],
    {input,encoding:"utf8",env,timeout:15000});
}
function ok(db,input,name) {
  const r=execSQL(db,input);
  assert.equal(r.status,0,name+": "+String(r.stderr).slice(0,360));
  return r.stdout.trim();
}
function denied(db,input,reason,name) {
  const r=execSQL(db,input);
  assert.notEqual(r.status,0,name+": aceito indevidamente");
  assert.ok(String(r.stderr).includes(reason),name+": motivo: "+String(r.stderr).slice(0,360));
}
// Login efetivo da role (mesma conexao de banco que a credencial teria).
// O cluster descartavel usa trust apenas em socket privado do runner; nao
// comprova autenticacao de credenciais operacionais reais.
function execAs(db,role,input) {
  return spawnSync(psqlBin, ["-X","-q","-v","ON_ERROR_STOP=1","-d",db,"-At"],
    {input,encoding:"utf8",env:{...env,PGUSER:role},timeout:15000});
}
function okAs(db,role,input,name) {
  const r=execAs(db,role,input);
  assert.equal(r.status,0,name+": "+String(r.stderr).slice(0,360));
  return r.stdout.trim();
}
function deniedAs(db,role,input,reason,name) {
  const r=execAs(db,role,input);
  assert.notEqual(r.status,0,name+": aceito indevidamente");
  assert.ok(String(r.stderr).includes(reason),name+": motivo: "+String(r.stderr).slice(0,360));
}
const db="lab_receipt_"+randomBytes(5).toString("hex");
const role="deliveryos_entregas_pilot";
let madeRole=false,madeDB=false,pass=0;
function passed(s) { console.log("PASS "+(++pass)+" "+s); }
try {
  ok("postgres","CREATE ROLE "+role+" LOGIN NOSUPERUSER NOBYPASSRLS;","create role");
  madeRole=true;
  ok("postgres","CREATE DATABASE "+db+";","create db");
  madeDB=true;
  ok(db,"CREATE SCHEMA entregas; CREATE TABLE entregas.inbound_receipt ("+
    "unit_id text NOT NULL,event_id text NOT NULL,command_id text NOT NULL,"+
    "idempotency_key text NOT NULL, PRIMARY KEY(unit_id,event_id));"+
    "INSERT INTO entregas.inbound_receipt VALUES "+
    "('ITAIM','evt-i','cmd-i','key-i'),('VILA-LAB','evt-v','cmd-v','key-v');"+
    "GRANT USAGE ON SCHEMA entregas TO deliveryos_entregas_pilot;","fixture");
  passed("cluster e fixture com duas unidades sinteticas");
  denied(db,sql,"RLS e FORCE RLS obrigatorios","sem RLS");
  passed("sem RLS a guarda recusa");
  ok(db,"ALTER TABLE entregas.inbound_receipt ENABLE ROW LEVEL SECURITY;","rls enable");
  denied(db,sql,"RLS e FORCE RLS obrigatorios","sem force");
  passed("somente RLS nao basta");
  ok(db,"ALTER TABLE entregas.inbound_receipt FORCE ROW LEVEL SECURITY;","rls force");
  ok(db,sql,"shared-role guard");
  passed("RLS FORCE sem grants para papel compartilhado");
  const sharedRights=ok(db,
    "SELECT has_table_privilege('"+role+"','entregas.inbound_receipt','SELECT'),"+
    "has_table_privilege('"+role+"','entregas.inbound_receipt','INSERT'),"+
    "has_table_privilege('"+role+"','entregas.inbound_receipt','UPDATE'),"+
    "has_table_privilege('"+role+"','entregas.inbound_receipt','DELETE'),"+
    "has_table_privilege('"+role+"','entregas.inbound_receipt','TRUNCATE');","shared privileges");
  assert.equal(sharedRights,"f|f|f|f|f");
  passed("papel compartilhado sem SELECT INSERT UPDATE DELETE TRUNCATE");
  deniedAs(db,role,"SELECT count(*) FROM entregas.inbound_receipt;",
    "permission denied","shared read");
  passed("leitura compartilhada nao autorizada");
  deniedAs(db,role,"INSERT INTO entregas.inbound_receipt VALUES ('ITAIM','x','x','x');",
    "permission denied","shared insert");
  passed("escrita compartilhada nao autorizada");
  ok(db,"GRANT SELECT ON entregas.inbound_receipt TO "+role+";","inject select");
  denied(db,sql,"papel multiunidade nao recebe privilegios","select leaked");
  passed("guarda detecta SELECT amplo introduzido depois");
  ok(db,"REVOKE SELECT ON entregas.inbound_receipt FROM "+role+";","revoke select");
  ok(db,"GRANT INSERT ON entregas.inbound_receipt TO "+role+";","inject insert");
  denied(db,sql,"papel multiunidade nao recebe privilegios","insert leaked");
  passed("guarda detecta INSERT amplo introduzido depois");
  ok(db,"REVOKE INSERT ON entregas.inbound_receipt FROM "+role+";","revoke insert");
  ok(db,sql,"reapply");
  passed("reaplicacao idempotente sem permitir acesso compartilhado");
  // ACLs can leak via PUBLIC, role membership, or individual columns.
  ok(db,"GRANT SELECT ON entregas.inbound_receipt TO PUBLIC;","PUBLIC SELECT injected");
  denied(db,sql,"papel multiunidade nao recebe privilegios","PUBLIC SELECT leaked");
  passed("guarda identifica SELECT herdado de PUBLIC");
  ok(db,"REVOKE SELECT ON entregas.inbound_receipt FROM PUBLIC;","PUBLIC SELECT revoked");
  ok(db,"GRANT INSERT ON entregas.inbound_receipt TO PUBLIC;","PUBLIC INSERT injected");
  denied(db,sql,"papel multiunidade nao recebe privilegios","PUBLIC INSERT leaked");
  passed("guarda identifica INSERT herdado de PUBLIC");
  ok(db,"REVOKE INSERT ON entregas.inbound_receipt FROM PUBLIC;","PUBLIC INSERT revoked");
  ok(db,"GRANT SELECT(event_id) ON entregas.inbound_receipt TO "+role+";","column SELECT injected");
  denied(db,sql,"papel multiunidade nao recebe privilegios","column SELECT leaked");
  passed("guarda identifica SELECT concedido somente por coluna");
  ok(db,"REVOKE SELECT(event_id) ON entregas.inbound_receipt FROM "+role+";","column SELECT revoked");
  const inherited="deliveryos_receipt_inherited_lab";
  ok("postgres","CREATE ROLE "+inherited+" NOLOGIN; GRANT "+inherited+" TO "+role+";","role inherited");
  ok(db,"GRANT SELECT ON entregas.inbound_receipt TO "+inherited+";","inherited SELECT injected");
  denied(db,sql,"papel multiunidade nao recebe privilegios","inherited SELECT leaked");
  passed("guarda identifica SELECT herdado por membership");
  ok(db,"REVOKE SELECT ON entregas.inbound_receipt FROM "+inherited+";","inherited SELECT revoked");
  ok("postgres","REVOKE "+inherited+" FROM "+role+"; DROP ROLE "+inherited+";","cleanup inherited role");
  ok(db,sql,"reapply after PUBLIC/column/role revocations");
  passed("guarda reexecutada apos todas revogacoes adversariais");
  const itaim="deliveryos_receipt_itaim";
  const vila="deliveryos_receipt_vila";
  ok("postgres","CREATE ROLE "+itaim+" LOGIN NOSUPERUSER NOBYPASSRLS;"+
    "CREATE ROLE "+vila+" LOGIN NOSUPERUSER NOBYPASSRLS;","per-unit roles");
  ok(db,"GRANT USAGE ON SCHEMA entregas TO "+itaim+","+vila+";"+
    "GRANT SELECT,INSERT ON entregas.inbound_receipt TO "+itaim+","+vila+";"+
    "CREATE POLICY receipt_itaim_policy ON entregas.inbound_receipt FOR ALL TO "+itaim+
    " USING (unit_id = 'ITAIM') WITH CHECK (unit_id = 'ITAIM');"+
    "CREATE POLICY receipt_vila_policy ON entregas.inbound_receipt FOR ALL TO "+vila+
    " USING (unit_id = 'VILA-LAB') WITH CHECK (unit_id = 'VILA-LAB');","fixture policies");
  passed("roles distintas e policies fixas sem GUC");
  const rowsI=okAs(db,itaim,"SELECT string_agg(unit_id,',') FROM entregas.inbound_receipt;",
    "ITAIM read");
  assert.equal(rowsI,"ITAIM");
  passed("ITAIM le apenas seu recibo");
  const rowsV=okAs(db,vila,"SELECT string_agg(unit_id,',') FROM entregas.inbound_receipt;",
    "VILA read");
  assert.equal(rowsV,"VILA-LAB");
  passed("VILA le apenas seu recibo");
  const spoof=okAs(db,itaim,"SET deliveryos.unit_scope = 'VILA-LAB';"+
    "SELECT string_agg(unit_id,',') FROM entregas.inbound_receipt;","spoof GUC");
  assert.equal(spoof,"ITAIM");
  passed("GUC falsa nao troca unidade");
  deniedAs(db,itaim,"SET ROLE "+vila+";","permission denied","SET ROLE cruzado");
  passed("role de ITAIM nao assume role VILA");
  deniedAs(db,itaim,"INSERT INTO entregas.inbound_receipt "+
    "VALUES ('VILA-LAB','e-ileg','c-ileg','k-ileg');","row-level security","cross-unit insert");
  passed("INSERT na outra unidade recusado por RLS");
  okAs(db,itaim,"INSERT INTO entregas.inbound_receipt "+
    "VALUES ('ITAIM','e-ok','c-ok','k-ok');","valid insert ITAIM");
  const after=okAs(db,itaim,"SELECT count(*) FROM entregas.inbound_receipt;","valid read");
  assert.equal(after,"2");
  passed("INSERT na propria unidade e leitura restrita funcionam");
  deniedAs(db,itaim,"UPDATE entregas.inbound_receipt SET command_id='x';",
    "permission denied","unit update");
  passed("roles de unidade nao podem alterar recibos");
  ok(db,"ALTER TABLE entregas.inbound_receipt NO FORCE ROW LEVEL SECURITY;","remove force");
  denied(db,sql,"RLS e FORCE RLS obrigatorios","drift RLS");
  passed("deriva FORCE ainda e bloqueada");
  console.log("ROLE_RECEIPT_PG16_FIXTURE="+pass+"/"+pass+" PASS");
  console.log("0011 NAO EXECUTADA; isolamento provado SO nas roles de fixture; DRAFT/HOLD/NO_GO");
} finally {
  if(madeDB) execSQL("postgres","DROP DATABASE IF EXISTS "+db+" WITH (FORCE);");
  execSQL("postgres","DROP ROLE IF EXISTS deliveryos_receipt_itaim,deliveryos_receipt_vila;");
  if(madeRole) execSQL("postgres","DROP ROLE IF EXISTS "+role+";");
}
