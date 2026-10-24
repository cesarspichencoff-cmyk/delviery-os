'use strict';
// Independent *read-only* proposal gate for human bag-size matches.
// Source pin & internal hashes are integrity, NEVER operational attestation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {reviewV2}=require('./comandas-human-review-v1/human_review_v1.cjs');
const LEDGER_PATH=path.join(__dirname,'../runtime/shadow/human-validations-cesar-20261014.review.json');
const LEDGER_GIT_BLOB='cd30d2039ea9228ff59c7581b0bc1c1f4cbaef98';
const EXPECTED_SOURCES=Object.freeze([
 ['tata-academia:installed/packaging-current.js','1e4cf2475edb586d5dae88388d2adc7cf02013b00ec93c0371e3edb80f81342e'],
 ['tata-academia:installed/app-data.json','62dcb7b7d35a8a4f3ba5af91516c7aabfa7c65d89cf21d3421bb8e998c2a2cdc'],
 ['deliveryos:installed/routing.json','7084771026ca54f10069f02e0babcaa00f9c7666484cbaf80ec1ecdcdcaa165d'],
 ['deliveryos:installed/printer-map.json','f37dae40779c5a205a26ceb289cd748d1c7747c1947c278f534a2dcc2f296f4c'],
 ['deliveryos:installed/non-production.json','b65872dd748edad7a871729ce2c00fedf860292e5bb8ccb5c48151ab9683c21e'],
 ['deliveryos:installed/product-identity-cache-v1.json','37e92fc87ea1d141cbaca32216564ac22ee469e6c3dde478f10d8e0351daf4f3'],
 ['deliveryos:installed/product-aliases-v1.json','cb50d4ba19d6b91d6b6241d8043109a0c5317348a95eeca5a721ec552870c167'],
 ['deliveryos:installed/human-order-overrides-v1.json','cd24f518649b37891a38dec0cdc6ddff31afde4b92e1589038c5654b51fc74e6']
]);
const ELIGIBLE=new Set(['B1','B5','B8','B9']);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const gitblob=b=>crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');
const hex=s=>typeof s==='string'&&/^[0-9a-f]{64}$/i.test(s);
const PROHIBITED=Object.freeze({ready_override:false,print_authorized:false,
 ticket_authorized:false,consumer_modified:false,v68_executed:false,
 service_changed:false,sequence_written:false});
function hold(reason){return {schema:'deliveryos.bag-human-proposal.v1',status:'HOLD',
 reason,bag_candidate:null,proof:'NO_OPERATIONAL_AUTHORITY',
 original_decision_unchanged:true,...PROHIBITED}}
