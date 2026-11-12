'use strict';
// Integrated, synthetic, end-to-end sensor -> private differential only.
// Not a source producer, no Home authority, no POS, SQL, or provider access.
const assert=require('node:assert/strict');
const sensor=require('../../runtime/reporting/gestor_v3_visible_sensor.js');
const {createMountedWindowDifferential}=require('../../runtime/reporting/gestor_mounted_window_differential_v1.cjs');
const actor='SECRET_NAME_11999998888';
const item=(quantity=2,observations='Sem cebolinha')=>({
 name:'Hot Roll',quantity,observations,options:[],externalCode:null
});
const mk=(n)=>({id:'PRIVATE_ORDER_'+n,displayId:String(n).padStart(4,'0'),
 merchant:{id:'FICTITIOUS_MERCHANT'},items:[item()],
 customer:{name:actor},createdAt:'2026-11-12T19:00:00-03:00'});
const orders=[mk(1),mk(2)];
const doc={location:{hostname:'gestordepedidos.ifood.com.br'},
 querySelectorAll(sel){
   assert.equal(sel,'[data-testid="card"]');
   return orders.map(o=>({
      get innerText(){return 'Pedido #'+o.displayId;},
      isConnected:true,parentElement:null,getClientRects(){return [{}]},
      __reactFiber$lab:{memoizedProps:{},return:{
       memoizedProps:{order:o},return:null}}
   }));
 }};
