'use strict';
// Disposable Node lab, NEVER executes projectors or reads operational data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const preflight=require('../../labs/reporting/projector_source_preflight_lab_v1.cjs');
let count=0;
const check=(name,fn)=>{fn();count++;console.log('PASS '+name)};
const outer=fs.mkdtempSync(path.join(os.tmpdir(),'deliveryos-source-preflight-'));
const root=path.join(outer,'deliveryos-projector-lab');
const base=path.join(root,'state','reader-report-source-envelopes-v1');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex').toUpperCase();
try{
 fs.mkdirSync(base,{recursive:true});
 fs.writeFileSync(path.join(root,'LAB_ONLY.txt'),preflight.MARKER+'\n');
 const files=['0000000001_A.report-source.json','0000000002_B.report-source.json'];
 files.forEach((n,i)=>fs.writeFileSync(path.join(base,n),JSON.stringify({fake:true,n:i})));
 const other=Object.fromEntries(preflight.SOURCES.filter(x=>x!=='source').map(x=>[x,hash(x)]));
 const version='lab-2026-11-10';
 let found=preflight.inventory(root);
 let checkpoint={schema:'deliveryos.projector-fast-checkpoint-lab.v1',semanticsVersion:version,
  signatures:{source:found.sourceSignature,...other}};
 check('matches exact installed SHA-256 signature convention without reading JSON',()=>{
  const rows=files.map(n=>{let st=fs.statSync(path.join(base,n));return n+'|'+st.size+'|'+Math.trunc(st.mtimeMs)});
  assert.equal(found.state,'SOURCE_METADATA_OBSERVED');
  assert.equal(found.sourceSignature,hash(rows.join('\n')));
  assert.equal(found.fileCount,2);assert.equal(found.envelopeBytesRead,0);
 });
 check('all metadata matches still NEVER authorize skipping or publishing',()=>{
  const x=preflight.review({inventoryResult:found,checkpoint,currentAux:other,semanticsVersion:version});
  assert.equal(x.reason,'METADATA_MATCHES_BUT_LIVE_SOURCE_UNPROVEN');
  assert.equal(x.potentialFullEnvelopeParsesAvoided,2);
  assert.equal(x.skipProductionProjector,false);assert.equal(x.homePublishAuthorized,false);
 });
 check('changing source metadata requires full replay',()=>{
  fs.appendFileSync(path.join(base,files[0]),'x');
  const newSource=preflight.inventory(root);
  const x=preflight.review({inventoryResult:newSource,checkpoint,currentAux:other,semanticsVersion:version});
  assert.equal(x.reason,'DEPENDENCY_CHANGED_FULL_REPLAY_REQUIRED');assert.equal(x.changedKind,'source');
  fs.truncateSync(path.join(base,files[0]),Buffer.byteLength(JSON.stringify({fake:true,n:0})));
 });
 check('enrichment changes invalidate the fast path even with identical envelopes',()=>{
  const x=preflight.review({inventoryResult:found,checkpoint,currentAux:{...other,enrichment:hash('change')},semanticsVersion:version});
  assert.equal(x.changedKind,'enrichment');assert.equal(x.skipProductionProjector,false);
 });
 check('all independent reporting sources are checked, not just KDS and quality',()=>{
  for(const kind of preflight.SOURCES.filter(x=>x!=='source')){
   const x=preflight.review({inventoryResult:found,checkpoint,currentAux:{...other,[kind]:hash(kind+'changed')},semanticsVersion:version});
   assert.equal(x.changedKind,kind);
  }
 });
 check('old checkpoint missing later dependency fields never fast-skips',()=>{
  const old={...checkpoint,signatures:{source:found.sourceSignature,quality:other.quality,kds:other.kds,enrichment:other.enrichment}};
  const x=preflight.review({inventoryResult:found,checkpoint:old,currentAux:other,semanticsVersion:version});
  assert.equal(x.reason,'DEPENDENCY_SIGNATURE_UNATTESTED');
 });
 check('changed code semantics prohibits preflight fast path',()=>{
  const x=preflight.review({inventoryResult:found,checkpoint,currentAux:other,semanticsVersion:'new-semantic-version'});
  assert.equal(x.reason,'SEMANTICS_VERSION_CHANGED');
 });
 check('file budget overflow fails closed',()=>{
  const x=preflight.inventory(root,{maxFiles:1});assert.equal(x.reason,'SOURCE_FILE_BUDGET_EXCEEDED');
 });
 check('untrusted sibling and symlink are refused',()=>{
  fs.writeFileSync(path.join(base,'bad.txt'),'noise');
  assert.equal(preflight.inventory(root).reason,'SOURCE_ENTRY_NAME_INVALID');
  fs.unlinkSync(path.join(base,'bad.txt'));
  if(process.platform!=='win32'){
   fs.symlinkSync(path.join(base,files[0]),path.join(base,'0000000003_C.report-source.json'));
   assert.equal(preflight.inventory(root).reason,'SOURCE_ENTRY_NOT_REGULAR_OR_BOUNDED');
   fs.unlinkSync(path.join(base,'0000000003_C.report-source.json'));
  }
 });
 check('malformed checkpoint never converts to healthy report',()=>{
  const x=preflight.review({inventoryResult:found,checkpoint:{},currentAux:other,semanticsVersion:version});
  assert.equal(x.state,'HOLD');assert.equal(x.skipProductionProjector,false);
 });
 check('untrusted root without lab marker is not read',()=>{
  const x=preflight.inventory(outer);assert.equal(x.state,'HOLD');
 });
 check('full 17997-file synthetic index does not open envelope JSON',()=>{
  // Keep test fast: create dummy metadata entries to match observed count.
  for(let i=0;i<17995;i++)fs.writeFileSync(path.join(base,String(i+3).padStart(10,'0')+'_F.report-source.json'),'{}');
  const x=preflight.inventory(root);
  assert.equal(x.fileCount,17997);assert.equal(x.envelopeBytesRead,0);
  assert.equal(x.skipProductionProjector,false);
 });
 console.log('PROJECTOR_SOURCE_METADATA_PREFLIGHT_LAB_PASS '+count+'/'+count+' SYNTHETIC_ONLY NO_FIELD_AUTHORIZATION');
}finally{fs.rmSync(outer,{recursive:true,force:true});}
