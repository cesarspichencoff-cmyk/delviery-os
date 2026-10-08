"use strict";
/**
 * V5.6: SHADOW-only plan for long operational notes.
 * May not modify original product names, item quantities, note order, or
 * production renderer until optical tests and an approved integration.
 * Even on failure, returns ZERO print-ready lines.
 */
const FONT_A_MAX=48;
const FONT_B_MAX=64;
const MAX_NOTE_LINES=12;
const LABELS={
  OBS:"OBS: ",
  FINALIZAR:"FINALIZAR: ",
  AGUARDAR_COZINHA:"AGUARDAR COZINHA: ",
};
const CONT_LABELS={
  OBS:"OBS > ",
  FINALIZAR:"FINALIZAR > ",
  AGUARDAR_COZINHA:"COZINHA > ",
};
function canonical(value){
 return String(value??"").replace(/\s+/g," ").trim().toLocaleUpperCase("pt-BR");
}
function allowed(text){
 return [...text].every(c=>{
   const point=c.codePointAt(0)??0;
   return point>=32&&point<=255&&!(point>=128&&point<160);
 });
}
function createAnnotationPlan(kind,source){
 if(!Object.prototype.hasOwnProperty.call(LABELS,kind))
   throw Error("UNSUPPORTED_NOTE_KIND");
 const normalized=canonical(source);
 function blocked(reason){
   return {status:"BLOCKED",reason,kind,normalized,lines:[],
    effects:{print:false,cut:false,spooler_write:false}};
 }
 if(!normalized)return blocked("EMPTY_ANNOTATION");
 if(!allowed(normalized))return blocked("ANNOTATION_ENCODING_UNSUPPORTED");
 const words=normalized.split(" ");
 const lines=[];
 let index=0;
 while(index<words.length){
   const prefix=lines.length===0?LABELS[kind]:CONT_LABELS[kind];
   const remainingA=FONT_A_MAX-prefix.length;
   const remainingB=FONT_B_MAX-prefix.length;
   let content="",font="A";
   while(index<words.length){
     const token=words[index];
     const candidate=content?content+" "+token:token;
     if(candidate.length<=remainingA){
       content=candidate;index++;continue;
     }
     if(!content){
       // An unsplittable token can use the condensed Epson native Font B.
       // Never hyphenate names, negations, allergen terms or arbitrary words.
       if(token.length<=remainingB){content=token;font="B";index++;}
       else return blocked("ANNOTATION_WORD_EXCEEDS_FONT_B");
     }
     break;
   }
   if(!content)return blocked("ANNOTATION_EMPTY_LINE");
   lines.push({
     text:prefix+content,
     font,
     continuation:lines.length>0,
     label:kind,
     chars:prefix.length+content.length,
     nominal_width_dots:(prefix.length+content.length)*(font==="A"?12:9),
     bold_policy:"REQUIRES_PAPER_ACCEPTANCE",
   });
   if(lines.length>MAX_NOTE_LINES)return blocked("ANNOTATION_TOO_MANY_LINES");
 }
 const recovered=lines.map(x=>x.text.slice(x.continuation?CONT_LABELS[kind].length:LABELS[kind].length)).join(" ");
 if(recovered!==normalized)return blocked("ANNOTATION_REASSEMBLY_MISMATCH");
 if(lines.some(x=>x.chars>(x.font==="A"?FONT_A_MAX:FONT_B_MAX) ||x.nominal_width_dots>576))
   return blocked("ANNOTATION_WIDTH_OVERFLOW");
 return {status:"PREVIEW_ONLY",reason:null,kind,normalized,lines,
   effects:{print:false,cut:false,spooler_write:false}};
}
function auditTicketItems(items){
 const groups=[];
 for(const item of items){
   const plans=[
     ...(item.observations??[]).map(text=>createAnnotationPlan("OBS",text)),
     ...(item.finishing??[]).map(text=>createAnnotationPlan("FINALIZAR",text)),
     ...(item.kitchen_dependencies??[]).map(text=>createAnnotationPlan("AGUARDAR_COZINHA",text)),
   ];
   groups.push({
     item_index:item.source_item_index,
     original_product_name:item.print_name,
     original_quantity:item.quantity,
     notes:plans,
     ready_for_automatic_print:false,
   });
 }
 return {schema:"deliveryos.annotation-lineplan.v56.shadow",
   items:groups,
   any_blocked:groups.some(g=>g.notes.some(n=>n.status==="BLOCKED")),
   line_count:groups.reduce((s,g)=>s+g.notes.reduce((a,n)=>a+n.lines.length,0),0),
   source_items_preserved:true,
   effects:{print:false,cut:false,spooler_write:false}};
}
module.exports={createAnnotationPlan,auditTicketItems,canonical,LABELS,CONT_LABELS,FONT_A_MAX,FONT_B_MAX};
