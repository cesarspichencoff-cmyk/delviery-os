'use strict';
// Safe no-PII one-shot receipts; synthetic fixtures, disposable temp dirs only.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {build,buildLegacy,makeEvent,eventPath,checkpointPath}=
 require('./build-reader-one-shot-lab-fixture.cjs');
const cli=path.resolve(__dirname,'../../labs/reader-proof/native_reader_one_shot_lab_cli_v1.cjs');
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name);}
function scope(fn){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'reader-receipt-'));
 const lab=path.join(base,'deliveryos-reader-proof-lab');
 try{build(lab);return fn(lab);}finally{fs.rmSync(base,{recursive:true,force:true});}
}
function scopeLegacy(fn){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'reader-legacy-receipt-'));
 const lab=path.join(base,'deliveryos-reader-proof-lab');
 try{buildLegacy(lab);return fn(lab);}finally{fs.rmSync(base,{recursive:true,force:true});}
}
function run(lab,legacy=false){
 return spawnSync(process.execPath,
  [cli,'--lab-dir='+lab,...(legacy?['--fixture-mode=legacy']:[])],{encoding:'utf8',
  timeout:4000,env:{...process.env,DELIVERYOS_READER_LAB_HOLD_MS:'0'}});
}
function file(lab){
 return fs.readFileSync(path.join(lab,'receipt.json'),'utf8');
}
function safe(lab,r){
 assert.equal(r.status,0);
 assert.equal(r.stdout,'');assert.equal(r.stderr,'');
 const b=file(lab),receipt=JSON.parse(b);
 assert(b.length<2048);
 for(const s of ['FICT_SALE','FICT_COMMAND','FICT_PRODUCT',
  'FICT_PRIVATE_SENTINEL',"L'ação",'9200001000'])assert(!b.includes(s));
 assert.equal(receipt.state,'HOLD');
 assert.equal(receipt.ordersPublishable,0);
 assert.equal(receipt.sourceIdentityVerified,false);
 assert.equal(receipt.n2ObservationReadIndependentlyComplete,false);
 assert.equal(receipt.homePublishAuthorized,false);
 assert.equal(receipt.customerDataExported,false);
 assert.equal(receipt.rawHashExported,false);
 assert.equal(receipt.rawOrderIdsExported,0);
 return receipt;
}
check('one synthetic source produces one sanitized and unpublished receipt',()=>scope(lab=>{
 const r=safe(lab,run(lab));
 assert.equal(r.reason,'N2_N3_SELF_CONSISTENT_SOURCE_UNATTESTED');
 assert.equal(r.itemRows,1);assert.equal(r.noteRows,1);
 assert.equal(r.n3CanonicalHashSelfConsistent,true);
}));
check('raw event is never modified by the one-shot evaluator',()=>scope(lab=>{
 const p=eventPath(lab),before=fs.readFileSync(p,'utf8');
 safe(lab,run(lab));assert.equal(fs.readFileSync(p,'utf8'),before);
}));
check('noncanonical apostrophe-escaped digest is rejected without private output',()=>scope(lab=>{
 const p=eventPath(lab),e=makeEvent();
 const keys=['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA','NRCOMANDAEXT',
  'IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'];
 const basis=Object.fromEntries(keys.map(k=>[k,e.order[k]]));
 basis.items=e.order.items.map(i=>Object.fromEntries(
  ['NRPRODCOMVEN','CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'].map(k=>[k,i[k]])));
 basis.observation_rows=e.order.observation_rows;
 const ps=JSON.stringify(basis).replace("L'ação",'L\\u0027ação');
 e.snapshot_hash=require('node:crypto').createHash('sha256').update(ps).digest('hex');
 // Keep an exact checkpoint/file pair; the mismatch must be CANONICAL,
 // not a missing file or a changed checkpoint pointer.
 fs.rmSync(p);
 fs.writeFileSync(eventPath(lab,e),JSON.stringify(e)+'\n');
 const cp=JSON.parse(fs.readFileSync(checkpointPath(lab),'utf8'));
 cp.entries[0].snapshot_hash=e.snapshot_hash;
 cp.entries[0].emitted_hash=e.snapshot_hash;
 fs.writeFileSync(checkpointPath(lab),JSON.stringify(cp)+'\n');
 assert.equal(safe(lab,run(lab)).reason,'N3_HASH_BYTES_NOT_CANONICAL');
}));
check('invalid input does not echo payload and returns HOLD',()=>scope(lab=>{
 fs.writeFileSync(eventPath(lab),'{ SECRET FICT_PRIVATE_SENTINEL ');
 const r=safe(lab,run(lab));assert.equal(r.reason,'LAB_INPUT_UNREADABLE_OR_CHANGED');
}));
check('oversized input is bounded before JSON parsing',()=>scope(lab=>{
 fs.writeFileSync(eventPath(lab),'A'.repeat(256*1024+1));
 const r=safe(lab,run(lab));assert.equal(r.reason,'LAB_INPUT_UNREADABLE_OR_CHANGED');
}));
check('file symlink outside lab is not followed',()=>scope(lab=>{
 const input=eventPath(lab),outside=path.resolve(__filename);
 fs.unlinkSync(input);
 try{fs.symlinkSync(outside,input,'file');}
 catch(e){if(process.platform==='win32'&&e.code==='EPERM')return;throw e;}
 const r=safe(lab,run(lab));assert.equal(r.reason,'LAB_INPUT_UNREADABLE_OR_CHANGED');
}));
check('without marker the executable refuses and writes no receipt',()=>scope(lab=>{
 fs.rmSync(path.join(lab,'LAB_ONLY.txt'));
 const r=run(lab);
 assert.notEqual(r.status,0);assert.equal(r.stdout,'');assert.equal(r.stderr,'');
 assert.equal(fs.existsSync(path.join(lab,'receipt.json')),false);
}));
check('a second invocation cannot replace a prior receipt',()=>scope(lab=>{
 safe(lab,run(lab));const first=file(lab);
 const r=run(lab);assert.notEqual(r.status,0);assert.equal(r.stdout,'');
 assert.equal(file(lab),first);
}));
check('lab path must be absolute and marked with exact basename',()=>scope(lab=>{
 for(const bad of ['./deliveryos-reader-proof-lab',path.dirname(lab)]){
  const r=run(bad);assert.notEqual(r.status,0);
  assert.equal(r.stdout,'');assert.equal(r.stderr,'');
 }
 assert.equal(fs.existsSync(path.join(lab,'receipt.json')),false);
}));
check('caller claims of real source do not authorize publication',()=>scope(lab=>{
 const p=eventPath(lab),e=makeEvent();
 e.sourceMode='real';e.sourceAuthenticated=true;e.ready_for_downstream_shadow=true;
 fs.writeFileSync(p,JSON.stringify(e)+'\n');
 const r=safe(lab,run(lab));assert.equal(r.sourceIdentityVerified,false);
 assert.equal(r.ordersPublishable,0);
}));
check('checkpoint with missing emitted file does not create or read orders',()=>scope(lab=>{
 const cp=JSON.parse(fs.readFileSync(checkpointPath(lab),'utf8'));
 cp.entries[0].snapshot_hash='a'.repeat(64);
 cp.entries[0].emitted_hash='a'.repeat(64);
 fs.writeFileSync(checkpointPath(lab),JSON.stringify(cp)+'\n');
 const r=safe(lab,run(lab));
 assert.equal(r.reason,'LAB_INPUT_UNREADABLE_OR_CHANGED');
 assert.equal(fs.existsSync(eventPath(lab)),true);
}));
check('tampered V2 event quantity stays HOLD despite original filename',()=>scope(lab=>{
 const p=eventPath(lab),event=JSON.parse(fs.readFileSync(p,'utf8'));
 event.order.items[0].QTPRODCOMVEN='17.000';
 fs.writeFileSync(p,JSON.stringify(event)+'\n');
 const r=safe(lab,run(lab));
 assert.equal(r.reason,'N3_HASH_BYTES_NOT_CANONICAL');
}));
check('invalid checkpoint source time never opens an event for authority',()=>scope(lab=>{
 const cp=JSON.parse(fs.readFileSync(checkpointPath(lab),'utf8'));
 cp.entries[0].last_seen_order_time='2026-02-30T12:00:00.0000000';
 fs.writeFileSync(checkpointPath(lab),JSON.stringify(cp)+'\n');
 const r=safe(lab,run(lab));
 assert.equal(r.reason,'LAB_INPUT_UNREADABLE_OR_CHANGED');
}));
check('checkpoint symlink cannot escape the sandbox',()=>scope(lab=>{
 const cp=checkpointPath(lab),outside=path.resolve(__filename);
 fs.rmSync(cp);
 try{fs.symlinkSync(outside,cp,'file');}
 catch(e){if(process.platform==='win32'&&e.code==='EPERM')return;throw e;}
 const r=safe(lab,run(lab));
 assert.equal(r.reason,'LAB_INPUT_UNREADABLE_OR_CHANGED');
}));
check('legacy uppercase event filename cannot be selected from canonical checkpoint',()=>scope(lab=>{
 const cp=JSON.parse(fs.readFileSync(checkpointPath(lab),'utf8'));
 cp.entries[0].snapshot_hash=cp.entries[0].snapshot_hash.toUpperCase();
 cp.entries[0].emitted_hash=cp.entries[0].emitted_hash.toUpperCase();
 fs.writeFileSync(checkpointPath(lab),JSON.stringify(cp)+'\n');
 const r=safe(lab,run(lab));
 assert.equal(r.reason,'LAB_INPUT_UNREADABLE_OR_CHANGED');
 assert.equal(fs.existsSync(eventPath(lab)),true);
}));
check('checkpoint without canonical V2 origin cannot produce false receipt',()=>scope(lab=>{
 const cp=JSON.parse(fs.readFileSync(checkpointPath(lab),'utf8'));
 delete cp.checkpoint_origin;
 fs.writeFileSync(checkpointPath(lab),JSON.stringify(cp)+'\n');
 const r=safe(lab,run(lab));
 assert.equal(r.reason,'LAB_INPUT_UNREADABLE_OR_CHANGED');
 assert.equal(r.ordersPublishable,0);
}));
check('legacy-only fixture yields the same no-PII HOLD receipt',()=>scopeLegacy(lab=>{
 const r=safe(lab,run(lab,true));
 assert.equal(r.reason,'N2_N3_SELF_CONSISTENT_SOURCE_UNATTESTED');
 assert.equal(r.legacyDiagnosticOnly,true);
 assert.equal(r.legacyUppercaseNormalized,true);
 assert.equal(r.checkpointBound,true);
 assert.equal(r.itemRows,1);assert.equal(r.noteRows,1);
}));
check('legacy fixture cannot be selected through canonical V2 mode',()=>scopeLegacy(lab=>{
 const r=safe(lab,run(lab));
 assert.equal(r.reason,'LAB_INPUT_UNREADABLE_OR_CHANGED');
 assert.equal(r.ordersPublishable,0);
}));
check('canonical V2 fixture cannot be selected through legacy mode',()=>scope(lab=>{
 const r=safe(lab,run(lab,true));
 assert.equal(r.reason,'LAB_INPUT_UNREADABLE_OR_CHANGED');
 assert.equal(r.ordersPublishable,0);
}));
check('legacy receipt cannot be replaced on a second invocation',()=>scopeLegacy(lab=>{
 safe(lab,run(lab,true));const first=file(lab);
 const r=run(lab,true);
 assert.notEqual(r.status,0);assert.equal(r.stdout,'');assert.equal(r.stderr,'');
 assert.equal(file(lab),first);
}));
check('legacy source bytes stay unchanged after local review',()=>scopeLegacy(lab=>{
 const dir=path.join(lab,'reader-events-v1');
 const names=fs.readdirSync(dir);
 assert.equal(names.length,1);
 const p=path.join(dir,names[0]),before=fs.readFileSync(p,'utf8');
 safe(lab,run(lab,true));
 assert.equal(fs.readFileSync(p,'utf8'),before);
}));
check('historical event changed under old hash cannot be passed as migration',()=>scopeLegacy(lab=>{
 const dir=path.join(lab,'reader-events-v1');
 const p=path.join(dir,fs.readdirSync(dir)[0]);
 const e=JSON.parse(fs.readFileSync(p,'utf8'));
 e.order.items[0].QTPRODCOMVEN='16.000';
 fs.writeFileSync(p,JSON.stringify(e)+'\n');
 const r=safe(lab,run(lab,true));
 assert.equal(r.reason,'N3_HASH_BYTES_NOT_CANONICAL');
 assert.equal(r.checkpointBound,false);
}));
check('legacy mode refuses marker-only spoofing of a canonical checkpoint',()=>scopeLegacy(lab=>{
 const cp=checkpointPath(lab);
 const body=JSON.parse(fs.readFileSync(cp,'utf8'));
 body.hash_contract_version='NODE_CANONICAL_JSON_SHA256_V1';
 body.checkpoint_origin='FRESH_NODE_CANONICAL_V2';
 body.checkpoint_generation='1234567890abcdef1234567890abcdef';
 fs.writeFileSync(cp,JSON.stringify(body)+'\n');
 const r=safe(lab,run(lab,true));
 assert.equal(r.reason,'LAB_INPUT_UNREADABLE_OR_CHANGED');
}));
check('unknown fixture mode fails without any receipt or stdout',()=>scopeLegacy(lab=>{
 const r=spawnSync(process.execPath,[cli,'--lab-dir='+lab,
  '--fixture-mode=production'],{encoding:'utf8',timeout:4000});
 assert.notEqual(r.status,0);
 assert.equal(r.stdout,'');assert.equal(r.stderr,'');
 assert.equal(fs.existsSync(path.join(lab,'receipt.json')),false);
}));
check('legacy emitted file missing never fabricates a candidate',()=>scopeLegacy(lab=>{
 const cp=checkpointPath(lab),c=JSON.parse(fs.readFileSync(cp,'utf8'));
 c.entries[0].snapshot_hash='A'.repeat(64);
 c.entries[0].emitted_hash='A'.repeat(64);
 fs.writeFileSync(cp,JSON.stringify(c)+'\n');
 const r=safe(lab,run(lab,true));
 assert.equal(r.reason,'LAB_INPUT_UNREADABLE_OR_CHANGED');
}));
console.log('NATIVE_READER_ONE_SHOT_LAB_PASS '+passed+'/'+passed+' SYNTHETIC_ONLY');
