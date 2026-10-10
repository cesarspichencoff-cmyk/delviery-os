"use strict";
/** Offline-only contract: one proven physical box may contain two distinct lines.
 * Two units of one product remain one product LINE. No real order or printer.
 */
const assert = require("node:assert/strict");
const {makeConference, render} = require("./gerar_prova_figma_v60_offline.js");
const {renderConferenceTicketProofV46} =
  require("../dist/src/production/operationalTicketEscposV46.js");
const {inspectEscPos} = require("./escposByteInspectorV51.js");

let passed=0;
const check=(label,fn)=>{fn();passed++;console.log("PASS "+passed+" "+label);};
const product=(idx,qty,name,obs=[])=>({
  source_item_index:idx,product_code:"SYNTHETIC-"+idx,
  quantity:qty,print_name:name,observations:obs,
  finishing:[],kitchen_dependencies:[]
});
const box=(items)=>({
  position:"C1",model:"750",status:"PROVEN",operator_field:"Op. ________",
  physical_box_count:1,items
});
const ticket=(boxes,unboxed=[])=>({
  order_id:"SYNTHETIC-NOT-REAL",
  identifiers:{ifood:"TEST-IF",teknisa:"TEST-TK",tata:"997",hour:"19:00"},
  revision:null,boxes,items_without_proven_box:unboxed,
  bags:[],kits:[],accompaniments:[],warnings:[]
});
const sample=()=>ticket([box([
  product(0,1,"URAMAKI SKIN 8",["SEM CEBOLINHA"]),
  product(1,1,"HOT ROLL TATA",["SEM PIMENTA"])
])]);

check("two product lines in ONE box have exactly one box and two products in Figma",()=>{
 const v=makeConference(sample());
 assert.equal(v.boxes,1);
 assert.equal(v.items,2);
 assert.equal(v.ready_for_visual_review,true,JSON.stringify(v.blocking_reasons));
 assert.equal((v.svg.match(/1 CAIXA \| 2 PRODUTOS/g)||[]).length,1);
 assert.ok(v.svg.indexOf("1 CAIXA | 2 PRODUTOS")<v.svg.indexOf("URAMAKI SKIN 8"));
 assert.ok(v.svg.indexOf("URAMAKI SKIN 8")<v.svg.indexOf("OBS: SEM CEBOLINHA"));
 assert.ok(v.svg.indexOf("OBS: SEM CEBOLINHA")<v.svg.indexOf("HOT ROLL TATA"));
 assert.ok(v.svg.indexOf("HOT ROLL TATA")<v.svg.indexOf("OBS: SEM PIMENTA"));
});
check("thermal trace has one physical box, 2 lines, both local notes",()=>{
 const p=renderConferenceTicketProofV46(sample());
 assert.equal(p.ready_for_offline_preview,true,JSON.stringify(p.blocking_reasons));
 assert.equal(p.ready_for_operational_print,false);
 assert.equal((p.text_trace.match(/1 CAIXA \| 2 PRODUTOS/g)||[]).length,1);
 assert.ok(p.text_trace.includes("C1  CAIXA 750"));
 const lines=p.text_trace.split("\n");
 const indices=["1 CAIXA | 2 PRODUTOS","1  URAMAKI SKIN 8","OBS: SEM CEBOLINHA",
  "1  HOT ROLL TATA","OBS: SEM PIMENTA"].map(s=>lines.indexOf(s));
 assert.ok(indices.every(x=>x>=0)&&indices.every((x,i)=>i===0||x>indices[i-1]),JSON.stringify(indices));
 assert.equal(p.effects.print,false);
 assert.ok(inspectEscPos(p.bytes).pass);
});
check("quantity TWO for one sold product stays ONE product line",()=>{
 const one=ticket([box([product(0,2,"URAMAKI SKIN 8")])]);
 const visual=makeConference(one), thermal=renderConferenceTicketProofV46(one);
 assert.equal(visual.ready_for_visual_review,true);
 assert.ok(visual.svg.includes("1 CAIXA | 1 PRODUTO"));
 assert.ok(!visual.svg.includes("2 PRODUTOS"));
 assert.ok(thermal.text_trace.includes("1 CAIXA | 1 PRODUTO"));
 assert.ok(thermal.text_trace.includes("2  URAMAKI SKIN 8"));
});
check("no box proof blocks BOTH previews rather than invent membership",()=>{
 const uncertain=ticket([{...box([product(0,1,"URAMAKI SKIN 8")]),status:"UNKNOWN"}]);
 const svg=makeConference(uncertain), esc=renderConferenceTicketProofV46(uncertain);
 assert.equal(svg.ready_for_visual_review,false);
 assert.ok(svg.blocking_reasons.some(x=>x.startsWith("CONFERENCE_BOX_MEMBERSHIP_NOT_PROVEN")));
 assert.equal(esc.ready_for_offline_preview,false);
 assert.equal(esc.byte_count,0);
 assert.ok(esc.blocking_reasons.includes("CONFERENCE_BOX_MEMBERSHIP_NOT_PROVEN"));
});
check("multiple boxes without proven per-box items are blocked",()=>{
 const bad=ticket([{...box([product(0,2,"URAMAKI SKIN 8")]),physical_box_count:2}]);
 assert.equal(makeConference(bad).ready_for_visual_review,false);
 const esc=renderConferenceTicketProofV46(bad);
 assert.equal(esc.byte_count,0);
 assert.ok(esc.blocking_reasons.includes("CONFERENCE_BOX_MEMBERSHIP_NOT_PROVEN"));
});
check("unknown loose items remain separate and no invented box",()=>{
 const loose=ticket([], [product(0,1,"SHISO SEM EMBALAGEM COMPROVADA")]);
 const svg=makeConference(loose), esc=renderConferenceTicketProofV46(loose);
 assert.equal(svg.boxes,0);
 assert.ok(svg.svg.includes("EMBALAGEM A CONFERIR"));
 assert.ok(!svg.svg.includes("1 CAIXA |"));
 assert.ok(esc.text_trace.includes("EMBALAGEM A CONFERIR"));
 assert.ok(!esc.text_trace.includes("1 CAIXA |"));
});
check("mandatory finalization appears once and before TATA sequence",()=>{
 const v=makeConference(sample());
 const p=renderConferenceTicketProofV46(sample());
 const note="FINALIZAÇÃO: CONFERIR FICHA VALIDADA";
 assert.equal(v.svg.split(note).length,2);
 assert.ok(v.svg.indexOf(note)<v.svg.indexOf(">997</text>"));
 assert.equal(p.text_trace.split(note).length,2);
 assert.ok(p.text_trace.indexOf(note)<p.text_trace.lastIndexOf("997"));
 assert.ok(inspectEscPos(p.bytes).pass);
});
check("production versions and the historical three-way comparison are unaffected structurally",()=>{
 const all=render();
 assert.equal(all.length,3);
 assert.deepEqual(all.map(p=>p.boxes),[2,4,6]);
 assert.equal(all[0].svg.includes("1 CAIXA |"),false);
 assert.equal(all[1].svg.includes("1 CAIXA |"),false);
 assert.equal((all[2].svg.match(/1 CAIXA \| 1 PRODUTO/g)||[]).length,6);
 assert.equal(all[2].ready_for_operational_print,false);
});
console.log("CONFERENCE_BOX_GROUPING_V62="+passed+"/"+passed+" PASS; OFFLINE ONLY; PRINT=false");