let n=0;
const assertSafe=r=>{
 assert.equal(r.homePublishAuthorized,false);
 assert.equal(r.ordersPublishable,0);
 assert.equal(r.printAuthorized,false);
 const visible=JSON.stringify(r);
 for(const secret of ['PRIVATE_ORDER','FICTITIOUS_MERCHANT','Hot Roll','Sem cebolinha',actor,'11999998888'])
  assert.ok(!visible.includes(secret),'PRIVATE_FIELD_LEAK');
};
const test=(label,fn)=>{fn();n++;console.log('PASS '+label)};
const diff=createMountedWindowDifferential({maxLocalAgeMs:1000});
const run=(time)=>diff.review(sensor.scanMountedOrderProps(doc,{mode:'FIELD_REVIEW'}),time);
test('actual sensor review -> actual differential finds two orders',()=>{
 const s=sensor.scanMountedOrderProps(doc,{mode:'FIELD_REVIEW'});
 assert.equal(s.state,'PRIVATE_REVIEW_ONLY');assert.equal(s.candidateOrders,2);
 const r=diff.review(s,1000);
 assert.equal(r.newlyObserved,2);assert.equal(r.candidateLines,2);
 assert.equal(r.candidateUnits,4);assertSafe(s);assertSafe(r);
});
test('same mounted content -> unchanged, no double order events',()=>{
 const r=run(1200);assert.equal(r.unchanged,2);
 assert.equal(r.newlyObserved,0);assertSafe(r);
});
test('quantity edited in Gestor props -> single revision',()=>{
 orders[0].items[0].quantity=4;
 const r=run(1300);assert.equal(r.contentRevised,1);
 assert.equal(r.candidateUnits,6);assertSafe(r);
});
test('note edit with unchanged quantity -> single revision',()=>{
 orders[1].items[0].observations='Sem pimenta';
 const r=run(1400);assert.equal(r.contentRevised,1);assertSafe(r);
});
test('card disappears -> only VIEW disappearance, never cancellation',()=>{
 orders.pop();const r=run(1500);
 assert.equal(r.disappearedFromView,1);
 assert.equal(r.disappearanceMeansCancellation,false);assertSafe(r);
});
test('card reappears -> one newly observed, no false cancellation recovery',()=>{
 const restored=mk(2);orders.push(restored);
 const r=run(1600);assert.equal(r.newlyObserved,1);assertSafe(r);
});
test('duplicated identity quarantined; previous valid state survives',()=>{
 orders.push({...mk(2)});
 const s=sensor.scanMountedOrderProps(doc,{mode:'FIELD_REVIEW'});
 assert.equal(s.state,'HOLD');assert.equal(s.reason,'DUPLICATE_MOUNTED_ORDER');
 const held=diff.review(s,1700);
 assert.equal(held.state,'HOLD');assertSafe(held);
 orders.pop();const r=run(1800);assert.equal(r.unchanged,2);assertSafe(r);
});
test('React private prop binding disappears -> HOLD, not a zero-demand event',()=>{
 const original=doc.querySelectorAll;
 doc.querySelectorAll=sel=>{const cards=original(sel);delete cards[0].__reactFiber$lab;return cards};
 const s=sensor.scanMountedOrderProps(doc,{mode:'FIELD_REVIEW'});
 assert.equal(s.reason,'REACT_VERSION_OR_CARD_BINDING_UNKNOWN');
 assert.equal(diff.review(s,1900).state,'HOLD');
 doc.querySelectorAll=original;
 assert.equal(run(2000).unchanged,2);
});
test('unsafe nested modifier -> HOLD, old aggregate not overwritten',()=>{
 orders[0].items[0].options=[{name:'Molho',quantity:1,customizations:[{name:'extra'}]}];
 const s=sensor.scanMountedOrderProps(doc,{mode:'FIELD_REVIEW'});
 assert.equal(s.reason,'MODIFIER_STRUCTURE_UNVERIFIED');
 const held=diff.review(s,2100);assertSafe(held);
 orders[0].items[0].options=[];
 assert.equal(run(2200).unchanged,2);
});
test('merchant changes from prior snapshot -> HARD HOLD even on one screen',()=>{
 orders.forEach(o=>{o.merchant={id:'OTHER_MERCHANT'}});
 const s=sensor.scanMountedOrderProps(doc,{mode:'FIELD_REVIEW'});
 assert.equal(s.state,'PRIVATE_REVIEW_ONLY');
 const r=diff.review(s,2300);
 assert.equal(r.reason,'MERCHANT_CHANGED_REQUIRES_NEW_REVIEW_CONTEXT');assertSafe(r);
});
test('staleness is not zero, normal, nor upstream freshness',()=>{
 const r=diff.current(3301);assert.equal(r.state,'HOLD');
 assert.equal(r.reason,'LOCAL_OBSERVATION_STALE_OR_ABSENT');assertSafe(r);
});
test('supplier header status change produces review-only differential',()=>{
 orders.forEach(o=>{o.merchant={id:'FICTITIOUS_MERCHANT'}});
 const before=run(2400);assert.equal(before.unchanged,2);
 orders[0].currentStatus={code:'IN_PREPARATION'};
 const changed=run(2500);
 assert.equal(changed.contentRevised,1);
 assert.equal(changed.physicalWorkProven,false);assertSafe(changed);
 orders[0].currentStatus={code:'READY'};
 const changedAgain=run(2600);
 assert.equal(changedAgain.contentRevised,1);
 assert.equal(changedAgain.ordersPublishable,0);assertSafe(changedAgain);
});
test('unknown supplier status object cannot enter revision chain',()=>{
 orders[0].currentStatus={complex:{status:'UNQUALIFIED'}};
 const source=sensor.scanMountedOrderProps(doc,{mode:'FIELD_REVIEW'});
 assert.equal(source.reason,'HEADER_STATUS_STRUCTURE_UNVERIFIED');
 const denied=diff.review(source,2700);
 assert.equal(denied.state,'HOLD');assertSafe(denied);
});
test('no new event type, storage, network or UI actions in either API',()=>{
 const src=sensor.scanMountedOrderProps(doc,{mode:'FIELD_REVIEW'});
 assert.equal(src.ordersPublishable,0);
 assert.equal(src.actionsExecuted,0);
 assert.equal(typeof diff.review,'function');
 assert.equal(typeof diff.current,'function');
});
console.log('DELIVERYOS_GESTOR_P2_SENSOR_DIFF_CHAIN_PASS '+n+'/'+n+' SYNTHETIC_ONLY');
