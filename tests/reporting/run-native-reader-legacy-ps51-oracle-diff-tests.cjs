'use strict';
// Requires Windows PowerShell 5.1. Synthetic-only oracle, disposable lab dir.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {snapshotHash}=require('../../runtime/reporting/native_reader_shadow_replay_v1.cjs');
const {legacyDigestUpper,divergentClasses,checkBasisGuard}=
 require('../../runtime/reporting/native_reader_legacy_ps51_digest_v1.cjs');
const {review}=require('../../runtime/reporting/native_reader_n2n3_sanitized_receipt_v2.cjs');
if(process.platform!=='win32'){
 console.log('NATIVE_READER_PS51_ORACLE_SKIPPED NON_WINDOWS_NO_PASS_CLAIM');
 process.exit(0);
}
if(os.hostname().toUpperCase()==='CAIXA_MOOCA' ||
 !(process.env.GITHUB_ACTIONS==='true' &&
   process.env.GITHUB_REPOSITORY==='cesarspichencoff-cmyk/delviery-os') &&
 os.hostname().toUpperCase()!=='FOXXY')
 throw Error('WINDOWS_SYNTHETIC_LAB_ONLY');
const parent=process.env.GITHUB_ACTIONS==='true'?process.env.RUNNER_TEMP:os.tmpdir();
assert(parent&&path.isAbsolute(parent));
const lab=path.join(parent,'deliveryos-reader-ps51-oracle-lab');
if(fs.existsSync(lab))throw Error('LAB_DIRECTORY_COLLISION');
fs.mkdirSync(lab,{recursive:false});
let passed=0,mutations=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name)};
const assertNoLeak=(r,e)=>{
 const s=JSON.stringify(r);
 assert(Buffer.byteLength(s,'utf8')<=2048);
 for(const word of ['FICT_SALE','FICT_COMMAND','FICT_PRODUCT','LAB_PLAIN',
  'LAB_O','reader-events-v1',e.snapshot_hash]){
  assert(!s.includes(word),'SANITIZED_OUTPUT_LEAK');
 }
 assert.equal(r.state,'HOLD');
 assert.equal(r.customerDataExported,false);
 assert.equal(r.ordersPublishable,0);
 assert.equal(r.sourceIdentityVerified,false);
 assert.equal(r.n2ObservationReadIndependentlyComplete,false);
};
const cases=['plain','apostrophe','angles','ampersand','nel','line_separator',
 'paragraph_separator','accent','emoji','controls','combined',
 'no_notes','null_fields','multiple_items'];
try{
 fs.writeFileSync(path.join(lab,'LAB_ONLY.txt'),'DELIVERYOS_READER_PS51_ORACLE_LAB_V1\n',{flag:'wx'});
 const ps=path.join(__dirname,'fixtures','ps51_legacy_event_oracle_LAB_ONLY.ps1');
 const r=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive',
  '-File',ps,'-LabDir',lab],{timeout:30000,encoding:'utf8',maxBuffer:524288});
 if(r.error||r.status!==0)throw Error('PS51_ORACLE_EXECUTION_FAILED');
 assert(r.stdout.includes('PS51_SYNTHETIC_ORACLE_CREATED 14/14'));
 const fixtures={};
 for(const name of cases){
  const file=path.join(lab,name+'.json');
  const e=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  fixtures[name]=e;
  check('PS51 exact digest '+name,()=>{
   const received=e.snapshot_hash;
   assert.match(received,/^[A-F0-9]{64}$/);
   assert.equal(legacyDigestUpper(e.order),received,'ORACLE_MISMATCH_'+name);
   assert.equal(checkBasisGuard(e.order),true,'BASIS_MISMATCH_'+name);
   const diag=review(e);
   assert.equal(diag.n3LegacyPs51DigestMatch,true);
   assert.equal(diag.n3DigestBoundToContent,true);
   assertNoLeak(diag,e);
   if(name==='null_fields')assert.equal(diag.n2StructureSelfConsistent,false);
   if(name==='no_notes')assert.equal(diag.noteRows,0);
  });
 }
 check('apostrophe is genuine legacy escaping, not tampering',()=>{
  const e=fixtures.apostrophe,r=review(e);
  assert.equal(r.n3CanonicalDigestMatch,false);
  assert.equal(r.n3LegacyPs51DigestMatch,true);
  assert.equal(r.n3DivergenceExplainedByLegacyEscaping,true);
  assert.equal(divergentClasses(e.order).apostrophe,true);
 });
 check('normal literal JSON agrees with canonical digest',()=>{
  const e=fixtures.plain;
  assert.equal(snapshotHash(e.order).toUpperCase(),e.snapshot_hash);
  assert.equal(review(e).n3CanonicalDigestMatch,true);
 });
 check('multi-item snapshot hash changes on order swap',()=>{
  const e=structuredClone(fixtures.multiple_items);
  e.order.items.reverse();
  const r=review(e);assert.equal(r.n3DigestBoundToContent,false);
  mutations++;assertNoLeak(r,e);
 });
 for(const [name,mutate] of [
  ['item_qty',e=>{e.order.items[0].QTPRODCOMVEN='7.000'}],
  ['note_value',e=>{e.order.observation_rows[0].value+='changed'}],
  ['note_join',e=>{e.order.observation_rows[0].CDPRODUTO='WRONG'}],
  ['native_state',e=>{e.order.IDSTCOMANDA='X'}],
  ['item_product',e=>{e.order.items[0].CDPRODUTO='WRONG'}],
  ['note_field',e=>{e.order.observation_rows[0].source_field='TXPRODCOMVEN'}],
  ['note_index',e=>{e.order.observation_rows[0].item_index=1}],
 ]){
  check('legacy hash detects mutation '+name,()=>{
   const e=structuredClone(fixtures.combined),before=e.snapshot_hash;
   mutate(e);
   const q=review(e);
   assert.equal(q.n3DigestBoundToContent,false);
   assert.equal(e.snapshot_hash,before);
   mutations++;assertNoLeak(q,e);
  });
 }
 check('unmatched hash and broken structure both shown',()=>{
  const e=structuredClone(fixtures.apostrophe);
  e.order.observation_rows[0].CDPRODUTO='WRONG';
  const q=review(e);
  assert.equal(q.n3DigestBoundToContent,false);
  assert.equal(q.n2StructureSelfConsistent,false);
  assert.equal(q.n2StructureDetailCode,'ITEM_OBSERVATION_JOIN_MISMATCH');
  assertNoLeak(q,e);
 });
 console.log('NATIVE_READER_PS51_ORACLE_PASS '+passed+'/'+passed+
  ' REAL_PS51_SYNTHETIC_ONLY MUTATIONS '+mutations+'/'+mutations+
  ' NO_FIELD_EXECUTION NO_PII');
}finally{
 fs.rmSync(lab,{recursive:true,force:true});
}
