'use strict';
// Pure tests of simulated ONE native rowset with explicit notes, never SQL.
const assert=require('node:assert/strict');
const {build}=require('./comandas_reader_native_note_rowset_v1_review_only.cjs');
const {snapshotHash}=require('./tata_comanda_reader_native_essentials_v857_offline.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const HEADER={CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'TESTSALE',
 NRCOMANDA:'TESTCMD',NRCOMANDAEXT:'1234',IDORGCMDVENDA:'DLV_IFO',
 IDSTCOMANDA:'3',DTHRABERMESA:'2026-11-03T18:30:00.0000000'};
function input(){
 return {schema:'tata.comandas.native-note-rowset-input.v1',source_read_exhausted:true,
  rows:[
   {...HEADER,NRPRODCOMVEN:'LINE01',CDPRODUTO:'PROD01',CDARVPROD:'9200001000',
    QTPRODCOMVEN:'2.000',IDSTPRCOMVEN:'4',DSOBSCOMANDA:'SOMENTE TESTE',
    DSOBSDESCIT:null,DSOBSPEDDIGCMD:'SEM CEBOLINHA',TXPRODCOMVEN:null},
   {...HEADER,NRPRODCOMVEN:'LINE02',CDPRODUTO:'PROD02',CDARVPROD:'9200002000',
    QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'4',DSOBSCOMANDA:'SOMENTE TESTE',
    DSOBSDESCIT:null,DSOBSPEDDIGCMD:null,TXPRODCOMVEN:"L'IMITADO"}
  ]};
}
const run=(f=()=>{})=>{const x=input();f(x);return build(x);};
let passed=0;const test=(name,fn)=>{fn();passed++;};
const deny=(fn,reason)=>{const v=run(fn);assert.equal(v.reason,reason);
 assert.equal(v.status,'HOLD');assert.equal(v.privateEvent,null);
 assert.equal(v.sourceAuthenticated,false);assert.equal(v.printAuthorized,false);};
