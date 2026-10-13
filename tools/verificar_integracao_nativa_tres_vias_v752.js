"use strict";
/** V7.52 adversarial tests. Archived order is a previous, sanitized offline replay:
 * no operational reader, no live sequence or Epson transport is accessed.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {archivedResult,partiallyKnownResult}=
 require("./verificar_real_order_tickets_v46.js");
const {renderOperationalTicketsProofV46}=
 require("../dist/src/production/operationalTicketEscposV46.js");
const {renderVerifiedNativeCandidateV752,wrapVerifiedLine,nativeFromTrace}=
 require("./comandas_native_v752_three_view_offline.js");
const {encodeCp850}=require("./comandas_native_fonts_v750_offline.js");

const archived=archivedResult();
assert.equal(archived.ready_for_semantic_preview,true);
const view=renderVerifiedNativeCandidateV752(archived);
assert.equal(view.status,"NATIVE_FONT_V752_SEMANTIC_PROOF_ONLY",
 JSON.stringify({status:view.status,blockers:view.blockers}));
assert.equal(view.outputs.length,3,"exact archived 2 station + 1 conference");
assert.deepEqual(view.outputs.map(x=>x.kind),["PRODUCAO","PRODUCAO","CONFERENCIA"]);
assert.equal(view.ready_for_operational_print,false);
assert.deepEqual(view.effects,{print:false,spooler_write:false,
 database_write:false,sequence_binding_write:false,
 service_change:false,driver_change:false,deploy:false,cut:false});
assert.ok(view.outputs.every(x=>/^[a-f0-9]{64}$/.test(x.native_bytes_sha256)));
assert.ok(view.outputs.every(x=>x.native_byte_count>0&&x.native_byte_count<32768));
assert.ok(view.outputs.every(x=>x.full_text_preserved===true&&x.unrepresentable_replaced===false));
assert.ok(view.outputs.every(x=>!Object.hasOwn(x,"bytes")&&!Object.hasOwn(x,"source_text_lines")));
assert.deepEqual(view.outputs.map(x=>x.station),["COZINHA","SUSHI","CONFERÊNCIA"]);
assert.deepEqual(view.outputs.map(x=>x.boxes),[2,4,6]);
const legacy=renderOperationalTicketsProofV46(archived);
const traces=[...legacy.production,legacy.conference];
for(let i=0;i<3;i++){
 const from=traces[i].text_trace,converted=nativeFromTrace(from,view.outputs[i].kind);
 assert.equal(converted.native_bytes_sha256,view.outputs[i].native_bytes_sha256);
 assert.equal(converted.native_byte_count,view.outputs[i].native_byte_count);
 assert.equal(converted.source_text_lines.join(" ").trim().replace(/\s+/g," "),
  from.split("\n").join(" ").trim().replace(/\s+/g," "));
 assert.ok(converted.source_text_lines.every(s=>encodeCp850(s).length<=42));
}
const wrapped=wrapVerifiedLine("OBS: NÃO PRODUZIR COM ALERGIA A CAMARÃO E SEM PIMENTA");
assert.ok(wrapped.length>1&&wrapped.every(t=>encodeCp850(t).length<=42));
assert.equal(wrapped.join(" "),"OBS: NÃO PRODUZIR COM ALERGIA A CAMARÃO E SEM PIMENTA");
assert.deepEqual(wrapVerifiedLine(" "),[" "]);
assert.deepEqual(wrapVerifiedLine("1  COMBINADO KIDS"),["1  COMBINADO KIDS"],
 "quantity separator spaces must not be collapsed");
assert.deepEqual(wrapVerifiedLine("C1  CAIXA 750"),["C1  CAIXA 750"]);
assert.throws(()=>wrapVerifiedLine("OBS:  "+ "MUITA OBSERVAÇÃO ".repeat(5)),
 /MULTISPACE_LINE_REQUIRES_REVIEW/);
assert.throws(()=>wrapVerifiedLine(" SEM CAMARÃO"),/TRACE_EDGE_SPACES_NOT_APPROVED/);
assert.throws(()=>wrapVerifiedLine("SEM CAMARÃO\r"),/TRACE_LINE_INVALID/);
assert.throws(()=>wrapVerifiedLine("A".repeat(43)),/UNBREAKABLE_WORD/);
assert.throws(()=>wrapVerifiedLine("CORTAR\u001bPAPEL"),/TRACE_LINE_INVALID/);
assert.throws(()=>wrapVerifiedLine("NÃO 🚨"),/UNREPRESENTABLE_CP850/);
assert.equal(nativeFromTrace("OBS: NÃO PRODUZIR\n","PRODUCAO").full_text_preserved,true);
// A non-approved live projection and any source/box regression must emit NO candidate bytes.
const unknown=renderVerifiedNativeCandidateV752(partiallyKnownResult());
assert.equal(unknown.status,"HOLD_NATIVE_FONT_CANDIDATE");
assert.deepEqual(unknown.outputs,[]);
for(const scenario of [
 s=>{s.ready_for_semantic_preview=false},
 s=>{s.blocking_reasons.push("FAKE_UNPROVEN")},
 s=>{s.conference.boxes[0].status="UNKNOWN"},
 s=>{s.production[0].boxes[0].physical_box_count=0},
 s=>{s.production[0].boxes[0].items[0].print_name="A".repeat(100)}
]){
 const altered=structuredClone(archived);scenario(altered);
 const got=renderVerifiedNativeCandidateV752(altered);
 assert.equal(got.status,"HOLD_NATIVE_FONT_CANDIDATE");
 assert.deepEqual(got.outputs,[]);
 assert.equal(got.effects.print,false);
}
const moduleSource=fs.readFileSync(path.join(__dirname,"comandas_native_v752_three_view_offline.js"),"utf8");
assert.doesNotMatch(moduleSource,/\b(?:OpenPrinter|StartDocPrinter|WritePrinter|Get-Printer|Set-Printer|Restart-Service|Start-Service|setTimeout|createConnection|execSync|spawnSync)\b|\.print\s*\(/i);
assert.ok(!moduleSource.includes("writeFileSync")&&!moduleSource.includes("fetch("));
console.log(JSON.stringify({schema:"deliveryos.native-three-view-v752.adversarial",
 status:"PASS",production:2,conference:1,encoded_views:3,
 observed_outputs:view.outputs.map(x=>({kind:x.kind,station:x.station,
  boxes:x.boxes,lines:x.native_line_count,bytes:x.native_byte_count,
  segments:x.segment_count,sha256:x.native_bytes_sha256})),
 source_text_not_elided:true,accent_and_allergen_preserved:true,
 unsafe_projection_rejected:true,mutations_rejected:5,
 print:false,driver_change:false,service_change:false}));
