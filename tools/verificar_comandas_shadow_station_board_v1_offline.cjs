"use strict";
const assert=require("node:assert/strict");
const {
 SCHEMA,CODES,EXPECTED_EFFECTS,buildBoardFromBoundReview:board
}=require("./comandas_shadow_station_board_v1_offline.cjs");
function valid(){
 return {
  status:"REVIEW_CANDIDATE_ONLY",
  native_projection_claim_bound:true,
  native_pair_self_consistency_checked:true,
  independent_native_source_attested:false,
  ready_for_operational_print:false,print_authorized:false,
  effects:{...EXPECTED_EFFECTS},
  selected:[{item_index:0,printer_code:"00009"},
   {item_index:1,printer_code:"00002"}],
  suppressed:[{item_index:0,printer_code:"00003",
   reason:"ALTERNATE_STATION_NOT_IN_ORDER_WINDOW"}],
  plan:{schema:"deliveryos.production-print-plan.v1",
   ready_for_shadow_payload:true,ready_for_physical_print:false,
   blocking_reasons:[],no_own_production_ticket_items:[],
   effects:{print:false,spooler_write:false,odhen_write:false,
    fiscal_action:false,cutover:false},
   print_intents:[
    {printer:{printer_code:"00009"},physical_effect_authorized:false,
     lines:[{item_index:0,quantity:2,product_name:"SECRET_ITEM"}]},
    {printer:{printer_code:"00002"},physical_effect_authorized:false,
     lines:[{item_index:1,quantity:1,product_name:"SECRET_ITEM_2"}]}
   ]}
 };
}
let n=0;
function test(label,fn){fn();console.log("PASS "+(++n)+" "+label);}
function run(x,status,reason){
 const before=JSON.stringify(x),v=board(x);
 assert.equal(JSON.stringify(x),before,"source mutated");
 assert.equal(v.schema,SCHEMA);assert.equal(v.status,status);
 if(reason)assert.equal(v.reason,reason);
 assert.deepEqual(v.effects,EXPECTED_EFFECTS);
 for(const k of ["source_pair_independently_attested",
  "reader_live_runtime_attested","physical_station_route_attested",
  "physical_ticket_proven","station_actions_enabled",
  "order_ready_for_production","print_authorized"])
  assert.equal(v[k],false,k);
 assert.equal(v.cashier_panel.ready,false);
 assert.equal(v.cashier_panel.source,"IFOOD_CONFERENCE_ONLY");
 assert.ok(!JSON.stringify(v).includes("SECRET_ITEM"));
 return v;
}
test("two isolated prep station previews plus independent cashier HOLD",()=>{
 const x=valid(),v=run(x,"SHADOW_BOARD_REVIEW_ONLY");
 assert.deepEqual(v.station_panels.map(p=>p.station),["COZINHA","SUSHI_1"]);
 assert.deepEqual(v.station_panels.map(p=>p.units),[1,2]);
 assert.equal(v.production_panel_count,2);
 assert.equal(v.cashier_panel.state,"INDEPENDENT_IFOOD_CHECK_NOT_ATTESTED");
});
const change=(name,fn,status,reason)=>test(name,()=>{
 const x=valid();fn(x);const y=run(x,status,reason);
 if(status==="HOLD")assert.equal(y.station_panels.length,0);
});
change("upstream HOLD blocks all lanes",x=>x.status="HOLD","HOLD",
 "UPSTREAM_BOUND_REVIEW_NOT_ESTABLISHED");
change("native pair consistency missing",x=>x.native_pair_self_consistency_checked=false,
 "HOLD","UPSTREAM_BOUND_REVIEW_NOT_ESTABLISHED");
change("unbound native snapshot not presented as board",x=>x.native_projection_claim_bound=false,
 "HOLD","UPSTREAM_BOUND_REVIEW_NOT_ESTABLISHED");
change("self-declared independent source is not accepted",x=>x.independent_native_source_attested=true,
 "HOLD","UPSTREAM_BOUND_REVIEW_NOT_ESTABLISHED");
change("print allowed anywhere blocks",x=>x.effects.print=true,
 "HOLD","UPSTREAM_BOUND_REVIEW_NOT_ESTABLISHED");
change("plan print physically ready blocks",x=>x.plan.ready_for_physical_print=true,
 "HOLD","PRODUCTION_PLAN_NOT_BOUNDED_OR_NOT_NO_EFFECT");
change("shadow item blocker suppresses partial board",x=>x.plan.blocking_reasons.push("BAG_UNKNOWN"),
 "HOLD","SHADOW_TICKET_CONTENT_STILL_BLOCKED");
change("shadow not ready blocks",x=>x.plan.ready_for_shadow_payload=false,
 "HOLD","SHADOW_TICKET_CONTENT_STILL_BLOCKED");
change("no station selection blocked",x=>x.selected=[],
 "HOLD","NO_BOUNDED_STATION_SELECTION");
change("unknown printer code blocked",x=>x.selected[0].printer_code="99999",
 "HOLD","UNKNOWN_OR_UNSAFE_STATION");
change("duplicate item for same station blocked",x=>x.selected.push({...x.selected[0]}),
 "HOLD","DUPLICATE_ITEM_IN_STATION");
change("lunch and dinner physical stations cannot merge",x=>x.selected.push({item_index:0,printer_code:"00003"}),
 "HOLD","ALTERNATE_STATION_CODES_IN_ONE_REVISION");
change("unselected station intent blocked",x=>x.plan.print_intents[0].printer.printer_code="00003",
 "HOLD","PRINT_INTENT_NOT_SELECTED_FOR_WINDOW");
change("wrong index cannot inherit another item's work",x=>x.plan.print_intents[0].lines[0].item_index=1,
 "HOLD","PRINT_INTENT_DOES_NOT_MATCH_STATION_SELECTION");
change("missing item line blocked",x=>x.plan.print_intents.pop(),
 "HOLD","MISSING_STATION_ITEM_COVERAGE");
change("duplicate intent station blocked",x=>x.plan.print_intents.push({...x.plan.print_intents[0]}),
 "HOLD","PRINT_INTENT_STATION_SHAPE_INVALID");
change("zero quantity blocked",x=>x.plan.print_intents[0].lines[0].quantity=0,
 "HOLD","PRINT_INTENT_ITEM_INVALID");
change("explicit physical action blocks",x=>x.plan.print_intents[1].physical_effect_authorized=true,
 "HOLD","PRINT_INTENT_STATION_SHAPE_INVALID");
change("plan missing print no-effect blocks",x=>x.plan.effects.print=true,
 "HOLD","PRODUCTION_PLAN_NOT_BOUNDED_OR_NOT_NO_EFFECT");
change("missing selected item blocks",x=>x.selected.pop(),
 "HOLD","PRINT_INTENT_NOT_SELECTED_FOR_WINDOW");
change("no cashier iFood proof is invented",x=>x.plan.no_own_production_ticket_items.push({item_index:2}),
 "SHADOW_BOARD_REVIEW_ONLY");
test("null, arrays and empty objects hold safely",()=>{
 for(const x of [null,[],{},false])run(x,"HOLD",
  "UPSTREAM_BOUND_REVIEW_NOT_ESTABLISHED");
});
test("only six configured production codes are recognized",()=>{
 assert.deepEqual(Object.keys(CODES).sort(),["00002","00003","00004","00006","00007","00009"]);
});
console.log("COMANDAS_SHADOW_STATION_BOARD="+n+"/"+n+
 " READ_ONLY NO_ORDERS NO_PII NO_PRINT NO_CASHIER_MATCH");
