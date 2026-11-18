'use strict';
// Exact installed-like checkpoint -> real-mode file feed -> Copiloto read model.
// Every event is synthetic. This does NOT validate actual Reader login/SQL, notes
// capture coverage, physical ready by area, or approval to display production data.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {snapshotHash}=require('../../runtime/reporting/native_reader_shadow_replay_v1.cjs');
const {readTataFileFeed:read}=require('../../runtime/reporting/copiloto_tata_file_feed_v1.cjs');
const scope={unitId:'ITAIM',sourceUnitId:'0001',sourceStoreId:'01',
  mappingEvidenceRef:'LAB_SYNTHETIC_ONLY',sourceMode:'real',
  sourceTimePolicy:{schema:'deliveryos.source-time-policy.v1',
    unitId:'ITAIM',sourceUnitId:'0001',sourceStoreId:'01',field:'DTHRABERMESA',
    basis:'NATIVE_LOCAL_WALL_TIME',timeZone:'America/Sao_Paulo',
    evidenceRef:'LAB_SYNTHETIC_ONLY'}};
const root=fs.mkdtempSync(path.join(os.tmpdir(),'copiloto-real-feed-'));
const dir=path.join(root,'state','reader-events-v1'),ckPath=path.join(root,'state','reader-watch-checkpoint-v1.json');
fs.mkdirSync(dir,{recursive:true});
const args={root,scope,selection:'checkpoint',now:'2026-11-04T15:32:00Z',maxAgeMs:120000};
function canonical(){
 const order={CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'LABSALE1',NRCOMANDA:'LABCMD1',
  NRCOMANDAEXT:'1234',IDORGCMDVENDA:'DLV_IFO',IDSTCOMANDA:'3',
  DTHRABERMESA:'2026-11-04T12:30:00.0000000',
  items:[{NRPRODCOMVEN:'LINE01',CDPRODUTO:'PROD01',CDARVPROD:'9200001000',
   QTPRODCOMVEN:'2.000',IDSTPRCOMVEN:'4'}],
  observation_scan_complete:true,
  observation_rows:[
   {source_field:'DSOBSCOMANDA',value:'ALERGIA FICTICIA',scope_hint:'order',join_proven:true},
   {source_field:'DSOBSPEDDIGCMD',value:'SEM CEBOLINHA FICTICIA',
     scope_hint:'item',item_index:0,CDPRODUTO:'PROD01',join_proven:true}
  ]};
 return {schema:'deliveryos.tata-reader-stable-order-event.v1',
  order_key:'0001|01|LABSALE1|LABCMD1',
  snapshot_hash:snapshotHash(order),observed_at:'2026-11-04T12:31:00-03:00',
  ready_for_downstream_shadow:true,blockers:[],
  service_resolution:{service:'LUNCH',evidence:'HUMAN_CONFIRMED_RULE',
   source_ref:'LAB_SYNTHETIC_ONLY',blockers:[]},
  effects:{database_read:true,database_write:false,network_call:false,
    odhen_write:false,print:false,spooler_write:false,
    fiscal_action:false,sefaz_call:false,cutover:false},
  order};
}
function seed(e){
 for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));
 fs.rmSync(ckPath,{force:true});
 const file=path.join(dir,e.order.NRCOMANDA+'_'+e.snapshot_hash+'.json');
 fs.writeFileSync(file,JSON.stringify(e));
 fs.writeFileSync(ckPath,JSON.stringify({
  schema:'deliveryos.tata-reader-continuous-checkpoint.v1',bootstrap_complete:true,
  entries:[{order_key:e.order_key,snapshot_hash:e.snapshot_hash,
    emitted_hash:e.snapshot_hash,stable_count:2}]
 }));
}
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
try{
 test('canonical synthetic Reader can no longer masquerade as REAL complete feed',()=>{
  const e=canonical();seed(e);const r=read(args);
  assert.equal(r.state,'unavailable');
  assert.equal(r.reason,'SOURCE_CURRENT_REVISION_BLOCKED');
  assert.equal(r.view,null);
  assert.equal(r.live_source_verified,false);
  assert.equal(r.operational_order_total,null);
  assert(!JSON.stringify(r).includes('ALERGIA FICTICIA'));
 });
 test('control-mode synthetic checkpoint still previews products without claiming reality',()=>{
  const e=canonical();seed(e);
  const r=read({...args,scope:{...scope,sourceMode:'control'}});
  assert.equal(r.state,'observed_records',r.reason);
  assert.equal(r.filesRead,1);
  assert.equal(r.view.orders[0].source_mode,'control');
  assert.equal(r.view.orders[0].source_status,'3');
  assert.equal(r.view.orders[0].items[0].quantity,2);
  assert.equal(r.view.orders[0].kds_cycle.state,'UNKNOWN');
  assert.equal(r.view.orders[0].ready_for_dispatch,null);
  assert.equal(r.view.orders[0].trip_id,null);
  assert.equal(r.live_source_verified,false);
  assert.equal(r.operational_order_total,null);
  assert(!JSON.stringify(r).includes('ALERGIA FICTICIA'));
  assert(!JSON.stringify(r).includes('SEM CEBOLINHA FICTICIA'));
 });
 test('legacy watcher with missing note scan is HOLD, not partial current record',()=>{
  const e=canonical();
  delete e.order.observation_scan_complete;delete e.order.observation_rows;
  e.snapshot_hash=snapshotHash(e.order);seed(e);
  const r=read(args);
  assert.equal(r.reason,'SOURCE_CURRENT_REVISION_BLOCKED');
  assert.equal(r.view,null);
 });
 test('edited note with stale digest is HOLD even when checkpoint follows stale digest',()=>{
  const e=canonical();e.order.observation_rows[0].value='ALTERADO';seed(e);
  const r=read(args);
  assert.equal(r.reason,'SOURCE_CURRENT_REVISION_BLOCKED');
  assert.equal(r.view,null);
 });
 test('rejoined wrong item cannot be promoted with recomputed digest',()=>{
  const e=canonical();e.order.observation_rows[1].CDPRODUTO='OUTRO';
  e.snapshot_hash=snapshotHash(e.order);seed(e);
  assert.equal(read(args).reason,'SOURCE_CURRENT_REVISION_BLOCKED');
 });
 test('current blocked revision cannot fall back to an older ready-shaped event',()=>{
  const e=canonical();e.order.observation_scan_complete=false;
  e.snapshot_hash=snapshotHash(e.order);seed(e);
  assert.equal(read(args).state,'unavailable');
  assert.equal(read(args).operational_order_total,null);
 });
 test('legacy uppercase is disabled unless trusted caller opts in',()=>{
  const e=canonical();e.snapshot_hash=e.snapshot_hash.toUpperCase();seed(e);
  const r=read(args);
  assert.equal(r.reason,'SOURCE_CURRENT_REVISION_BLOCKED');
  assert.equal(r.view,null);
 });
 test('actual V2 uppercase-format digest is verified in memory, never published as live',()=>{
  const e=canonical();e.snapshot_hash=e.snapshot_hash.toUpperCase();seed(e);
  const eventPath=path.join(dir,e.order.NRCOMANDA+'_'+e.snapshot_hash+'.json');
  const before=fs.readFileSync(eventPath,'utf8');
  const ckBefore=fs.readFileSync(ckPath,'utf8');
  const r=read({...args,scope:{...scope,allowVerifiedLegacyUppercase:true}});
  assert.equal(r.state,'unavailable');
  assert.equal(r.reason,'SOURCE_CURRENT_REVISION_BLOCKED');
  assert.equal(r.view,null);
  assert.equal(r.live_source_verified,false);
  assert.equal(r.operational_order_total,null);
  assert.equal(fs.readFileSync(eventPath,'utf8'),before);
  assert.equal(fs.readFileSync(ckPath,'utf8'),ckBefore);
  assert(!JSON.stringify(r).includes('ALERGIA FICTICIA'));
 });
 test('even a canonical lowercase event with bridge stays REAL blocked',()=>{
  const e=canonical();seed(e);
  const r=read({...args,scope:{...scope,allowVerifiedLegacyUppercase:true}});
  assert.equal(r.state,'unavailable');
  assert.equal(r.reason,'SOURCE_CURRENT_REVISION_BLOCKED');
  assert.equal(r.view,null);
  assert.equal(r.live_source_verified,false);
 });
 test('stale or inconsistent uppercase digest cannot pass even when checkpoint agrees',()=>{
  const e=canonical();e.order.observation_rows[0].value='NOTA ALTERADA';
  // Deliberately retain old SHA. Its uppercase form still matches a tampered
  // checkpoint/file name, but NOT the current canonical event contents.
  e.snapshot_hash=e.snapshot_hash.toUpperCase();seed(e);
  const r=read({...args,scope:{...scope,allowVerifiedLegacyUppercase:true}});
  assert.equal(r.reason,'SOURCE_CURRENT_REVISION_BLOCKED');
  assert.equal(r.view,null);
 });
 test('uppercase hash cannot forgive broken note-item relation or missing completeness',()=>{
  for(const alter of [
   e=>{e.order.observation_rows[1].CDPRODUTO='WRONG';},
   e=>{delete e.order.observation_scan_complete;}
  ]){
   const e=canonical();alter(e);
   e.snapshot_hash=snapshotHash(e.order).toUpperCase();seed(e);
   const r=read({...args,scope:{...scope,allowVerifiedLegacyUppercase:true}});
   assert.equal(r.reason,'SOURCE_CURRENT_REVISION_BLOCKED');
  }
 });
 test('legacy compatibility cannot be enabled from other scope, mode or directory',()=>{
  for(const delta of [
    {scope:{...scope,unitId:'OUTRO',allowVerifiedLegacyUppercase:true}},
    {scope:{...scope,sourceMode:'control',allowVerifiedLegacyUppercase:true}},
    {scope:{...scope,sourceStoreId:'02',allowVerifiedLegacyUppercase:true}},
    {scope:{...scope,allowVerifiedLegacyUppercase:'yes'}},
    {scope:{...scope,allowVerifiedLegacyUppercase:true},selection:'directory'}
  ]){
   const r=read({...args,...delta});
   assert.match(r.reason,/LEGACY_HASH_REVIEW_(?:SCOPE|POLICY)_INVALID/);
   assert.equal(r.view,null);
  }
 });
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log('COPILOTO_REAL_CHECKPOINT_BOUNDARY_PASS '+passed+'/'+passed+' SYNTHETIC_ONLY');
