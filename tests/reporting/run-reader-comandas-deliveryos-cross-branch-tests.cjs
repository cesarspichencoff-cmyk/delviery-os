'use strict';
// Integration regression between PR #135 actual producer and PR #137 actual consumers.
// Run: node tests/reporting/run-reader-comandas-deliveryos-cross-branch-tests.cjs <absolute-PR135-worktree>
// Both worktrees are detached to independently pinned commits. Requires compiled PR135 dist.
// Executes NO SQL/network/print/GPS/host mutations; never outputs raw observations.
const assert=require('node:assert/strict');
const path=require('node:path');
const sourceRoot=process.argv[2];
if(!sourceRoot||!path.isAbsolute(sourceRoot)) throw Error('PR135_SOURCE_WORKTREE_ABSOLUTE_PATH_REQUIRED');
const producer=require(path.join(sourceRoot,'tools','comandas_reader_native_note_rowset_v1_review_only.cjs'));
const nativeJoin=require(path.join(sourceRoot,'dist','src','production','nativeReaderChainV1.js'));
const consumer=require('../../runtime/reporting/native_reader_shadow_replay_v1.cjs');
const {review}=require('../../runtime/reporting/native_reader_producer_contract_review_v1.cjs');
const HMAC=Buffer.alloc(32,13);
const clone=v=>JSON.parse(JSON.stringify(v));
const head={
 CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'LABSALE01',
 NRCOMANDA:'LABCMD01',NRCOMANDAEXT:'1234',IDORGCMDVENDA:'DLV_IFO',
 IDSTCOMANDA:'3',DTHRABERMESA:'2026-11-03T18:30:00.0000000'
};
function input(){
 return {schema:'tata.comandas.native-note-rowset-input.v1',
 source_read_exhausted:true,rows:[
 {...head,NRPRODCOMVEN:'LINE02',CDPRODUTO:'PROD02',CDARVPROD:'9200002000',
  QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'4',DSOBSCOMANDA:'NOTA GERAL FICTICIA',
  DSOBSDESCIT:null,DSOBSPEDDIGCMD:null,TXPRODCOMVEN:"TESTE L'IMITADO"},
 {...head,NRPRODCOMVEN:'LINE01',CDPRODUTO:'PROD01',CDARVPROD:'9200001000',
  QTPRODCOMVEN:'2.000',IDSTPRCOMVEN:'4',DSOBSCOMANDA:'NOTA GERAL FICTICIA',
  DSOBSDESCIT:null,DSOBSPEDDIGCMD:'SEM CEBOLINHA, LIMÃO',TXPRODCOMVEN:null}
 ]};
}
function built(f=()=>{}){
 const x=input();f(x);return producer.build(x);
}
const fromRows=raw=>{
 const x=producer.build(raw);
 assert.equal(x.status,'PRIVATE_CANONICAL_EVENT_CANDIDATE');
 return x.privateEvent;
};
function pair(evt){
 const e=clone(evt),o=e.order;
 const d={
 schema:'deliveryos.live-shadow-decision.v1',
 order_key:e.order_key,snapshot_hash:e.snapshot_hash,
 ifood_sequence:o.NRCOMANDAEXT,teknisa_sequence:o.NRCOMANDA,
 ready:false,blocking_reasons:[],service:e.service_resolution,
 items:o.items.map((r,i)=>({
  item_index:i+1,CDPRODUTO:r.CDPRODUTO,
  canonical_code:r.CDARVPROD==='9200001000'?'9.20.00.010.00':'9.20.00.020.00',
  product_name:'PRODUTO FICTICIO '+(i+1),
  quantity:Number(r.QTPRODCOMVEN),
  observations:o.observation_rows.filter(n=>n.scope_hint==='item'&&n.item_index===i)
   .map(n=>({source_field:n.source_field,value:n.value}))
 })),
 order_observations:o.observation_rows.filter(n=>n.scope_hint==='order')
  .map(n=>({source_field:n.source_field,value:n.value})),
 observation_scan_complete:true,
 packaging:{has_unknown:true,total_items:3},
 kits:{status:'UNKNOWN'},
 sequence:{shadow_candidate:'999',binding_written:false}
 };
 d.fingerprint=consumer.decisionHash(d);
 return {event:e,decision:d};
}
function run(...pairs){
 return consumer.replay({schema:consumer.SCHEMA,host:'CAIXA_MOOCA',
 unit:'ITAIM',hmacKey:HMAC,pairs});
}
let ok=0;const test=(name,fn)=>{fn();ok++;};
const baseline=()=>fromRows(input());
const fictionalShapeOnly=e=>{
 const x=clone(e);x.blockers=[];delete x.ready_for_downstream_shadow;
 x.order.observation_scan_complete=true;
 x.snapshot_hash=consumer.snapshotHash(x.order);
 return x;
};
const self=e=>assert.equal(review(e).reason,'NATIVE_PRODUCER_DECLARED_CHILD_OR_SOURCE_BLOCKER');
const selfShape=e=>assert.equal(review(e).reason,'CANONICAL_ENVELOPE_SELF_CONSISTENT_BUT_SOURCE_UNATTESTED');
const denied=p=>{const r=run(p);assert.equal(r.reason,'NATIVE_PAIR_INVALID');
 assert.equal(r.state,'HOLD');assert.equal(r.rows.length,0);
 assert.equal(r.ordersPublishable,0);return r;};
