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
assert.equal((sql.match(/GRANT SELECT, INSERT ON entregas.inbound_receipt/g)||[]).length,1);
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
    "('ITAIM','evt-i','cmd-i','key-i'),('VILA-LAB','evt-v','cmd-v','key-v');","fixture");
  passed("cluster e fixture de duas unidades criados");
  denied(db,sql,"RLS e FORCE RLS obrigatorios","sem RLS");
  passed("sem RLS bloqueia grant");
  ok(db,"ALTER TABLE entregas.inbound_receipt ENABLE ROW LEVEL SECURITY;","RLS on");
  denied(db,sql,"RLS e FORCE RLS obrigatorios","RLS sem FORCE");
  passed("RLS sem FORCE nao basta");
  ok(db,"ALTER TABLE entregas.inbound_receipt FORCE ROW LEVEL SECURITY;","RLS force");
  ok(db,sql,"grant");
  passed("GRANT condicionado a RLS e FORCE");
  const rights=ok(db,"SELECT has_table_privilege('"+role+"','entregas.inbound_receipt','SELECT'),"+
    "has_table_privilege('"+role+"','entregas.inbound_receipt','INSERT'),"+
    "has_table_privilege('"+role+"','entregas.inbound_receipt','UPDATE'),"+
    "has_table_privilege('"+role+"','entregas.inbound_receipt','DELETE'),"+
    "has_table_privilege('"+role+"','entregas.inbound_receipt','TRUNCATE');","privs");
  assert.equal(rights,"t|t|f|f|f");
  passed("apenas SELECT e INSERT para o papel restrito");
  const count=ok(db,"SET ROLE "+role+"; SELECT count(*) FROM entregas.inbound_receipt;","RLS SELECT");
  assert.equal(count,"0");
  passed("sem policy SELECT nao expoe linhas da outra unidade");
  denied(db,"SET ROLE "+role+"; INSERT INTO entregas.inbound_receipt VALUES ('ITAIM','evt-x','cmd-x','key-x');",
     "row-level security","RLS INSERT");
  passed("sem policy INSERT falha mesmo com grant");
  ok(db,"GRANT UPDATE(unit_id) ON entregas.inbound_receipt TO "+role+";","inject");
  denied(db,sql,"privilegio perigoso","UPDATE(column)");
  passed("UPDATE por coluna bloqueia reaplicacao");
  ok(db,"REVOKE UPDATE(unit_id) ON entregas.inbound_receipt FROM "+role+";","revoke");
  ok(db,sql,"reapply");
  passed("reaplicacao idempotente na fixture");
  ok(db,"ALTER TABLE entregas.inbound_receipt NO FORCE ROW LEVEL SECURITY;","NO FORCE");
  denied(db,sql,"RLS e FORCE RLS obrigatorios","policy drift");
  passed("deriva no FORCE provoca recusa");
  console.log("ROLE_RECEIPT_PG16_FIXTURE="+pass+"/"+pass+" PASS");
  console.log("NAO EXECUTOU 0011, NAO PROVOU RLS MULTIUNIDADE, DRAFT/HOLD/NO_GO");
} finally {
  if(madeDB) execSQL("postgres","DROP DATABASE IF EXISTS "+db+" WITH (FORCE);");
  if(madeRole) execSQL("postgres","DROP ROLE IF EXISTS "+role+";");
}
