"use strict";
const assert=require("node:assert/strict");
const {projectScopedPreview,SCHEMA}=require("./comandas_scoped_view_preview_v1_offline.cjs");
const {fixture}=require("./verificar_comandas_view_source_scope_v1_offline.cjs");
const {archivedResult,archivedCompleteInput,partiallyKnownResult}=
 require("./verificar_real_order_tickets_v46.js");
const {projectOperationalTicketsV45}=
 require("../dist/src/production/operationalTicketsV45.js");
const clone=x=>structuredClone(x);
const native=archivedResult();
const original=JSON.stringify(native);
let n=0;
function test(label,fn){fn();n++;console.log("PASS "+n+" "+label);}
function run(claims=fixture(),src=native){
 const before=JSON.stringify(src),inputBefore=JSON.stringify(claims);
 const r=projectScopedPreview(src,claims);
 assert.equal(JSON.stringify(src),before,"native projection must not mutate");
 assert.equal(JSON.stringify(claims),inputBefore,"crosscheck input must not mutate");
 assert.equal(r.schema,SCHEMA);
 assert.equal(r.production.length,2);
 assert.equal(r.effects.print,false);
 assert.equal(r.effects.ifood_request,false);
 assert.equal(r.effects.spooler_write,false);
 assert.equal(r.effects.sequence_write,false);
 assert.equal(r.ready_for_operational_print,false);
 for(const v of [...r.production,r.conference]){
  assert.equal(v.ready_for_operational_print,false);
  assert.equal(v.byte_count,v.bytes.length);
 }
 return r;
}
const prodView=r=>r.production.map(v=>({
 ready:v.ready_for_offline_preview,bytes:v.bytes,blocking_reasons:v.blocking_reasons
}));
test("two native-only production previews + one crosschecked conference",()=>{
 const r=run();
 assert.ok(r.production.every(v=>v.ready_for_offline_preview&&v.byte_count>0));
 assert.equal(r.conference.ready_for_offline_preview,true);
 assert.ok(r.conference.byte_count>0);
});
test("absence of official iFood source removes only conference preview bytes",()=>{
 const a=run(),claims=fixture();delete claims.ifood;
 const b=run(claims);
 assert.deepEqual(prodView(b),prodView(a));
 assert.equal(b.conference.byte_count,0);
 assert.ok(b.conference.blocking_reasons.includes("CONFERENCE_INDEPENDENT_IFOOD_CROSSCHECK_HOLD"));
});
test("conflicting official iFood short ID cannot revoke native kitchen/sushi preview",()=>{
 const a=run(),claims=fixture();claims.ifood.short_id="1234";
 const b=run(claims);
 assert.deepEqual(prodView(b),prodView(a));
 assert.equal(b.conference.ready_for_offline_preview,false);
 assert.equal(b.conference.byte_count,0);
});
test("wrong external store or date must hold conference independently",()=>{
 const baseline=run();
 for(const change of [{store_id:"9999"},{operational_date:"2026-10-25"}]){
  const claims=fixture();Object.assign(claims.ifood,change);
  const b=run(claims);
  assert.deepEqual(prodView(b),prodView(baseline));
  assert.equal(b.conference.byte_count,0);
 }
});
test("native source revision invalidation blocks ALL three views, unlike iFood mismatch",()=>{
 const claims=fixture();claims.views[1].native_snapshot_sha256="f".repeat(64);
 const b=run(claims);
 assert.ok(b.production.every(v=>v.byte_count===0));
 assert.equal(b.conference.byte_count,0);
});
test("global renderer native-source veto remains intact and cannot be bypassed by iFood match",()=>{
 const src=clone(native);src.blocking_reasons.push("NATIVE_SOURCE_INVALID");
 const b=run(fixture(),src);
 assert.ok(b.production.every(v=>v.byte_count===0));
 assert.equal(b.conference.byte_count,0);
});
test("native three-view order mismatch remains a global integrity hold",()=>{
 const src=clone(native);src.production[0].identifiers.teknisa="ALTERED";
 const b=run(fixture(),src);
 assert.ok(b.production.every(v=>v.byte_count===0));
 assert.equal(b.conference.byte_count,0);
});
test("incomplete native projection with zero production routes cannot be invented by iFood",()=>{
 const src=partiallyKnownResult(),before=JSON.stringify(src);
 const b=projectScopedPreview(src,fixture());
 assert.equal(JSON.stringify(src),before);
 assert.equal(b.production.length,0,"renderer must not invent missing production routes");
 assert.equal(b.conference.byte_count,0);
 assert.equal(b.conference.ready_for_operational_print,false);
 assert.equal(b.effects.print,false);
});
test("actual V4.5 archived projection with missing conference packaging retains two safe native previews",()=>{
 const f=archivedCompleteInput();
 const src=projectOperationalTicketsV45({
  order_id:f.id,source_items:f.source_items,production_plan:f.production_plan,
  resource_projection:f.resource_projection,packaging_plan:null
 });
 assert.deepEqual(src.blocking_reasons,[]);
 assert.equal(src.ready_for_semantic_preview,false);
 assert.equal(src.conference.ready_for_semantic_preview,false);
 assert.equal(src.production.length,2);
 assert.ok(src.production.every(p=>p.ready_for_semantic_preview===true));
 assert.ok(src.conference.warnings.includes("PACKAGING_PLAN_MISSING"));
 const b=run(fixture(),src);
 assert.ok(b.production.every(v=>v.ready_for_offline_preview&&v.byte_count>0),
  "kitchen/sushi preview remains native-only despite cashier packaging gap");
 assert.equal(b.conference.byte_count,0);
 assert.ok(b.conference.blocking_reasons.includes("CONFERENCE_NATIVE_PACKAGING_HOLD"));
});
test("missing packaging plus absent iFood keeps native production bytes, holds cashier",()=>{
 const f=archivedCompleteInput();
 const src=projectOperationalTicketsV45({
  order_id:f.id,source_items:f.source_items,production_plan:f.production_plan,
  resource_projection:f.resource_projection,packaging_plan:null
 });
 const original=run(fixture(),src),claim=fixture();delete claim.ifood;
 const missing=run(claim,src);
 assert.deepEqual(prodView(missing),prodView(original));
 assert.equal(missing.conference.byte_count,0);
});
test("missing cashier packaging never overrides a global native source failure",()=>{
 const f=archivedCompleteInput();
 const src=projectOperationalTicketsV45({
  order_id:f.id,source_items:f.source_items,production_plan:f.production_plan,
  resource_projection:f.resource_projection,packaging_plan:null
 });
 src.blocking_reasons.push("NATIVE_SOURCE_INVALID");
 const v=run(fixture(),src);
 assert.ok(v.production.every(p=>p.byte_count===0));
 assert.equal(v.conference.byte_count,0);
});
test("missing cashier packaging never bypasses native three-view mismatch",()=>{
 const f=archivedCompleteInput();
 const src=projectOperationalTicketsV45({
  order_id:f.id,source_items:f.source_items,production_plan:f.production_plan,
  resource_projection:f.resource_projection,packaging_plan:null
 });
 src.production[0].identifiers.teknisa="FORGED";
 const v=run(fixture(),src);
 assert.ok(v.production.every(p=>p.byte_count===0));
 assert.equal(v.conference.byte_count,0);
});
test("native production ticket local HOLD blocks source even if cashier packaging is unknown",()=>{
 const f=archivedCompleteInput();
 const src=projectOperationalTicketsV45({
  order_id:f.id,source_items:f.source_items,production_plan:f.production_plan,
  resource_projection:f.resource_projection,packaging_plan:null
 });
 src.production[0].ready_for_semantic_preview=false;
 const v=run(fixture(),src);
 assert.ok(v.production.every(p=>p.byte_count===0));
 assert.equal(v.conference.byte_count,0);
});
test("source review cannot inject modified external iFood number into native ticket identifiers",()=>{
 const claims=fixture();claims.ifood.short_id="0999";
 const b=run(claims);
 assert.deepEqual(b.production.map(v=>v.byte_count),
   run().production.map(v=>v.byte_count));
 assert.equal(JSON.stringify(native),original);
});
console.log("COMANDAS_SCOPED_V46_PREVIEW_V1="+n+"/"+n+
 " 2_NATIVE_PRODUCTION 1_IFOOD_CROSSCHECK_CONFERENCE NO_OPERATIONAL_PRINT");
