"use strict";
/**
 * V7.50 — Epson TM-T20X native-font comparison; SYNTHETIC and OFFLINE ONLY.
 * Inspired by the device-font approach in receiptline, python-escpos and node-thermal-printer.
 * No third-party package or printer transport. Does not configure persistent density.
 * Mode A ESC E emphasized; mode B ESC G double-strike.
 * Do NOT confuse a comparative test ticket with an operational 3-way ticket.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const EXTENDED_CP850="\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00f8\u00a3\u00d8\u00d7\u0192\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u00ae\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb\u2591\u2592\u2593\u2502\u2524\u00c1\u00c2\u00c0\u00a9\u2563\u2551\u2557\u255d\u00a2\u00a5\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u00e3\u00c3\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u00a4\u00f0\u00d0\u00ca\u00cb\u00c8\u0131\u00cd\u00ce\u00cf\u2518\u250c\u2588\u2584\u00a6\u00cc\u2580\u00d3\u00df\u00d4\u00d2\u00f5\u00d5\u00b5\u00fe\u00de\u00da\u00db\u00d9\u00fd\u00dd\u00af\u00b4\u00ad\u00b1\u2017\u00be\u00b6\u00a7\u00f7\u00b8\u00b0\u00a8\u00b7\u00b9\u00b3\u00b2\u25a0\u00a0";
assert.equal(Array.from(EXTENDED_CP850).length,128,"CP850_TABLE_INVALID");
const cp=new Map(Array.from(EXTENDED_CP850,(c,i)=>[c,128+i]));
const ESC=0x1b,GS=0x1d,LF=0x0a;
const CMD=Object.freeze({FONT:"M".charCodeAt(0),EMPH:"E".charCodeAt(0),
 STRIKE:"G".charCodeAt(0),CODEPAGE:"t".charCodeAt(0),
 ALIGN:"a".charCodeAt(0),SIZE:"!".charCodeAt(0)});
const MODES=new Set(["normal","emph","strike"]);
function encodeCp850(s){
 if(typeof s!=="string"||s.length===0)throw Error("EMPTY_TEXT");
 const norm=s.normalize("NFC"),bytes=[];
 for(const ch of norm){
  const cpv=ch.codePointAt(0);
  if(cpv>=0x20&&cpv<=0x7e){bytes.push(cpv);continue}
  if(cp.has(ch)&& !/[\u00ad\u00a0]/u.test(ch)){bytes.push(cp.get(ch));continue}
  throw Error("UNREPRESENTABLE_CP850_U"+cpv.toString(16).toUpperCase());
 }
 return Buffer.from(bytes);
}
function line(text,{font="A",mode="normal"}={}){
 if(!["A","B"].includes(font)||!MODES.has(mode))throw Error("UNSUPPORTED_FONT_MODE");
 const payload=encodeCp850(text);
 const width=font==="A"?42:60; // Epson supports 42/60-column mode; conservative fail-closed cap
 if(payload.length>width)throw Error("NO_TRUNCATE_LINE_OVERFLOW_"+font+"_"+payload.length);
 return {font,mode,text:text.normalize("NFC"),bytes:payload};
}
function makeFictitiousComparison(){
 // Synthetic reference only; duplicated comparisons must never be used as live kitchen tickets.
 const name="1 URAMAKI FICTICIO EXTRA ESPECIAL";
 const note="OBS: CALIBRAÇÃO FICTÍCIA - NÃO PRODUZIR";
 const result=[
 line("TESTE - NAO PRODUZIR / NAO DUPLICAR",{mode:"emph"}),
 line("V7.50 | FONTES NATIVAS EPSON"),
 line("iFood #0000 | TEKNISA 0000000000 | 00:00"),
 line("----------------------------------------"),
 line("AMOSTRA A: ENFASE ESC E",{mode:"emph"}),
 line("SUSHI | C1 CAIXA 450",{mode:"emph"}),
 line(name,{mode:"emph"}),line(note,{mode:"emph"}),
 line("OBS: CONTRASTE E NOME LONGO",{mode:"emph"}),
 line("----------------------------------------"),
 line("AMOSTRA B: DUPLA PASSAGEM ESC G",{mode:"strike"}),
 line("SUSHI | C1 CAIXA 450",{mode:"strike"}),
 line(name,{mode:"strike"}),line(note,{mode:"strike"}),
 line("OBS: CONTRASTE E NOME LONGO",{mode:"strike"}),
 line("----------------------------------------"),
 line("ACENTOS: NÃO / CONFERÊNCIA / AÇÃO",{mode:"emph"}),
 line("IDENTIFICADORES FICTICIOS / SEQUENCIAL 000"),
 line("TESTE - NAO PRODUZIR / NAO DUPLICAR",{mode:"emph"})
 ];
 return result;
}
function build(lines){
 if(!Array.isArray(lines)||!lines.length||lines.length>35)throw Error("LINE_COUNT_OUT_OF_BOUNDS");
 const parts=[];
 const put=(...n)=>parts.push(Buffer.from(n));
 // Explicit volatile text formatting, without printer initialization, cutting,
 // cash drawer pulses, persistent density writes, graphics or driver interaction.
 put(ESC,CMD.CODEPAGE,2); // PC850 multilingual; deterministic byte-to-glyph mapping
 put(ESC,CMD.ALIGN,0);
 put(GS,CMD.SIZE,0); // normal 1x1 glyph dimensions
 for(const row of lines){
  if(!row||!Buffer.isBuffer(row.bytes)||row.bytes.length===0)throw Error("INVALID_LINE");
  const checked=line(row.text,{font:row.font,mode:row.mode});
  if(!row.bytes.equals(checked.bytes))throw Error("ROW_BYTES_IDENTITY_DRIFT");
  put(ESC,CMD.FONT,row.font==="A"?0:1);
  put(ESC,CMD.EMPH,row.mode==="emph"?1:0);
  put(ESC,CMD.STRIKE,row.mode==="strike"?1:0);
  put(...row.bytes,LF);
 }
 put(ESC,CMD.EMPH,0);put(ESC,CMD.STRIKE,0);
 put(ESC,CMD.FONT,0);put(GS,CMD.SIZE,0);
 put(ESC,CMD.CODEPAGE,0);put(ESC,CMD.ALIGN,0);
 const payload=Buffer.concat(parts);
 if(payload.length>4096)throw Error("THERMAL_PAYLOAD_BUDGET");
 return payload;
}
function proof(){
 const l=makeFictitiousComparison(),p=build(l);
 const hash=crypto.createHash("sha256").update(p).digest("hex").toUpperCase();
 return {schema:"tata.comandas.native-font-offline.v750",status:"CANDIDATE_OFFLINE_ONLY",
  lines:l.length,source:"ONLY_SYNTHETIC_REFERENCE",fontAColumns:48,fontBColumns:64,safeColumnsA:42,safeColumnsB:60,
  modeA:"ESC E 1",modeB:"ESC G 1",codepage:"PC850",
  payloadBytes:p.length,sha256:hash,portUsed:false,printJobCreated:false,
  printerSettingsChanged:false,serviceChanged:false,automaticRelease:false,
  bytes:p};
}
function saveFixture(dir){
 const resolved=path.resolve(dir);
 if(path.basename(resolved)!=="calibration-fictitious-v741")
  throw Error("WRITING_ONLY_IN_KNOWN_SYNTHETIC_FOLDER");
 const m=JSON.parse(fs.readFileSync(path.join(resolved,"manifest-v741.json"),"utf8"));
 assert.equal(m.schema,"tata.comandas.synthetic-calibration.v741");
 assert.equal(m.status,"FICTITIOUS_PREVIEW_ONLY");
 assert.equal(m.real_order,false);assert.equal(m.print_authorized,false);
 for(const name of ["01-producao.svg","02-conferencia.svg"]){
  const svg=fs.readFileSync(path.join(resolved,name),"utf8");
  assert.ok(svg.includes("TESTE - NAO PRODUZIR / NAO DUPLICAR"));
  assert.ok(svg.includes("URAMAKI FICTICIO EXTRA ESPECIAL"));
 }
 const p=proof(),f=path.join(resolved,"v750b-native-font-A-vs-B-offline.bin");
 fs.writeFileSync(f,p.bytes,{flag:"wx",mode:0o600});
 return {status:"OFFLINE_BUFFER_WRITTEN",file:path.basename(f),hash:p.sha256,
  bytes:p.payloadBytes,printJobCreated:false,printerSettingsChanged:false};
}
if(require.main===module){
 if(process.argv.length===2||process.argv[2]==="--selftest"&&process.argv.length===3){
  const result=proof();delete result.bytes;console.log(JSON.stringify(result));
 }else if(process.argv[2]==="--fixture"&&process.argv.length===4){
  console.log(JSON.stringify(saveFixture(process.argv[3])));
 }else throw Error("UNSUPPORTED_CLI_NO_TRANSPORT_COMMAND");
}
module.exports={encodeCp850,line,makeFictitiousComparison,build,proof};
