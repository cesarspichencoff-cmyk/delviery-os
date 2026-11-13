'use strict';
// Synthetic-only: never imports a browser, DB, customer feed or production code.
const assert=require('node:assert/strict');
const {SCHEMA,compareMountedMerchantWithPublicReference:compare}=
 require('../../runtime/reporting/gestor_public_merchant_scope_review_v1.cjs');
const PUBLIC='https://www.ifood.com.br/delivery/sao-paulo-sp/tata-sushi-vila-nova-conceicao/039ed60c-0ea5-4660-900a-265a720d7869?UTM_Medium=share';
const id='039ed60c-0ea5-4660-900a-265a720d7869';
const wrap=(merchant=id)=>{
 const r={
  schema:'deliveryos.gestor-mounted-order-review.v1',state:'PRIVATE_REVIEW_ONLY',
  readOnly:true,actionsExecuted:0,merchantVerified:false,
  ordersPublishable:0,homePublishAuthorized:false,
  coverage:'MOUNTED_CARDS_ONLY',visibleCards:2,candidateOrders:2
 };
 Object.defineProperty(r,'privateCandidates',{enumerable:false,value:[
  {merchantId:merchant,orderId:'PRIVATE_ORDER_1111',note:'SECRET_NOTE_11999998888'},
  {merchantId:merchant,orderId:'PRIVATE_ORDER_2222',product:'HOT_ROLL_CUSTOMER'}
 ]});
 return r;
};
const assertSafe=x=>{
 assert.equal(x.schema,SCHEMA);assert.equal(x.merchantVerified,false);
 assert.equal(x.unitVerified,false);assert.equal(x.homePublishAuthorized,false);
 assert.equal(x.ordersPublishable,0);assert.equal(x.printAuthorized,false);
 assert.equal(x.networkRequests,0);assert.equal(x.storageWrites,0);
 const json=JSON.stringify(x);
 for(const privateText of ['039ed60c','PRIVATE_ORDER','SECRET_NOTE','11999998888',
  'HOT_ROLL_CUSTOMER','tata-sushi','ifood.com.br'])
  assert.equal(json.includes(privateText),false,'PRIVATE_OR_PUBLIC_ID_LEAK');
};
let n=0;
function check(name,fn){fn();n++;console.log('PASS '+name)}
check('same public storefront UUID is still unscoped REVIEW not verified merchant',()=>{
 const r=compare(wrap(),PUBLIC);assert.equal(r.referenceMatch,true);
 assert.equal(r.state,'PRIVATE_CORRELATION_ONLY');assert.equal(r.unitVerified,false);
 assert.equal(r.referenceBoundToItaim,false);assertSafe(r);
});
check('different storefront UUID is a mismatch, not another merchant promotion',()=>{
 const r=compare(wrap('a0f41f06-14bc-48d3-aad3-111111111111'),PUBLIC);
 assert.equal(r.referenceMatch,false);assertSafe(r);
});
check('numeric merchant ID cannot be compared to public storefront UUID',()=>{
 const r=compare(wrap('53069'),PUBLIC);
 assert.equal(r.reason,'MERCHANT_ID_FORMAT_NOT_COMPARABLE');
 assert.equal(r.referenceMatch,null);assertSafe(r);
});
check('mixed mounted merchant IDs fail closed',()=>{
 const r=wrap();r.privateCandidates[1].merchantId='a0f41f06-14bc-48d3-aad3-111111111111';
 const x=compare(r,PUBLIC);assert.equal(x.reason,'MIXED_MERCHANT_IDS');assertSafe(x);
});
check('wrong domain is forbidden',()=>{
 const r=compare(wrap(),'https://www.ifood.com.br.evil.invalid/delivery/sao-paulo-sp/teste/'+id);
 assert.equal(r.reason,'PUBLIC_REFERENCE_UNSUPPORTED');assertSafe(r);
});
check('different city page is not accepted as the canonical Sao Paulo candidate',()=>{
 const r=compare(wrap(),'https://www.ifood.com.br/delivery/rio-de-janeiro-rj/restaurant/'+id);
 assert.equal(r.reason,'PUBLIC_REFERENCE_UNSUPPORTED');assertSafe(r);
});
check('raw customer data in link is refused',()=>{
 const r=compare(wrap(),PUBLIC+'&phone=11999998888');
 assert.equal(r.reason,'PUBLIC_REFERENCE_UNSUPPORTED');assertSafe(r);
});
check('source self-claim of merchant verified cannot bypass read-only gate',()=>{
 const v=wrap();v.merchantVerified=true;
 const r=compare(v,PUBLIC);assert.equal(r.reason,'GESTOR_REVIEW_NOT_QUALIFIED');
 assertSafe(r);
});
check('private candidate property missing refuses instead of reporting false equality',()=>{
 const x={...wrap()};
 const r=compare(x,PUBLIC);assert.equal(r.reason,'GESTOR_REVIEW_NOT_QUALIFIED');assertSafe(r);
});
check('empty card array never means merchant mismatch',()=>{
 const x=wrap();x.visibleCards=0;x.candidateOrders=0;
 const r=compare(x,PUBLIC);assert.equal(r.reason,'GESTOR_REVIEW_NOT_QUALIFIED');assertSafe(r);
});
check('URL without UTM still produces same unscoped correlation',()=>{
 const r=compare(wrap(),PUBLIC.split('?')[0]);assert.equal(r.referenceMatch,true);
 assertSafe(r);
});
check('caller-provided public URL never independently proves provenance',()=>{
 const r=compare(wrap(),PUBLIC);
 assert.equal(r.referenceProvenanceIndependentlyVerified,false);
 assert.equal(r.gestorAccountIndependentlyVerified,false);assertSafe(r);
});
console.log('GESTOR_PUBLIC_MERCHANT_SCOPE_SHADOW_PASS '+n+'/'+n+' FIXTURES_ONLY');
