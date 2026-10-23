// Executable REVIEW-ONLY RLS proof using PostgreSQL16 private CI socket.
// Uses a fixture, NOT original SQL 0011, and never connects to operational DB.
"use strict";
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const {join}=require("node:path");
const {spawnSync}=require("node:child_process");
const {randomBytes}=require("node:crypto");
let url;
try{url=new URL(process.env.DELIVERYOS_PG_URL||"");}catch{}
const temp=process.env.RUNNER_TEMP||"",socket=url?.searchParams.get("host")||"";
if(process.env.GITHUB_ACTIONS!=="true"||!temp||
   !socket.startsWith(temp+"/deliveryos-sock-")||
   url.hostname!=="localhost"||url.port!=="55434"||url.pathname!=="/postgres"){
 console.error("REVIEW_RLS_LAB_DENIED: CI ephemeral private PG required");
 process.exit(78);
}
const sql=readFileSync(join(process.cwd(),
 "docs/entregas/pilot/PROPOSTA_RLS_0011_REVISAO.sql"),"utf8");
assert.ok(sql.includes("approved_ephemeral_lab")&&!sql.includes("CREATE TABLE"));
const env={...process.env,PGHOST:socket,PGPORT:"55434",PGUSER:decodeURIComponent(url.username),
 PGDATABASE:"postgres",PGPASSWORD:""};
delete env.DELIVERYOS_SOURCE_SECRET;
const psql="/usr/lib/postgresql/16/bin/psql";
function exec(db,statement,role=env.PGUSER) {
 return spawnSync(psql,["-X","-q","-At","-v","ON_ERROR_STOP=1","-d",db],
  {input:statement,encoding:"utf8",timeout:20000,env:{...env,PGUSER:role}});
}
function yes(db,q,label,role) {
 const r=exec(db,q,role);
 assert.equal(r.status,0,label+": "+String(r.stderr).slice(0,450));
 return r.stdout.trim();
}
function no(db,q,reason,label,role) {
 const r=exec(db,q,role);
 assert.notEqual(r.status,0,label+": unexpectedly succeeded");
 assert.ok(String(r.stderr).includes(reason),label+": "+String(r.stderr).slice(0,450));
}
const db="lab_review_rls_"+randomBytes(5).toString("hex");
const shared="deliveryos_entregas_pilot",itaim="deliveryos_receipt_itaim",
 pin="deliveryos_receipt_pinheiros";
