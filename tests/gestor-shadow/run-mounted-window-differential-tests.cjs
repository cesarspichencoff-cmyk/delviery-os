'use strict';
// In-memory synthetic only. No browser, provider, login, network or cashier.
const assert=require('node:assert/strict');
const {SCHEMA,createMountedWindowDifferential}=require('../../runtime/reporting/gestor_mounted_window_differential_v1.cjs');
const secret='SECRET_CUSTOMER_PHONE_11999998888';
const item=(name='Hot Roll',quantity=2,observations='Sem cebola',options=[])=>
 ({name,quantity,observations,options,externalCode:null});
const record=(id='LAB_ORDER_PRIVATE_0001',shortCode='0001',items=[item()],
 merchantId='ITAIM_FIXTURE_ONLY')=>
 ({id,shortCode,merchantId,placedAt:'2026-11-12T19:00:00-03:00',items,customer:secret});
const wrap=(items)=>{
 const x={schema:'deliveryos.gestor-mounted-order-review.v1',
  state:'PRIVATE_REVIEW_ONLY',readOnly:true,actionsExecuted:0,
  ordersPublishable:0,homePublishAuthorized:false,
  merchantVerified:false,coverage:'MOUNTED_CARDS_ONLY',
  visibleCards:items.length,candidateOrders:items.length,
  candidateLines:items.reduce((n,o)=>n+o.items.length,0),
  candidateUnits:items.reduce((n,o)=>n+o.items.reduce((s,i)=>s+i.quantity,0),0)};
 Object.defineProperty(x,'privateCandidates',{value:items,enumerable:false});
 return x;
};
const noLeak=x=>{
 assert.equal(x.schema,SCHEMA);
 assert.equal(x.ordersPublishable,0);
 assert.equal(x.publishableEvents,0);
 assert.equal(x.homePublishAuthorized,false);
 assert.equal(x.printAuthorized,false);
 assert.equal(x.upstreamFreshnessVerified,false);
 assert.equal(x.fullCoverageVerified,false);
 assert.equal(x.disappearanceMeansCancellation,false);
 assert.equal(x.storageWrites,0);
 for(const s of ['LAB_ORDER_PRIVATE','ITAIM_FIXTURE_ONLY','Hot Roll','Sem cebola',
   secret,'11999998888','0001'])
  assert.equal(JSON.stringify(x).includes(s),false,'PII_OR_ORDER_LEAK');
};
let total=0;
const check=(name,fn)=>{fn();total++;console.log('PASS '+name)};
check('first snapshot: two new private candidates, nothing publishable',()=>{
 const d=createMountedWindowDifferential();
 const x=d.review(wrap([record(),record('LAB_ORDER_PRIVATE_0002','0002')]),1000);
 assert.equal(x.state,'PRIVATE_DIFFERENTIAL_REVIEW_ONLY');noLeak(x);
 assert.equal(x.newlyObserved,2);assert.equal(x.contentRevised,0);
 assert.equal(x.candidateUnits,4);assert.equal(x.candidateLines,2);
});
check('identical re-read does not create new events or fake freshness',()=>{
 const d=createMountedWindowDifferential();d.review(wrap([record()]),1000);
 const x=d.review(wrap([record()]),1100);noLeak(x);
 assert.equal(x.unchanged,1);assert.equal(x.newlyObserved,0);
 assert.equal(x.upstreamFreshnessVerified,false);
});
check('quantity revision found without fabricating production readiness',()=>{
 const d=createMountedWindowDifferential();d.review(wrap([record()]),1000);
 const x=d.review(wrap([record(undefined,undefined,[item('Hot Roll',3)])]),2000);
 noLeak(x);assert.equal(x.contentRevised,1);assert.equal(x.candidateUnits,3);
 assert.equal(x.physicalWorkProven,false);
});
check('edited observation causes revision even with same SKU and quantity',()=>{
 const d=createMountedWindowDifferential();d.review(wrap([record()]),1000);
 const x=d.review(wrap([record(undefined,undefined,[item('Hot Roll',2,'Sem pimenta')])]),2000);
 assert.equal(x.contentRevised,1);noLeak(x);
});
check('changed modifier causes revision',()=>{
 const d=createMountedWindowDifferential();d.review(wrap([record()]),1000);
 const x=d.review(wrap([record(undefined,undefined,[item('Hot Roll',2,'Sem cebola',[{name:'Molho',quantity:1}])])]),2000);
 assert.equal(x.contentRevised,1);noLeak(x);
});
check('missing card means disappearance, NOT cancellation',()=>{
 const d=createMountedWindowDifferential();d.review(wrap([record(),record('LAB_ORDER_PRIVATE_0002','0002')]),1000);
 const x=d.review(wrap([record()]),2000);
 assert.equal(x.disappearedFromView,1);assert.equal(x.unchanged,1);noLeak(x);
});
check('previously disappeared card can reappear without false cancellation',()=>{
 const d=createMountedWindowDifferential();const both=[record(),record('LAB_ORDER_PRIVATE_0002','0002')];
 d.review(wrap(both),1000);d.review(wrap([both[0]]),2000);
 const x=d.review(wrap(both),3000);
 assert.equal(x.newlyObserved,1);assert.equal(x.unchanged,1);noLeak(x);
});
check('HOLD source does not clear previous snapshot',()=>{
 const d=createMountedWindowDifferential();d.review(wrap([record()]),1000);
 const bad=wrap([record()]);bad.state='HOLD';const hold=d.review(bad,2000);
 assert.equal(hold.reason,'SOURCE_REVIEW_NOT_QUALIFIED');noLeak(hold);
 const resumed=d.review(wrap([record()]),3000);assert.equal(resumed.unchanged,1);
});
check('empty mounted view never becomes zero orders',()=>{
 const d=createMountedWindowDifferential();d.review(wrap([record()]),1000);
 const x=d.review(wrap([]),2000);
 assert.equal(x.reason,'SOURCE_REVIEW_NOT_QUALIFIED');noLeak(x);
 assert.equal(d.current(2000).candidateOrders,1);
});
check('duplicate order ID rejected with no advancement',()=>{
 const d=createMountedWindowDifferential();d.review(wrap([record()]),1000);
 const x=d.review(wrap([record(),record('LAB_ORDER_PRIVATE_0001','0002')]),2000);
 assert.equal(x.reason,'PRIVATE_CANDIDATE_MALFORMED_OR_DUPLICATED');noLeak(x);
 assert.equal(d.current(2000).candidateOrders,1);
});
check('merchant changes require new explicit review context',()=>{
 const d=createMountedWindowDifferential();d.review(wrap([record()]),1000);
 const x=d.review(wrap([record(undefined,undefined,undefined,'OTHER_MERCHANT')]),2000);
 assert.equal(x.reason,'MERCHANT_CHANGED_REQUIRES_NEW_REVIEW_CONTEXT');noLeak(x);
});
check('aggregate mismatch is quarantined before state replacement',()=>{
 const d=createMountedWindowDifferential();d.review(wrap([record()]),1000);
 const bad=wrap([record()]);bad.candidateUnits=999;
 const x=d.review(bad,2000);assert.equal(x.reason,'AGGREGATE_CONTRADICTION');noLeak(x);
 assert.equal(d.review(wrap([record()]),3000).unchanged,1);
});
check('missing note array in a candidate refuses malformed input',()=>{
 const d=createMountedWindowDifferential();
 const x=d.review(wrap([record(undefined,undefined,[{name:'Sushi',quantity:1,options:[],externalCode:null}])]),1000);
 assert.equal(x.reason,'PRIVATE_ITEM_SHAPE_UNVERIFIED');noLeak(x);
});
check('stale current() explicitly rejects rather than zeroing',()=>{
 const d=createMountedWindowDifferential({maxLocalAgeMs:1000});
 d.review(wrap([record()]),1000);assert.equal(d.current(2000).candidateOrders,1);
 const x=d.current(2001);assert.equal(x.reason,'LOCAL_OBSERVATION_STALE_OR_ABSENT');noLeak(x);
});
check('clock regression fails closed without clearing previous state',()=>{
 const d=createMountedWindowDifferential();d.review(wrap([record()]),1000);
 const x=d.review(wrap([record()]),999);
 assert.equal(x.reason,'LOCAL_CLOCK_REGRESSION');noLeak(x);
 assert.equal(d.review(wrap([record()]),1100).unchanged,1);
});
check('invalid option fails closed without exporting option name',()=>{
 const d=createMountedWindowDifferential();
 const r=record(undefined,undefined,[item('Sushi',1,'', [{name:'Wasabi',quantity:-1}])]);
 const x=d.review(wrap([r]),1000);
 assert.equal(x.reason,'PRIVATE_OPTION_SHAPE_UNVERIFIED');noLeak(x);
});
console.log('GESTOR_MOUNTED_WINDOW_DIFF_PASS '+total+'/'+total+' SYNTHETIC_ONLY');
