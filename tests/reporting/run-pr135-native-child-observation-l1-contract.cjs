'use strict';
// Exact PR135 source at a pinned SHA in a separate GitHub Actions checkout.
// Does not read private POS files or call SQL/print/network. Synthetic only.
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const remote=process.argv[2];
if(!remote||!path.isAbsolute(remote))throw Error('PINNED_PR135_WORKTREE_REQUIRED');
const {build}=require(path.join(remote,'tools/comandas_reader_native_note_rowset_v1_review_only.cjs'));
const {review}=require('../../runtime/reporting/native_reader_producer_contract_review_v1.cjs');
const {adaptStableTataOrderV1}=require('../../runtime/reporting/copiloto_tata_reader_adapter_v1.cjs');
const shadow=require('../../runtime/reporting/native_reader_shadow_replay_v1.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const raw={
 CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'FICTSALE1',NRCOMANDA:'FICTCMD1',
 NRCOMANDAEXT:'1234',IDORGCMDVENDA:'DLV_IFO',
 IDSTCOMANDA:'3',DTHRABERMESA:'2026-11-08T12:30:00.0000000',
 NRPRODCOMVEN:'LINE01',CDPRODUTO:'PROD01',CDARVPROD:'9200001000',
 QTPRODCOMVEN:'2.000',IDSTPRCOMVEN:'4',
 DSOBSCOMANDA:null,DSOBSDESCIT:null,DSOBSPEDDIGCMD:null,TXPRODCOMVEN:null
};
const candidate=build({schema:'tata.comandas.native-note-rowset-input.v1',
 source_read_exhausted:true,rows:[raw]});
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name)}
test('actual PR135 producer returns a private candidate and an explicit missing-child veto',()=>{
 assert.equal(candidate.status,'PRIVATE_CANONICAL_EVENT_CANDIDATE');
 assert.equal(candidate.realOrderPublishable,false);
 assert.equal(candidate.semantic_observation_coverage_proven,false);
 assert.equal(candidate.native_child_item_coverage_proven,false);
 assert.equal(candidate.native_child_observation_coverage_proven,false);
 assert.equal(candidate.privateEvent.order.observation_scan_complete,false);
 assert.equal(candidate.privateEvent.ready_for_downstream_shadow,false);
 assert.ok(candidate.privateEvent.blockers.includes(
 'NATIVE_CHILD_ITEM_AND_OBSERVATION_TABLES_NOT_READ'));
});
const original=clone(candidate.privateEvent);
test('PR137 reviewer refuses PR135 raw private candidate before claiming self-consistency',()=>{
 const r=review(original);
 assert.equal(r.state,'HOLD');
 assert.equal(r.reason,'NATIVE_PRODUCER_DECLARED_CHILD_OR_SOURCE_BLOCKER');
 assert.equal(r.canonicalContractChecked,false);
 assert.equal(r.ordersPublishable,0);
});
const realItScope={
 unitId:'ITAIM',sourceUnitId:'0001',sourceStoreId:'01',
 mappingEvidenceRef:'LAB_NO_FIELD_AUTHORITY',sourceMode:'real'
};
test('Copiloto reader adapter keeps PR135 incomplete child scan out of Home',()=>{
 const r=adaptStableTataOrderV1(clone(original),realItScope);
 assert.equal(r.state,'blocked');
 assert.equal(r.reason,'READER_REAL_NATIVE_NOTE_CONTRACT_NOT_QUALIFIED');
 assert.equal(r.revision,null);
});
test('forged downstream-ready flags do not manufacture complete child evidence',()=>{
 const forged=clone(original);
 forged.ready_for_downstream_shadow=true;
 forged.blockers=[];
 forged.service_resolution={
   service:'LUNCH',evidence:'HUMAN_CONFIRMED_RULE',
   source_ref:'LAB_UNVERIFIED',blockers:[]
 };
 forged.observed_at='2026-11-08T12:31:00-03:00';
 forged.effects={
   database_read:true,database_write:false,network_call:false,
   odhen_write:false,print:false,spooler_write:false,
   fiscal_action:false,sefaz_call:false,cutover:false
 };
 const r=adaptStableTataOrderV1(forged,realItScope);
 assert.equal(r.state,'blocked');
 assert.equal(r.reason,'READER_REAL_NATIVE_NOTE_CONTRACT_NOT_QUALIFIED');
 assert.equal(r.revision,null);
});
function pair(event){
 const o=event.order;
 const d={
  schema:'deliveryos.live-shadow-decision.v1',
  order_key:event.order_key,snapshot_hash:event.snapshot_hash,
  ifood_sequence:o.NRCOMANDAEXT,teknisa_sequence:o.NRCOMANDA,
  ready:false,blocking_reasons:[],service:event.service_resolution,
  items:[{item_index:1,CDPRODUTO:o.items[0].CDPRODUTO,
   canonical_code:'9.20.00.010.00',product_name:'FICT_PRODUCT',quantity:2,
   observations:[]}],
  order_observations:[],observation_scan_complete:true,
  packaging:{has_unknown:true,total_items:2},kits:{status:'UNKNOWN'},
  sequence:{shadow_candidate:'999',binding_written:false}
 };
 d.fingerprint=shadow.decisionHash(d);
 return {event,decision:d};
}
function replay(event){
 return shadow.replay({schema:shadow.SCHEMA,
  host:'CAIXA_MOOCA',unit:'ITAIM',hmacKey:Buffer.alloc(32,13),
  pairs:[pair(event)]});
}
test('PR137 shadow refuses HMAC candidate directly from actual PR135 event',()=>{
 const r=replay(original);
 assert.equal(r.reason,'NATIVE_PAIR_INVALID');
 assert.equal(r.state,'HOLD');
 assert.equal(r.rows.length,0);
 assert.equal(r.ordersPublishable,0);
});
test('spoofed complete scan and rehashed event cannot erase native child-source veto',()=>{
 const forged=clone(original);
 forged.order.observation_scan_complete=true;
 forged.snapshot_hash=shadow.snapshotHash(forged.order);
 const r=review(forged);
 assert.equal(r.reason,'NATIVE_PRODUCER_DECLARED_CHILD_OR_SOURCE_BLOCKER');
 assert.equal(r.canonicalContractChecked,false);
 const shadowResult=replay(forged);
 assert.equal(shadowResult.reason,'NATIVE_PAIR_INVALID');
 assert.equal(shadowResult.rows.length,0);
 assert.equal(shadowResult.operationalEventEmissionAuthorized,false);
});
test('no PII, raw IDs or note values leave review surface',()=>{
 const s=JSON.stringify({review:review(original),shadow:replay(original)});
 for(const x of ['FICTSALE1','FICTCMD1','PROD01','1234'])
  assert.equal(s.includes(x),false);
 assert.equal(review(original).actualNativeSourceAuthenticated,false);
});
test('current PR135 V7.16 disposable subprocess remains HOLD and cannot export customer notes',()=>{
 const suite=path.join(remote,'tools/verificar_comandas_v716_isolated_sandbox_offline.cjs');
 const child=spawnSync(process.execPath,[suite],{
  cwd:remote,encoding:'utf8',timeout:120000,maxBuffer:1024*1024,
  env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}
 });
 assert.equal(child.error,undefined,String(child.error));
 assert.equal(child.status,0,child.stderr);
 assert.equal(child.stderr,'');
 assert.match(child.stdout,/COMANDAS_V716_ISOLATED_SANDBOX_TEST_PASS 14\/14 SYNTHETIC_ONLY NO_CAIXA_NO_SQL_NO_PRINT/);
 assert.doesNotMatch(child.stdout,/PRIVATE_FAKE_NOTE_MUST_NOT_REACH_PUBLIC_STDOUT|FAKESALE|PRIVATE_CHANGED_FAKE_NOTE/);
});
console.log('PR135_ACTUAL_PRODUCER_PR137_CHILD_NOTE_HOLD_PASS '+passed+'/'+passed+
 ' PINNED_SOURCE_SYNTHETIC_ROWS_NO_POS');