function watcherHash(event){
 const order=event?.order,fields=['CDFILIAL','CDLOJA','NRVENDAREST','NRCOMANDA',
 'NRCOMANDAEXT','IDORGCMDVENDA','IDSTCOMANDA','DTHRABERMESA'];
 const keys=['NRPRODCOMVEN','CDPRODUTO','CDARVPROD','QTPRODCOMVEN','IDSTPRCOMVEN'];
 if(!order||fields.some(k=>!Object.hasOwn(order,k))||!Array.isArray(order.items)||
  order.items.length===0||order.items.some(i=>!i||keys.some(k=>!Object.hasOwn(i,k)))||
  order.observation_scan_complete!==true||!Array.isArray(order.observation_rows))return null;
 const cleanItems=order.items.map(i=>Object.fromEntries(keys.map(k=>[k,i[k]])));
 const snap={CDFILIAL:order.CDFILIAL,CDLOJA:order.CDLOJA,
 NRVENDAREST:order.NRVENDAREST,NRCOMANDA:order.NRCOMANDA,
 NRCOMANDAEXT:order.NRCOMANDAEXT,IDORGCMDVENDA:order.IDORGCMDVENDA,
 IDSTCOMANDA:order.IDSTCOMANDA,DTHRABERMESA:order.DTHRABERMESA,items:cleanItems};
 const notes=[],seen=new Set();let general=0;
 for(const row of order.observation_rows){
  if(!row||typeof row.value!=='string'||!row.value.trim()||
   row.value!==row.value.trim()||row.join_proven!==true)return null;
  if(row.scope_hint==='order'){
   if(row.source_field!=='DSOBSCOMANDA'||++general>1)return null;
   notes.push({source_field:row.source_field,value:row.value,
    scope_hint:'order',join_proven:true});
  }else if(row.scope_hint==='item'){
   if(!['DSOBSDESCIT','DSOBSPEDDIGCMD','TXPRODCOMVEN'].includes(row.source_field)||
      !Number.isSafeInteger(row.item_index)||row.item_index<0||
      row.item_index>=cleanItems.length||
      row.CDPRODUTO!==cleanItems[row.item_index].CDPRODUTO)return null;
   const key=row.item_index+':'+row.source_field;
   if(seen.has(key))return null;seen.add(key);
   notes.push({source_field:row.source_field,value:row.value,
    item_index:row.item_index,CDPRODUTO:row.CDPRODUTO,
    scope_hint:'item',join_proven:true});
  }else return null;
 }
 if(notes.length)snap.observation_rows=notes;
 return sha(Buffer.from(JSON.stringify(snap)));
}
function fingerprint(decision){
 if(!decision||typeof decision!=='object')return null;
 const fields=['order_key','snapshot_hash','ifood_sequence','teknisa_sequence',
 'service','items','order_observations','observation_scan_complete',
 'packaging','kits','sequence'];
 if(fields.some(k=>!Object.hasOwn(decision,k)))return null;
 return sha(Buffer.from(JSON.stringify(Object.fromEntries(fields.map(k=>[k,decision[k]])))));
}
function inspect(event,decision,ledgerBytes){
 try{
  if(!Buffer.isBuffer(ledgerBytes)||gitblob(ledgerBytes)!==LEDGER_GIT_BLOB)return hold('HUMAN_LEDGER_GIT_BLOB_NOT_PINNED');
  const ledger=JSON.parse(ledgerBytes.toString('utf8'));
  if(ledger.schema!=='deliveryos.cesar-exact-human-validation.v1'||
    ledger.source!=='CESAR_DIRECT_CHAT_2026_10_14'||
    ledger.scope!=='TATA_ITAIM_V2_SHADOW_REVIEW'||
    ledger.policy?.no_live_effects!==true||
    ledger.policy?.no_inference_to_similar_orders!==true||
    !Array.isArray(ledger.bags))return hold('HUMAN_LEDGER_POLICY_INVALID');
  if(event?.schema!=='deliveryos.tata-reader-stable-order-event.v1'||
   decision?.schema!=='deliveryos.live-shadow-decision.v1'||!hex(event.snapshot_hash)||
   event.snapshot_hash!==decision.snapshot_hash||typeof event.order_key!=='string'||
   event.order_key!==decision.order_key)return hold('EVENT_DECISION_REVISION_MISMATCH');
  const o=event.order;
  if(!o||event.order_key!==[o.CDFILIAL,o.CDLOJA,o.NRVENDAREST,o.NRCOMANDA].join('|')||
   event.ready_for_downstream_shadow!==true||
   !Array.isArray(event.blockers)||event.blockers.length!==0||
   watcherHash(event)!==event.snapshot_hash.toLowerCase())
   return hold('WATCHER_EVENT_SOURCE_HASH_OR_IDENTITY_UNPROVEN');
  if(!hex(decision.fingerprint)||fingerprint(decision)!==decision.fingerprint.toLowerCase()||
   decision.teknisa_sequence!==o.NRCOMANDA||decision.ifood_sequence!==o.NRCOMANDAEXT||
   JSON.stringify(decision.service)!==JSON.stringify(event.service_resolution))
   return hold('V2_DECISION_FINGERPRINT_OR_SERVICE_MISMATCH');
  const refs=[...(decision.rule_lineage?.academy_rule_refs||[]),
    ...(decision.rule_lineage?.delivery_rule_refs||[])];
  if(refs.length!==8||refs.some((s,i)=>s!==EXPECTED_SOURCES[i][0]+'#sha256='+EXPECTED_SOURCES[i][1]))
   return hold('V2_RULE_SOURCE_LINEAGE_NOT_PINNED');
  if(decision.ready!==false||!Array.isArray(decision.blocking_reasons)||
   decision.blocking_reasons.length!==1||decision.blocking_reasons[0]!=='BAG_SIZE_NOT_FACT')
   return hold('V2_HAS_OTHER_OR_NO_BLOCKERS');
  const effects=['database_read','database_write','sequence_binding_write','print',
   'spooler_write','odhen_write','fiscal_action','sefaz_call'];
  if(!decision.effects||Object.keys(decision.effects).length!==effects.length||
    effects.some(k=>decision.effects[k]!==false)||decision.sequence?.binding_written!==false)
   return hold('V2_EFFECT_BOUNDARY_NOT_PROVEN');
  if(!Array.isArray(decision.items)||decision.items.length!==o.items.length||
    !decision.items.every((d,i)=>{
     const raw=o.items[i];if(!raw||d.item_index!==i+1||
       d.CDPRODUTO!==raw.CDPRODUTO||
       String(d.canonical_code||'').replace(/[^0-9a-z]/gi,'')!==
       String(raw.CDARVPROD||'').replace(/[^0-9a-z]/gi,'')||
       !Number.isSafeInteger(d.quantity)||d.quantity<=0)return false;
     const value=Number(String(raw.QTPRODCOMVEN).trim());
     return Number.isSafeInteger(value)&&value===d.quantity;
    }))return hold('V2_ITEM_IDENTITY_QUANTITY_MISMATCH');
  const noteRows=o.observation_rows;
  if(decision.observation_scan_complete!==true||
    !Array.isArray(decision.order_observations)||
    !decision.items.every(x=>Array.isArray(x.observations)))
   return hold('V2_OBSERVATION_CONTRACT_UNPROVEN');
  const general=noteRows.filter(x=>x.scope_hint==='order').map(x=>({source_field:x.source_field,value:x.value}));
  const items=decision.items.map((d,i)=>noteRows.filter(x=>x.scope_hint==='item'&&x.item_index===i)
    .map(x=>({source_field:x.source_field,value:x.value})));
  if(JSON.stringify(decision.order_observations)!==JSON.stringify(general)||
    items.some((notes,i)=>JSON.stringify(notes)!==JSON.stringify(decision.items[i].observations)))
   return hold('V2_OBSERVATIONS_NOT_IDENTICAL');
  const review=reviewV2(decision);
  if(review.status!=='REVIEW_ONLY'||review.candidate_for_reconciliation!==true||
    !review.bag||!ELIGIBLE.has(review.bag.case))return hold('NO_EXACT_HUMAN_CASE_OR_OTHER_BLOCKER');
  const candidates=ledger.bags.filter(x=>x.id===review.bag.case);
  const sourceRule=candidates[0];
  if(candidates.length!==1||sourceRule.kind!=='bag'||
     sourceRule.authority!=='HUMAN_CONFIRMATION_2026-10-14'||
     sourceRule.applies_to!=='EXACT_PRODUCT_OR_EXACT_COMPOSITION_ONLY'||
     sourceRule.print_authorized!==false||
     JSON.stringify(sourceRule.value?.bags)!==JSON.stringify(review.bag.sizes)||
     sourceRule.value.bag_count!==review.bag.count)
   return hold('HUMAN_RULE_EXACT_SOURCE_MISMATCH');
  return {schema:'deliveryos.bag-human-proposal.v1',
    status:'SHADOW_BAG_MATCH_ATTESTATION_AND_V68_PENDING',reason:'HUMAN_SOURCE_IS_REVIEW_NOT_RELEASE',
    bag_candidate:{case:review.bag.case,sizes:[...review.bag.sizes],
      count:review.bag.count,source_git_blob:LEDGER_GIT_BLOB},
    proof:'V2_EVENT_INTERNAL_INTEGRITY_PLUS_PINNED_HUMAN_REVIEW_ONLY',
    independent_human_attestation:false,sql_original_authentication:false,
    consumer_source_code_authentication:false,
    source_bytes_compared_externally:false,original_decision_unchanged:true,
    original_ready:decision.ready,original_blockers:[...decision.blocking_reasons],...PROHIBITED};
 }catch{return hold('INPUT_OR_SOURCE_UNAVAILABLE')}
}
if(require.main===module)console.log(JSON.stringify(hold('DIRECT_LIVE_RUN_NOT_SUPPORTED')));
module.exports={inspect,watcherHash,fingerprint,EXPECTED_SOURCES,LEDGER_GIT_BLOB};
