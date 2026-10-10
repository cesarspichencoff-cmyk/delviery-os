"use strict";
/**
 * V5.9 SHADOW: quantity contract boundary checks. Entirely offline.
 * No actual printer, order data mutation, cut, warehouse or deploy.
 */
const assert=require("node:assert/strict");
const {archivedResult,archivedCompleteInput}=require("./verificar_real_order_tickets_v46.js");
const {projectOperationalTicketsV45}=require("../dist/src/production/operationalTicketsV45.js");
const {
  OfflinePrinter,
  renderConferenceTicketProofV46,
  renderProductionTicketProofV46,
}=require("../dist/src/production/operationalTicketEscposV46.js");
const {inspectEscPos}=require("./escposByteInspectorV51.js");

const ORIGINAL=archivedResult();
const invalid=[
 ["zero",0],["negative",-2],["fraction",1.5],["not_a_number",NaN],
 ["infinity",Infinity],["negative_infinity",-Infinity],
 ["string","2"],["null",null],["undefined",undefined],
 ["unsafe_integer",Number.MAX_SAFE_INTEGER+1],
];
let checks=0;
function check(label,fn){fn();checks++;console.log("PASS "+String(checks).padStart(2,"0")+" "+label);}
function hasBlocked(proof,scope){
 assert.equal(proof.ready_for_offline_preview,false,scope);
 assert.equal(proof.ready_for_operational_print,false);
 assert.equal(proof.bytes.length,0,scope);
 assert.equal(proof.byte_count,0,scope);
 assert.ok(proof.blocking_reasons.some(x=>x.startsWith("INVALID_QUANTITY:"+scope)),JSON.stringify(proof.blocking_reasons));
 assert.deepEqual(proof.effects,{print:false,spooler_write:false,odhen_write:false,cut:false});
}
for(const [kind,bad] of invalid){
 check("conference item "+kind+" must be zero-byte BLOCKED",()=>{
  const c=structuredClone(ORIGINAL.conference);
  c.boxes[0].items[0].quantity=bad;
  hasBlocked(renderConferenceTicketProofV46(c),"ITEM:"+c.boxes[0].items[0].source_item_index);
 });
 check("bag "+kind+" must be zero-byte BLOCKED",()=>{
  const c=structuredClone(ORIGINAL.conference);
  c.bags[0].quantity=bad;
  hasBlocked(renderConferenceTicketProofV46(c),"BAG");
 });
 check("kit "+kind+" must be zero-byte BLOCKED",()=>{
  const c=structuredClone(ORIGINAL.conference);
  c.kits[0].quantity=bad;
  hasBlocked(renderConferenceTicketProofV46(c),"KIT");
 });
 check("accompaniment "+kind+" must be zero-byte BLOCKED",()=>{
  const c=structuredClone(ORIGINAL.conference);
  c.accompaniments=[{label:"GARI",quantity:bad}];
  hasBlocked(renderConferenceTicketProofV46(c),"RESOURCE:ACOMP");
 });
 if(kind!=="undefined")check("production physical box count "+kind+" must be zero-byte BLOCKED",()=>{
  const c=structuredClone(ORIGINAL.production[0]);
  c.boxes[0].physical_box_count=bad;
  hasBlocked(renderProductionTicketProofV46(c),"BOX_COUNT");
 });
}
check("optional missing physical box count preserves the existing default of one",()=>{
 const c=structuredClone(ORIGINAL.production[0]);
 delete c.boxes[0].physical_box_count;
 const proof=renderProductionTicketProofV46(c);
 assert.equal(proof.ready_for_offline_preview,true);
 assert.equal(proof.byte_count,332);
 assert.ok(proof.text_trace.includes("CAIXA 650"));
});
check("valid archived complete production tickets still yield unchanged safe bytes",()=>{
 const p=ORIGINAL.production.map(renderProductionTicketProofV46);
 assert.deepEqual(p.map(x=>x.byte_count).sort((a,b)=>a-b),[332,349]);
 assert.ok(p.every(x=>x.ready_for_offline_preview===true&&x.ready_for_operational_print===false));
 assert.ok(p.every(x=>inspectEscPos(x.bytes).pass));
});
check("valid conference includes box summary and finishing line without loss",()=>{
 const p=renderConferenceTicketProofV46(ORIGINAL.conference);
 assert.equal(p.byte_count,849);
 assert.equal((p.text_trace.match(/1 CAIXA \| 1 PRODUTO/g)||[]).length,6);
 assert.ok(p.text_trace.includes("FINALIZAÇÃO: CONFERIR FICHA VALIDADA"));
 assert.equal(p.ready_for_offline_preview,true);
 assert.equal(p.ready_for_operational_print,false);
 assert.ok(p.text_trace.includes("3 KIT KIDS"));
 assert.ok(inspectEscPos(p.bytes).pass);
});
check("positive integral counts 1 and 12 are representable",()=>{
 const c=structuredClone(ORIGINAL.conference);
 c.bags[0].quantity=12;c.kits[0].quantity=1;c.boxes[0].items[0].quantity=12;
 const p=renderConferenceTicketProofV46(c);
 assert.equal(p.ready_for_offline_preview,true);
 assert.ok(p.byte_count>0);
 assert.ok(p.text_trace.includes("12 SACOLA G"));
 assert.ok(p.text_trace.includes("12  COMBINADO KIDS"));
 assert.equal(p.ready_for_operational_print,false);
});
check("safe integer ceiling is NOT an invented business limit",()=>{
 const p=new OfflinePrinter();
 p.item({source_item_index:1,print_name:"ABC",quantity:9007199254740991,
  observations:[],finishing:[],kitchen_dependencies:[]});
 assert.equal(p.blockers.has("INVALID_QUANTITY:ITEM:1"),false);
 // Paper width still applies separately; false safety promises are forbidden.
});
check("direct OfflinePrinter.item checks its own malformed quantity",()=>{
 const p=new OfflinePrinter();
 p.item({source_item_index:5,print_name:"SUSHI",quantity:"2",
  observations:[],finishing:[],kitchen_dependencies:[]});
 hasBlocked(p.result("MALFORMED_DIRECT_ITEM"),"ITEM:5");
});
for(const [kind,bad] of invalid){
 check("source projection rejects invalid sold quantity "+kind,()=>{
  const source=archivedCompleteInput();
  source.source_items[0].quantity=bad;
  const result=projectOperationalTicketsV45({
   order_id:source.id,source_items:source.source_items,
   production_plan:source.production_plan,
   resource_projection:source.resource_projection,
   packaging_plan:source.packaging,
  });
  assert.equal(result.ready_for_semantic_preview,false,kind);
  assert.equal(result.ready_for_automatic_operational_print,false);
  assert.ok(result.blocking_reasons.some(x=>x.startsWith("INVALID_SOURCE_ITEM:")),JSON.stringify(result.blocking_reasons));
 });
}
check("no source fixtures were changed by synthetic mutations",()=>{
 assert.equal(ORIGINAL.conference.boxes[0].items[0].quantity,1);
 assert.deepEqual(ORIGINAL.conference.bags,[{label:"Sacola G",quantity:1}]);
 assert.ok(ORIGINAL.production.every(p=>p.boxes.length>0));
});
console.log("thermal-quantity-contract-v59: "+checks+"/"+checks+" PASS; zero hardware access");
