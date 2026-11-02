"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {DatabaseSync}=require("node:sqlite");
const {createSyntheticTables,bindSyntheticSequence}=
 require("./comandas_sequence_v2_sqlite_lab.cjs");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"comandas-atomic-test-"));
const dbPath=path.join(tmp,"synthetic-only.sqlite");
let db,peer,n=0;
const inp=(sale,order,date="2026-11-01")=>({
 lab_context:"EPHEMERAL_CI_FIXTURE_ONLY",store:"0001|01",date,
 native_order_key:"0001|01|TEST_"+sale+"|TEST_"+order});
function ok(msg){console.log("PASS "+(++n)+" "+msg)}
try{
 db=new DatabaseSync(dbPath,{timeout:0});createSyntheticTables(db);
 let x=bindSyntheticSequence(db,inp("VENDA1","CMD1"));
 assert.equal(x.status,"SYNTHETIC_ATOMIC_BIND_READBACK_ONLY");
 assert.equal(x.lab_sequence,"001");assert.equal(x.authorize_print,false);
 assert.equal(x.number_for_operational_ticket,null);
 ok("first full-key bind is lab-only");
 x=bindSyntheticSequence(db,inp("VENDA1","CMD1"));
 assert.equal(x.status,"SYNTHETIC_REUSE_RECHECKED");assert.equal(x.lab_sequence,"001");
 ok("same strong key reuses existing number");
 x=bindSyntheticSequence(db,inp("VENDA1","CMD2"));assert.equal(x.lab_sequence,"002");
 ok("same sale distinct comanda does not alias");
 x=bindSyntheticSequence(db,inp("VENDA2","CMD1"));assert.equal(x.lab_sequence,"003");
 ok("same comanda distinct sale does not alias");
 x=bindSyntheticSequence(db,inp("VENDA1","CMD1","2026-11-02"));
 assert.equal(x.lab_sequence,"001");ok("new store-local day starts at one");
 db.close();db=new DatabaseSync(dbPath,{timeout:0});
 x=bindSyntheticSequence(db,inp("VENDA1","CMD1"));
 assert.equal(x.lab_sequence,"001");ok("database reopen preserves binding");
 x=bindSyntheticSequence(db,{...inp("VENDA1","CMD4"),native_order_key:"0001|02|TEST_VENDA1|TEST_CMD4"});
 assert.equal(x.status,"HOLD");ok("wrong native shop rejected");
 x=bindSyntheticSequence(db,{...inp("VENDA1","CMD4"),lab_context:"PRODUCTION"});
 assert.equal(x.status,"HOLD");ok("operational context forbidden");
 const wrongPath=new DatabaseSync(path.join(tmp,"unauthorized-name.sqlite"),{timeout:0});
 try{
  assert.throws(()=>createSyntheticTables(wrongPath),/SYNTHETIC_DB_LOCATION_REQUIRED/);
  assert.equal(bindSyntheticSequence(wrongPath,inp("VENDA1","CMD4")).reason,
   "SYNTHETIC_DB_LOCATION_REQUIRED");
  ok("reject non-designated SQLite path before touching tables");
 }finally{wrongPath.close()}
 peer=new DatabaseSync(dbPath,{timeout:0});
 db.exec("BEGIN IMMEDIATE");
 x=bindSyntheticSequence(peer,inp("VENDA1","CMD5"));
 assert.equal(x.status,"HOLD");assert.equal(x.authorize_print,false);
 ok("concurrent SQLite writer is blocked without retry");
 db.exec("ROLLBACK");
 x=bindSyntheticSequence(peer,inp("VENDA1","CMD5"));
 assert.equal(x.status,"SYNTHETIC_ATOMIC_BIND_READBACK_ONLY");
 assert.equal(x.lab_sequence,"004");ok("subsequent writer allocates once");
 assert.throws(()=>db.exec("DELETE FROM test_tata_seq_bind WHERE seq=1"));
 ok("prior binding cannot be deleted");
 db.prepare("UPDATE test_tata_seq_head SET highest=999 WHERE scope=?")
  .run("STORE:0001|01|DATE:2026-11-01");
 x=bindSyntheticSequence(db,inp("VENDA1","CMD6"));
 assert.equal(x.status,"HOLD");
 assert.equal(x.reason,"LAB_COUNTER_OR_BINDINGS_INTEGRITY_FAILED");
 ok("tampered sequence head detected");
 for(let i=1;i<=999;i++){
  let y=bindSyntheticSequence(db,inp("EX",String(i).padStart(4,"0"),"2026-11-04"));
  assert.equal(y.status,"SYNTHETIC_ATOMIC_BIND_READBACK_ONLY");
 }
 x=bindSyntheticSequence(db,inp("EX","1000","2026-11-04"));
 assert.equal(x.status,"HOLD");assert.equal(x.reason,"SYNTHETIC_SEQUENCE_EXHAUSTED");
 ok("999 ceiling reached without rollover");
 console.log("COMANDAS_SEQUENCE_V2_SQLITE_LAB="+n+"/"+n+
  " SYNTHETIC_ONLY NO_PRODUCTION_NUMBER NO_PRINT");
}finally{
 try{peer?.close()}catch{}
 try{db?.close()}catch{}
 fs.rmSync(tmp,{recursive:true,force:true});
}
