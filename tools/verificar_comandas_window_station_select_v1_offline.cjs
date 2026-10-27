"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {projectExpectedRouting}=require("../dist/src/shadow/expectedRouting.js");
const {windowOf,selectWindowStations,planWindowReview,SCHEMA}=
 require("./comandas_window_station_select_v1_offline.cjs");
const load=f=>JSON.parse(fs.readFileSync(path.join(__dirname,"..","data",f),"utf8"));
const routing=load("odhen_product_routing_compact_v1.json");
const printers=load("runtime_printer_map_v1.json");
const calibration=load("production_printer_calibration_registry_v1.json");
const deep=structuredClone;
const context={tata_sequence:"037",teknisa_sequence:"SYNTHETIC",ifood_sequence:"9627",
 order_time:"13:42",template_version:"production-ticket-v2-shadow",ticket_items:[]};
function projection(routes=["00009","00003"],itemCode="9.15.00.075.00"){
 const src=deep(routing);src.products={...src.products,[itemCode]:routes};
 return projectExpectedRouting({ids:{pedido_interno:"SYNTHETIC"},
  items:[{item_index:0,codigo:itemCode,nome:"SYNTHETIC",quantidade:1}]},
  src,printers);
}
function evidence(day="2026-10-27",hm="13:42",category="COMBINADOS",productCode="9.15.00.075.00"){
 return {schema:"tata.comandas.window-evidence-claim.v1",
  store_id:"0001",store_unit:"01",
  timestamp_origin:"TEKNISA_ORDER_SOURCE_CLAIM",
  snapshot_sha256:"a".repeat(64),source_ref:"SYNTHETIC_NATIVE_EVENT_ONLY",
  order_local_day:day,order_local_hm:hm,
  item_roles:[{item_index:0,category,product_code:productCode,rule_ref:"SYNTHETIC_REVIEWED_RULE",
   rule_source:"REVIEWED_CATALOG_RULE_CLAIM"}]};
}
let n=0;
function test(label,fn){fn();console.log("PASS "+(++n)+" "+label);}
function review(p,e){
 const pb=JSON.stringify(p),eb=JSON.stringify(e);
 const r=selectWindowStations(p,e);
 assert.equal(JSON.stringify(p),pb,"routing projection unchanged");
 assert.equal(JSON.stringify(e),eb,"window claim unchanged");
 assert.equal(r.schema,SCHEMA);
 assert.equal(r.print_authorized,false);
 assert.equal(r.ready_for_operational_print,false);
 assert.equal(r.live_window_verified_here,false);
 assert.equal(r.first_print_event_proven,false);
 assert.equal(r.effects.print,false);
 assert.equal(r.effects.spooler_write,false);
 assert.equal(r.effects.windows_queue_change,false);
 return r;
}
const codes=r=>r.projection.items[0].targets.map(x=>x.printer_code);
function ok(p,e,expected){
 const r=review(p,e);
 assert.equal(r.status,"REVIEW_CANDIDATE_ONLY",r.reasons.join(","));
 assert.deepEqual(codes(r),expected);
 return r;
}
function hold(p,e,reason){
 const r=review(p,e);
 assert.equal(r.status,"HOLD");
 assert.ok(r.reasons.includes(reason),r.reasons.join(","));
 assert.equal(r.projection,undefined);
 return r;
}
test("weekday 11:00 lunch chooses Balcao1 only for approved combined source claim",()=>{
 ok(projection(),evidence("2026-10-27","11:00"),["00009"]);
});
test("weekday 14:59 still lunch candidate",()=>{
 ok(projection(),evidence("2026-10-27","14:59"),["00009"]);
});
test("weekday 15:00 no candidate",()=>{
 hold(projection(),evidence("2026-10-27","15:00"),"OUTSIDE_REPORTED_DELIVERY_HOURS");
});
test("weekend 16:29 lunch selects Balcao2 for rolls",()=>{
 ok(projection(["00006","00004"],"9.50.00.000.00"),
  evidence("2026-10-25","16:29","ENROLADOS","9.50.00.000.00"),["00006"]);
});
test("weekend 16:30 is outside reported lunch",()=>{
 hold(projection(),evidence("2026-10-25","16:30"),"OUTSIDE_REPORTED_DELIVERY_HOURS");
});
test("weekday 18:00 dinner chooses Delivery Sushi1 only",()=>{
 ok(projection(),evidence("2026-10-27","18:00"),["00003"]);
});
test("dinner 22:59 chooses Delivery Sushi2 only for rolls",()=>{
 ok(projection(["00006","00004"],"9.50.00.000.00"),
  evidence("2026-10-27","22:59","ENROLADOS","9.50.00.000.00"),["00004"]);
});
test("23:00 has no implied extra shift",()=>{
 hold(projection(),evidence("2026-10-27","23:00"),"OUTSIDE_REPORTED_DELIVERY_HOURS");
});
test("9:00 outside cannot silently print at lunch or dinner",()=>{
 hold(projection(),evidence("2026-10-27","09:00"),"OUTSIDE_REPORTED_DELIVERY_HOURS");
});
test("unknown date, invalid leap day and malformed native time fail closed",()=>{
 for(const [day,hm] of [["2026-02-30","13:00"],["2026-10-27","25:00"],["2026-10-27","12:90"]])
  hold(projection(),evidence(day,hm),"INVALID_OR_MISSING_LOCAL_ORDER_TIME");
});
test("native time without source reference fails closed",()=>{
 const e=evidence();e.source_ref="";
 hold(projection(),e,"NATIVE_WINDOW_SOURCE_CLAIM_MISSING");
});
test("unverified store does not inherit Itaim printer policy",()=>{
 const e=evidence();e.store_id="0002";
 hold(projection(),e,"NATIVE_WINDOW_SOURCE_CLAIM_MISSING");
});
test("no explicit per-item category does not resolve alternative by name",()=>{
 const e=evidence();e.item_roles=[];
 hold(projection(),e,"MISSING_ITEM_STATION_RULE_0");
});
test("unsupported category combination cannot direct another station",()=>{
 hold(projection(),evidence("2026-10-27","13:42","ENROLADOS"),"ITEM_ROLE_ROUTE_CONFLICT_0");
});
test("dupla exception stays hold with original location unknown",()=>{
 hold(projection(),evidence("2026-10-27","19:30","COMBINADO_DUPLA_EXCEPTION"),
  "PRODUCT_STATION_EXCEPTION_OR_UNKNOWN_0");
});
test("hot rolls retain Balcao Sushi2 in dinner, never route to Delivery Sushi2",()=>{
 ok(projection(["00006"],"9.65.00.000.00"),
  evidence("2026-10-27","19:00","ENROLADOS_QUENTES","9.65.00.000.00"),["00006"]);
});
test("hot rolls erroneously configured for both Balcao2 and Delivery2 hold",()=>{
 hold(projection(["00006","00004"],"9.65.00.000.00"),
  evidence("2026-10-27","19:00","ENROLADOS_QUENTES","9.65.00.000.00"),"HOT_ROLL_ROUTE_CONFLICT_0");
});
test("missing configured alternate at lunch cannot invent Balcao1",()=>{
 hold(projection(["00003"]),evidence(),"SERVICE_DESTINATION_NOT_CONFIGURED_0");
});
test("missing configured alternate at dinner cannot invent Delivery1",()=>{
 hold(projection(["00009"]),evidence("2026-10-27","19:00"),
  "SERVICE_DESTINATION_NOT_CONFIGURED_0");
});
test("kitchen route remains its independent destination in all services",()=>{
 const lunch=ok(projection(["00002"],"9.90.00.010.00"),
  evidence("2026-10-27","12:00","INDEPENDENT","9.90.00.010.00"),["00002"]);
 const dinner=ok(projection(["00002"],"9.90.00.010.00"),
  evidence("2026-10-27","20:00","INDEPENDENT","9.90.00.010.00"),["00002"]);
 assert.deepEqual(codes(lunch),codes(dinner));
});
test("a second independent kitchen destination survives a valid sushi suppression",()=>{
 const p=projection(["00009","00003","00002"]);
 const r=ok(p,evidence(),["00009","00002"]);
 assert.equal(r.suppressed.length,1);
});
test("other ambiguous pairs are not arbitrarily suppressed",()=>{
 const p=projection(["00006","00009"]);
 hold(p,evidence("2026-10-27","19:00","COMBINADOS"),"ITEM_ROLE_ROUTE_CONFLICT_0");
});
test("wrong source role prevents any partial sending even if one item could pass",()=>{
 const src=deep(routing);src.products={"9.15.00.075.00":["00009","00003"],
  "9.50.00.000.00":["00006","00004"]};
 const p=projectExpectedRouting({ids:{pedido_interno:"SYNTHETIC"},
  items:[{item_index:0,codigo:"9.15.00.075.00",nome:"A",quantidade:1},
  {item_index:1,codigo:"9.50.00.000.00",nome:"B",quantidade:1}]},src,printers);
 const e=evidence();hold(p,e,"MISSING_ITEM_STATION_RULE_1");
});
test("review adapter connects real planner but cannot authorize physical ticket",()=>{
 const p=projection();
 const e=evidence("2026-10-27","19:00");
 const result=planWindowReview(p,e,{...context,order_time:"19:00"},calibration);
 assert.equal(result.status,"REVIEW_CANDIDATE_ONLY");
 assert.equal(result.plan.ready_for_shadow_payload,true);
 assert.deepEqual(result.plan.print_intents.map(x=>x.printer.printer_code),["00003"]);
 assert.equal(result.plan.ready_for_physical_print,false);
 assert.equal(result.plan.print_intents[0].physical_effect_authorized,false);
 assert.equal(result.print_authorized,false);
});
test("station category is tied to the exact native product code, not its displayed name",()=>{
 const e=evidence();e.item_roles[0].product_code="9.15.00.076.00";
 hold(projection(),e,"ITEM_RULE_PRODUCT_IDENTITY_MISMATCH_0");
});
test("preview rejects a time different from the time used to select the destination",()=>{
 const output=planWindowReview(projection(),evidence("2026-10-27","13:42"),
   {...context,order_time:"19:00"},calibration);
 assert.equal(output.status,"HOLD");
 assert.ok(output.reasons.includes("PREVIEW_TIME_DIFFERS_FROM_NATIVE_ORDER_TIME"));
 assert.equal(output.plan,null);
 assert.equal(output.print_authorized,false);
});
test("historical 463-product matrix keeps 106 paired candidates without inferring categories",()=>{
 let p1=0,p2=0,other=0;
 for(const codes of Object.values(routing.products)){
  const c=new Set(codes);
  if(c.has("00009")&&c.has("00003"))p1++;
  else if(c.has("00006")&&c.has("00004"))p2++;
  else if(c.size===2)other++;
 }
 assert.equal(Object.keys(routing.products).length,463);
 assert.deepEqual([p1,p2,other],[87,19,11]);
});
console.log("COMANDAS_PRINTER_WINDOW_STATION_REVIEW_V1="+n+"/"+n+
 " WINDOW_SELECTIVE_CANDIDATES ONLY NO_QUEUE_NO_PAPER");
