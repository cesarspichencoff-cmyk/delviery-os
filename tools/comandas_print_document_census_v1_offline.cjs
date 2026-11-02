"use strict";
/**
 * Content-minimizing print document census. PURE: no filesystem, network,
 * spooler, printer, SQL or child process.
 *
 * Input: the bytes of ONE print submission (for example one retained spool
 * job) or, in aggregate mode, a whole Odhen LogIMP file whose block framing
 * is not proven.
 * Output: closed enums and integer counts ONLY. Never decoded text, never a
 * hash of raw content, never an order/customer identifier.
 *
 * Classification uses only markers proven in repository sources. Everything
 * else stays UNKNOWN_FORMAT: in particular the iFood GP/Gestor invoice layout
 * is not known from any source, so no rule pretends to recognize it.
 * A classification is a statement about bytes submitted for printing, never
 * about paper, device effect, order identity or first native dispatch.
 */
const SCHEMA="tata.comandas.print-document-census.v1.review-only";
const EFFECTS=Object.freeze({filesystem_read:false,filesystem_write:false,
 network:false,spooler:false,print:false,sql:false,child_process:false});

// Closed marker vocabulary. `evidence` is the repository file proving that the
// literal belongs to a print path; the field-matrix verifier checks it exists.
const MARKERS=Object.freeze({
 DELIVERY_REPORT_HEADER:Object.freeze({re:/Relatorio De Entrega/gi,
  evidence:"docs/comandas/AUDITORIA_RAMOS_IMPRESSAO_RELATORIO_DELIVERY_VS_PRODUCAO_20261027.md"}),
 DLV_COMANDA:Object.freeze({re:/COMANDA\.?\s*:\s*DLV_\d+/gi,
  evidence:"docs/Print_Topology_Production_Ticket_Source_Map_V132.md"}),
 SENHA_LABEL:Object.freeze({re:/\bSENHA\b/gi,
  evidence:"docs/Print_Topology_Production_Ticket_Source_Map_V132.md"}),
 MESA_LABEL:Object.freeze({re:/\bMesa\b/g,
  evidence:"data/tata_reader_passive_print_log_source_proof_20261005_v1.json"}),
 PEDIDO_LABEL:Object.freeze({re:/\bPedido\b/g,
  evidence:"data/tata_reader_passive_print_log_source_proof_20261005_v1.json"}),
 ORDER_OBS_LABEL:Object.freeze({re:/^[ \t]*OBS\.:/gm,
  evidence:"docs/Passive_Print_Log_Shadow_V132.md"}),
 FISCAL_NFCE:Object.freeze({re:/DANFE\s+NFC-?e|Documento Auxiliar da Nota Fiscal de Consumidor/gi,
  evidence:"docs/Fiscal_Observation_Architecture_2026-10-05.md"}),
 TATA_TEST_BANNER:Object.freeze({re:/TESTE - NAO PRODUZIR/g,
  evidence:"src/production/operationalTicketEscposV46.ts"})
});
const KINDS=Object.freeze(["DELIVERY_REPORT","PRODUCTION_TICKET_DLV_MARKED",
 "TABLE_TICKET_CANDIDATE","TATA_SHADOW_TEST","FISCAL_EXCLUDED",
 "MULTIPLE_DOCUMENTS_FRAMING_UNPROVEN","UNKNOWN_FORMAT","EMPTY"]);

const ESC=0x1b,GS=0x1d,FS=0x1c,DLE=0x10;
const ESC_PARAMS={0x40:0,0x21:1,0x2d:1,0x45:1,0x47:1,0x4d:1,0x61:1,0x64:1,
 0x74:1,0x32:0,0x33:1,0x4a:1,0x70:3,0x52:1,0x7b:1,0x56:1,0x20:1,0x24:2,
 0x5c:2,0x63:2,0x69:0,0x6d:0,0x3d:1,0x72:1,0x55:1,0x44:-1};
const GS_PARAMS={0x21:1,0x42:1,0x48:1,0x66:1,0x68:1,0x77:1,0x4c:2,0x57:2,
 0x2f:1,0x61:1,0x72:1,0x49:1,0x50:2,0x24:2,0x5c:2};
const FS_PARAMS={0x70:2,0x26:0,0x2e:0,0x21:1,0x43:1};

