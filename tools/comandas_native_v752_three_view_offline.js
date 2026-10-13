"use strict";
/**
 * V7.52: proof-only native Epson Font A bridge for VERIFIED V6.8 ticket projections.
 * Reuses the existing operational V4.6 text trace; never synthesizes order
 * facts, mutates a source ticket or runs a print transport.
 *
 * Source text layout is NOT Figma visual parity. The physical Epson Font A
 * comparison is limited to the fictitious V7.51 proof on CAIXA_MOOCA.
 */
const crypto=require("node:crypto");
const {renderOperationalTicketsProofV46}=
 require("../dist/src/production/operationalTicketEscposV46.js");
const {makeProduction,makeConference}=
 require("./gerar_prova_figma_v60_offline.js");
const {line,build,encodeCp850}=require("./comandas_native_fonts_v750_offline.js");

const MAX_LINE_COLUMNS=42;
const MAX_SOURCE_LINES=180;
const MAX_NATIVE_LINES=160;
const MAX_TICKET_BYTES=32768;
const NO_EFFECTS=Object.freeze({print:false,spooler_write:false,
 database_write:false,sequence_binding_write:false,
 service_change:false,driver_change:false,deploy:false,cut:false});
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");

function blocked(reasons){
 return {schema:"deliveryos.comandas-native-font-v752.offline",
  status:"HOLD_NATIVE_FONT_CANDIDATE",blockers:[...new Set(reasons)].sort(),
  outputs:[],ready_for_operational_print:false,effects:NO_EFFECTS};
}
function isSourceEligible(source){
 return !!source&&!Array.isArray(source)&&
  source.ready_for_semantic_preview===true&&
  source.ready_for_automatic_operational_print===false&&
  Array.isArray(source.blocking_reasons)&&source.blocking_reasons.length===0&&
  Array.isArray(source.production)&&source.production.length>0&&
  source.conference&&typeof source.conference==="object"&&
  source.effects?.print===false;
}
function wrapVerifiedLine(original){
 if(typeof original!=="string"||original.length>512||
   /[\x00-\x09\x0b-\x1f\x7f]/.test(original))
  throw Error("TRACE_LINE_INVALID");
 const input=original.normalize("NFC").replace(/\r/g,"");
 if(!input.trim())return [" "]; // preserve blank line as white space + LF
 // Reject unsupported bytes BEFORE wrapping. Never strip accents, allergens,
 // negations or unrepresentable characters as a "helpful" fallback.
 encodeCp850(input);
 const chunks=[],words=input.trim().split(/ +/);
 let acc="";
 for(const word of words){
  if(encodeCp850(word).length>MAX_LINE_COLUMNS)
   throw Error("UNBREAKABLE_WORD_EXCEEDS_FONT_A");
  const next=acc?acc+" "+word:word;
  if(encodeCp850(next).length>MAX_LINE_COLUMNS){
   chunks.push(acc);acc=word;
  }else acc=next;
 }
 if(acc)chunks.push(acc);
 if(chunks.join(" ")!==input.trim().replace(/ +/g," "))
  throw Error("SEMANTIC_TEXT_LOSS_IN_WRAP");
 return chunks;
}
function emphasized(original){
 const s=original.trim();
 return !!s&&!/^[-\s]+$/.test(s);
}
function nativeFromTrace(textTrace,kind){
 if(typeof textTrace!=="string"||!textTrace.length||textTrace.length>64000)
  throw Error("INVALID_V46_TRACE");
 const sourceLines=textTrace.split("\n");
 if(sourceLines.length>MAX_SOURCE_LINES)throw Error("SOURCE_TRACE_LINE_BUDGET");
 const encoded=[],plain=[];
 for(const sourceLine of sourceLines){
  const lines=wrapVerifiedLine(sourceLine);
  for(const text of lines){
   const row=line(text,{font:"A",mode:emphasized(text)?"emph":"normal"});
   encoded.push(row);plain.push(row.text);
   if(encoded.length>MAX_NATIVE_LINES)throw Error("NATIVE_LINE_COUNT_BUDGET");
  }
 }
 if(encoded.length===0)throw Error("NATIVE_EMPTY_TICKET");
 // V7.50 build itself limits each segment to 35 lines; segmented ESC/POS text
 // reinserts explicit PC850 and resets font/weight between bounded segments.
 const segments=[];
 for(let i=0;i<encoded.length;i+=35)
  segments.push(build(encoded.slice(i,i+35)));
 const bytes=Buffer.concat(segments);
 if(bytes.length>MAX_TICKET_BYTES)throw Error("NATIVE_PAYLOAD_BUDGET");
 const traceTokens=sourceLines.join(" ").trim().replace(/\s+/g," ");
 const renderedTokens=plain.join(" ").trim().replace(/\s+/g," ");
 if(traceTokens!==renderedTokens)
  throw Error("SOURCE_VS_NATIVE_TEXT_DIFFERENCE");
 if(!bytes.length)throw Error("EMPTY_BINARY");
 return {kind,source_line_count:sourceLines.length,
  native_line_count:plain.length,segment_count:segments.length,
  trace_sha256:sha(Buffer.from(textTrace,"utf8")),
  native_bytes_sha256:sha(bytes),native_byte_count:bytes.length,
  full_text_preserved:true,unrepresentable_replaced:false,
  source_text_lines:plain};
}
function renderVerifiedNativeCandidateV752(source){
 if(!isSourceEligible(source))return blocked(["SOURCE_SEMANTIC_GATE_NOT_VERIFIED"]);
 const traces=renderOperationalTicketsProofV46(source);
 const thermal=[...traces.production,traces.conference];
 const visuals=[...source.production.map(makeProduction),
  makeConference(source.conference)];
 if(thermal.length!==visuals.length||thermal.length<2||
   !thermal.every(x=>x.ready_for_offline_preview===true&&
     x.ready_for_operational_print===false&&
     Array.isArray(x.blocking_reasons)&&x.blocking_reasons.length===0&&
     x.effects?.print===false&&x.effects?.spooler_write===false)||
   !visuals.every(x=>x.ready_for_visual_review===true&&
     x.ready_for_operational_print===false&&
     Array.isArray(x.blocking_reasons)&&x.blocking_reasons.length===0))
  return blocked(["V46_TRACE_OR_FIGMA_SEMANTIC_GATE_BLOCKED"]);
 try{
  const outputs=thermal.map((ticket,index)=>{
   const proof=nativeFromTrace(ticket.text_trace,
    index<traces.production.length?"PRODUCAO":"CONFERENCIA");
   const visual=visuals[index];
   const {source_text_lines,...meta}=proof;
   return {kind:visual.kind,station:visual.station,
    boxes:visual.boxes,product_lines:visual.items,
    design_svg_sha256:sha(Buffer.from(visual.svg,"utf8")),
    ...meta};
  });
  if(outputs.some(x=>x.full_text_preserved!==true||!x.native_bytes_sha256))
   throw Error("PARTIAL_NATIVE_PROOF");
  return {schema:"deliveryos.comandas-native-font-v752.offline",
   status:"NATIVE_FONT_V752_SEMANTIC_PROOF_ONLY",
   source:"VERIFIED_V46_TRACES_AND_APPROVED_FIGMA_STRUCTURE",
   profile:"EPSON_TM_T20X_FONT_A_42_COLUMNS_ESC_E_CP850",
   physical_fidelity:"UNPROVEN_THREE_OPERATIONAL_VIEWS",
   design_fidelity:"NOT_FIGMA_PIXEL_PARITY",
   routing_confirmed_by_this_module:false,
   ready_for_operational_print:false,
   outputs,effects:NO_EFFECTS};
 }catch(error){
  // Deliberately no order text, raw exception/PII or partial artifact on block.
  return blocked(["NATIVE_FONT_ENCODING_OR_WRAPPING_NOT_PROVEN"]);
 }
}

module.exports={renderVerifiedNativeCandidateV752,
 nativeFromTrace,wrapVerifiedLine,NO_EFFECTS};
