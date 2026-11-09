"use strict";
/**
 * Isolated proof of a proposed pre-flight gate; not installed or integrated.
 * Uses only a pinned Git snapshot and wholly fictitious events.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {SCHEMA,PINNED_V714_BLOB,EFFECTS,
 reviewLegacyV714Scope:review}=
 require("./comandas_v714_native_scope_preflight_review_only.cjs");
const source=fs.readFileSync(path.join(__dirname,"..","runtime","shadow",
 "live_shadow_consumer_v2_candidate_v714.cjs"),"utf8");
const event=()=>({
 schema:"deliveryos.tata-reader-stable-order-event.v1",
 order_key:"0001|01|FAKESALE|FAKECMD",
 ready_for_downstream_shadow:true,
 blockers:[],service_resolution:{blockers:[]},
 order:{CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"FAKESALE",
  NRCOMANDA:"FAKECMD",IDORGCMDVENDA:"DLV_IFO",
  IDSTCOMANDA:"P",items:[]}
});
let count=0;
const test=(name,fn)=>{fn();console.log("PASS "+(++count)+" "+name);};
const check=(input=event(),src=source)=>{
 const out=review(input,src);
 assert.equal(out.schema,SCHEMA);
 assert.equal(out.status,"HOLD");
 assert.equal(out.source_event_authenticated,false);
 assert.equal(out.source_revision_complete,false);
 assert.equal(out.native_status_semantics_proven,false);
 assert.equal(out.consumer_patched_or_executed,false);
 assert.equal(out.operational_ready,false);
 assert.equal(out.print_authorized,false);
 assert.deepEqual(out.effects,EFFECTS);
 assert.ok(Object.values(out.effects).every(v=>v===false));
 assert.ok(!JSON.stringify(out).includes("FAKESALE"));
 return out;
};
test("pinned original V714 is preserved and only preflight is evaluated",()=>{
 assert.equal(PINNED_V714_BLOB,"8e75fea85437d063c2f6ee2df09ee33962d42ce6");
 assert.equal(check().reason,"EXACT_SCOPE_IS_ONLY_UNATTESTED_CANDIDATE");
 assert.equal(check().exact_itaim_ifood_scope_syntactically_matching,true);
 assert.equal(source.includes("nativeItaimIfoodScopeReasonsV1"),false);
});
test("upstream ready cannot promote unrelated native DLV source",()=>{
 const x=event();x.order.IDORGCMDVENDA="DLV_NMO";
 assert.equal(check(x).reason,"NATIVE_IFOOD_ORIGIN_NOT_EXACT");
});
test("another similar-looking DLV prefix never becomes iFood",()=>{
 const x=event();x.order.IDORGCMDVENDA="DLV_CPD";
 assert.equal(check(x).reason,"NATIVE_IFOOD_ORIGIN_NOT_EXACT");
});
test("missing native origin is denied",()=>{
 const x=event();delete x.order.IDORGCMDVENDA;
 assert.equal(check(x).reason,"NATIVE_IFOOD_ORIGIN_NOT_EXACT");
});
test("different filial remains blocked",()=>{
 const x=event();x.order.CDFILIAL="0002";
 assert.equal(check(x).reason,"ITAIM_NATIVE_SCOPE_MISMATCH");
});
test("different logical store remains blocked",()=>{
 const x=event();x.order.CDLOJA="02";
 assert.equal(check(x).reason,"ITAIM_NATIVE_SCOPE_MISMATCH");
});
test("header/order key mismatch remains blocked",()=>{
 const x=event();x.order_key="0001|01|FAKESALE|NOT_SAME";
 assert.equal(check(x).reason,"NATIVE_ORDER_KEY_NOT_BOUND_TO_HEADER");
});
test("missing order header remains blocked",()=>{
 const x=event();delete x.order;
 assert.equal(check(x).reason,"EVENT_ENVELOPE_NOT_TRUSTED");
});
test("null envelope remains blocked",()=>{
 assert.equal(check(null).reason,"EVENT_ENVELOPE_NOT_TRUSTED");
});
test("delimiter injection remains blocked",()=>{
 const x=event();x.order.NRVENDAREST="FAKE|SALE";
 x.order_key="0001|01|FAKE|SALE|FAKECMD";
 assert.equal(check(x).reason,"NATIVE_ORDER_KEY_NOT_BOUND_TO_HEADER");
});
test("native varchar10 length boundary remains enforced",()=>{
 const x=event();x.order.NRCOMANDA="12345678901";
 x.order_key="0001|01|FAKESALE|12345678901";
 assert.equal(check(x).reason,"NATIVE_ORDER_KEY_NOT_BOUND_TO_HEADER");
});
test("control characters cannot become native identity",()=>{
 const x=event();x.order.NRCOMANDA="A\nB";
 x.order_key="0001|01|FAKESALE|A\nB";
 assert.equal(check(x).reason,"NATIVE_ORDER_KEY_NOT_BOUND_TO_HEADER");
});
test("native status 3 P X remains uninterpreted and not approved",()=>{
 for(const status of ["3","P","X"]){
  const x=event();x.order.IDSTCOMANDA=status;
  const result=check(x);
  assert.equal(result.exact_itaim_ifood_scope_syntactically_matching,true);
  assert.equal(result.native_status_semantics_proven,false);
 }
});
test("changed pinned V714 bytes fail before any scope claim",()=>{
 const changed=source.replace("CANONICAL_PACKAGING_MOTOR_SOURCE_NOT_PINNED_BEFORE_EXEC",
  "CANONICAL_PACKAGING_MOTOR_SOURCE_CHANGED_BEFORE_EXEC");
 assert.notEqual(changed,source);
 assert.equal(check(event(),changed).reason,"PINNED_V714_BLOB_MISMATCH");
});
test("omitted candidate source fails closed",()=>{
 assert.equal(check(event(),"").reason,"PINNED_V714_SOURCE_UNAVAILABLE");
 assert.equal(check(event(),null).reason,"PINNED_V714_SOURCE_UNAVAILABLE");
});
test("unreviewed print flag never grants authorization",()=>{
 const x=event();x.print_authorized=true;x.effects={print:true};
 assert.equal(check(x).print_authorized,false);
 assert.equal(check(x).consumer_patched_or_executed,false);
});
if(count!==16)throw Error("V714_ORIGIN_PREFLIGHT_TEST_COUNT_DRIFT_"+count);
console.log("COMANDAS_V714_ORIGIN_PREFLIGHT="+count+"/"+count+
 " UNINSTALLED_PENDING_INTEGRATION NO_SQL NO_PRIVATE_ORDERS NO_PRINT");