const passed=p=>{const r=run(p);assert.equal(r.state,'HOLD');assert.equal(r.selfConsistentCandidates,1);
 assert.equal(r.ordersPublishable,0);assert.equal(r.operationalEventEmissionAuthorized,false);
 return r;};
test('producer keeps private event review-only and source unauthenticated',()=>{
 const x=built();assert.equal(x.sourceAuthenticated,false);
 assert.equal(x.observationScanIndependentlyProven,false);
 assert.equal(x.realOrderPublishable,false);assert.equal(x.printAuthorized,false);
 assert.equal(x.privateEvent.ready_for_downstream_shadow,false);
});
test('canonical two items and three observations cross into PR137 reviewer',()=>{
 const e=baseline();self(e);
 assert.equal(e.order.items.length,2);
 assert.equal(e.order.observation_rows.length,3);
 assert.equal(e.order.observation_rows[0].item_index,0);
 assert.equal(e.order.observation_rows[1].item_index,1);
 assert.equal(review(e).canonicalContractChecked,false);
 selfShape(fictionalShapeOnly(e));
 assert.equal(review(fictionalShapeOnly(e)).itemRows,2);
 assert.equal(review(fictionalShapeOnly(e)).noteRows,3);
});
test('producer canonical digest equals independent PR137 digest',()=>{
 const e=baseline();assert.equal(e.snapshot_hash,consumer.snapshotHash(e.order));
 assert.match(e.snapshot_hash,/^[0-9a-f]{64}$/);
});
test('consumer accepts fabricated decision shape only as HOLD',()=>{
 denied(pair(baseline()));
 const r=passed(pair(fictionalShapeOnly(baseline())));
 assert.equal(r.reason,'NATIVE_SOURCE_AUTHENTICITY_AND_FRESHNESS_NOT_PROVEN');
 assert.equal(r.nativeSourceAuthenticated,false);
 assert.equal(r.nativeLifecycleSemanticsProven,false);
 assert.equal(r.independentIfoodIdentityProven,false);
});
test('notes and raw order IDs are never exported by either reviewer',()=>{
 const e=baseline(),a=review(e),b=run(pair(e));
 for(const s of [JSON.stringify(a),JSON.stringify(b)]){
  for(const secret of ['LIMÃO',"L'IMITADO",'LABSALE01','LABCMD01',
     'PROD01','NOTA GERAL FICTICIA','1234'])assert.equal(s.includes(secret),false);
 }
});
test('row order reversal preserves canonical digest and HMAC refs',()=>{
 const x=input(),y=input();y.rows.reverse();
 assert.equal(fromRows(x).snapshot_hash,fromRows(y).snapshot_hash);
 denied(pair(fromRows(x)));denied(pair(fromRows(y)));
 assert.equal(passed(pair(fictionalShapeOnly(fromRows(x)))).rows[0].orderRef,
  passed(pair(fictionalShapeOnly(fromRows(y)))).rows[0].orderRef);
});
test('apostrophe and accent do not change cross-runtime hash',()=>{
 const e=baseline();assert.ok(e.order.observation_rows.some(n=>n.value.includes("'")));
 assert.ok(e.order.observation_rows.some(n=>n.value.includes('LIMÃO')));self(e);
});
test('P remains an uninterpreted native state and in HOLD',()=>{
 const e=fromRows((()=>{const x=input();x.rows.forEach(r=>r.IDSTCOMANDA='P');return x})());
 self(e);denied(pair(e));
 assert.equal(passed(pair(fictionalShapeOnly(e))).rows[0].nativeState,'P');
});
test('X remains an uninterpreted native state and in HOLD',()=>{
 const e=fromRows((()=>{const x=input();x.rows.forEach(r=>r.IDSTCOMANDA='X');return x})());
 self(e);denied(pair(e));
 assert.equal(passed(pair(fictionalShapeOnly(e))).rows[0].nativeState,'X');
});
test('real item state 6 is not promoted as normal order by replayer',()=>{
 const x=input();x.rows[1].IDSTPRCOMVEN='6';
 const e=fromRows(x);self(e);
 const r=run(pair(e));assert.equal(r.state,'HOLD');
 assert.equal(r.reason,'NATIVE_PAIR_INVALID');
});
test('recorded notes omitted cannot be proven complete by caller flag',()=>{
 const x=input();x.rows.forEach(r=>{r.DSOBSPEDDIGCMD=null;r.TXPRODCOMVEN=null;r.DSOBSCOMANDA=null});
 const e=fromRows(x);self(e);
 denied(pair(e));const r=passed(pair(fictionalShapeOnly(e)));assert.equal(r.nativeSourceAuthenticated,false);
 assert.equal(r.sourceFreshnessProven,false);
 assert.equal(r.rows[0].noteRows,0);
});
test('producer requires explicit declared exhaustion',()=>{
 const x=built(y=>y.source_read_exhausted=false);
 assert.equal(x.status,'HOLD');assert.equal(x.privateEvent,null);
});
test('producer rejects wrong unit before consumer',()=>{
 const x=built(y=>y.rows.forEach(r=>r.CDLOJA='99'));
 assert.equal(x.status,'HOLD');assert.equal(x.privateEvent,null);
});
test('producer rejects duplicate line keys',()=>{
 const x=built(y=>y.rows[1].NRPRODCOMVEN='LINE02');
 assert.equal(x.status,'HOLD');assert.equal(x.privateEvent,null);
});
test('producer rejects inconsistent customer-note between source rows',()=>{
 const x=built(y=>y.rows[1].DSOBSCOMANDA='DIVERGE');
 assert.equal(x.status,'HOLD');assert.equal(x.privateEvent,null);
});
test('producer refuses fractional item quantity',()=>{
 const x=built(y=>y.rows[0].QTPRODCOMVEN='1.500');
 assert.equal(x.status,'HOLD');assert.equal(x.privateEvent,null);
});
test('tampered note after producer hash is refused',()=>{
 const e=fictionalShapeOnly(baseline());e.order.observation_rows[1].value='EDITADO';
 assert.equal(review(e).reason,'SNAPSHOT_HASH_NOT_BOUND_TO_CANONICAL_FIELDS');
 assert.equal(run(pair(e)).reason,'NATIVE_PAIR_INVALID');
});
test('wrong note-to-item binding fails in PR137 reviewer',()=>{
 const e=fictionalShapeOnly(baseline());e.order.observation_rows[0].CDPRODUTO='OUTRO';
 e.snapshot_hash=consumer.snapshotHash(e.order);
 assert.equal(review(e).reason,'ITEM_OBSERVATION_JOIN_MISMATCH');
 assert.equal(run(pair(e)).reason,'NATIVE_PAIR_INVALID');
});
test('decision quantity differs even when recomputed -> no HMAC row',()=>{
 const p=pair(baseline());p.decision.items[0].quantity=99;
 p.decision.fingerprint=consumer.decisionHash(p.decision);
 assert.equal(run(p).reason,'NATIVE_PAIR_INVALID');
});
test('incomplete notes scan cannot be declared source-complete',()=>{
 const e=fictionalShapeOnly(baseline());e.order.observation_scan_complete=false;
 assert.equal(review(e).reason,'OBSERVATION_COMPLETENESS_MISSING_OR_UNATTESTED');
 assert.equal(run(pair(e)).reason,'NATIVE_PAIR_INVALID');
});
test('same revision duplicated is deduplicated',()=>{
 denied(pair(baseline()));
 const p=pair(fictionalShapeOnly(baseline())),r=run(p,clone(p));
 assert.equal(r.selfConsistentCandidates,1);
 assert.equal(r.duplicateSnapshotsIgnored,1);
});
test('two distinct revisions without ordering proof remain quarantined',()=>{
 const x=input(),y=input();y.rows[0].QTPRODCOMVEN='3.000';
 denied(pair(fromRows(x)));denied(pair(fromRows(y)));
 const r=run(pair(fictionalShapeOnly(fromRows(x))),pair(fictionalShapeOnly(fromRows(y))));
 assert.equal(r.reason,'CONFLICTING_NATIVE_REVISIONS_NO_ORDERING_PROOF');
 assert.equal(r.ordersPublishable,0);
});
test('consumer refuses an envelope with unauthorized host',()=>{
 const p=pair(baseline());
 const r=consumer.replay({schema:consumer.SCHEMA,host:'OUTRO',
 unit:'ITAIM',hmacKey:HMAC,pairs:[p]});
 assert.equal(r.reason,'INVALID_ENVELOPE');
});
test('producer output never claims a real order even with self-consistent review',()=>{
 const e=baseline(),p=pair(e),r=run(p);
 assert.equal(e.ready_for_downstream_shadow,false);
 assert.equal(review(e).actualNativeSourceAuthenticated,false);
 assert.equal(r.sourceFreshnessProven,false);
 assert.equal(r.ordersPublishable,0);
});
test('native production join reuses exact event and separates customer vs production notes',()=>{
 const source=baseline();denied(pair(source));
 const deniedJoin=nativeJoin.joinNativeReaderSnapshotV1(source,pair(source).decision,{});
 assert.equal(deniedJoin.status,'HOLD');
 assert.equal(deniedJoin.join,null);
 const e=fictionalShapeOnly(source),d=pair(e).decision;
 const out=nativeJoin.joinNativeReaderSnapshotV1(e,d,{
  '9.20.00.010.00':['00009'],'9.20.00.020.00':['00002']
 });
 assert.equal(out.status,'NATIVE_SAME_SNAPSHOT_JOINED');
 assert.equal(out.provenance.independent_source_attested,false);
 assert.equal(out.join.effects.print,false);
 assert.equal(out.join.effects.persistence_write,false);
 assert.deepEqual(out.join.order_observations,['NOTA GERAL FICTICIA']);
 assert.deepEqual(out.join.items[0].delivery_observacoes,['SEM CEBOLINHA, LIMÃO']);
 assert.deepEqual(out.join.items[0].tx_prod_com_ven,[]);
 assert.deepEqual(out.join.items[1].tx_prod_com_ven,["TESTE L'IMITADO"]);
 assert.deepEqual(out.join.items[1].delivery_observacoes,[]);
});
test('native ticket observation bridge preserves source notes without printing',()=>{
 const source=baseline();denied(pair(source));
 const deniedJoin=nativeJoin.joinNativeReaderSnapshotV1(source,pair(source).decision,{});
 assert.equal(deniedJoin.status,'HOLD');
 assert.equal(deniedJoin.join,null);
 const e=fictionalShapeOnly(source);
 const j=nativeJoin.joinNativeReaderSnapshotV1(e,pair(e).decision,{});
 assert.equal(j.status,'NATIVE_SAME_SNAPSHOT_JOINED');
 assert.deepEqual(nativeJoin.nativeTicketItemsV1(j.join),[
  {item_index:0,item_observations:['SEM CEBOLINHA, LIMÃO']},
  {item_index:1,item_observations:["TESTE L'IMITADO"]}
 ]);
 assert.equal(j.provenance.independent_source_attested,false);
});
test('production native join refuses quantity drift before creating joined item',()=>{
 const e=fictionalShapeOnly(baseline()),d=pair(e).decision;
 d.items[0].quantity=99;
 const x=nativeJoin.joinNativeReaderSnapshotV1(e,d,{});
 assert.equal(x.status,'HOLD');
 assert.equal(x.join,null);
 assert.ok(x.reasons.some(s=>s.startsWith('NATIVE_ITEM_IDENTITY_OR_QUANTITY_MISMATCH')));
});
test('production native join refuses tampered observation identity',()=>{
 const e=fictionalShapeOnly(baseline()),d=pair(e).decision;
 e.order.observation_rows[0].CDPRODUTO='OTHER';
 const x=nativeJoin.joinNativeReaderSnapshotV1(e,d,{});
 assert.equal(x.status,'HOLD');
 assert.equal(x.join,null);
 assert.ok(x.reasons.includes('NATIVE_OBSERVATION_SCOPE_INVALID'));
});
test('real producer cannot be rescued by forged flags and self-recomputed hash',()=>{
 const e=clone(baseline());
 e.ready_for_downstream_shadow=true;
 e.order.observation_scan_complete=true;
 e.snapshot_hash=consumer.snapshotHash(e.order);
 assert.equal(review(e).reason,'NATIVE_PRODUCER_DECLARED_CHILD_OR_SOURCE_BLOCKER');
 denied(pair(e));
 const native=nativeJoin.joinNativeReaderSnapshotV1(e,pair(e).decision,{});
 assert.equal(native.status,'HOLD');
 assert.equal(native.join,null);
 assert.ok(native.reasons.includes('NATIVE_CHILD_SOURCE_COVERAGE_NOT_ATTESTED'));
 assert.equal(native.provenance.independent_source_attested,false);
});
test('unrecognized source blocker cannot become a native joined production view',()=>{
 const e=fictionalShapeOnly(baseline());
 e.blockers=['SOURCE_ROWSET_CALLER_NOT_AUTHENTICATED'];
 const x=nativeJoin.joinNativeReaderSnapshotV1(e,pair(e).decision,{});
 assert.equal(x.status,'HOLD');assert.equal(x.join,null);
 assert.ok(x.reasons.includes('NATIVE_SOURCE_NON_SERVICE_BLOCKER'));
 assert.equal(x.provenance.independent_source_attested,false);
 assert.equal(x.provenance.print_text_used,false);
});
test('legacy hours alone are not a source coverage failure in offline structural join',()=>{
 const e=fictionalShapeOnly(baseline());
 e.blockers=['SERVICE_STATE_EXPIRED_FOR_ORDER'];
 const x=nativeJoin.joinNativeReaderSnapshotV1(e,pair(e).decision,{});
 assert.equal(x.status,'NATIVE_SAME_SNAPSHOT_JOINED');
 assert.equal(x.provenance.independent_source_attested,false);
 assert.equal(x.join.effects.print,false);
 assert.equal(x.join.effects.persistence_write,false);
});
test('fictional bridge is only structurally ready, never an authenticated source',()=>{
 const e=fictionalShapeOnly(baseline()),d=pair(e).decision;
 const x=nativeJoin.joinNativeReaderSnapshotV1(e,d,{});
 assert.equal(x.status,'NATIVE_SAME_SNAPSHOT_JOINED');
 assert.equal(x.provenance.independent_source_attested,false);
 assert.equal(x.join.effects.print,false);
 assert.equal(passed(pair(e)).ordersPublishable,0);
});
console.log('READER_PR135_TO_DELIVERYOS_PR137_CROSS_BRANCH_PASS '+ok+'/'+ok+' SYNTHETIC_ONLY');
