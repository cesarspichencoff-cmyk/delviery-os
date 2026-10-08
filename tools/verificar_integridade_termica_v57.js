"use strict";
const assert=require("node:assert/strict");
const {OfflinePrinter}=require("../dist/src/production/operationalTicketEscposV46.js");
const {inspectEscPos}=require("./escposByteInspectorV51.js");
const {createAnnotationPlan,auditTicketItems,canonical}=require("./planejar_observacoes_legiveis_v56.js");
const {archivedResult}=require("./verificar_real_order_tickets_v46.js");
const {renderConferenceTicketProofV46}=require("../dist/src/production/operationalTicketEscposV46.js");
let tests=0;
function test(label,fn){fn();tests++;console.log("PASS "+String(tests).padStart(2,"0")+" "+label);}
const prefix=[0x1b,0x40,0x1b,0x74,0x10,0x1b,0x4d,0x00];
function ins(payload){return inspectEscPos([...prefix,...payload]);}
for(const [label,code] of [
 ["DELETE_NOT_PRINTABLE",0x7f],
 ["SOFT_HYPHEN_INVISIBLE",0xad],
 ["ESCAPE",0x1b],
 ["NULL",0x00],
 ["C1_CONTROL",0x80],
 ["UTF8_NON_LATIN1","\u200b"],
]){
 test("three independent gates reject "+label,()=>{
  const s="SEM"+(typeof code==="number"?String.fromCharCode(code):code)+"SAL";
  const p=new OfflinePrinter();p.line(s,"OBS");
  assert.equal(p.result("TEST").bytes.length,0);
  assert.equal(createAnnotationPlan("OBS",s).status,"BLOCKED");
  if(typeof code==="number"&&![0x1b,0x00].includes(code)){
   const r=ins([0x53,0x45,0x4d,code,0x53,0x41,0x4c,0x0a]);
   assert.equal(r.pass,false,label);
  }
 });
}
test("independent byte inspector refuses ESC/POS unsupported triple-sized characters",()=>{
 const r=ins([0x1d,0x21,0x22,0x58,0x0a]);
 assert.equal(r.pass,false,JSON.stringify(r));
 assert.ok(r.errors.some(e=>e.includes("UNSUPPORTED_CHAR_SIZE")));
});
test("mid-ticket ESC@ reset is not a valid, coherent template",()=>{
 const r=ins([0x41,0x0a,0x1b,0x40,0x42,0x0a]);
 assert.equal(r.pass,false,JSON.stringify(r));
 assert.ok(r.errors.some(e=>e.includes("MID_DOCUMENT_RESET")));
});
test("normal Epson double-height and double-width templates remain legal",()=>{
 for(const value of [0x00,0x01,0x10,0x11]){
  const r=ins([0x1d,0x21,value,0x41,0x0a]);
  assert.equal(r.pass,true,JSON.stringify(r.errors));
 }
});
test("real replay receipts remain safe with the corrected inspector",()=>{
 const source=archivedResult();
 const proof=renderConferenceTicketProofV46(source.conference);
 assert.equal(proof.ready_for_offline_preview,true,JSON.stringify(proof.blocking_reasons));
 assert.equal(inspectEscPos(proof.bytes).pass,true);
 assert.equal(proof.ready_for_operational_print,false);
});
const lex=["SEM","SAL","PIMENTA","GLÚTEN","NÃO","COLOCAR","AMENDOIM","MOLHO","À","PARTE","SHISÔ","EBITEN","MAIS","POUCO","GENGIBRE","WASABI","CEBOLINHA","POR","FAVOR","QUENTE","FRIO"];
let random=0x5eed4217;
function rand(){random^=random<<13;random^=random>>>17;random^=random<<5;return random>>>0;}
test("500 seeded safe notes preserve every token, semantic order and bounding columns",()=>{
 let accepted=0,blocked=0;
 for(let i=0;i<500;i++){
  const count=1+(rand()%115);
  const input=Array.from({length:count},()=>lex[rand()%lex.length]).join(" ");
  const kind=["OBS","FINALIZAR","AGUARDAR_COZINHA"][i%3];
  const p=createAnnotationPlan(kind,input);
  if(p.status==="PREVIEW_ONLY"){
   accepted++;
   const label=kind==="OBS"?"OBS: ":kind==="FINALIZAR"?"FINALIZAR: ":"AGUARDAR COZINHA: ";
   const cont=kind==="OBS"?"OBS > ":kind==="FINALIZAR"?"FINALIZAR > ":"COZINHA > ";
   const reconstructed=p.lines.map((x,j)=>x.text.slice((j===0?label:cont).length)).join(" ");
   assert.equal(reconstructed,canonical(input));
   assert.ok(p.lines.length>0&&p.lines.length<=12);
   assert.ok(p.lines.every(x=>x.chars<=(x.font==="A"?48:64) && x.nominal_width_dots<=576));
   const printer=new OfflinePrinter();
   for(const line of p.lines){printer.font(line.font);printer.line(line.text,"FUZZ");}
   const receipt=printer.result("FUZZ_OFFLINE");
   assert.equal(receipt.ready_for_offline_preview,true);
   assert.equal(inspectEscPos(receipt.bytes).pass,true);
   assert.equal(receipt.ready_for_operational_print,false);
  } else {
   blocked++;
   assert.equal(p.status,"BLOCKED");
   assert.deepEqual(p.lines,[]);
   assert.ok(["ANNOTATION_TOO_MANY_LINES","ANNOTATION_WORD_EXCEEDS_FONT_B"].includes(p.reason),p.reason);
  }
 }
 assert.ok(accepted>=200,"not enough accepted cases");
 assert.ok(blocked>=1,"should exercise line-limit fail closed");
 console.log("  SEEDED_FUZZ="+accepted+" accepted / "+blocked+" blocked (no print)");
});
test("item association, negations and quantities are unchanged in projection",()=>{
 const original=[
  {source_item_index:1,print_name:"COMBINADO KIDS",quantity:3,observations:["SEM SAL","SEM CEBOLA"]},
  {source_item_index:2,print_name:"URAMAKI EBITEN",quantity:12,observations:["NÃO COLOCAR AMENDOIM EM NENHUMA PEÇA E EMBALAR MOLHO À PARTE SEM PIMENTA"]},
 ];
 const before=JSON.stringify(original);
 const result=auditTicketItems(original);
 assert.equal(JSON.stringify(original),before);
 assert.deepEqual(result.items.map(x=>[x.item_index,x.original_product_name,x.original_quantity]),[[1,"COMBINADO KIDS",3],[2,"URAMAKI EBITEN",12]]);
 assert.equal(result.effects.print,false);
 assert.equal(result.effects.spooler_write,false);
});
console.log("safety-escpos-v57: "+tests+"/"+tests+" PASS; no printer/network calls");