function asBytes(input){
 if(Buffer.isBuffer(input))return input;
 if(input instanceof Uint8Array)return Buffer.from(input);
 if(Array.isArray(input)&&input.every(b=>Number.isInteger(b)&&b>=0&&b<=255))
  return Buffer.from(input);
 return null;
}
function mnemonic(prefix,cmd,arg){
 const p=prefix===ESC?"ESC":prefix===GS?"GS":prefix===FS?"FS":"DLE";
 const c=cmd>=0x21&&cmd<=0x7e?String.fromCharCode(cmd):"x"+cmd.toString(16);
 return p+c+(arg===undefined?"":String(arg));
}

/** Strip ESC/POS commands; keep printable text IN MEMORY ONLY. */
function decode(bytes){
 const out=[],prologue=[];
 const stats={init:0,codepage_select:0,cut:0,raster_or_barcode:0,
  unknown_command:0,other_control:0,truncated_command:0};
 const note=(prefix,cmd,arg)=>{if(prologue.length<6)prologue.push(mnemonic(prefix,cmd,arg));};
 let i=0;
 const skip=(n)=>{if(i+n>bytes.length){stats.truncated_command++;i=bytes.length;return false;}i+=n;return true;};
 while(i<bytes.length){
  const b=bytes[i];
  if(b===ESC||b===GS||b===FS||b===DLE){
   if(i+1>=bytes.length){stats.truncated_command++;break;}
   const cmd=bytes[i+1];i+=2;
   if(b===ESC){
    if(cmd===0x40)stats.init++;
    if(cmd===0x74)stats.codepage_select++;
    if(cmd===0x69||cmd===0x6d)stats.cut++;
    if(cmd===0x2a){ // ESC * m nL nH d1..dk (bit image)
     if(i+3>bytes.length){stats.truncated_command++;break;}
     const m=bytes[i],k=bytes[i+1]+bytes[i+2]*256;
     note(b,cmd,m);stats.raster_or_barcode++;skip(3+k*(m>=32?3:1));continue;
    }
    if(cmd===0x44){ // ESC D n1..nk NUL (tab stops)
     note(b,cmd);while(i<bytes.length&&bytes[i]!==0)i++;i++;continue;
    }
    const n=ESC_PARAMS[cmd];
    if(n===undefined){stats.unknown_command++;note(b,cmd);continue;}
    note(b,cmd,n?bytes[i]:undefined);skip(n);continue;
   }
   if(b===GS){
    if(cmd===0x56){ // GS V m [n]
     if(i>=bytes.length){stats.truncated_command++;break;}
     const m=bytes[i];stats.cut++;note(b,cmd,m);skip(m===65||m===66||m===97||m===98||m===103||m===104?2:1);continue;
    }
    if(cmd===0x6b){ // GS k m d... NUL | GS k m n d1..dn
     if(i>=bytes.length){stats.truncated_command++;break;}
     const m=bytes[i];stats.raster_or_barcode++;note(b,cmd,m);
     if(m<=6){i++;while(i<bytes.length&&bytes[i]!==0)i++;i++;}
     else{if(i+2>bytes.length){stats.truncated_command++;break;}skip(2+bytes[i+1]);}
     continue;
    }
    if(cmd===0x28||cmd===0x38){ // GS ( fn pL pH d.. | GS 8 L p1..p4 d..
     const four=cmd===0x38;
     if(i+(four?5:3)>bytes.length){stats.truncated_command++;break;}
     const len=four?bytes[i+1]+bytes[i+2]*256+bytes[i+3]*65536+bytes[i+4]*16777216
      :bytes[i+1]+bytes[i+2]*256;
     stats.raster_or_barcode++;note(b,cmd,bytes[i]);skip((four?5:3)+len);continue;
    }
    if(cmd===0x76){ // GS v 0 m xL xH yL yH d..
     if(i+6>bytes.length){stats.truncated_command++;break;}
     const len=(bytes[i+2]+bytes[i+3]*256)*(bytes[i+4]+bytes[i+5]*256);
     stats.raster_or_barcode++;note(b,cmd,bytes[i+1]);skip(6+len);continue;
    }
    if(cmd===0x2a){ // GS * x y d (x*y*8)
     if(i+2>bytes.length){stats.truncated_command++;break;}
     const len=bytes[i]*bytes[i+1]*8;stats.raster_or_barcode++;note(b,cmd);skip(2+len);continue;
    }
    const n=GS_PARAMS[cmd];
    if(n===undefined){stats.unknown_command++;note(b,cmd);continue;}
    note(b,cmd,n?bytes[i]:undefined);skip(n);continue;
   }
   if(b===FS){
    const n=FS_PARAMS[cmd];
    if(n===undefined){stats.unknown_command++;note(b,cmd);continue;}
    note(b,cmd);skip(n);continue;
   }
   // DLE EOT n | DLE ENQ n | DLE DC4 fn m t
   const n=cmd===0x04||cmd===0x05?1:cmd===0x14?3:undefined;
   if(n===undefined){stats.unknown_command++;note(b,cmd);continue;}
   note(b,cmd);skip(n);continue;
  }
  if(b===0x0a||b===0x0d||b===0x09){out.push(b);i++;continue;}
  if(b<0x20||b===0x7f){stats.other_control++;i++;continue;}
  out.push(b);i++;
 }
 // latin1 keeps every byte; markers are ASCII, so code page (CP850/1252)
 // ambiguity cannot change classification.
 return {text:Buffer.from(out).toString("latin1"),stats,prologue};
}

