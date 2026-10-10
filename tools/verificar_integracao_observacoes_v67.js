"use strict";
const assert=require("node:assert/strict");
const {archivedResult}=require("./verificar_real_order_tickets_v46.js");
const {renderConferenceTicketProofV46,renderProductionTicketProofV46,OfflinePrinter}=
 require("../dist/src/production/operationalTicketEscposV46.js");
const {planAnnotationV67}=
 require("../dist/src/production/annotationLinePlanV67.js");
const {createAnnotationPlan}=require("./planejar_observacoes_legiveis_v56.js");
let done=0;const check=(name,run)=>{run();done++;console.log("PASS "+done+" "+name)};
const long="SEM PIMENTA NENHUMA SEM CEBOLA CRUA E SEM CEBOLINHA POR FAVOR COLOCAR MOLHO A PARTE CONFIRMAR QUE O PEDIDO NAO TEM AMENDOIM";
const get=(trace)=>trace.split("\n").filter(x=>x.startsWith("OBS: ")||x.startsWith("OBS > "));
check("V6.7 matches original independently tested V5.6 wrapping",()=>{
 for(const kind of ["OBS","FINALIZAR","AGUARDAR_COZINHA"]){
  for(const text of [long,"SEM SAL","A".repeat(50),"A".repeat(60),
   "SEM AÇÚCAR COM LIMÃO E PORÇÃO DE GENGIBRE À PARTE NÃO COLOCAR PIMENTÃO"]){
   const old=createAnnotationPlan(kind,text),v=planAnnotationV67(kind,text);
   assert.equal(v.status,old.status);
   assert.equal(v.reason,old.reason);
   assert.equal(v.normalized,old.normalized);
   assert.deepEqual(v.lines.map(l=>({text:l.text,font:l.font,continuation:l.continuation})),
    old.lines.map(l=>({text:l.text,font:l.font,continuation:l.continuation})));
  }
 }
});
check("conference physically wraps long OBS with zero missing words",()=>{
 const c=structuredClone(archivedResult().conference);
 c.boxes[0].items[0].observations=[long];
 const p=renderConferenceTicketProofV46(c);
 assert.equal(p.ready_for_offline_preview,true,JSON.stringify(p.blocking_reasons));
 assert.deepEqual(get(p.text_trace),createAnnotationPlan("OBS",long).lines.map(x=>x.text));
 assert.equal(p.ready_for_operational_print,false);
});
check("production and conference produce identical note lines when source agrees",()=>{
 const base=archivedResult();
 const sushi=structuredClone(base.production.find(x=>x.station!=="COZINHA"));
 const conf=structuredClone(base.conference);
 sushi.boxes[0].items[0].observations=[long];
 conf.boxes[0].items[0].observations=[long];
 const p=renderProductionTicketProofV46(sushi),c=renderConferenceTicketProofV46(conf);
 assert.equal(p.ready_for_offline_preview,true);
 assert.equal(c.ready_for_offline_preview,true);
 const expected=get(c.text_trace);
 const actual=get(p.text_trace);
 assert.equal(sushi.boxes[0].physical_box_count,3);
 assert.equal(actual.length,expected.length*3);
 for(let i=0;i<3;i++)
   assert.deepEqual(actual.slice(i*expected.length,(i+1)*expected.length),expected,
    "Every individually proven Kids box must preserve the same customer note");
});
check("note belongs to the right product, never printed on second product",()=>{
 const conf=structuredClone(archivedResult().conference);
 conf.boxes[0].items[0].observations=[long];
 conf.boxes[1].items[0].observations=["SEM SAL"];
 const proof=renderConferenceTicketProofV46(conf);
 const t=proof.text_trace;
 const one=t.indexOf("C1  CAIXA"),two=t.indexOf("C2  CAIXA"),
       three=t.indexOf("C3  CAIXA");
 assert.ok(one>=0&&two>one&&three>two);
 assert.ok(t.slice(one,two).includes("AMENDOIM"));
 assert.ok(!t.slice(two,three).includes("AMENDOIM"));
 assert.ok(t.slice(two,three).includes("OBS: SEM SAL"));
});
check("oversized unsplittable token fails with ZERO ESC/POS bytes",()=>{
 const c=structuredClone(archivedResult().conference);
 c.boxes[0].items[0].observations=["A".repeat(70)];
 const p=renderConferenceTicketProofV46(c);
 assert.equal(p.ready_for_offline_preview,false);
 assert.equal(p.bytes.length,0);
 assert.ok(p.blocking_reasons.some(s=>s.includes("ANNOTATION_WORD_EXCEEDS_FONT_B")));
});
check("unsupported symbols fail closed and cannot be silently converted",()=>{
 const c=structuredClone(archivedResult().conference);
 c.boxes[0].items[0].observations=["SEM 🍣"];
 const p=renderConferenceTicketProofV46(c);
 assert.equal(p.bytes.length,0);
 assert.ok(p.blocking_reasons.some(s=>s.includes("ANNOTATION_ENCODING_UNSUPPORTED")));
});
check("current printer never declares physical print even when wrapping succeeds",()=>{
 const p=new OfflinePrinter();
 p.item({source_item_index:0,product_code:"T",print_name:"URAMAKI TESTE",quantity:1,
  observations:[long],finishing:[],kitchen_dependencies:[]});
 const v=p.result("ANNOTATION_TEST");
 assert.equal(v.ready_for_offline_preview,true);
 assert.equal(v.ready_for_operational_print,false);
 assert.deepEqual(v.effects,{print:false,spooler_write:false,odhen_write:false,cut:false});
});
console.log("ANNOTATION_INTEGRATION_V67="+done+"/"+done+" PREVIEW_ONLY; PAPER_ACCEPTANCE_REQUIRED");
