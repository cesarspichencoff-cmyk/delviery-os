"use strict";
// PURE synthetic Gestor mounted-card props; no live provider or host access.
const assert=require("node:assert/strict");
const sensor=require("../../runtime/reporting/gestor_v3_visible_sensor.js");
const source="deliveryos.gestor-mounted-order-review.v1";
const make=(changes=[])=>{
  const entries=changes.length?changes:[{},{},{},{}];
  const doc={location:{hostname:"gestordepedidos.ifood.com.br"}};
  doc.querySelectorAll=sel=>{
    assert.equal(sel,'[data-testid="card"]');
    return entries.map((change,i)=>{
      const short=String(i+1).padStart(4,"0");
      const o={id:"FICT_ORDER_ID_"+short,displayId:short,
        merchant:{id:"FICT_MERCHANT"},createdAt:"2026-11-12T19:10:00-03:00",
        customer:{name:"SECRET_CUSTOMER",phone:"11999998888"},
        items:[{name:"Combinado Sushi",quantity:2,
          observations:"Sem Pimenta",options:[{name:"Wasabi",quantity:1}]}],
        ...change};
      return {innerText:"#"+o.displayId+" teste",isConnected:true,
        getClientRects(){return [{}]},parentElement:null,
        __reactFiber$fict:{memoizedProps:{},return:{
          memoizedProps:{order:o},return:null}}};
    });
  };
  return doc;
};
const check=r=>{
 assert.equal(r.schema,source);
 assert.equal(r.ordersPublishable,0);
 assert.equal(r.homePublishAuthorized,false);
 assert.equal(r.printAuthorized,false);
 assert.equal(r.merchantVerified,false);
 assert.equal(r.sourceFreshnessVerified,false);
 assert.equal(r.actionsExecuted,0);
 const dump=JSON.stringify(r);
 for(const secret of ["FICT_ORDER_ID","FICT_MERCHANT","Combinado Sushi",
  "Sem Pimenta","Wasabi","SECRET_CUSTOMER","11999998888"])
  assert.equal(dump.includes(secret),false,"LEAK");
};
let n=0;
function test(label,fn){fn();n++;console.log("PASS "+label)}
test("4 mounted cards: 4 orders, 4 lines, 8 units shadow-only",()=>{
 const r=sensor.scanMountedOrderProps(make(),{mode:"FIELD_REVIEW"});
 assert.equal(r.state,"PRIVATE_REVIEW_ONLY");check(r);
 assert.equal(r.candidateOrders,4);
 assert.equal(r.candidateLines,4);
 assert.equal(r.candidateUnits,8);
 assert.equal(r.candidateDirectNotes,4);
 assert.equal(r.candidateOptions,4);
 assert.equal(r.candidateCodes,0);
 assert.equal(r.privateCandidates.length,4);
 assert.equal(Object.keys(r).includes("privateCandidates"),false);
 assert.ok(Object.isFrozen(r.privateCandidates[0].items[0]));
});
test("fixture origin must not be mistaken for field",()=>{
 const d=make();d.location.hostname="localhost";
 const r=sensor.scanMountedOrderProps(d,{mode:"FIELD_REVIEW"});
 assert.equal(r.reason,"GESTOR_ORIGIN_NOT_QUALIFIED");check(r);
});
test("fixture mode only on local origin",()=>{
 const r=sensor.scanMountedOrderProps(make(),{mode:"FIXTURE"});
 assert.equal(r.reason,"GESTOR_ORIGIN_NOT_QUALIFIED");check(r);
});
test("duplicate short identity refused",()=>{
 const r=sensor.scanMountedOrderProps(make([{},{displayId:"0001"}]),{mode:"FIELD_REVIEW"});
 assert.equal(r.reason,"DUPLICATE_MOUNTED_ORDER");check(r);
});
test("different merchant IDs rejected, not silently merged",()=>{
 const r=sensor.scanMountedOrderProps(make([{},{merchant:{id:"OTHER"}}]),{mode:"FIELD_REVIEW"});
 assert.equal(r.reason,"MULTIPLE_MERCHANTS_IN_VIEW");check(r);
});
test("provider code optional but not treated as proven identity",()=>{
 const r=sensor.scanMountedOrderProps(make([{items:[
  {name:"Sashimi",quantity:1,externalCode:"9200001000"},
  {name:"Hot Roll",quantity:2}]}]),{mode:"FIELD_REVIEW"});
 assert.equal(r.candidateCodes,1);assert.equal(r.candidateLines,2);check(r);
});
test("invalid external code fails closed",()=>{
 const r=sensor.scanMountedOrderProps(make([{items:[{name:"Sushi",quantity:1,externalCode:"X"}]}]),{mode:"FIELD_REVIEW"});
 assert.equal(r.reason,"EXTERNAL_PRODUCT_CODE_INVALID");check(r);
});
test("item zero quantity invalid",()=>{
 const r=sensor.scanMountedOrderProps(make([{items:[{name:"Sushi",quantity:0}]}]),{mode:"FIELD_REVIEW"});
 assert.equal(r.reason,"ITEM_CONTENT_UNSAFE");check(r);
});
test("phone number in note refused",()=>{
 const r=sensor.scanMountedOrderProps(make([{items:[{name:"Sushi",quantity:1,observations:"ligar 11999998888"}]}]),{mode:"FIELD_REVIEW"});
 assert.equal(r.reason,"NOTE_CONTENT_UNSAFE");check(r);
});
test("nested customization can't disappear",()=>{
 const r=sensor.scanMountedOrderProps(make([{items:[{name:"Combo",quantity:1,options:[
  {name:"Extra",quantity:1,customizations:[{name:"Special"}]}]}]}]),{mode:"FIELD_REVIEW"});
 assert.equal(r.reason,"MODIFIER_STRUCTURE_UNVERIFIED");check(r);
});
test("empty DOM does not establish zero demand",()=>{
 const d=make();d.querySelectorAll=()=>[];
 const r=sensor.scanMountedOrderProps(d,{mode:"FIELD_REVIEW"});
 assert.equal(r.reason,"MOUNTED_CARD_COVERAGE_UNKNOWN");check(r);
});
test("React private key drift fails closed",()=>{
 const d=make(),orig=d.querySelectorAll;
 d.querySelectorAll=sel=>{const cards=orig(sel);delete cards[0].__reactFiber$fict;return cards};
 const r=sensor.scanMountedOrderProps(d,{mode:"FIELD_REVIEW"});
 assert.equal(r.reason,"REACT_VERSION_OR_CARD_BINDING_UNKNOWN");check(r);
});
test("test order cannot be considered operational",()=>{
 const r=sensor.scanMountedOrderProps(make([{isTest:true}]),{mode:"FIELD_REVIEW"});
 assert.equal(r.reason,"TEST_ORDER_NOT_OPERATIONAL");check(r);
});
test("opaque provider header status remains PRIVATE and untrusted",()=>{
 const r=sensor.scanMountedOrderProps(make([{currentStatus:{code:"IN_PREPARATION"}}]),{mode:"FIELD_REVIEW"});
 assert.equal(r.state,"PRIVATE_REVIEW_ONLY");
 assert.equal(r.privateCandidates[0].statusClaim,"IN_PREPARATION");
 assert.equal(JSON.stringify(r).includes("IN_PREPARATION"),false);
 assert.equal(r.statusSemanticsProven,false);check(r);
});
test("unsupported provider status object fails closed",()=>{
 const r=sensor.scanMountedOrderProps(make([{currentStatus:{nested:["UNKNOWN"]}}]),{mode:"FIELD_REVIEW"});
 assert.equal(r.reason,"HEADER_STATUS_STRUCTURE_UNVERIFIED");check(r);
});
test("existing DOM scan/watch contracts retained",()=>{
 assert.equal(typeof sensor.scan,"function");
 assert.equal(typeof sensor.watch,"function");
 assert.equal(sensor.SCHEMA,"deliveryos.gestor-visible-facts-review.v3");
});
console.log("GESTOR_MOUNTED_PROPS_SHADOW_PASS "+n+"/"+n+" NO_LIVE_SOURCE");