test('same-row notes produce a canonical event without operational authority',()=>{
 const v=run();assert.equal(v.status,'PRIVATE_CANONICAL_EVENT_CANDIDATE');
 assert.equal(v.reason,'REVIEW_ONLY_SOURCE_AUTHORITY_UNPROVEN');
 assert.equal(v.sourceAuthenticated,false);assert.equal(v.printAuthorized,false);
 assert.equal(v.realOrderPublishable,false);assert.equal(v.currentSqlSnapshotProven,false);
 assert.equal(v.observationScanIndependentlyProven,false);
 assert.equal(v.itemsCount,2);assert.equal(v.notesCount,3);
 assert.equal(v.privateEvent.order.observation_scan_complete,false);
 assert.equal(v.direct_column_rowset_exhausted_reported,true);
 assert.equal(v.native_child_item_coverage_proven,false);
 assert.equal(v.native_child_observation_coverage_proven,false);
 assert.equal(v.semantic_observation_coverage_proven,false);
 assert.ok(v.privateEvent.blockers.includes('NATIVE_CHILD_ITEM_AND_OBSERVATION_TABLES_NOT_READ'));
 assert.equal(v.privateEvent.ready_for_downstream_shadow,false);
 assert.ok(v.privateEvent.blockers.includes('SOURCE_ROWSET_CALLER_NOT_AUTHENTICATED'));
 assert.equal(v.privateEvent.snapshot_hash,snapshotHash(v.privateEvent.order));
 assert.match(v.privateEvent.snapshot_hash,/^[0-9a-f]{64}$/);
});
test('order note binds exactly once not once per item',()=>{
 const v=run(),notes=v.privateEvent.order.observation_rows;
 assert.equal(notes.filter(r=>r.scope_hint==='order').length,1);
 assert.equal(notes.filter(r=>r.scope_hint==='item').length,2);
 assert.deepEqual(notes.map(r=>r.source_field),['DSOBSPEDDIGCMD','TXPRODCOMVEN','DSOBSCOMANDA']);
});
test('apostrophe survives without PowerShell JSON escaping in canonical digest',()=>{
 const v=run();assert.equal(v.privateEvent.order.observation_rows[1].value,"L'IMITADO");
 assert.equal(v.privateEvent.snapshot_hash,snapshotHash(v.privateEvent.order));
});
test('order-independent SQL result rows produce deterministic canonical hashes',()=>{
 const a=run(),b=run(x=>x.rows.reverse());
 assert.equal(a.privateEvent.snapshot_hash,b.privateEvent.snapshot_hash);
 assert.deepEqual(a.privateEvent.order.items,b.privateEvent.order.items);
});
test('change observation changes canonical snapshot hash',()=>{
 const a=run(),b=run(x=>x.rows[0].DSOBSPEDDIGCMD='SEM MOLHO');
 assert.notEqual(a.privateEvent.snapshot_hash,b.privateEvent.snapshot_hash);
});
test('native item 4 is preserved without interpreting lifecycle',()=>{
 const v=run();assert.equal(v.privateEvent.order.items[0].IDSTPRCOMVEN,'4');
 assert.equal(v.privateEvent.ready_for_downstream_shadow,false);
});
test('source rows unexhausted blocked',()=>deny(x=>x.source_read_exhausted=false,'BOUNDED_EXHAUSTED_SOURCE_ROWSET_NOT_SUPPLIED'));
test('zero rows blocked',()=>deny(x=>x.rows=[],'BOUNDED_EXHAUSTED_SOURCE_ROWSET_NOT_SUPPLIED'));
test('extra customer field blocked',()=>deny(x=>x.rows[0].customerName='PERSON','NATIVE_SOURCE_COLUMNS_OR_VALUES_UNTRUSTED'));
test('missing note column blocked',()=>deny(x=>delete x.rows[0].TXPRODCOMVEN,'NATIVE_SOURCE_COLUMNS_OR_VALUES_UNTRUSTED'));
test('note text beyond cap blocked',()=>deny(x=>x.rows[0].DSOBSPEDDIGCMD='a'.repeat(2001),'NATIVE_SOURCE_COLUMNS_OR_VALUES_UNTRUSTED'));
test('untrusted non-trimmed observation cannot be silently lost',()=>deny(x=>x.rows[0].DSOBSPEDDIGCMD=' SEM MOLHO','NATIVE_SOURCE_COLUMNS_OR_VALUES_UNTRUSTED'));
test('bad unit blocked',()=>deny(x=>x.rows.forEach(r=>r.CDLOJA='02'),'ITAIM_DELIVERY_SOURCE_SCOPE_INVALID'));
test('non-iFood native origin blocked',()=>deny(x=>x.rows.forEach(r=>r.IDORGCMDVENDA='DLV_NMO'),'ITAIM_DELIVERY_SOURCE_SCOPE_INVALID'));
test('header drift between item rows blocked',()=>deny(x=>x.rows[1].NRVENDAREST='OTHER','NATIVE_HEADER_OR_ORDER_NOTE_NOT_SAME_SNAPSHOT'));
test('order note drift between item rows blocked',()=>deny(x=>x.rows[1].DSOBSCOMANDA='OTHER','NATIVE_HEADER_OR_ORDER_NOTE_NOT_SAME_SNAPSHOT'));
test('different item statuses in same order preserved as unknown',()=>{
 const v=run(x=>x.rows[1].IDSTPRCOMVEN='6');
 assert.equal(v.privateEvent.order.items[1].IDSTPRCOMVEN,'6');
 assert.equal(v.realOrderPublishable,false);
});
test('duplicate line identifier blocked',()=>deny(x=>x.rows[1].NRPRODCOMVEN='LINE01','NATIVE_ITEM_LINE_KEY_DUPLICATE'));
test('bad quantity blocked',()=>deny(x=>x.rows[0].QTPRODCOMVEN='0','NATIVE_QUANTITY_INVALID'));
test('fractional 1.5 not silently rounded to 1',()=>deny(x=>x.rows[0].QTPRODCOMVEN='1.500','NATIVE_QUANTITY_INVALID'));
test('quantity 3.000 preserved without recalculation',()=>{
 const v=run(x=>x.rows[0].QTPRODCOMVEN='3.000');
 assert.equal(v.privateEvent.order.items[0].QTPRODCOMVEN,'3.000');
});
test('no order note and no item notes still hold without independent source proof',()=>{
 const v=run(x=>x.rows.forEach(r=>{r.DSOBSCOMANDA=null;r.DSOBSPEDDIGCMD=null;r.TXPRODCOMVEN=null;}));
 assert.equal(v.notesCount,0);assert.equal(v.realOrderPublishable,false);
 assert.equal(v.sourceAuthenticated,false);
});
test('missing inline notes does not prove native child observations absent',()=>{
 const v=run(x=>x.rows.forEach(r=>{r.DSOBSCOMANDA=null;
  r.DSOBSDESCIT=null;r.DSOBSPEDDIGCMD=null;r.TXPRODCOMVEN=null;}));
 assert.equal(v.notesCount,0);
 assert.equal(v.privateEvent.order.observation_scan_complete,false);
 assert.equal(v.semantic_observation_coverage_proven,false);
 assert.equal(v.privateEvent.ready_for_downstream_shadow,false);
});
test('three stable direct-column polls cannot certify later child rows',()=>{
 const a=run(),b=run(),c=run();
 assert.equal(a.privateEvent.snapshot_hash,b.privateEvent.snapshot_hash);
 assert.equal(b.privateEvent.snapshot_hash,c.privateEvent.snapshot_hash);
 for(const v of [a,b,c]){
  assert.equal(v.direct_column_rowset_exhausted_reported,true);
  assert.equal(v.privateEvent.order.observation_scan_complete,false);
  assert.equal(v.native_child_observation_coverage_proven,false);
  assert.equal(v.realOrderPublishable,false);
 }
});
test('malformed input blocked',()=>{
 const v=build({rows:input().rows,source_read_exhausted:true,schema:'OTHER'});
 assert.equal(v.status,'HOLD');assert.equal(v.privateEvent,null);
});
test('outputs are not automatically published and no process/file actions exist',()=>{
 const x=run();
 assert.deepEqual(x.effects,{sql:false,write:false,network:false,
  service:false,printer:false,spooler:false,sequence:false});
 assert.equal(x.realOrderPublishable,false);
});
console.log('COMANDAS_READER_NATIVE_NOTE_ROWSET_REVIEW_PASS '+passed+'/'+passed+' SYNTHETIC_ONLY');
