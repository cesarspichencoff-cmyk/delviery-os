"use strict";
/* V8.72: actual archived V4.5 -> V7.52 native output -> V7.54 receipt
 * descriptor boundary. The event/source hash below is SYNTHETIC TEST CONTEXT,
 * not the original Reader pair, not operational print evidence.
 */
const assert=require("node:assert/strict");
const {createHash}=require("node:crypto");
const {archivedResult}=require("./verificar_real_order_tickets_v46.js");
const {makeProduction,makeConference}=require("./gerar_prova_figma_v60_offline.js");
const {renderVerifiedNativeCandidateV752}=
 require("./comandas_native_v752_three_view_offline.js");
const {descriptorsFromProof}=
 require("./comandas_idempotencia_v754_offline.js");
const sha=s=>createHash("sha256").update(s).digest("hex");
const ticket=archivedResult();
const native=renderVerifiedNativeCandidateV752(ticket);
assert.equal(native.status,"NATIVE_FONT_V752_SEMANTIC_PROOF_ONLY");
const visual=[...ticket.production.map(makeProduction),makeConference(ticket.conference)];
assert.equal(native.outputs.length,3);
assert.equal(visual.length,3);
const sourceHash=sha("SYNTHETIC_ARCHIVED_RECONSTRUCTION_NOT_READER_SOURCE");
const manifest={status:"OFFLINE_VERIFIED_NO_PHYSICAL_EFFECT",
 effects:{print:false,spooler_write:false},
 origin:{event_sha256:sourceHash},
 outputs:visual.map(v=>({kind:v.kind,station:v.station,
  boxes:v.boxes,product_lines:v.items,
  svg_sha256:sha(Buffer.from(v.svg,"utf8"))})),
 native_font_candidate:native};
const order={CDFILIAL:"0001",CDLOJA:"01",NRVENDAREST:"0000000001",
 NRCOMANDA:"0000000001"};
const event={schema:"deliveryos.tata-reader-stable-order-event.v1",
 order_key:Object.values(order).join("|"),order};
const context={scope_id:"STORE:LAB|DATE:2026-10-23",
 scope_evidence:"SYNTHETIC_SCOPE_ONLY",tata_sequence:"001",
 event_file_sha256:sourceHash};
let n=0;
function check(label,fn){fn();n++;console.log("PASS "+n+" "+label);}
check("real offline archived native outputs and exact three scoped descriptors",()=>{
 const value=descriptorsFromProof(manifest,event,context);
 assert.equal(value.status,"OFFLINE_DESCRIPTORS_ONLY");
 assert.equal(value.authorize_print,false);
 assert.equal(value.descriptors.length,3);
 assert.deepEqual(value.descriptors.map(v=>v.kind),["PRODUCAO","PRODUCAO","CONFERENCIA"]);
 assert.equal(new Set(value.descriptors.map(v=>v.key)).size,3);
 assert.ok(Object.values(value.effects).every(v=>v===false));
});
function mutate(label,fn){
 check(label,()=>{
  const m=structuredClone(manifest),before=JSON.stringify(m);
  fn(m);
  const mutation=JSON.stringify(m),value=descriptorsFromProof(m,event,context);
  assert.equal(value.status,"HOLD");
  assert.equal(value.descriptors.length,0);
  assert.equal(JSON.stringify(m),mutation,"no source mutation");
  assert.equal(value.authorize_print,undefined);
 });
}
mutate("reject one production missing",m=>{
 m.outputs.splice(0,1);m.native_font_candidate.outputs.splice(0,1);
});
mutate("reject extra production",m=>{
 m.outputs.splice(2,0,{...m.outputs[0],station:"EXTRA"});
 m.native_font_candidate.outputs.splice(2,0,{...m.native_font_candidate.outputs[0],station:"EXTRA"});
});
mutate("reject duplicate station despite distinct slots",m=>{
 m.outputs[1].station=m.outputs[0].station;
 m.native_font_candidate.outputs[1].station=m.native_font_candidate.outputs[0].station;
});
mutate("reject design station drift from actual Epson candidate",m=>{
 m.outputs[0].station="OUTRA_PRACA";
});
mutate("reject missing visual digest despite matching missing values",m=>{
 delete m.outputs[0].svg_sha256;
 delete m.native_font_candidate.outputs[0].design_svg_sha256;
});
mutate("reject empty physical station",m=>{
 m.outputs[0].station="   ";
 m.native_font_candidate.outputs[0].station="   ";
});
mutate("reject no counts despite equal undefined fields",m=>{
 delete m.outputs[0].boxes;
 delete m.native_font_candidate.outputs[0].boxes;
});
check("the synthetic context is never authorization",()=>{
 assert.equal(native.ready_for_operational_print,false);
 assert.equal(ticket.ready_for_automatic_operational_print,false);
 assert.equal(ticket.effects.print,false);
});
console.log("COMANDAS_NATIVE_MANIFEST_IDEMPOTENCY_V872="+n+"/"+n+
 " OFFLINE_ARCHIVED_SOURCE_SYNTHETIC_EVENT NO_PRINT NO_BIND NO_HOST");
