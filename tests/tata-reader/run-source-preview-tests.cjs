'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {previewTataSource:preview}=require('../../tools/windows-local-lab/tata-source-preview.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tata-source-preview-'));
const dir=path.join(root,'state','reader-events-v1');fs.mkdirSync(dir,{recursive:true});
const binding={schema:'deliveryos.tata-source-binding.v1',hostName:'LAB',unitId:'ITAIM',
  sourceUnitId:'SOURCE',sourceStoreId:'STORE',evidence:'synthetic-approved',publishEnabled:false};
const args={root,binding,hostName:'LAB'};
const e={schema:'deliveryos.tata-reader-stable-order-event.v1',
  order:{CDFILIAL:'SOURCE',CDLOJA:'STORE',customer:'PRIVATE_SENTINEL'},
  ready_for_downstream_shadow:false,blockers:['SERVICE_STATE_EXPIRED_FOR_ORDER','PRIVATE_SENTINEL'],
  service_resolution:{blockers:['SERVICE_STATE_EXPIRED_FOR_ORDER']}};
let passed=0;function test(n,f){f();passed++;console.log('PASS',n);}
try{
test('wrong host, absent mapping or enabled publication is refused',()=>{
  assert.throws(()=>preview({...args,hostName:'OTHER'}),/BINDING/);
  assert.throws(()=>preview({...args,binding:null}),/BINDING/);
  assert.throws(()=>preview({...args,binding:{...binding,publishEnabled:true}}),/BINDING/);
});
test('absence and empty sample do not claim zero operational orders',()=>{
  assert.equal(preview({...args,root:path.join(root,'missing')}).state,'source_unavailable');
  assert.equal(preview(args).state,'no_evidence');assert.equal(preview(args).operationalOrderTotal,null);
});
test('source blockers preserved without identifiers or untrusted text',()=>{
  fs.writeFileSync(path.join(dir,'sample.json'),JSON.stringify(e));const r=preview(args);
  assert.equal(r.state,'source_blocked');assert.equal(r.blockers.SERVICE_STATE_EXPIRED_FOR_ORDER,1);
  assert.equal(r.blockers.OTHER_SOURCE_BLOCKER,1);assert.equal(JSON.stringify(r).includes('PRIVATE_SENTINEL'),false);
  assert.equal(r.sourceMode,null);assert.equal(r.liveSourceVerified,false);assert.equal(r.publishEnabled,false);
});
test('mismatched unit is not counted as Itaim',()=>{
  fs.writeFileSync(path.join(dir,'other.json'),JSON.stringify({...e,order:{CDFILIAL:'OTHER',CDLOJA:'STORE'}}));
  const r=preview(args);assert.equal(r.scopeMatches,1);assert.equal(r.scopeMismatches,1);assert.equal(r.state,'review_required');
});
test('producer allow flag does not override service denial',()=>{
  fs.writeFileSync(path.join(dir,'allow.json'),JSON.stringify({...e,ready_for_downstream_shadow:true,blockers:[]}));
  const r=preview(args);assert.equal(r.producerAllowsDownstream,0);
});
test('sample budget enforced and corrupt files are explicit',()=>{
  assert.throws(()=>preview({...args,limit:0}),/BOUNDED/);
  fs.writeFileSync(path.join(dir,'bad.json'),'{');assert.equal(preview(args).unreadableFiles,1);
  assert.equal(preview({...args,limit:1}).sampledFiles,1);
});
console.log(`SOURCE_PREVIEW_PASS ${passed}`);
}finally{fs.rmSync(root,{recursive:true,force:true});}
