"use strict";
/**
 * STAGE 3, no SQL connection, no live files and no customer data.
 * Counterexample DIFFERENT from mixed-revision tests: a SERIALIZABLE read
 * can truthfully observe one committed DB state while the POS application
 * has not committed all components of the business order yet.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {build}=require("./comandas_reader_native_note_rowset_v1_review_only.cjs");
const {review}=require("./comandas_reader_sql_consistency_gate_v1_review_only.cjs");
const sql=fs.readFileSync(path.join(__dirname,
 "comandas_reader_one_order_serializable_REVIEW_ONLY.sql"),"utf8");
const strip=x=>x.replace(/\/\*[\s\S]*?\*\//g," ").replace(/--[^\r\n]*/g," ");
const candidate=strip(sql);
const simulatedCommits=Object.freeze([
 {at:10,what:"HEADER_COMMITTED"},
 {at:20,what:"ITEM_COMMITTED"},
 {at:50,what:"GENERAL_NOTE_COMMITTED"},
 {at:75,what:"LATER_CANCEL_COMMITTED"}
]);
const header=Object.freeze({
 CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"FICTIONAL_SALE",
 NRCOMANDA:"FICTIONAL_COMMAND",NRCOMANDAEXT:"1234",
 IDORGCMDVENDA:"DLV_IFO",IDSTCOMANDA:"P",
 DTHRABERMESA:"2026-11-06T12:00:00.0000000"
});
const fakeRow=(time)=>{
 if(time<10)return null;
 const hasItem=time>=20,hasNote=time>=50,cancel=time>=75;
 return {...header,IDSTCOMANDA:cancel?"X":"P",
  NRPRODCOMVEN:hasItem?"000001":null,
  CDPRODUTO:hasItem?"FICTIONAL_PRODUCT":null,
  CDARVPROD:hasItem?"9100005000":null,
  QTPRODCOMVEN:hasItem?"1.000":null,
  IDSTPRCOMVEN:hasItem?"4":null,
  DSOBSCOMANDA:hasNote?"NOTA FICTICIA DE TESTE":null,
  DSOBSDESCIT:null,DSOBSPEDDIGCMD:null,TXPRODCOMVEN:null
 };
};
function privateSnapshotAt(time,exhausted=true){
 const row=fakeRow(time);
 return build({schema:"tata.comandas.native-note-rowset-input.v1",
  source_read_exhausted:exhausted,rows:row?[row]:[]});
}
function neverOperable(x){
 assert.equal(x.realOrderPublishable,false);
 assert.equal(x.printAuthorized,false);
 assert.equal(x.currentSqlSnapshotProven,false);
 assert.equal(x.observationScanIndependentlyProven,false);
 assert.ok(Object.values(x.effects).every(v=>v===false));
 if(x.privateEvent){
  assert.equal(x.privateEvent.ready_for_downstream_shadow,false);
  assert.equal(x.privateEvent.effects.printer,false);
 }
}
let n=0;
function test(label,fn){fn();console.log("PASS "+(++n)+" "+label);}
test("candidate is a single source SELECT under SERIALIZABLE without live execution",()=>{
 assert.match(candidate,/SET TRANSACTION ISOLATION LEVEL SERIALIZABLE\s*;/i);
 assert.match(candidate,/SET LOCK_TIMEOUT 100\s*;/i);
 assert.equal((candidate.match(/\bSELECT\b/gi)||[]).length,1);
 assert.doesNotMatch(candidate,/\b(?:NOLOCK|READPAST|EXEC|UPDATE|DELETE|INSERT|MERGE)\b/i);
});
test("all simulated application components commit at distinct moments",()=>{
 assert.deepEqual(simulatedCommits.map(e=>e.at),[10,20,50,75]);
 assert.ok(simulatedCommits.every(e=>!e.what.includes("SQL_READ")));
});
test("immediately after header commit, a valid database state can have no items",()=>{
 const x=privateSnapshotAt(15);
 assert.equal(x.status,"HOLD");
 assert.equal(x.reason,"NATIVE_SOURCE_COLUMNS_OR_VALUES_UNTRUSTED");
 neverOperable(x);
});
test("after item commit and BEFORE note commit, rowset looks internally valid",()=>{
 const x=privateSnapshotAt(25);
 assert.equal(x.status,"PRIVATE_CANONICAL_EVENT_CANDIDATE");
 assert.equal(x.itemsCount,1);
 assert.equal(x.notesCount,0);
 neverOperable(x);
});
test("three identical snapshots before later note commit cannot prove business completion",()=>{
 const rs=[25,30,40].map(time=>privateSnapshotAt(time));
 assert.ok(rs.every(x=>x.status==="PRIVATE_CANONICAL_EVENT_CANDIDATE"));
 assert.equal(new Set(rs.map(x=>x.privateEvent.snapshot_hash)).size,1);
 for(const x of rs)neverOperable(x);
});
test("later committed note changes the revision although item and status were unchanged",()=>{
 const before=privateSnapshotAt(40),after=privateSnapshotAt(55);
 assert.equal(before.status,"PRIVATE_CANONICAL_EVENT_CANDIDATE");
 assert.equal(after.status,"PRIVATE_CANONICAL_EVENT_CANDIDATE");
 assert.equal(after.notesCount,1);
 assert.notEqual(before.privateEvent.snapshot_hash,after.privateEvent.snapshot_hash);
 assert.equal(before.privateEvent.order.IDSTCOMANDA,after.privateEvent.order.IDSTCOMANDA);
 assert.deepEqual(before.privateEvent.order.items,after.privateEvent.order.items);
 neverOperable(after);
});
test("even reading after all known fictional commits does not authenticate real completeness",()=>{
 const x=privateSnapshotAt(60);
 assert.equal(x.status,"PRIVATE_CANONICAL_EVENT_CANDIDATE");
 assert.equal(x.itemsCount,1);
 assert.equal(x.notesCount,1);
 neverOperable(x);
});
test("a later cancel can invalidate previously observed status P without changing item",()=>{
 const before=privateSnapshotAt(60),after=privateSnapshotAt(80);
 assert.equal(before.privateEvent.order.IDSTCOMANDA,"P");
 assert.equal(after.privateEvent.order.IDSTCOMANDA,"X");
 assert.notEqual(before.privateEvent.snapshot_hash,after.privateEvent.snapshot_hash);
 assert.deepEqual(before.privateEvent.order.items,after.privateEvent.order.items);
 neverOperable(after);
});
test("self-reported source exhaustion cannot prove app finalization",()=>{
 const x=privateSnapshotAt(25,true);
 assert.equal(x.status,"PRIVATE_CANONICAL_EVENT_CANDIDATE");
 assert.equal(x.privateEvent.order.observation_scan_complete,false);
 assert.equal(x.direct_column_rowset_exhausted_reported,true);
 assert.equal(x.native_child_observation_coverage_proven,false);
 assert.ok(x.privateEvent.blockers.includes('NATIVE_CHILD_ITEM_AND_OBSERVATION_TABLES_NOT_READ'));
 assert.equal(x.sourceAuthenticated,false);
 neverOperable(x);
});
test("not exhausted source remains HOLD even with visible item and note",()=>{
 const x=privateSnapshotAt(55,false);
 assert.equal(x.status,"HOLD");
 neverOperable(x);
});
test("RCSI-OFF SERIALIZABLE proposed policy stays HOLD despite plausible flags",()=>{
 const x=review({
  schema:"tata.comandas.reader-sql-consistency-input.v1",
  metadata:{database_name:"teknisa",current_login:"NT SERVICE\\TataComandaReader",
   is_read_committed_snapshot_on:0,snapshot_isolation_state_desc:"OFF"},
  proposal:{statement_count:1,isolation_level:"SERIALIZABLE",target_orders:1,
   uses_nolock:false,reader_host:"CAIXA_MOOCA",unit:"ITAIM",
   source_query_kind:"NATIVE_HEADER_ITEMS_AND_NOTES"}
 });
 assert.equal(x.state,"HOLD");assert.equal(x.actualStatementSnapshotProven,false);
 assert.equal(x.sourceRevisionAuthenticated,false);
 assert.equal(x.ordersPublishable,0);assert.equal(x.printAuthorized,false);
});
test("bounded read is not a guarantee of bounded writer blocking",()=>{
 assert.match(sql,/can temporarily block POS WRITERS/i);
 assert.match(sql,/100ms LOCK_TIMEOUT limits this reader's wait, NOT time writers wait for it/i);
 assert.match(sql,/DO NOT EXECUTE against the live Teknisa database/i);
});
if(n!==12)throw Error("STAGE3_APPLICATION_COMMIT_GAP_TEST_COUNT_DRIFT:"+n);
console.log("COMANDAS_STAGE3_SEMANTIC_COMMIT_GAP="+n+"/"+n+
 " SYNTHETIC_COMMITTED_STATES_ONLY NO_SQL NO_CUSTOMER NO_PRINT GATE3_HOLD");
