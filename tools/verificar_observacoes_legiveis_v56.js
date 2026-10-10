"use strict";
const assert=require("node:assert/strict");
const {createAnnotationPlan,auditTicketItems,canonical}=require("./planejar_observacoes_legiveis_v56.js");
const {archivedResult}=require("./verificar_real_order_tickets_v46.js");
const {renderConferenceTicketProofV46,OfflinePrinter}=require("../dist/src/production/operationalTicketEscposV46.js");
const {inspectEscPos}=require("./escposByteInspectorV51.js");
let pass=0;
function test(label,fn){fn();pass++;console.log("PASS "+String(pass).padStart(2,"0")+" "+label);}
const long="SEM PIMENTA NENHUMA SEM CEBOLA CRUA E SEM CEBOLINHA POR FAVOR COLOCAR MOLHO A PARTE CONFIRMAR QUE O PEDIDO NAO TEM AMENDOIM";
test("01 integrated renderer wraps long OBS without clipping or breaking words",()=>{
 const item=structuredClone(archivedResult().conference);
 item.boxes[0].items[0].observations=[long];
 const proof=renderConferenceTicketProofV46(item);
 assert.equal(proof.ready_for_offline_preview,true,JSON.stringify(proof.blocking_reasons));
 assert.ok(proof.byte_count>0);
 const actual=proof.text_trace.split("\n").filter(x=>x.startsWith("OBS: ")||x.startsWith("OBS > "));
 assert.deepEqual(actual,createAnnotationPlan("OBS",long).lines.map(x=>x.text));
});
test("02 multi-line candidate keeps every word, in the correct order",()=>{
 const p=createAnnotationPlan("OBS",long);
 assert.equal(p.status,"PREVIEW_ONLY");
 assert.ok(p.lines.length>=3);
 assert.equal(p.lines.map((l,i)=>l.text.slice(i===0?5:6)).join(" "),canonical(long));
});
test("03 continuation rows are visibly labeled and never look like a product",()=>{
 const p=createAnnotationPlan("OBS",long);
 assert.ok(p.lines[0].text.startsWith("OBS: "));
 assert.ok(p.lines.slice(1).every(x=>x.text.startsWith("OBS > ")));
 assert.ok(p.lines.slice(1).every(x=>x.continuation));
});
test("04 all wrapped OBS use maximum legible native Font A where possible",()=>{
 const p=createAnnotationPlan("OBS",long);
 assert.ok(p.lines.every(x=>x.font==="A"));
 assert.ok(p.lines.every(x=>x.chars<=48&&x.nominal_width_dots<=576));
});
test("05 single short note stays on one line",()=>{
 const p=createAnnotationPlan("OBS","sem sal");
 assert.equal(p.lines.length,1);
 assert.equal(p.lines[0].text,"OBS: SEM SAL");
 assert.equal(p.lines[0].font,"A");
});
test("06 finishing and kitchen-dependency labels remain distinguishable",()=>{
 const f=createAnnotationPlan("FINALIZAR",long);
 const k=createAnnotationPlan("AGUARDAR_COZINHA",long);
 assert.equal(f.lines[0].text.startsWith("FINALIZAR: "),true);
 assert.equal(k.lines[0].text.startsWith("AGUARDAR COZINHA: "),true);
 assert.ok(f.lines.length>1&&k.lines.length>1);
});
test("07 negations are not dropped at wrap boundaries",()=>{
 const text="SEM SAL SEM PIMENTA SEM MOLHO SEM CEBOLA SEM AMENDOIM SEM WASABI SEM GENGIBRE SEM CEBOLINHA";
 const p=createAnnotationPlan("OBS",text);
 assert.equal(p.status,"PREVIEW_ONLY");
 assert.equal(p.lines.map((l,i)=>l.text.slice(i===0?5:6)).join(" "),text);
 assert.equal((p.normalized.match(/\bSEM\b/g)||[]).length,8);
});
test("08 Portuguese accents remain in source and output",()=>{
 const text="SEM AÇÚCAR COM LIMÃO E PORÇÃO DE GENGIBRE À PARTE NÃO COLOCAR PIMENTÃO";
 const p=createAnnotationPlan("OBS",text);
 assert.equal(p.status,"PREVIEW_ONLY");
 assert.equal(p.lines.map((l,i)=>l.text.slice(i===0?5:6)).join(" "),text);
 assert.ok(p.lines.some(x=>x.text.includes("AÇÚCAR")));
});
test("09 unsupported Unicode and emoji block all lines",()=>{
 for(const v of ["USAR 🍣", "USAR — ESPETO", "COLOCAR €"]){
  const p=createAnnotationPlan("OBS",v);
  assert.equal(p.status,"BLOCKED");
  assert.equal(p.lines.length,0);
  assert.equal(p.reason,"ANNOTATION_ENCODING_UNSUPPORTED");
 }
});
test("10 empty annotations do not silently create fake instructions",()=>{
 const p=createAnnotationPlan("OBS"," \t \n ");
 assert.equal(p.status,"BLOCKED");
 assert.equal(p.reason,"EMPTY_ANNOTATION");
});
test("11 individual long words can fall back to Font B without breaking",()=>{
 const word="A".repeat(50);
 const p=createAnnotationPlan("OBS",word);
 assert.equal(p.status,"PREVIEW_ONLY");
 assert.equal(p.lines.length,1);
 assert.equal(p.lines[0].font,"B");
 assert.equal(p.lines[0].text,"OBS: "+word);
});
test("12 overlong individual words still block and return ZERO lines",()=>{
 const p=createAnnotationPlan("OBS","A".repeat(60));
 assert.equal(p.status,"BLOCKED");
 assert.equal(p.reason,"ANNOTATION_WORD_EXCEEDS_FONT_B");
 assert.equal(p.lines.length,0);
});
test("13 too many continuation lines block cleanly",()=>{
 const p=createAnnotationPlan("OBS","SEM ".repeat(700));
 assert.equal(p.status,"BLOCKED");
 assert.equal(p.reason,"ANNOTATION_TOO_MANY_LINES");
 assert.equal(p.lines.length,0);
});
test("14 notes preserve wording despite extra whitespace normalization",()=>{
 const p=createAnnotationPlan("OBS","sem   sal\n e \t sem   pimenta");
 assert.equal(p.normalized,"SEM SAL E SEM PIMENTA");
 assert.equal(p.lines[0].text,"OBS: SEM SAL E SEM PIMENTA");
});
test("15 original items and product names remain untouched",()=>{
 const original=[{source_item_index:3,print_name:"Uramaki Ebiten Especial",quantity:2,
  observations:[long],finishing:["SEM SAL"],kitchen_dependencies:[]}];
 const snapshot=JSON.stringify(original);
 const r=auditTicketItems(original);
 assert.equal(JSON.stringify(original),snapshot);
 assert.equal(r.items[0].original_product_name,"Uramaki Ebiten Especial");
 assert.equal(r.items[0].original_quantity,2);
 assert.equal(r.items[0].notes.length,2);
});
test("16 original note association remains anchored to item source index",()=>{
 const r=auditTicketItems([
   {source_item_index:1,print_name:"KIDS",quantity:3,observations:["SEM MOLHO"]},
   {source_item_index:2,print_name:"EBITEN",quantity:1,observations:[long]}
 ]);
 assert.deepEqual(r.items.map(x=>x.item_index),[1,2]);
 assert.equal(r.items[1].notes[0].normalized,canonical(long));
 assert.equal(r.items[0].notes[0].normalized,"SEM MOLHO");
});
test("17 candidate can be decoded by independent Epson ESC/POS byte inspector",()=>{
 const plan=createAnnotationPlan("OBS",long);
 const p=new OfflinePrinter();
 for(const line of plan.lines){p.font(line.font);p.line(line.text,"ANNOTATION");}
 const proof=p.result("ANNOTATION_V56_NO_REAL_PRINT");
 assert.equal(proof.ready_for_operational_print,false);
 assert.equal(proof.ready_for_offline_preview,true);
 const inspection=inspectEscPos(proof.bytes);
 assert.equal(inspection.pass,true,inspection.errors.join(","));
 assert.deepEqual(inspection.lines.map(l=>l.text),plan.lines.map(l=>l.text.trim()));
 assert.ok(inspection.lines.every(l=>l.width_dots<=576));
});
test("18 planner never authorizes printer or spooler effects",()=>{
 const a=createAnnotationPlan("OBS",long),b=auditTicketItems([]);
 assert.deepEqual(a.effects,{print:false,cut:false,spooler_write:false});
 assert.deepEqual(b.effects,{print:false,cut:false,spooler_write:false});
});
test("19 unknown note types are rejected without fallback",()=>{
 assert.throws(()=>createAnnotationPlan("PACKAGING",long),/UNSUPPORTED_NOTE_KIND/);
});
test("20 integrated preview remains offline, paper emphasis still requires acceptance",()=>{
 const p=createAnnotationPlan("OBS",long);
 const item=structuredClone(archivedResult().conference);
 item.boxes[0].items[0].observations=[long];
 const v=renderConferenceTicketProofV46(item);
 assert.equal(p.status,"PREVIEW_ONLY");
 assert.ok(p.lines.every(x=>x.bold_policy==="REQUIRES_PAPER_ACCEPTANCE"));
 assert.equal(v.ready_for_operational_print,false);
 assert.equal(v.effects.print,false);
});
console.log("annotation-readability-v56: "+pass+"/"+pass+" PASS; candidate remains SHADOW/OFFLINE");
