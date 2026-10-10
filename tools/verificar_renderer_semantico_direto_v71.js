"use strict";
const assert=require("node:assert/strict");
const {archivedResult,archivedCompleteInput}=
 require("./verificar_real_order_tickets_v46.js");
const {projectOperationalTicketsV45}=
 require("../dist/src/production/operationalTicketsV45.js");
const {renderProductionTicketProofV46,renderConferenceTicketProofV46,
 renderOperationalTicketsProofV46}=
 require("../dist/src/production/operationalTicketEscposV46.js");
let n=0;
function test(label,f){f();n++;console.log("PASS "+n+" "+label)}
const fixture=()=>structuredClone(archivedResult());
function denied(p,reason){
 assert.equal(p.ready_for_offline_preview,false);
 assert.equal(p.ready_for_operational_print,false);
 assert.deepEqual(p.bytes,[]);
 assert.equal(p.byte_count,0);
 assert.ok(p.blocking_reasons.includes(reason),JSON.stringify(p.blocking_reasons));
 assert.equal(p.effects.print,false);
 assert.equal(p.effects.spooler_write,false);
 assert.equal(p.effects.odhen_write,false);
 assert.equal(p.effects.cut,false);
}
const clean=p=>{assert.equal(p.ready_for_offline_preview,true,p.blocking_reasons.join(","));
 assert.ok(p.byte_count>0);assert.equal(p.bytes.length,p.byte_count);};
test("01 archived known good stays 340/538/849 bytes",()=>{
 const all=renderOperationalTicketsProofV46(fixture());
 assert.deepEqual([...all.production,all.conference].map(p=>p.byte_count),[340,538,849]);
 [...all.production,all.conference].forEach(clean);
});
test("02 direct production call blocks local semantic false",()=>{
 const f=fixture(),p=f.production[0];
 p.ready_for_semantic_preview=false;p.warnings.push("SYNTHETIC_ITEM_MISMATCH");
 const output=renderProductionTicketProofV46(p);
 denied(output,"STATION_SEMANTIC_NOT_READY");
 assert.ok(output.text_trace.includes("TESTE - NAO PRODUZIR"));
});
test("03 direct conference call blocks local semantic false",()=>{
 const f=fixture();f.conference.ready_for_semantic_preview=false;
 const output=renderConferenceTicketProofV46(f.conference);
 denied(output,"CONFERENCE_SEMANTIC_NOT_READY");
 assert.ok(output.text_trace.includes("CONFERENCIA"));
});
test("04 aggregate false vetoes all outputs even when local flags true",()=>{
 const f=fixture();f.ready_for_semantic_preview=false;
 assert.ok(f.production.every(x=>x.ready_for_semantic_preview));
 const r=renderOperationalTicketsProofV46(f);
 [...r.production,r.conference].forEach(p=>denied(p,"GLOBAL_SOURCE_SEMANTIC_BLOCKED"));
});
test("05 contradictory reason with ready:true still vetoes all bytes",()=>{
 const f=fixture();f.blocking_reasons.push("SOLD_ITEM_MISMATCH:TEST");
 assert.equal(f.ready_for_semantic_preview,true);
 const r=renderOperationalTicketsProofV46(f);
 [...r.production,r.conference].forEach(p=>denied(p,"GLOBAL_SOURCE_SEMANTIC_BLOCKED"));
});
test("06 real projector source mismatch propagates to direct renderer",()=>{
 const f=archivedCompleteInput();
 f.source_items[0].quantity+=1;
 const t=projectOperationalTicketsV45({order_id:f.id,source_items:f.source_items,
  production_plan:f.production_plan,resource_projection:f.resource_projection,
  packaging_plan:f.packaging});
 assert.equal(t.ready_for_semantic_preview,false);
 assert.ok(t.blocking_reasons.some(x=>x.startsWith("SOLD_ITEM_MISMATCH")));
 const out=renderOperationalTicketsProofV46(t);
 [...out.production,out.conference].forEach(p=>denied(p,"GLOBAL_SOURCE_SEMANTIC_BLOCKED"));
});
test("07 aggregate reason array absent fails closed",()=>{
 const f=fixture();delete f.blocking_reasons;
 const r=renderOperationalTicketsProofV46(f);
 [...r.production,r.conference].forEach(p=>denied(p,"GLOBAL_SOURCE_SEMANTIC_BLOCKED"));
});
test("08 direct local false is not silently upgraded by aggregate true",()=>{
 const f=fixture();f.production[1].ready_for_semantic_preview=false;
 const r=renderOperationalTicketsProofV46(f);
 clean(r.production[0]);denied(r.production[1],"STATION_SEMANTIC_NOT_READY");
 clean(r.conference);
});
test("09 direct conference false is not silently upgraded by aggregate true",()=>{
 const f=fixture();f.conference.ready_for_semantic_preview=false;
 const r=renderOperationalTicketsProofV46(f);
 r.production.forEach(clean);denied(r.conference,"CONFERENCE_SEMANTIC_NOT_READY");
});
test("10 immutable source and diagnostics preserved",()=>{
 const f=fixture(),snapshot=structuredClone(f);
 f.ready_for_semantic_preview=false;
 const before=structuredClone(f);
 const r=renderOperationalTicketsProofV46(f);
 assert.deepEqual(f,before);assert.equal(snapshot.ready_for_semantic_preview,true);
 assert.ok(r.production.every(p=>p.text_trace.length>10));
});
test("11 blocking reason list never gets duplicated on two passes",()=>{
 const p=renderProductionTicketProofV46({...fixture().production[0],ready_for_semantic_preview:false});
 assert.equal(p.blocking_reasons.filter(x=>x==="STATION_SEMANTIC_NOT_READY").length,1);
});
test("12 return effects permanently false",()=>{
 const f=fixture();f.blocking_reasons=["ADVERSARIAL"];
 const r=renderOperationalTicketsProofV46(f);
 assert.deepEqual(r.effects,{print:false,spooler_write:false,odhen_write:false,cut:false});
});
console.log("THERMAL_DIRECT_RENDERER_SEMANTIC_V71="+n+"/12 NO_PRINT_NO_SPOOLER");
