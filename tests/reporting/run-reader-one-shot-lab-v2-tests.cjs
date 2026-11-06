'use strict';
// End-to-end synthetic ONLY: emitted PS5.1 digest, checkpoint, one event, receipt.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {legacyDigestUpper}=require('../../runtime/reporting/native_reader_legacy_ps51_digest_v1.cjs');
const {build,makeEvent,eventPath,checkpointPath}=
 require('./build-reader-one-shot-lab-v2-fixture.cjs');
const cli=path.resolve(__dirname,'../../labs/reader-proof/native_reader_one_shot_lab_cli_v2.cjs');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
function scope(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'reader-v2-receipt-'));
 const lab=path.join(root,'deliveryos-reader-proof-v2-lab');
 try{build(lab);return fn(lab);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
function run(lab){
 return spawnSync(process.execPath,[cli,'--lab-dir='+lab],{encoding:'utf8',
  timeout:4000,env:{...process.env,DELIVERYOS_READER_LAB_HOLD_MS:'0'}});
}
function receipt(lab){
 const s=fs.readFileSync(path.join(lab,'receipt.json'),'utf8');
 assert(Buffer.byteLength(s,'utf8')<=2048);
 for(const token of ['FICT_SALE','FICT_COMMAND','FICT_PRODUCT',
  'FICT_PRIVATE_SENTINEL','reader-events-v1','L\\u0027a',"L'ação"])
  assert(!s.includes(token),'RAW_CONTENT_EXPORTED '+token);
 return JSON.parse(s);
}
function safe(lab){
 const runResult=run(lab);assert.equal(runResult.status,0);
 assert.equal(runResult.stdout,'');assert.equal(runResult.stderr,'');
 const r=receipt(lab);
 assert.equal(r.schema,'deliveryos.native-reader-existing-event-binding.v2');
 assert.equal(r.state,'HOLD');assert.equal(r.ordersPublishable,0);
 assert.equal(r.homePublishAuthorized,false);
 assert.equal(r.customerDataExported,false);assert.equal(r.rawHashExported,false);
 assert.equal(r.rawOrderIdsExported,0);
 assert.equal(r.sourceVerified,false);
 assert.equal(r.n2ObservationReadIndependentlyComplete,false);
 return r;
}
test('emitted PS5.1 apostrophe event binds without false tamper',()=>scope(lab=>{
 const event=makeEvent();assert.equal(event.snapshot_hash,legacyDigestUpper(event.order));
 const r=safe(lab);
 assert.equal(r.checkpointBound,true);
 assert.equal(r.n3LegacyPs51DigestMatch,true);
 assert.equal(r.n3CanonicalDigestMatch,false);
 assert.equal(r.n2StructureSelfConsistent,true);
 assert.equal(r.stabilityBucket,'2');
 assert.equal(r.reason,'N2_N3_SELF_CONSISTENT_SOURCE_UNATTESTED');
}));
test('existing raw synthetic event is byte-for-byte preserved',()=>scope(lab=>{
 const p=eventPath(lab),before=fs.readFileSync(p);
 safe(lab);
 assert(fs.readFileSync(p).equals(before));
}));
test('quantity mutation still fails even when checkpoint hash remains stable',()=>scope(lab=>{
 const p=eventPath(lab),e=JSON.parse(fs.readFileSync(p,'utf8'));
 e.order.items[0].QTPRODCOMVEN='90.000';
 fs.writeFileSync(p,JSON.stringify(e)+'\n');
 const r=safe(lab);
 assert.equal(r.checkpointBound,false);
 assert.equal(r.n3LegacyPs51DigestMatch,false);
 assert.equal(r.reason,'N3_DIGEST_NOT_BOUND_TO_CONTENT');
}));
test('structural false join is caught even with updated valid PS5.1 hash',()=>scope(lab=>{
 const p=eventPath(lab),e=JSON.parse(fs.readFileSync(p,'utf8'));
 e.order.observation_rows[0].CDPRODUTO='FICT_OTHER';
 e.snapshot_hash=legacyDigestUpper(e.order);
 fs.unlinkSync(p);
 fs.writeFileSync(eventPath(lab,e),JSON.stringify(e)+'\n');
 const cp=JSON.parse(fs.readFileSync(checkpointPath(lab),'utf8'));
 cp.entries[0].snapshot_hash=e.snapshot_hash;
 cp.entries[0].emitted_hash=e.snapshot_hash;
 fs.writeFileSync(checkpointPath(lab),JSON.stringify(cp)+'\n');
 const r=safe(lab);
 assert.equal(r.n3LegacyPs51DigestMatch,true);
 assert.equal(r.n2StructureSelfConsistent,false);
 assert.equal(r.n2StructureDetailCode,'ITEM_OBSERVATION_JOIN_MISMATCH');
 assert.equal(r.checkpointBound,false);
}));
test('invalid marker refuses before reading',()=>scope(lab=>{
 fs.unlinkSync(path.join(lab,'LAB_ONLY.txt'));
 const r=run(lab);assert.notEqual(r.status,0);
 assert.equal(fs.existsSync(path.join(lab,'receipt.json')),false);
}));
test('only one non-overwritable receipt is allowed',()=>scope(lab=>{
 safe(lab);
 const orig=fs.readFileSync(path.join(lab,'receipt.json'));
 const r=run(lab);assert.notEqual(r.status,0);
 assert(fs.readFileSync(path.join(lab,'receipt.json')).equals(orig));
}));
test('lab root must be canonical and exact',()=>scope(lab=>{
 const r=run(path.dirname(lab));
 assert.notEqual(r.status,0);
 assert.equal(fs.existsSync(path.join(lab,'receipt.json')),false);
}));
test('malformed checkpoint returns bounded sanitized HOLD',()=>scope(lab=>{
 const cp=checkpointPath(lab);
 fs.writeFileSync(cp,'{ FICT_PRIVATE_SENTINEL invalid');
 const r=safe(lab);
 assert.equal(r.reason,'LAB_INPUT_UNREADABLE_OR_CHANGED');
 assert.equal(r.ordersPublishable,0);
}));
test('oversized event cannot enter JSON parser',()=>scope(lab=>{
 const p=eventPath(lab);
 fs.writeFileSync(p,'x'.repeat(256*1024+1));
 const r=safe(lab);assert.equal(r.reason,'LAB_INPUT_UNREADABLE_OR_CHANGED');
}));
test('forged source authority cannot authorize downstream',()=>scope(lab=>{
 const p=eventPath(lab),e=JSON.parse(fs.readFileSync(p,'utf8'));
 e.sourceAuthenticated=true;e.ready_for_downstream_shadow=true;
 fs.writeFileSync(p,JSON.stringify(e)+'\n');
 const r=safe(lab);
 assert.equal(r.checkpointBound,true);
 assert.equal(r.ordersPublishable,0);assert.equal(r.sourceVerified,false);
}));
console.log('NATIVE_READER_ONE_SHOT_V2_LAB_PASS '+passed+'/'+passed+
 ' PS51_HASHED_SYNTHETIC_ONLY NO_FIELD_EXECUTION NO_PII');
