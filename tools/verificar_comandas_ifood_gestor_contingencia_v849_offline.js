"use strict";
const assert=require("node:assert/strict");
const {assessGestorTeknisaContingency,NO_EFFECTS,SCHEMA}=
 require("./comandas_ifood_gestor_contingencia_v849_offline.cjs");
const uuid="00000000-0000-4000-8000-000000000049";
const clone=x=>JSON.parse(JSON.stringify(x));
const g={
 schema:"deliveryos.ifood-gestor-observation.v1",
 store_id:"STORE_TEST",order_uuid:uuid,display_id:"4321",
 status:"CONFIRMED",snapshot_complete:true,paper_claimed:false,
 items:[
  {name:"COMBINADO TESTE",quantity:1,observations:["SEM CEBOLA"]},
  {name:"BEBIDA TESTE",quantity:2,observations:[]},
  {name:"COMBINADO TESTE",quantity:1,observations:["SEM MOLHO"]}
 ]
};
const t={
 schema:"deliveryos.teknisa-order-observation.v1",
 store_id:"STORE_TEST",ifood_order_uuid:uuid,ifood_display_id:"4321",
 order_key:"0001|01|000001|000001",snapshot_complete:true,paper_claimed:false,
 items:clone(g.items)
};
let count=0;
function test(title,fn){fn();count++;console.log("PASS "+count+" "+title);}
function run(gg=g,tt=t){
 const out=assessGestorTeknisaContingency({gestor:gg,teknisa:tt});
 assert.equal(out.schema,SCHEMA);
 assert.deepEqual(out.effects,NO_EFFECTS);
 assert.equal(out.can_reprint,false);
 assert.equal(out.can_activate_gestor_auto_print,false);
 assert.equal(out.can_confirm,false);
 assert.equal(out.can_dispatch,false);
 assert.equal(out.physical_paper_proven,false);
 assert.equal(out.needs_operator_reconciliation,true);
 assert.ok(!JSON.stringify(out).includes(uuid));
 assert.ok(!JSON.stringify(out).includes("4321"));
 assert.ok(!JSON.stringify(out).includes("CEBOLA"));
 return out;
}
test("exact full uuid and composition = review candidate, never print",()=>{
 const a=run();assert.equal(a.status,"MATCH_CANDIDATE_HOLD");
 assert.equal(a.matched_full_uuid,true);
 assert.equal(a.items_equal,true);assert.equal(a.observations_equal,true);
});
test("different arrival item order = same multiset",()=>{
 const b=clone(t);b.items.reverse();const a=run(g,b);
 assert.equal(a.status,"MATCH_CANDIDATE_HOLD");
});
test("same name two rows preserved by multiplicity",()=>{
 const b=clone(t);b.items.pop();const a=run(g,b);
 assert.deepEqual(a.reasons,["ITEMS_OR_QUANTITIES_DIFFER_REVIEW_SOURCE_MAPPINGS"]);
});
test("different quantity blocks",()=>{
 const b=clone(t);b.items[0].quantity=2;
 assert.equal(run(g,b).items_equal,false);
});
test("different item name blocks",()=>{
 const b=clone(t);b.items[0].name="PRODUTO DIFERENTE";
 assert.equal(run(g,b).items_equal,false);
});
test("missing notes blocks",()=>{
 const b=clone(t);b.items[0].observations=[];
 const a=run(g,b);assert.equal(a.items_equal,true);
 assert.equal(a.observations_equal,false);
});
test("different notes scope blocks",()=>{
 const b=clone(t);b.items[0].observations=["COM MOLHO"];
 assert.equal(run(g,b).priority,"CRITICAL");
});
test("short ID alone cannot prove full uuid",()=>{
 const b=clone(t);b.ifood_order_uuid=null;
 assert.ok(run(g,b).reasons.includes("SHORT_ID_IS_NOT_UNIQUE_ORDER_ID"));
});
test("Gestor uuid absent cannot prove full uuid",()=>{
 const b=clone(g);b.order_uuid=null;
 assert.ok(run(b,t).reasons.includes("FULL_IFOOD_UUID_JOIN_NOT_PROVEN"));
});
test("uuid contradiction blocks despite short ID",()=>{
 const b=clone(t);b.ifood_order_uuid="00000000-0000-4000-8000-000000000050";
 assert.deepEqual(run(g,b).reasons,["FULL_IFOOD_UUID_MISMATCH"]);
});
test("short ID contradiction blocks",()=>{
 const b=clone(t);b.ifood_display_id="4322";
 assert.deepEqual(run(g,b).reasons,["SHORT_DISPLAY_ID_MISMATCH"]);
});
test("cross-store contradiction blocks",()=>{
 const b=clone(t);b.store_id="OTHER_STORE";
 assert.deepEqual(run(g,b).reasons,["STORE_IDENTITY_MISMATCH"]);
});
test("Gestor visible, Tek not observed = alert not fact of lost order",()=>{
 const a=run(g,null);assert.equal(a.priority,"CRITICAL");
 assert.ok(a.reasons.includes("GESTOR_PRESENT_TEK_NOT_OBSERVED_IN_PROVIDED_CAPTURE"));
});
test("Tek visible, Gestor not observed = alert not fact of lost order",()=>{
 const a=run(null,t);assert.equal(a.priority,"CRITICAL");
 assert.ok(a.reasons.includes("TEKNISA_PRESENT_GESTOR_NOT_OBSERVED_IN_PROVIDED_CAPTURE"));
});
test("neither source observed => HOLD",()=>{
 assert.deepEqual(run(null,null).reasons,["BOTH_SOURCES_UNOBSERVED"]);
});
test("unconfirmed order is not prepared just from a placed event",()=>{
 const b=clone(g);b.status="PLACED";
 assert.ok(run(b,t).reasons.includes("IFOOD_NOT_CONFIRMED_DO_NOT_ASSUMED_PRODUCTION_READY"));
});
test("cancelled order blocks production regardless of Tek",()=>{
 const b=clone(g);b.status="CANCELLED";
 assert.deepEqual(run(b,t).reasons,["IFOOD_CANCELLED_NO_PREPARATION_OR_REPRINT"]);
});
test("concluded order not assumed newly ready",()=>{
 const b=clone(g);b.status="CONCLUDED";
 assert.ok(run(b,t).reasons.includes("IFOOD_ORDER_STATUS_NOT_READY_FOR_PREPARATION_REVIEW"));
});
test("double print claims do not become paper proof",()=>{
 const a=clone(g),b=clone(t);a.paper_claimed=true;b.paper_claimed=true;
 const r=run(a,b);assert.equal(r.priority,"CRITICAL");
 assert.equal(r.physical_paper_proven,false);
 assert.ok(r.reasons.includes("TWO_CHANNEL_PAPER_CLAIMS_REQUIRE_PHYSICAL_DUPLICATE_REVIEW"));
});
test("single claimed print does not certify delivery",()=>{
 const a=clone(g);a.paper_claimed=true;
 const r=run(a,t);assert.equal(r.physical_paper_proven,false);
 assert.equal(r.can_reprint,false);
});
test("malformed items fail closed",()=>{
 const a=clone(g);a.items[0].quantity=0;
 assert.deepEqual(run(a,t).reasons,["GESTOR_SNAPSHOT_INVALID_OR_INCOMPLETE"]);
});
test("malformed Tek snapshot fails closed",()=>{
 const b=clone(t);b.order_key="invalid";
 assert.deepEqual(run(g,b).reasons,["TEKNISA_SNAPSHOT_INVALID_OR_INCOMPLETE"]);
});
test("missing observation array fails closed rather than implying none",()=>{
 const b=clone(t);delete b.items[0].observations;
 assert.deepEqual(run(g,b).reasons,["TEKNISA_SNAPSHOT_INVALID_OR_INCOMPLETE"]);
});
test("incomplete source blocks",()=>{
 const a=clone(g);a.snapshot_complete=false;
 assert.deepEqual(run(a,t).reasons,["GESTOR_SNAPSHOT_INVALID_OR_INCOMPLETE"]);
});
test("both paper claims never authorize automatic retry",()=>{
 const a=clone(g),b=clone(t);a.paper_claimed=true;b.paper_claimed=true;
 assert.equal(run(a,b).effects.automatic_reprint,false);
});
test("output never contains raw item names, note text or order key",()=>{
 const r=run();const s=JSON.stringify(r);
 for(const raw of ["COMBINADO TESTE","BEBIDA TESTE","SEM MOLHO",t.order_key])
  assert.equal(s.includes(raw),false);
});
console.log("COMANDAS_IFOOD_GESTOR_V849="+count+"/"+count+
 " OFFLINE_REVIEW_ONLY NO_API NO_PRINT NO_ACK NO_DISPATCH");
