'use strict';
// Counterexample: a structurally valid event can combine item rows that
// existed at different times; a hash authenticates its bytes, not the DB state.
// This never simulates a real customer's order or queries the database.
const assert=require('node:assert/strict');
const {build}=require('./comandas_reader_native_note_rowset_v1_review_only.cjs');
const {review}=require('./comandas_reader_sql_consistency_gate_v1_review_only.cjs');
const fakeHead={CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'FICTSALE',
 NRCOMANDA:'FICTCMD',NRCOMANDAEXT:'1234',IDORGCMDVENDA:'DLV_IFO',
 IDSTCOMANDA:'3',DTHRABERMESA:'2026-11-03T18:30:00.0000000',
 DSOBSCOMANDA:'PEDIDO FICTICIO'};
function item(line,note){
 return {...fakeHead,NRPRODCOMVEN:line,CDPRODUTO:line,
 CDARVPROD:line==='A'?'9200001000':'9200002000',
 QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'4',
 DSOBSDESCIT:null,DSOBSPEDDIGCMD:note,TXPRODCOMVEN:null};
}
const early=[item('A','SEM CEBOLINHA'),item('B','SEM MOLHO')];
const late=[item('A','COM CEBOLINHA'),item('B','COM MOLHO')];
const mixed=[early[0],late[1]];
function candidate(rows){
 return build({schema:'tata.comandas.native-note-rowset-input.v1',
  source_read_exhausted:true,rows});
}
const e=candidate(early),l=candidate(late),m=candidate(mixed);
let n=0;
const test=(name,fn)=>{fn();n++;};
test('individually consistent early rowset',()=>assert.equal(e.status,'PRIVATE_CANONICAL_EVENT_CANDIDATE'));
test('individually consistent late rowset',()=>assert.equal(l.status,'PRIVATE_CANONICAL_EVENT_CANDIDATE'));
test('mixed read looks structurally consistent: must NOT be promoted',()=>{
 assert.equal(m.status,'PRIVATE_CANONICAL_EVENT_CANDIDATE');
 assert.equal(m.realOrderPublishable,false);
 assert.equal(m.currentSqlSnapshotProven,false);
 assert.equal(m.observationScanIndependentlyProven,false);
});
test('the fake mixed hash is unique but has no source truth',()=>{
 assert.notEqual(m.privateEvent.snapshot_hash,e.privateEvent.snapshot_hash);
 assert.notEqual(m.privateEvent.snapshot_hash,l.privateEvent.snapshot_hash);
 assert.equal(m.privateEvent.ready_for_downstream_shadow,false);
});
const base={
 schema:'tata.comandas.reader-sql-consistency-input.v1',
 metadata:{database_name:'teknisa',current_login:'NT SERVICE\\TataComandaReader',
  is_read_committed_snapshot_on:0,snapshot_isolation_state_desc:'OFF'},
 proposal:{statement_count:1,isolation_level:'READ_COMMITTED',target_orders:1,
  uses_nolock:false,reader_host:'CAIXA_MOOCA',unit:'ITAIM',
  source_query_kind:'NATIVE_HEADER_ITEMS_AND_NOTES'}
};
test('locking read committed fails snapshot requirement',()=>{
 const x=review(base);
 assert.equal(x.reason,'READ_COMMITTED_LOCKING_DOES_NOT_PROVE_STATEMENT_SNAPSHOT');
 assert.equal(x.ordersPublishable,0);
});
test('claimed RCSI ON still does not prove caller or actual query',()=>{
 const x=review({...base,metadata:{...base.metadata,is_read_committed_snapshot_on:1}});
 assert.equal(x.reason,'CONFIG_ELIGIBLE_BUT_NOT_ATTESTED');
 assert.equal(x.eligibleToConsiderSingleStatementSnapshot,true);
 assert.equal(x.actualStatementSnapshotProven,false);
 assert.equal(x.ordersPublishable,0);
});
// Stage 2: structurally plausible counterexamples to stable-read heuristics.
// These fixtures do not prove real SQL transactions or semantic completeness.
test('two identical mixed reads and hashes still do not attest a source revision',()=>{
 const repeat=candidate([early[0],late[1]]);
 assert.equal(repeat.status,'PRIVATE_CANONICAL_EVENT_CANDIDATE');
 assert.equal(repeat.privateEvent.snapshot_hash,m.privateEvent.snapshot_hash);
 assert.equal(repeat.realOrderPublishable,false);
 assert.equal(repeat.currentSqlSnapshotProven,false);
 assert.equal(repeat.observationScanIndependentlyProven,false);
});
test('ABA change A then B then A defeats equality-only stability detection',()=>{
 const before=candidate(early),during=candidate(late),after=candidate(early);
 assert.equal(before.privateEvent.snapshot_hash,after.privateEvent.snapshot_hash);
 assert.notEqual(before.privateEvent.snapshot_hash,during.privateEvent.snapshot_hash);
 for(const result of [before,during,after]){
  assert.equal(result.realOrderPublishable,false);
  assert.equal(result.currentSqlSnapshotProven,false);
 }
});
test('plausible but semantically partial rowset cannot establish completeness',()=>{
 const partial=candidate([early[0]]);
 assert.equal(partial.status,'PRIVATE_CANONICAL_EVENT_CANDIDATE');
 assert.equal(partial.realOrderPublishable,false);
 assert.equal(partial.currentSqlSnapshotProven,false);
 assert.equal(partial.observationScanIndependentlyProven,false);
});

console.log('READER_MIXED_REVISION_FAIL_CLOSED_PASS '+n+'/'+n+
 ' NO_SQL_REAL_ORDERS_OR_CUSTOMERS');