let database=false,roles=false,count=0;
function passed(s){console.log("REVIEW_RLS_PASS "+(++count)+" "+s);}
const arm="SET deliveryos.review_rls_lab='approved_ephemeral_lab';\n";
try{
 yes("postgres","CREATE ROLE "+shared+" LOGIN NOSUPERUSER NOBYPASSRLS;"+
 "CREATE ROLE "+itaim+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;"+
 "CREATE ROLE "+pin+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;","roles");
 roles=true;
 yes("postgres","CREATE DATABASE "+db+";","database");
 database=true;
 yes(db,"CREATE SCHEMA entregas;"+
 "CREATE TABLE entregas.inbound_receipt("+
 "unit_id text NOT NULL,event_id text NOT NULL,command_id text NOT NULL,"+
 "idempotency_key text NOT NULL,PRIMARY KEY(unit_id,event_id));"+
 "INSERT INTO entregas.inbound_receipt VALUES "+
 "('ITAIM','ei','ci','ki'),('PINHEIROS','ep','cp','kp');"+
 "GRANT USAGE ON SCHEMA entregas TO "+shared+";","fixture");
 passed("database, role identities, and two-unit fixture");
 no(db,sql,"REVIEW_ONLY: exige sessao","unarmed SQL rejected");
 assert.equal(yes(db,"SELECT relrowsecurity FROM pg_class WHERE oid='entregas.inbound_receipt'::regclass","no side effects"),"f");
 passed("unarmed proposal rejects without modifying RLS");
 yes(db,arm+sql,"review-only policy first application");
 passed("versioned review SQL applied only with lab flag");
 yes(db,arm+sql,"review-only policy second application");
 passed("versioned review SQL idempotent");
 const flags=yes(db,"SELECT relrowsecurity::text||'|'||relforcerowsecurity::text FROM pg_class WHERE oid='entregas.inbound_receipt'::regclass","force");
 assert.equal(flags,"true|true");
 passed("RLS and FORCE active after reapply");
 const pol=yes(db,"SELECT string_agg(policyname,',' ORDER BY policyname) FROM pg_policies WHERE schemaname='entregas' AND tablename='inbound_receipt'","policies");
 assert.equal(pol,"inbound_receipt_itaim_review,inbound_receipt_pinheiros_review");
 passed("exactly two scoped policies");
 no(db,"SELECT count(*) FROM entregas.inbound_receipt","permission denied","shared SELECT",shared);
 no(db,"INSERT INTO entregas.inbound_receipt VALUES('ITAIM','s1','sc1','sk1')","permission denied","shared INSERT",shared);
 passed("shared multiunit role cannot read or write");
 assert.equal(yes(db,"SELECT string_agg(unit_id,',') FROM entregas.inbound_receipt","itaim read",itaim),"ITAIM");
 assert.equal(yes(db,"SELECT string_agg(unit_id,',') FROM entregas.inbound_receipt","pin read",pin),"PINHEIROS");
 passed("unit roles read only own rows");
 no(db,"INSERT INTO entregas.inbound_receipt VALUES('PINHEIROS','forged','fc','fk')",
  "row-level security","cross-unit INSERT",itaim);
 passed("cross-unit INSERT refused");
 yes(db,"INSERT INTO entregas.inbound_receipt VALUES('ITAIM','e2','c2','k2')","own INSERT",itaim);
 assert.equal(yes(db,"SELECT count(*) FROM entregas.inbound_receipt","own SELECT",itaim),"2");
 passed("own-unit INSERT accepted");
 assert.equal(yes(db,"SET deliveryos.unit_scope='PINHEIROS'; SELECT string_agg(unit_id,',') FROM entregas.inbound_receipt","GUC fake",itaim),"ITAIM");
 no(db,"SET ROLE "+pin,"permission denied","cross-role SET ROLE",itaim);
 passed("GUC spoof and SET ROLE do not escape unit");
 no(db,"UPDATE entregas.inbound_receipt SET event_id='x'","permission denied","UPDATE",itaim);
 no(db,"DELETE FROM entregas.inbound_receipt","permission denied","DELETE",pin);
 passed("unit roles are read/insert only");
 yes(db,"GRANT SELECT ON entregas.inbound_receipt TO PUBLIC","poison PUBLIC");
 no(db,arm+sql,"papel multiunidade com privilegio","PUBLIC ACL attack refused");
 yes(db,"REVOKE SELECT ON entregas.inbound_receipt FROM PUBLIC","revoke PUBLIC");
 passed("policy composition refuses PUBLIC grant");
 yes("postgres","GRANT "+itaim+" TO "+shared,"membership poison");
 no(db,arm+sql,"membership cruzada","shared membership attack refused");
 yes("postgres","REVOKE "+itaim+" FROM "+shared,"revoke membership");
 passed("policy composition refuses shared-to-unit membership");
 yes(db,"CREATE POLICY receipt_open_leak ON entregas.inbound_receipt TO PUBLIC USING (true) WITH CHECK (true)","unknown policy poison");
 no(db,arm+sql,"policies desconhecidas","unknown permissive policy refused");
 yes(db,"DROP POLICY receipt_open_leak ON entregas.inbound_receipt","remove unknown");
 passed("policy composition refuses unknown permissive policy");
 yes(db,arm+sql,"final reapplication");
 assert.equal(yes(db,"SELECT count(*) FROM entregas.inbound_receipt","row count"),"3");
 passed("no denied operation changed receipt count");
 console.log("REVIEW_RLS_PG16_FIXTURE="+count+"/"+count+" PASS; ORIGINAL_0011_NOT_RUN; REVIEW_ONLY; DRAFT/HOLD/NO_GO");
}finally{
 if(database){
  const r=exec("postgres","DROP DATABASE IF EXISTS "+db+" WITH (FORCE)");
  assert.equal(r.status,0,"drop lab db:"+r.stderr?.slice(0,150));
 }
 if(roles){
  const r=exec("postgres","DROP ROLE IF EXISTS "+shared+","+itaim+","+pin+";");
  assert.equal(r.status,0,"drop lab roles:"+r.stderr?.slice(0,150));
 }
}
