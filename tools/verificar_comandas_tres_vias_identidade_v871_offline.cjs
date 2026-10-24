"use strict";
/** V8.71 — evidence-only cross-view guard. HISTORICAL isolated replay.
 * Never claims real Reader revision, persisted TATA binding or print rights.
 */
const assert=require("node:assert/strict");
const {archivedResult,partiallyKnownResult}=
 require("./verificar_real_order_tickets_v46.js");
const {renderOperationalTicketsProofV46}=
 require("../dist/src/production/operationalTicketEscposV46.js");

let checks=0;
const assertNoEffects=result=>{
 assert.ok(Object.values(result.effects).every(v=>v===false));
 for(const item of [...result.production,result.conference])
  assert.equal(item.ready_for_operational_print,false);
};
function test(label,callback){
 callback();checks++;console.log("PASS "+checks+" "+label);
}
const source=archivedResult();
const original=JSON.stringify(source);
const render=()=>renderOperationalTicketsProofV46(structuredClone(source));
const baseline=render();
const views=[...baseline.production,baseline.conference];
test("archived isolated sample projects exactly two production and one conference",()=>{
 assert.equal(baseline.production.length,2);
 assert.equal(views.length,3);
});
test("all three previews contain bounded bytes with no blockers",()=>{
 for(const v of views){
  assert.equal(v.ready_for_offline_preview,true);
  assert.equal(v.blocking_reasons.length,0);
  assert.ok(v.byte_count>0);
  assert.equal(v.byte_count,v.bytes.length);
 }
});
test("all three views refer to one source identifier tuple",()=>{
 const same=source.conference.identifiers;
 assert.ok(same);
 for(const view of source.production)
  assert.deepEqual(view.identifiers,same);
});
test("baseline renderer advertises zero operational effects",()=>{
 assertNoEffects(baseline);
});
test("baseline does not mutate any source field or observation",()=>{
 assert.equal(JSON.stringify(source),original);
});
function mustBlock(label,edit,reason){
 test(label,()=>{
  const mutated=structuredClone(source);
  edit(mutated);
  const before=JSON.stringify(mutated);
  const output=renderOperationalTicketsProofV46(mutated);
  assert.equal(JSON.stringify(mutated),before,"render must not mutate source");
  assert.equal(output.production.length,mutated.production.length);
  for(const view of [...output.production,output.conference]){
   assert.equal(view.ready_for_offline_preview,false);
   assert.equal(view.byte_count,0);
   assert.deepEqual(view.bytes,[]);
   assert.ok(view.blocking_reasons.includes(reason),view.name);
  }
  assertNoEffects(output);
 });
}
mustBlock("mismatched TATA number in only the kitchen via",
 s=>{s.production[0].identifiers.tata="999"},
 "THREE_VIEW_ORDER_IDENTIFIERS_MISMATCH");
mustBlock("mismatched Teknisa in only sushi via",
 s=>{s.production[1].identifiers.teknisa="DIFFERENT"},
 "THREE_VIEW_ORDER_IDENTIFIERS_MISMATCH");
mustBlock("mismatched iFood in only the kitchen via",
 s=>{s.production[0].identifiers.ifood="DIFFERENT"},
 "THREE_VIEW_ORDER_IDENTIFIERS_MISMATCH");
mustBlock("different hour on one production via",
 s=>{s.production[1].identifiers.hour="23:59"},
 "THREE_VIEW_ORDER_IDENTIFIERS_MISMATCH");
mustBlock("different iFood number on conference via",
 s=>{s.conference.identifiers.ifood="DIFFERENT"},
 "THREE_VIEW_ORDER_IDENTIFIERS_MISMATCH");
mustBlock("duplicate production station",
 s=>{s.production[1].station=s.production[0].station},
 "PRODUCTION_STATION_NOT_UNIQUE");
mustBlock("duplicate print-intent fingerprint",
 s=>{s.production[1].fingerprint=s.production[0].fingerprint},
 "PRODUCTION_FINGERPRINT_NOT_UNIQUE");
mustBlock("missing conference identity",
 s=>{s.conference.identifiers=null},
 "CONFERENCE_IDENTIFIERS_MISSING");
mustBlock("missing identity on one production via",
 s=>{s.production[0].identifiers=null},
 "THREE_VIEW_ORDER_IDENTIFIERS_MISMATCH");
mustBlock("missing production views even if source claims ready",
 s=>{s.production=[]},
 "PRODUCTION_VIEWS_MISSING");
mustBlock("global semantic blocker strips every preview byte",
 s=>{s.blocking_reasons.push("TEST_SOURCE_BLOCKED")},
 "GLOBAL_SOURCE_SEMANTIC_BLOCKED");
test("historically incomplete order never yields preview bytes",()=>{
 const pending=renderOperationalTicketsProofV46(partiallyKnownResult());
 for(const view of [...pending.production,pending.conference]){
  assert.equal(view.ready_for_offline_preview,false);
  assert.equal(view.byte_count,0);
 }
 assertNoEffects(pending);
});
console.log("COMANDAS_THREE_VIEWS_V871="+checks+"/"+checks+
 " ARCHIVED_RECONSTRUCTION ONLY_NO_PRINT NO_BIND NO_HOST");
