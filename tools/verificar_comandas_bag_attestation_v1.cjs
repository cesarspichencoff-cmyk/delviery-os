'use strict';
// All signing keys are synthetic, ephemeral, and never stored.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const crypto=require('node:crypto');
const {verify,signingMessage,FIELDS}=require('./comandas_bag_attestation_v1.cjs');
const {watcherHash,fingerprint,EXPECTED_SOURCES}=require('./comandas_bag_human_proposal_v1.cjs');
const {N}=require('./comandas-human-review-v1/human_review_v1.cjs');
const ledger=fs.readFileSync(path.join(__dirname,'../runtime/shadow/human-validations-cesar-20261014.review.json'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const pub=publicKey.export({format:'pem',type:'spki'}).toString();
const trust={schema:'deliveryos.bag-human-trust-context.v1',
 authority:'EPHEMERAL_CI_TEST_CONTEXT_ONLY',operator_ref:'test:cesar_operator_001',
 public_key_spki_pem:pub,public_key_sha256:sha(publicKey.export({format:'der',type:'spki'})),
 valid_from:'2026-10-15T02:00:00.000Z',valid_until:'2026-10-15T04:00:00.000Z',
 revoked_nonces:[],revoked_snapshots:[]};
const NOW='2026-10-15T03:00:00.000Z';
function mk(keys){
 const raw=keys.map((k,i)=>({NRPRODCOMVEN:String(i+100),CDPRODUTO:'P'+i,
 CDARVPROD:N[k][0].replace(/[^0-9a-z]/gi,''),QTPRODCOMVEN:'1.000',IDSTPRCOMVEN:'X'}));
 const order={CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'9001',NRCOMANDA:'0000000011',
 NRCOMANDAEXT:'TEST_EXTERNAL_1',IDORGCMDVENDA:'DLV_TEST_FIXTURE',IDSTCOMANDA:'X',
 DTHRABERMESA:'2026-10-14T12:00:00',items:raw,observation_scan_complete:true,
 observation_rows:[{source_field:'DSOBSCOMANDA',value:'NOTA FICTICIA SEM DADOS PESSOAIS',
 scope_hint:'order',join_proven:true}]};
 const event={schema:'deliveryos.tata-reader-stable-order-event.v1',
 order_key:[order.CDFILIAL,order.CDLOJA,order.NRVENDAREST,order.NRCOMANDA].join('|'),
 order,ready_for_downstream_shadow:true,blockers:[],snapshot_hash:null,
 service_resolution:{service:'LUNCH',evidence:'HUMAN_CONFIRMED_RULE',source_ref:'FICTIONAL_ONLY',blockers:[]}};
 event.snapshot_hash=watcherHash(event);
 const decision={schema:'deliveryos.live-shadow-decision.v1',ready:false,
 blocking_reasons:['BAG_SIZE_NOT_FACT'],order_key:event.order_key,
 snapshot_hash:event.snapshot_hash,ifood_sequence:order.NRCOMANDAEXT,
 teknisa_sequence:order.NRCOMANDA,service:event.service_resolution,
 items:keys.map((k,i)=>({item_index:i+1,CDPRODUTO:'P'+i,
 canonical_code:N[k][0],product_name:N[k][1],quantity:1,
 classification:{family:'combinado',station:'combinados',review_required:false},
 classification_source:'SYNTHETIC_FIXTURE',observations:[]})),
 order_observations:[{source_field:'DSOBSCOMANDA',value:'NOTA FICTICIA SEM DADOS PESSOAIS'}],
 observation_scan_complete:true,packaging:{total_items:keys.length,has_unknown:false,
 bags:{size_status:'UNKNOWN',exact_bag_count_status:'FACT'}},
 kits:{status:'FACT'},sequence:{shadow_candidate:'321',binding_written:false},
 rule_lineage:{academy_rule_refs:EXPECTED_SOURCES.slice(0,2).map(([k,v])=>k+'#sha256='+v),
 delivery_rule_refs:EXPECTED_SOURCES.slice(2).map(([k,v])=>k+'#sha256='+v)},
 effects:{database_read:false,database_write:false,sequence_binding_write:false,
 print:false,spooler_write:false,odhen_write:false,fiscal_action:false,sefaz_call:false}};
 decision.fingerprint=fingerprint(decision);
 return {event,decision};
}
const cases=[['B1',['EXEC']],['B5',['KIDS','TEMAKI','SPRITE']],
 ['B8',['ESPECIAL_1P','SASHIMI_BARRIGA']],['B9',['TEMAKI','HOSSO']]];
function signed(event,decision,which='B1',key=privateKey){
 const stmt={schema:'deliveryos.bag-human-signed-review.v1',
 purpose:'SHADOW_REVIEW_NOT_RELEASE',operator_ref:trust.operator_ref,
 order_key_sha256:sha(Buffer.from(event.order_key)),snapshot_hash:event.snapshot_hash,
 decision_fingerprint:decision.fingerprint,
 ledger_git_blob:'cd30d2039ea9228ff59c7581b0bc1c1f4cbaef98',
 bag_case:which,bag_sizes:['M'],bag_count:1,
 issued_at:'2026-10-15T02:55:00.000Z',expires_at:'2026-10-15T03:10:00.000Z',
 nonce:'test:never_reused_nonce_0001'};
 return {...stmt,signature_base64:crypto.sign(null,signingMessage(stmt),key).toString('base64')};
}
let checks=0;
const yes=(condition)=>{assert.ok(condition);checks++};
const block=(r)=>{assert.equal(r.status,'HOLD');checks++;
 assert.equal(r.signature_valid,false);checks++;
 assert.equal(r.print_authorized,false);checks++;
 assert.equal(r.ready_override,false);checks++};
for(const [id,items] of cases){
 const {event,decision}=mk(items),att=signed(event,decision,id);
 const before=JSON.stringify([event,decision]);
 const r=verify(event,decision,ledger,att,trust,NOW);
 yes(r.status==='SIGNED_SHADOW_REVIEW_MATCH_NOT_OPERATIONAL');
 yes(r.signature_valid&&r.matched_review&&r.bag_case===id);
 yes(r.human_key_custody_proven===false);
 yes(r.independent_operator_authenticated===false);
 yes(r.operational_human_authority_proven===false);
 yes(r.ready_override===false&&r.print_authorized===false&&r.v68_authorized===false);
 yes(JSON.stringify([event,decision])===before);
}
const {event,decision}=mk(['EXEC']);const a=signed(event,decision);
const change=(base,field,value)=>({...base,[field]:value});
block(verify(event,decision,ledger,change(a,'bag_case','B5'),trust,NOW));
block(verify(event,decision,ledger,change(a,'snapshot_hash','0'.repeat(64)),trust,NOW));
block(verify(event,decision,ledger,change(a,'bag_count',2),trust,NOW));
block(verify(event,decision,ledger,change(a,'operator_ref','test:other_operator_2'),trust,NOW));
block(verify(event,decision,ledger,change(a,'decision_fingerprint','1'.repeat(64)),trust,NOW));
block(verify(event,decision,ledger,change(a,'nonce','test:nonce_for_another_case'),trust,NOW));
block(verify(event,decision,ledger,change(a,'purpose','OPERATIONAL_RELEASE'),trust,NOW));
block(verify(event,decision,ledger,a,{...trust,authority:'AUTHENTICATED_OPERATOR_REGISTRY'},NOW));
block(verify(event,decision,ledger,a,{...trust,revoked_nonces:[a.nonce]},NOW));
block(verify(event,decision,ledger,a,{...trust,revoked_snapshots:[event.snapshot_hash]},NOW));
block(verify(event,decision,ledger,a,{...trust,public_key_sha256:'0'.repeat(64)},NOW));
const another=crypto.generateKeyPairSync('ed25519');
block(verify(event,decision,ledger,signed(event,decision,'B1',another.privateKey),trust,NOW));
// Select an actually different Base64 character; 'A' may already be the first
// character of an ephemeral Ed25519 signature (a 1/64 false failure).
const alteredFirstChar=a.signature_base64[0]==='A'?'B':'A';
assert.notEqual(alteredFirstChar,a.signature_base64[0]);
block(verify(event,decision,ledger,change(a,'signature_base64',alteredFirstChar+a.signature_base64.slice(1)),trust,NOW));
block(verify(event,decision,ledger,a,trust,'2026-10-15T03:11:00.000Z'));
block(verify(event,decision,ledger,a,trust,'2026-10-15T02:50:00.000Z'));
block(verify(event,{...decision,ready:true},ledger,a,trust,NOW));
block(verify(event,{...decision,blocking_reasons:['BAG_SIZE_NOT_FACT','KITS_NOT_FACT']},ledger,a,trust,NOW));
block(verify(event,decision,Buffer.concat([ledger,Buffer.from('\n')]),a,trust,NOW));
const mutated={...event,order:{...event.order,observation_rows:[
 {...event.order.observation_rows[0],value:'OUTRA NOTA FICTICIA'}]}};
block(verify(mutated,decision,ledger,a,trust,NOW));
// Valid cryptography with a substituted self-provided key cannot grant reality authority.
const otherTrust={...trust,public_key_spki_pem:another.publicKey.export({format:'pem',type:'spki'}).toString(),
 public_key_sha256:sha(another.publicKey.export({format:'der',type:'spki'}))};
const o=verify(event,decision,ledger,signed(event,decision,'B1',another.privateKey),otherTrust,NOW);
yes(o.signature_valid===true&&o.operational_human_authority_proven===false&&o.print_authorized===false);
yes(FIELDS.length===13);
console.log(JSON.stringify({result:'PASS',checks,synthetic_only:true,
 no_real_operator_keys:true,signature_is_not_human_authority:true,
 production_fact_promotions:0,prints:0}));
