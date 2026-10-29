"use strict";
const assert=require("node:assert/strict");
const {projectScopedPreview,SCHEMA}=require("./comandas_scoped_view_preview_v1_offline.cjs");
const {fixture:unboundSourceFixture}=require("./verificar_comandas_view_source_scope_v1_offline.cjs");
const {archivedResult,archivedCompleteInput,partiallyKnownResult}=
 require("./verificar_real_order_tickets_v46.js");
const {projectOperationalTicketsV45}=
 require("../dist/src/production/operationalTicketsV45.js");
const clone=x=>structuredClone(x);
const native=archivedResult();
const original=JSON.stringify(native);
function fixture(){
 const x=unboundSourceFixture();
 const id=native.identifiers;
 assert.ok(id&&typeof id.teknisa==="string"&&typeof id.ifood==="string");
 x.native.order_key="0001|01|SYNTHETIC_SALE|"+id.teknisa;
 x.native.short_id=id.ifood;
 x.ifood.short_id=id.ifood;
 return x;
}
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
test("a self-consistent native source claim about another order blocks all preview bytes",()=>{
 const x=fixture();x.native.order_key="0001|01|SYNTHETIC_SALE|WRONG_ORDER";
 const r=run(x);
 assert.deepEqual(r.production.map(v=>v.byte_count),[0,0]);
 assert.equal(r.conference.byte_count,0);
 assert.equal(r.native_projection_identity_consistent,false);
 assert.equal(r.native_snapshot_independently_bound_to_rendered_projection,false);
 assert.ok(r.production.every(v=>v.blocking_reasons.includes(
  "NATIVE_PREVIEW_SOURCE_ORDER_IDENTITY_NOT_BOUND")));
 assert.equal(r.effects.print,false);
});
test("even a coherent fake iFood short ID cannot bind another native claim to preview",()=>{
 const x=fixture();x.native.short_id="9999";x.ifood.short_id="9999";
 const r=run(x);
 assert.deepEqual(r.production.map(v=>v.byte_count),[0,0]);
 assert.equal(r.conference.byte_count,0);
 assert.equal(r.native_projection_identity_consistent,false);
 assert.equal(r.ready_for_operational_print,false);
});
test("matching visible native order IDs remain a review, not independent snapshot proof",()=>{
 const r=run();
 assert.equal(r.native_projection_identity_consistent,true);
 assert.equal(r.native_snapshot_independently_bound_to_rendered_projection,false);
 assert.equal(r.ready_for_operational_print,false);
 assert.equal(r.effects.spooler_write,false);
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
test("real V4.5 native source with missing box allocation must HOLD both production stations",()=>{
 const f=archivedCompleteInput();
 const src=projectOperationalTicketsV45({
  order_id:f.id,source_items:f.source_items,production_plan:f.production_plan,
  resource_projection:f.resource_projection,packaging_plan:null
 });
 assert.ok(src.blocking_reasons.includes("EXACT_BAG_ALLOCATION_NOT_PROVEN"),
   "a missing packaging plan also lacks a proven external bag allocation");
 assert.equal(src.ready_for_semantic_preview,false);
 assert.equal(src.production.length,2);
 assert.equal(src.conference.ready_for_semantic_preview,false);
 assert.ok(src.conference.warnings.includes("PACKAGING_PLAN_MISSING"));
 assert.ok(src.production.every(p=>p.ready_for_semantic_preview===false));
 assert.ok(src.production.every(p=>p.warnings.some(w=>
  w.startsWith("STATION_BOX_ALLOCATION_NOT_PROVEN:"))));
 const b=run(fixture(),src);
 assert.ok(b.production.every(v=>v.byte_count===0));
 assert.equal(b.conference.byte_count,0);
});
test("matching iFood cannot override native production packaging HOLD",()=>{
 const f=archivedCompleteInput();
 const src=projectOperationalTicketsV45({
  order_id:f.id,source_items:f.source_items,production_plan:f.production_plan,
  resource_projection:f.resource_projection,packaging_plan:null
 });
 const a=run(fixture(),src),other=fixture();
 other.ifood.short_id="1234";
 const b=run(other,src);
 assert.deepEqual(a.production.map(v=>v.byte_count),[0,0]);
 assert.deepEqual(b.production.map(v=>v.byte_count),[0,0]);
 assert.equal(a.conference.byte_count,0);
 assert.equal(b.conference.byte_count,0);
});
// A missing kit or wrong bag count is a conference packing failure, not a
// native kitchen/sushi source revision failure. Preview bytes are OFFLINE ONLY.
function projectArchivedChange(change){
 const f=archivedCompleteInput();
 change(f);
 return projectOperationalTicketsV45({
  order_id:f.id,source_items:f.source_items,
  production_plan:f.production_plan,resource_projection:f.resource_projection,
  packaging_plan:f.packaging
 });
}
test("known conference-only resource gaps preserve two native production previews",()=>{
 const baseline=run();
 const changes=[
  {name:"KIT_PLAN_MISSING",modify:f=>f.resource_projection.unknowns.push("KIT_PLAN_MISSING"),
   reason:"PACKAGING_RESOURCE_EVIDENCE_INCOMPLETE"},
  {name:"EXACT_BAG_MISMATCH",modify:f=>{f.packaging.bags.exact_bag_count=2;},
   reason:"EXACT_BAG_ALLOCATION_NOT_PROVEN"},
  {name:"UNKNOWN_BAG_RESOURCE",modify:f=>f.resource_projection.unknowns.push("EXACT_BAG_COUNT_UNKNOWN"),
   reason:"PACKAGING_RESOURCE_EVIDENCE_INCOMPLETE"},
  {name:"EXTRA_INVALID_BOX",modify:f=>f.packaging.groups.push({
   box:"750",boxes:1,status:"UNKNOWN",products:[{name:"SYNTHETIC_GHOST",quantity:1}]
  }),reason:"PACKAGING_GROUP_COVERAGE_NOT_PROVEN"},
 ];
 for(const item of changes){
  const src=projectArchivedChange(item.modify);
  assert.ok(src.blocking_reasons.includes(item.reason),item.name);
  assert.equal(src.ready_for_semantic_preview,false,item.name);
  assert.ok(src.production.every(s=>s.ready_for_semantic_preview),item.name);
  assert.equal(src.conference.ready_for_semantic_preview,false,item.name);
  const preview=run(fixture(),src);
  assert.deepEqual(prodView(preview),prodView(baseline),item.name);
  assert.equal(preview.conference.byte_count,0,item.name);
  assert.equal(preview.conference.ready_for_offline_preview,false,item.name);
  assert.equal(preview.effects.print,false,item.name);
 }
});
test("native integrity remains global even alongside conference-only gap",()=>{
 const src=projectArchivedChange(f=>f.resource_projection.unknowns.push("KIT_PLAN_MISSING"));
 src.blocking_reasons.push("NATIVE_SOURCE_INVALID");
 const a=run(fixture(),src);
 assert.ok(a.production.every(s=>s.byte_count===0));
 assert.equal(a.conference.byte_count,0);
});
test("unknown reason and inconsistent readiness claims cannot bypass global veto",()=>{
 const base=projectArchivedChange(f=>f.resource_projection.unknowns.push("KIT_PLAN_MISSING"));
 const versions=[
  s=>s.blocking_reasons.push("UNCLASSIFIED_ERROR"),
  s=>{s.ready_for_semantic_preview=true;},
  s=>{s.conference.ready_for_semantic_preview=true;},
  s=>{s.production[0].ready_for_semantic_preview=false;},
  s=>{s.production=s.production.slice(0,1);},
 ];
 for(const mutation of versions){
  const src=clone(base);mutation(src);
  // A deliberate missing-station fixture cannot satisfy run()'s normal
  // two-station shape assertion. Review it directly as malformed evidence.
  const preview=src.production.length===2
    ?run(fixture(),src):projectScopedPreview(src,fixture());
  assert.ok(preview.production.every(v=>v.byte_count===0));
  assert.equal(preview.conference.byte_count,0);
 }
});
test("three-view identity mismatch still zeros all bytes with only conference packing fault",()=>{
 const src=projectArchivedChange(f=>f.resource_projection.unknowns.push("KIT_PLAN_MISSING"));
 src.production[0].identifiers.teknisa="SYNTHETIC_WRONG_ORDER";
 const preview=run(fixture(),src);
 assert.ok(preview.production.every(v=>v.byte_count===0));
 assert.equal(preview.conference.byte_count,0);
});
test("missing official iFood crosscheck still changes conference only on packing fault",()=>{
 const src=projectArchivedChange(f=>f.resource_projection.unknowns.push("KIT_PLAN_MISSING"));
 const approved=run(fixture(),src),unknown=fixture();
 delete unknown.ifood;
 const absent=run(unknown,src);
 assert.deepEqual(prodView(absent),prodView(approved));
 assert.equal(absent.conference.byte_count,0);
 assert.equal(absent.effects.print,false);
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
