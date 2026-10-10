/** V6.7: deterministic, read-only thermal annotation line plan.
 * Ported from the independently verified V5.6 planner. Nominal Epson
 * native-font widths remain UNCALIBRATED on physical paper.
 */
export type NoteKindV67="OBS"|"FINALIZAR"|"AGUARDAR_COZINHA";
export type AnnotationLineV67={text:string;font:"A"|"B";continuation:boolean;chars:number};
export type AnnotationPlanV67={
 status:"PREVIEW_ONLY"|"BLOCKED";reason:string|null;normalized:string;
 lines:AnnotationLineV67[];print_authorized:false;
};
const FIRST:Record<NoteKindV67,string>={
 OBS:"OBS: ",FINALIZAR:"FINALIZAR: ",AGUARDAR_COZINHA:"AGUARDAR COZINHA: ",
};
const NEXT:Record<NoteKindV67,string>={
 OBS:"OBS > ",FINALIZAR:"FINALIZAR > ",AGUARDAR_COZINHA:"COZINHA > ",
};
const A=48,B=64,MAX_LINES=12;
export function planAnnotationV67(kind:NoteKindV67,raw:string):AnnotationPlanV67{
 const normalized=String(raw??"").replace(/\s+/g," ").trim().toLocaleUpperCase("pt-BR");
 const denied=(reason:string):AnnotationPlanV67=>({
   status:"BLOCKED",reason,normalized,lines:[],print_authorized:false
 });
 if(!Object.prototype.hasOwnProperty.call(FIRST,kind))return denied("UNSUPPORTED_NOTE_KIND");
 if(!normalized)return denied("EMPTY_ANNOTATION");
 if([...normalized].some(c=>{
   const code=c.codePointAt(0)??0;
   return code<32||code>255||code===127||code===173||(code>=128&&code<160);
 }))return denied("ANNOTATION_ENCODING_UNSUPPORTED");
 const words=normalized.split(" "),lines:AnnotationLineV67[]=[];
 let index=0;
 while(index<words.length){
   if(lines.length>=MAX_LINES)return denied("ANNOTATION_TOO_MANY_LINES");
   const prefix=lines.length?NEXT[kind]:FIRST[kind];
   const remainingA=A-prefix.length,remainingB=B-prefix.length;
   let content="",font:"A"|"B"="A";
   while(index<words.length){
     const token=words[index];
     const candidate=content?content+" "+token:token;
     if(candidate.length<=remainingA){content=candidate;index++;continue;}
     if(!content){
       if(token.length<=remainingB){content=token;font="B";index++;}
       else return denied("ANNOTATION_WORD_EXCEEDS_FONT_B");
     }
     break;
   }
   if(!content)return denied("ANNOTATION_EMPTY_LINE");
   const line=prefix+content;
   if(line.length>(font==="A"?A:B)||line.length*(font==="A"?12:9)>576)
      return denied("ANNOTATION_WIDTH_OVERFLOW");
   lines.push({text:line,font,continuation:lines.length>0,chars:line.length});
 }
 const recovered=lines.map((line,i)=>line.text.slice(
    i?NEXT[kind].length:FIRST[kind].length)).join(" ");
 if(recovered!==normalized)return denied("ANNOTATION_REASSEMBLY_MISMATCH");
 return {status:"PREVIEW_ONLY",reason:null,normalized,lines,print_authorized:false};
}