function countMarkers(text){
 const counts={};
 for(const [name,{re}] of Object.entries(MARKERS)){
  const g=new RegExp(re.source,re.flags.includes("g")?re.flags:re.flags+"g");
  counts[name]=(text.match(g)||[]).length;
 }
 return counts;
}
function classify(c,nonEmpty){
 if(!nonEmpty)return "EMPTY";
 if(c.FISCAL_NFCE>0)return "FISCAL_EXCLUDED";
 const families=[c.DELIVERY_REPORT_HEADER>0,c.TATA_TEST_BANNER>0,
  c.DLV_COMANDA>0].filter(Boolean).length;
 if(families>1||c.DELIVERY_REPORT_HEADER>1||c.DLV_COMANDA>1||c.TATA_TEST_BANNER>1)
  return "MULTIPLE_DOCUMENTS_FRAMING_UNPROVEN";
 if(c.TATA_TEST_BANNER===1)return "TATA_SHADOW_TEST";
 if(c.DELIVERY_REPORT_HEADER===1)return "DELIVERY_REPORT";
 if(c.DLV_COMANDA===1)return "PRODUCTION_TICKET_DLV_MARKED";
 // "Mesa" was observed in archived IMP logs; the document type behind it is
 // NOT source-attributed, so it is only a candidate. "Pedido" alone is not a
 // discriminator: the iFood layouts are unknown and may carry it too.
 if(c.MESA_LABEL>0)return "TABLE_TICKET_CANDIDATE";
 return "UNKNOWN_FORMAT";
}
function lineCount(text){
 return text.split(/\r?\n/).filter(l=>l.trim()).length;
}

/** Census of ONE submission. Returns enums and counts only. */
function censusSubmissionV1(input){
 const bytes=asBytes(input);
 if(!bytes)return {schema:SCHEMA,status:"HOLD",reason:"INPUT_NOT_BYTES",effects:EFFECTS};
 const {text,stats,prologue}=decode(bytes);
 const counts=countMarkers(text);
 const kind=classify(counts,text.trim().length>0);
 const fiscal=kind==="FISCAL_EXCLUDED";
 return {schema:SCHEMA,status:"CENSUS_ONLY",unit:"SUBMISSION",kind,
  // Fiscal documents are excluded: no structural detail beyond kind/size.
  marker_counts:fiscal?null:counts,
  printable_lines:fiscal?null:lineCount(text),
  byte_length:bytes.length,
  escpos:fiscal?null:{...stats,prologue_signature:prologue.join("|")||"NONE"},
  decode_confidence:stats.unknown_command||stats.truncated_command?"PARTIAL":"FULL",
  claims:{paper_proven:false,device_effect_proven:false,
   order_identity_proven:false,first_native_dispatch_proven:false,
   ifood_layout_recognized:false},
  privacy:{text_returned:false,raw_hash_returned:false,identifiers_returned:false},
  effects:EFFECTS};
}

/** Aggregate census of a whole log file whose block framing is unproven. */
function censusAggregateV1(input){
 const bytes=asBytes(input);
 if(!bytes)return {schema:SCHEMA,status:"HOLD",reason:"INPUT_NOT_BYTES",effects:EFFECTS};
 const {text,stats}=decode(bytes);
 const counts=countMarkers(text);
 return {schema:SCHEMA,status:"CENSUS_ONLY",unit:"AGGREGATE_NO_FRAMING",
  kind:null,marker_counts:counts,printable_lines:lineCount(text),
  byte_length:bytes.length,fiscal_marker_present:counts.FISCAL_NFCE>0,
  escpos:{...stats},
  claims:{paper_proven:false,device_effect_proven:false,
   order_identity_proven:false,first_native_dispatch_proven:false,
   documents_counted:false},
  privacy:{text_returned:false,raw_hash_returned:false,identifiers_returned:false},
  effects:EFFECTS};
}

