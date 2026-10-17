'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {inspect,watcherHash,fingerprint,EXPECTED_SOURCES,LEDGER_GIT_BLOB}=
 require('./comandas_bag_human_proposal_v1.cjs');
const {N}=require('./comandas-human-review-v1/human_review_v1.cjs');
const ledger=fs.readFileSync(path.join(__dirname,'../runtime/shadow/human-validations-cesar-20261014.review.json'));
let checks=0;
const ck=(actual,expected)=>{assert.deepEqual(actual,expected);checks++};
const mk=(key,index)=>({
 NRPRODCOMVEN:String(index+100),CDPRODUTO:'P'+index,
 CDARVPROD:N[key][0].replace(/[^0-9a-z]/gi,''),QTPRODCOMVEN:'1.000',
 IDSTPRCOMVEN:'X'
});
function scenario(names){
 const order={CDFILIAL:'0001',CDLOJA:'01',NRVENDAREST:'9001',
 NRCOMANDA:'0000000011',NRCOMANDAEXT:'TEST_EXTERNAL_1',
 IDORGCMDVENDA:'DLV_TEST_FIXTURE',IDSTCOMANDA:'X',
 DTHRABERMESA:'2026-10-14T12:00:00',items:names.map(mk),
 observation_scan_complete:true,observation_rows:[
  {source_field:'DSOBSCOMANDA',value:'NOTA FICTICIA SEM DADOS PESSOAIS',
   scope_hint:'order',join_proven:true}
 ]};
 const event={schema:'deliveryos.tata-reader-stable-order-event.v1',
 order_key:[order.CDFILIAL,order.CDLOJA,order.NRVENDAREST,order.NRCOMANDA].join('|'),
 order,snapshot_hash:null,ready_for_downstream_shadow:true,
 blockers:[],service_resolution:{service:'LUNCH',evidence:'HUMAN_CONFIRMED_RULE',source_ref:'FICTIONAL_ONLY',blockers:[]}};
 event.snapshot_hash=watcherHash(event);
 const decision={
 schema:'deliveryos.live-shadow-decision.v1',ready:false,
 blocking_reasons:['BAG_SIZE_NOT_FACT'],order_key:event.order_key,
 snapshot_hash:event.snapshot_hash,ifood_sequence:order.NRCOMANDAEXT,
 teknisa_sequence:order.NRCOMANDA,service:event.service_resolution,
 items:names.map((key,index)=>({
 item_index:index+1,CDPRODUTO:'P'+index,
 canonical_code:N[key][0],product_name:N[key][1],quantity:1,
 classification:{family:'combinado',subfamily:'combinado',station:'combinados',review_required:false},
 classification_source:'SYNTHETIC_SOURCE',observations:[] })),
 order_observations:[{source_field:'DSOBSCOMANDA',value:'NOTA FICTICIA SEM DADOS PESSOAIS'}],
 observation_scan_complete:true,packaging:{total_items:names.length,has_unknown:false,
 bags:{size_status:'UNKNOWN',exact_bag_count_status:'FACT'}},
 kits:{status:'FACT'},sequence:{shadow_candidate:'321',binding_written:false},
 rule_lineage:{academy_rule_refs:EXPECTED_SOURCES.slice(0,2).map(([k,v])=>k+'#sha256='+v),
 delivery_rule_refs:EXPECTED_SOURCES.slice(2).map(([k,v])=>k+'#sha256='+v)},
 effects:{database_read:false,database_write:false,sequence_binding_write:false,
 print:false,spooler_write:false,odhen_write:false,fiscal_action:false,sefaz_call:false}
 };
 decision.fingerprint=fingerprint(decision);
 return {event,decision};
}
for(const [id,keys]of [
 ['B1',['EXEC']],
 ['B5',['KIDS','TEMAKI','SPRITE']],
 ['B8',['ESPECIAL_1P','SASHIMI_BARRIGA']],
 ['B9',['TEMAKI','HOSSO']]
]){
 const {event,decision}=scenario(keys);
 const before=JSON.stringify([event,decision]);
 const r=inspect(event,decision,ledger);
 ck(r.status,'SHADOW_BAG_MATCH_ATTESTATION_AND_V68_PENDING');
 ck(r.bag_candidate.case,id);
 ck(r.bag_candidate.sizes,['M']);
 ck(r.bag_candidate.count,1);
 ck(r.bag_candidate.source_git_blob,LEDGER_GIT_BLOB);
 ck(r.original_decision_unchanged,true);
 ck(r.original_ready,false);
 ck(r.original_blockers,['BAG_SIZE_NOT_FACT']);
 ck(r.independent_human_attestation,false);
 ck(r.ready_override,false);ck(r.print_authorized,false);
 ck(r.v68_executed,false);
 ck(JSON.stringify([event,decision]),before);
}
const {event:e,decision:d}=scenario(['EXEC']);
const clone=x=>JSON.parse(JSON.stringify(x));
const no=(E,D,L=ledger)=>{const r=inspect(E,D,L);ck(r.status,'HOLD');ck(r.print_authorized,false);};
let x=clone(e);x.order.items[0].QTPRODCOMVEN='2.000';no(x,d);
x=clone(e);x.order.observation_rows[0].value='MUTACAO FICTICIA';no(x,d);
x=clone(e);x.order.observation_rows[0].join_proven=false;no(x,d);
x=clone(e);x.order_key='0001|01|NOT_REAL';no(x,d);
x=clone(e);x.ready_for_downstream_shadow=false;no(x,d);
let y=clone(d);y.items[0].quantity=2;no(e,y);
y=clone(d);y.items[0].quantity=2;y.fingerprint=fingerprint(y);no(e,y);
y=clone(d);y.rule_lineage.delivery_rule_refs[0]+='X';no(e,y);
y=clone(d);y.blocking_reasons.push('KITS_NOT_FACT');no(e,y);
y=clone(d);y.blocking_reasons=[];y.ready=true;no(e,y);
y=clone(d);y.effects.print=true;no(e,y);
y=clone(d);y.order_observations=[];y.fingerprint=fingerprint(y);no(e,y);
y=clone(d);y.sequence.binding_written=true;y.fingerprint=fingerprint(y);no(e,y);
const tampered=Buffer.concat([ledger,Buffer.from('\n')]);no(e,d,tampered);
const b4=scenario(['KIDS','ZERO']);no(b4.event,b4.decision);
const extra=scenario(['EXEC','SHIMEJI']);no(extra.event,extra.decision);
const sourceError=scenario(['EXEC']);sourceError.decision.fingerprint='0'.repeat(64);no(sourceError.event,sourceError.decision);
assert.equal(watcherHash(e),e.snapshot_hash);checks++;
assert.equal(fingerprint(d),d.fingerprint);checks++;
console.log(JSON.stringify({result:'PASS',checks,synthetic_only:true,
  human_source_pinned:true,operational_authority:false,ready_promotions:0,
  customer_notes_exposed:0,prints:0}));
