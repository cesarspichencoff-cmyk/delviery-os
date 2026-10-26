'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const {verify,EXPECTED_FILES}=require('./comandas_exact_intake_v1.cjs');
let checks=0;const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tata-exact-intake-test-'));
try{
 for(const d of ['events','decisions','rules'])fs.mkdirSync(path.join(temp,d));
 const data=[];
 for(let n=0;n<10;n++){
  const snapshot=sha(Buffer.from('synthetic-snapshot-'+n));
  const ev=Buffer.from(JSON.stringify({synthetic:true,n,private_note:'FICTIONAL'}));
  const dec=Buffer.from(JSON.stringify({synthetic:true,n,ready:false}));
  const name=String(n).padStart(10,'0')+'_'+snapshot;
  fs.writeFileSync(path.join(temp,'events',name+'.json'),ev);
  fs.writeFileSync(path.join(temp,'decisions',name+'.decision.json'),dec);
  data.push({snapshot_hash:snapshot,event_file_sha256:sha(ev),
   legacy_decision_file_sha256:sha(dec),legacy_decision_ready:false,
   legacy_blockers:['BAG_SIZE_NOT_FACT']});
 }
 const hashes={};
 for(const f of EXPECTED_FILES){const b=Buffer.from('SOURCE_'+f+'_SYNTHETIC');
  fs.writeFileSync(path.join(temp,'rules',f),b);hashes[f]=sha(b)}
 const manifest={schema:'tata-comandas-private-ten-original-pair-evidence.v2',
  ten_cases:data,staged_v2_sources_readonly_sha256:hashes};
 const good=verify(manifest,temp);assert.equal(good.source_bytes_verified,true);checks++;
 assert.equal(good.status,'SOURCE_BYTES_VERIFIED_REPLAY_STILL_HOLD');checks++;
 assert.equal(good.v2_replayed,false);checks++;
 assert.equal(good.v68_reconciled,false);checks++;
 assert.equal(good.release_authorized,false);checks++;
 assert.equal(good.effects.print,false);checks++;
 assert.equal(good.counts.events,10);checks++;
 assert.equal(good.counts.decisions,10);checks++;
 assert.equal(good.counts.rules,9);checks++;
 const input=JSON.parse(JSON.stringify(manifest));input.ten_cases[0].snapshot_hash='0'.repeat(64);
 assert.equal(verify(input,temp).source_bytes_verified,false);checks++;
 input.ten_cases[0].snapshot_hash=manifest.ten_cases[0].snapshot_hash;
 input.ten_cases[0].legacy_blockers=['BAG_SIZE_NOT_FACT','KITS_NOT_FACT'];
 assert.equal(verify(input,temp).source_bytes_verified,false);checks++;
 const changed=path.join(temp,'events',String(0).padStart(10,'0')+'_'+data[0].snapshot_hash+'.json');
 fs.appendFileSync(changed,'TAMPER');
 assert.equal(verify(manifest,temp).reason,'EVENT_OR_DECISION_DIGEST_MISMATCH');checks++;
 fs.writeFileSync(changed,JSON.stringify({synthetic:true,n:0,private_note:'FICTIONAL'}));
 const rule=path.join(temp,'rules',EXPECTED_FILES[0]);fs.appendFileSync(rule,'TAMPER');
 assert.equal(verify(manifest,temp).reason,'RULE_DIGEST_MISMATCH');checks++;
 fs.writeFileSync(rule,'SOURCE_'+EXPECTED_FILES[0]+'_SYNTHETIC');
 const extra=path.join(temp,'events','0000000000_'+sha('extra')+'.json');
 fs.writeFileSync(extra,'synthetic');
 assert.equal(verify(manifest,temp).reason,'TEN_FILES_REQUIRED');checks++;
 fs.unlinkSync(extra);
 const copy=JSON.parse(JSON.stringify(manifest));copy.ten_cases[9].snapshot_hash=data[0].snapshot_hash;
 assert.equal(verify(copy,temp).source_bytes_verified,false);checks++;
 if(process.platform!=='win32'){
  const original=changed+'-backup';fs.renameSync(changed,original);fs.symlinkSync(original,changed);
  assert.equal(verify(manifest,temp).source_bytes_verified,false);checks++;
  fs.unlinkSync(changed);fs.renameSync(original,changed);
 }
 console.log(JSON.stringify({status:'PASS',checks,synthetic_only:true,
  no_live_data:true,prints:0,source_bytes_verified_does_not_grant_release:true}));
}finally{fs.rmSync(temp,{recursive:true,force:true})}