/** Boolean self-check of the decoder against a known text trace (tests only). */
function decoderMatchesTraceV1(input,expectedText){
 const bytes=asBytes(input);
 if(!bytes||typeof expectedText!=="string")return false;
 const norm=s=>s.split(/\r?\n/).map(l=>l.trimEnd()).join("\n").replace(/\n+$/,"");
 return norm(decode(bytes).text)===norm(expectedText);
}

/**
 * Provenance ladder for ONE submission. Three identity classes are kept apart:
 *   ORDER_REFERENCE      what the document itself carries;
 *   PRINT_SUBMISSION     bytes that reached a logged bridge/queue destination;
 *   DEVICE_EFFECT        always UNKNOWN here (no sensor, no witness).
 * Verdicts: INSUFFICIENT_EVIDENCE < SOURCE_PRINT_FORMAT_PROVEN <
 * ORDER_TO_SUBMISSION_CANDIDATE. Nothing reaches paper or world proof.
 * Only a revision-bound FOUR-PART native key can link a submission to an
 * order; short code, NRCOMANDA alone, time window, queue name or file
 * counter never become identity.
 */
const KNOWN_FORMATS=new Set(["DELIVERY_REPORT","PRODUCTION_TICKET_DLV_MARKED"]);
const WEAK_REFERENCES=new Set(["NRCOMANDA_ONLY","SHORT_CODE","TIME_WINDOW",
 "QUEUE_NAME","FILE_COUNTER","ITEM_CONTENT_MATCH"]);
function provenanceVerdictV1(evidence){
 const e=evidence&&typeof evidence==="object"?evidence:{};
 const c=e.census,ref=e.order_reference;
 const out=(verdict,reason)=>({schema:SCHEMA+".provenance",verdict,reason,
  identity:{order_reference:verdict==="ORDER_TO_SUBMISSION_CANDIDATE"?"FOUR_PART_KEY_REVISION_BOUND":
   ref&&ref.kind?String(ref.kind):"NONE",
   print_submission:verdict==="INSUFFICIENT_EVIDENCE"?"UNPROVEN":"LOGGED_DESTINATION",
   device_effect:"UNKNOWN"},
  world_proven:false,paper_proven:false,effects:EFFECTS});
 if(!c||c.schema!==SCHEMA||c.unit!=="SUBMISSION")return out("INSUFFICIENT_EVIDENCE","SUBMISSION_CENSUS_REQUIRED");
 if(c.kind==="FISCAL_EXCLUDED")return out("INSUFFICIENT_EVIDENCE","FISCAL_CHANNEL_EXCLUDED");
 if(c.kind==="TATA_SHADOW_TEST")return out("INSUFFICIENT_EVIDENCE","TATA_TEST_DOCUMENT_IN_STREAM_ANOMALY");
 if(!KNOWN_FORMATS.has(c.kind))return out("INSUFFICIENT_EVIDENCE","DOCUMENT_FORMAT_NOT_SOURCE_PROVEN");
 if(e.destination_resolution!=="RESOLVED")return out("INSUFFICIENT_EVIDENCE","DESTINATION_NOT_UNIQUELY_RESOLVED");
 if(!ref||!ref.kind)return out("SOURCE_PRINT_FORMAT_PROVEN","NO_ORDER_REFERENCE");
 if(WEAK_REFERENCES.has(ref.kind))return out("SOURCE_PRINT_FORMAT_PROVEN","WEAK_REFERENCE_IS_NOT_IDENTITY");
 if(ref.kind!=="FOUR_PART_KEY"||ref.revision_bound!==true)
  return out("SOURCE_PRINT_FORMAT_PROVEN","ORDER_REFERENCE_UNBOUND");
 return out("ORDER_TO_SUBMISSION_CANDIDATE","FOUR_PART_KEY_CLAIM_NOT_INDEPENDENTLY_ATTESTED");
}

module.exports={SCHEMA,EFFECTS,MARKERS,KINDS,censusSubmissionV1,
 censusAggregateV1,decoderMatchesTraceV1,provenanceVerdictV1};
