'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {watcherHash}=require('./comandas_bag_human_proposal_v1.cjs');
const {inspect}=require('./comandas_ten_v68_note_scope_audit_v1.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'tata-note-scope-synthetic-'));
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++};
try{
 const evDir=path.join(root,'events'),decDir=path.join(root,'decisions');
 fs.mkdirSync(evDir);fs.mkdirSync(decDir);
 const original=[];
 for(let i=0;i<10;i++){
  const item={NRPRODCOMVEN:String(i+100),CDPRODUTO:'P'+i,
   CDARVPROD:'9050508000',QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'X'};
  const rows=[];
  if(i<4)rows.push({source_field:'DSOBSCOMANDA',
    value:'FICTICIO METADADO SEM DADOS PESSOAIS',scope_hint:'order',join_proven:true});
  if(i%3===0)rows.push({source_field:'DSOBSDESCIT',value:'SEM PIMENTA FICTICIO',
    scope_hint:'item',join_proven:true,item_index:0,CDPRODUTO:'P'+i});
  const order={CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'FAKE'+i,NRCOMANDA:'FAKE'+i,
   NRCOMANDAEXT:'FAKE_EXT'+i,IDORGCMDVENDA:'DLV_FAKE',IDSTCOMANDA:'X',
   DTHRABERMESA:'2026-10-14T12:00:00',items:[item],
   observation_scan_complete:true,observation_rows:rows};
  const event={schema:'deliveryos.tata-reader-stable-order-event.v1',
   order_key:'0001|01|FAKE'+i+'|FAKE'+i,order,snapshot_hash:null,
   ready_for_downstream_shadow:true,blockers:[]};
  event.snapshot_hash=watcherHash(event);
  const decision={schema:'deliveryos.live-shadow-decision.v1',
   order_key:event.order_key,snapshot_hash:event.snapshot_hash,ready:false,
   blocking_reasons:['BAG_SIZE_NOT_FACT']};
  const eventBytes=Buffer.from(JSON.stringify(event)),decisionBytes=Buffer.from(JSON.stringify(decision));
  const prefix=String(i).padStart(10,'0')+'_'+event.snapshot_hash;
  const ep=path.join(evDir,prefix+'.json'),dp=path.join(decDir,prefix+'.decision.json');
  fs.writeFileSync(ep,eventBytes);fs.writeFileSync(dp,decisionBytes);
  original.push({ep,dp,ev:event,decision,meta:{
   snapshot_hash:event.snapshot_hash,event_file_sha256:sha(eventBytes),
   legacy_decision_file_sha256:sha(decisionBytes),
   observation_rows:rows.length,legacy_decision_ready:false,
   legacy_blockers:['BAG_SIZE_NOT_FACT']}});
 }
 const manifest={schema:'tata-comandas-private-ten-original-pair-evidence.v2',
  ten_cases:original.map(x=>x.meta)};
 const result=inspect(manifest,evDir,decDir);
 eq(result.status,'REVIEW_REQUIRED_FOR_GENERAL_NOTES');
 eq(result.files_verified,20);eq(result.orders_with_general_note,4);
 eq(result.orders_with_item_note,4);eq(result.notes_total,8);
 eq(result.counts.DSOBSCOMANDA,4);eq(result.counts.DSOBSDESCIT,4);
 eq(result.counts.DSOBSPEDDIGCMD,0);eq(result.counts.TXPRODCOMVEN,0);
 eq(result.v68_authorized,false);eq(result.print_authorized,false);
 eq(result.source_text_emitted,false);
 eq(JSON.stringify(result).includes('FICTICIO'),false);
 const allItem=original.map(x=>({...x.meta}));
 // The no-general path is still blocked from independent V6.8 authority;
 // proving that scenario would require different, fully self-consistent event bytes.
 const invalid=JSON.parse(JSON.stringify(manifest));
 invalid.ten_cases[0].snapshot_hash=invalid.ten_cases[1].snapshot_hash;
 eq(inspect(invalid,evDir,decDir).status,'HOLD');
 const dup=JSON.parse(JSON.stringify(manifest));
 dup.ten_cases[1].snapshot_hash=dup.ten_cases[0].snapshot_hash;
 eq(inspect(dup,evDir,decDir).status,'HOLD');
 const saved=fs.readFileSync(original[0].ep);
 fs.appendFileSync(original[0].ep,' CHANGED');
 eq(inspect(manifest,evDir,decDir).files_verified,0);
 fs.writeFileSync(original[0].ep,saved);
 eq(inspect(manifest,evDir,decDir).files_verified,20);
 const m2=JSON.parse(JSON.stringify(manifest));m2.ten_cases[0].observation_rows=99;
 eq(inspect(m2,evDir,decDir).status,'HOLD');
 const m3=JSON.parse(JSON.stringify(manifest));m3.ten_cases[4].legacy_blockers.push('KITS_NOT_FACT');
 eq(inspect(m3,evDir,decDir).status,'HOLD');
 const extra=fs.readFileSync(original[3].dp);
 fs.writeFileSync(original[3].dp,Buffer.from('{"fake":true}'));
 eq(inspect(manifest,evDir,decDir).status,'HOLD');
 fs.writeFileSync(original[3].dp,extra);
 eq(inspect(manifest,evDir,decDir).files_verified,20);
 const symlink=original[0].ep+'.copy';fs.renameSync(original[0].ep,symlink);
 if(process.platform!=='win32'){
  fs.symlinkSync(symlink,original[0].ep);
  eq(inspect(manifest,evDir,decDir).status,'HOLD');
  fs.unlinkSync(original[0].ep);
 }fs.renameSync(symlink,original[0].ep);
 eq(inspect(manifest,evDir,decDir).files_verified,20);
 // Adversarial pair: both source files are deliberately re-hashed in a
 // self-consistent manifest. File SHA and watcher snapshot remain valid,
 // but the pair's declared order_key does not match native order identity.
 // This must never be counted as one of ten original orders.
 const originalEventBytes=fs.readFileSync(original[0].ep);
 const originalDecisionBytes=fs.readFileSync(original[0].dp);
 try{
  const spoofEvent=JSON.parse(originalEventBytes),spoofDecision=JSON.parse(originalDecisionBytes);
  spoofEvent.order_key='0001|01|OTHER_SALE|OTHER_ORDER';
  spoofDecision.order_key=spoofEvent.order_key;
  const eventBytes=Buffer.from(JSON.stringify(spoofEvent));
  const decisionBytes=Buffer.from(JSON.stringify(spoofDecision));
  fs.writeFileSync(original[0].ep,eventBytes);
  fs.writeFileSync(original[0].dp,decisionBytes);
  const consistentManifest=JSON.parse(JSON.stringify(manifest));
  consistentManifest.ten_cases[0].event_file_sha256=sha(eventBytes);
  consistentManifest.ten_cases[0].legacy_decision_file_sha256=sha(decisionBytes);
  const reject=inspect(consistentManifest,evDir,decDir);
  eq(reject.status,'HOLD');
  eq(reject.files_verified,0);
  eq(reject.source_text_emitted,false);
  eq(reject.print_authorized,false);
 }finally{
  fs.writeFileSync(original[0].ep,originalEventBytes);
  fs.writeFileSync(original[0].dp,originalDecisionBytes);
 }
 eq(inspect(manifest,evDir,decDir).files_verified,20);
 console.log(JSON.stringify({result:'PASS',checks,fictional_source_only:true,
  original_client_data:false,notes_printed:false,production_effects:false}));
}finally{fs.rmSync(root,{recursive:true,force:true})}
