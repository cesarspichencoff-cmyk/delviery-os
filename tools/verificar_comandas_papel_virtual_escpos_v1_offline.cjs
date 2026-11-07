"use strict";
/**
 * Virtual paper gate. The V4.6 bytes must decode with the command set the
 * renderer is known to emit and fit the 72 mm printable width. The layout
 * facts measured against Figma Production V4.4 (node 30:3) and Conference
 * V4.3 (node 20:9) on 02/11/2026 are pinned here, using the masters' OWN
 * example content as fixtures: a renderer change must be re-measured
 * (docs/comandas/VIAS_VS_FIGMA_MEDICAO_20261102.md), never silently accepted.
 * No device, spooler, file or network.
 */
const assert=require("node:assert/strict");
const P=require("./comandas_papel_virtual_escpos_v1_offline.cjs");
const R=require("../dist/src/production/operationalTicketEscposV46.js");
let n=0;const test=(name,fn)=>{fn();console.log("PASS "+(++n)+" "+name);};
const it=(i,q,name,obs=[],dep=[])=>({source_item_index:i,product_code:null,quantity:q,print_name:name,
 observations:obs,finishing:[],kitchen_dependencies:dep});
const box=(pos,model,items)=>({position:pos,model,status:"PROVEN",items,operator_field:"Op. ________"});
// Texts as rendered in the Figma screenshots (layer names there are stale).
const sushi30_3={station:"SUSHI",fingerprint:"fixture",identifiers:{ifood:"5487",teknisa:"1234",tata:"006",hour:"19:45"},
 boxes:[box("C1","750",[it(0,1,"COMBINADO SALMÃO 1 PESSOA")]),
  box("C2","750",[it(1,2,"URAMAKI EBITEN ESPECIAL (8)",["SEM CEBOLINHA"],["2X EBITEN"])])],
 items_without_proven_box:[],warnings:[],ready_for_semantic_preview:true};
const conf20_9={order_id:"fixture",identifiers:{ifood:"3921",teknisa:"17864",tata:"006",hour:"19:42"},revision:1,
 boxes:[box("C1","750",[it(0,1,"COMBINADO SALMÃO 1 PESSOA",["SEM CEBOLINHA"])]),box("C2","750",[it(1,2,"URAMAKI SKIN (8)")])],
 items_without_proven_box:[],items_without_physical_box:[],bags:[],kits:[],
 accompaniments:[{label:"GARI",quantity:1},{label:"TARE",quantity:1}],
 warnings:["BAG_SIZE_NOT_FACT","KIT_ASSIGNMENT_NOT_PROVEN"],ready_for_semantic_preview:true};
const sushi=R.renderProductionTicketProofV46(sushi30_3),conf=R.renderConferenceTicketProofV46(conf20_9);
const L={sushi:P.layoutVirtualPaperV1(sushi.bytes),conf:P.layoutVirtualPaperV1(conf.bytes)};
const line=(lay,text)=>lay.lines.find(l=>l.text===text);
const mm=P.mm;

test("unknown commands are refused, never guessed (cut, raster, feed, tab, other code page)",()=>{
 for(const bad of [[0x1d,0x56,0x00],[0x1d,0x76,0x30,0x00],[0x1b,0x64,0x05],[0x09],[0x1b,0x74,0x00]])
  assert.equal(P.decodeEscposV46([0x1b,0x40,...bad]).errors.length,1,JSON.stringify(bad));
 assert.deepEqual(P.decodeEscposV46([0x1b,0x40,0x41,0x0a]).errors,[]);
});
test("TM-T20 grid: 203 dpi, 576 printable dots (72 mm) on 80 mm, Font A 12x24, Font B 9x17",()=>{
 assert.deepEqual([P.DPI,P.PRINTABLE,mm(P.PRINTABLE)],[203,576,72.07]);
 assert.deepEqual([P.CELL.A,P.CELL.B],[{w:12,h:24},{w:9,h:17}]);
 const r=P.layoutVirtualPaperV1([0x1b,0x61,2,0x1d,0x21,0x11,0x41,0x42,0x0a]);
 assert.deepEqual([r.lines[0].x+r.lines[0].width,r.lines[0].height],[576,48]);
});
test("the masters' own content renders with zero blockers and fits 72 mm",()=>{
 for(const [k,p] of [["sushi",sushi],["conf",conf]]){
  assert.deepEqual(p.blocking_reasons,[],k);assert.ok(p.byte_count>0,k);
  assert.deepEqual([L[k].errors,L[k].overflow],[[],[]],k);
  assert.ok(L[k].lines.every(l=>l.x+l.width<=P.PRINTABLE),k);
 }
});
test("matches the masters: item 1x2 Font A bold (6.01 mm cell vs 6.1 mm box), TATÁ number last and right-aligned",()=>{
 const item=line(L.sushi,"1  COMBINADO SALMÃO 1 PESSOA");
 assert.deepEqual([item.runs[0].font,item.runs[0].bold,item.runs[0].wmul,item.runs[0].hmul,mm(item.height)],["A",true,1,2,6.01]);
 for(const k of ["sushi","conf"]){
  const printed=L[k].lines.filter(l=>l.text);const last=printed.at(-1);
  assert.deepEqual([last.text,last.align,last.x+last.width,last.runs[0].wmul,last.runs[0].hmul],["006","RIGHT",576,2,2],k);
 }
 assert.ok(line(L.conf,"OBS: SEM CEBOLINHA"));assert.ok(line(L.sushi,"AGUARDAR COZINHA: 2X EBITEN"));
});
test("measured differences (doc table D1-D13) stay exactly as measured until re-measured",()=>{
 const div=line(L.sushi,"--------------------------------");
 assert.equal(mm(div.width),48.05);                                    // D1 master divider 72 mm
 const confText=L.conf.lines.map(l=>l.text);
 const firstBox=confText.indexOf("C1  CAIXA 750  Op. ________"),secondBox=confText.indexOf("C2  CAIXA 750  Op. ________");
 assert.ok(firstBox>=0&&secondBox>firstBox);
 assert.equal(confText.slice(firstBox,secondBox).includes("--------------------------------"),false); // D2
 const op=line(L.conf,"C1  CAIXA 750  Op. ________");
 assert.deepEqual([mm(15*12),mm(op.width)],[22.52,40.54]);             // D3 master right column
 assert.equal(confText.filter(t=>t==="1 CAIXA | 1 PRODUTO").length,2);  // D4
 assert.ok(confText.includes("FINALIZAÇÃO: CONFERIR FICHA VALIDADA"));  // D5
 assert.equal(L.conf.lines[0].text,"TESTE - NAO PRODUZIR");              // D6
 const st=line(L.sushi,"PRODUCAO SUSHI");
 assert.deepEqual([st.runs[0].wmul,st.runs[0].hmul,mm(st.height)],[1,1,3]); // D7 master 6.1 mm
 assert.deepEqual([line(L.conf,"CONFERENCIA").runs[0].font],["B"]);     // D8
 assert.ok(line(L.sushi,"IFOOD 5487 | TEKNISA 1234 | 19:45"));          // D9
 assert.ok(line(L.sushi,"C1  CAIXA 750"));                               // D10 no descriptor
 assert.equal(line(L.sushi,"OBS: SEM CEBOLINHA").runs[0].bold,false);   // D11
 assert.ok(["SACOLA: A DEFINIR","KIT: A DEFINIR","ACOMP: 1 GARI | 1 TARE"].every(t=>confText.includes(t))); // D12
 const seq=L.sushi.lines.find(l=>l.text==="006"),item=line(L.sushi,"1  COMBINADO SALMÃO 1 PESSOA");
 assert.deepEqual([mm(seq.height),mm(item.height)],[6.01,6.01]);       // D13 TATÁ not taller than items
});
// ── V4.8: the renderer aligned to the masters (César, 02/11/2026). Same fixtures.
const F=require("../dist/src/production/operationalTicketEscposFigmaV48.js");
const sushi48=F.renderProductionTicketFigmaV48(sushi30_3),conf48=F.renderConferenceTicketFigmaV48(conf20_9);
const L48={sushi:P.layoutVirtualPaperV1(sushi48.bytes),conf:P.layoutVirtualPaperV1(conf48.bytes)};
const T48=k=>L48[k].lines.map(l=>l.text);
test("V4.8 renders the masters' content with zero blockers inside 72 mm, one command set",()=>{
 for(const [k,p] of [["sushi",sushi48],["conf",conf48]]){
  assert.deepEqual(p.blocking_reasons,[],k);assert.ok(p.byte_count>0,k);
  assert.deepEqual([L48[k].errors,L48[k].overflow],[[],[]],k);
  assert.equal(p.ready_for_operational_print,false);
 }
});
test("V4.8 closes D1-D3: 72 mm dividers after every box, Op. ending at the right edge",()=>{
 const div=L48.conf.lines.find(l=>/^-+$/.test(l.text));
 assert.deepEqual([mm(div.width),div.text.length],[mm(576),48]);                         // D1
 const t=T48("conf"),c1=t.indexOf("C1  CAIXA 750"+" ".repeat(23)+"Op. ________"),c2=t.findIndex(x=>/^C2  CAIXA 750 +Op\. ________$/.test(x));
 assert.ok(c1>=0&&c2>c1,"box lines");
 assert.equal(t.slice(c1,c2).filter(x=>x==="-".repeat(48)).length,1);                      // D2
 const op=L48.conf.lines[c1];assert.deepEqual([op.x+op.width,mm(op.x+op.width-12*12)],[576,54.05]); // D3
});
test("V4.8 closes D4/D5/D8/D9/D12: master texts, no lines the master lacks",()=>{
 assert.ok(!T48("conf").some(x=>/^1 CAIXA \||FINALIZAÇÃO/.test(x)));                       // D4 D5
 assert.equal(T48("conf")[1],"CONFERÊNCIA");                                                  // D8
 assert.ok(T48("sushi").includes("iFood #5487  |  TEKNISA 1234  |  19:45"));                 // D9 = master 30:3
 assert.ok(T48("conf").includes("iFood #3921  |  TEKNISA 17864  |  19:42"));
 assert.ok(T48("conf").includes("Sacola: a conferir  |  Kit: a conferir"));                 // D12 = master 20:9
 assert.ok(T48("conf").includes("Acomp.: 1 Gari  |  1 Tare"));
});
test("V4.8 closes D7/D11/D13: praça 1x2 bold, production notes bold, TATÁ 3x3 the tallest",()=>{
 const st=L48.sushi.lines[1];
 assert.deepEqual([st.text,st.runs[0].hmul,st.runs[0].bold,mm(st.height)],["SUSHI",2,true,6.01]); // D7 master 6.1 mm
 for(const t of ["OBS: SEM CEBOLINHA","AGUARDAR COZINHA: 2X EBITEN"])
  assert.equal(L48.sushi.lines.find(l=>l.text===t).runs[0].bold,true,t);                       // D11
 assert.equal(L48.conf.lines.find(l=>l.text==="OBS: SEM CEBOLINHA").runs[0].bold,false);
 for(const k of ["sushi","conf"]){
  const seq=L48[k].lines.find(l=>l.text==="006");
  assert.deepEqual([seq.align,seq.x+seq.width,seq.runs[0].wmul,seq.runs[0].hmul,mm(seq.height)],["RIGHT",576,3,3,9.01],k); // D13 master 9.5 mm
  assert.ok(L48[k].lines.every(l=>l===seq||l.height<seq.height),k);
 }
});
test("V4.8 keeps every fact of the source: ids, boxes, items, notes, resources, number",()=>{
 const want=["SIMULAÇÃO · NÃO PRODUZIR","SUSHI","C1  CAIXA 750","1  COMBINADO SALMÃO 1 PESSOA","C2  CAIXA 750",
  "2  URAMAKI EBITEN ESPECIAL (8)","OBS: SEM CEBOLINHA","AGUARDAR COZINHA: 2X EBITEN","006"];
 assert.deepEqual(T48("sushi").filter(x=>x&&!/^-+$/.test(x)&&!/^iFood/.test(x)),want);
 assert.ok(["1  COMBINADO SALMÃO 1 PESSOA","2  URAMAKI SKIN (8)","OBS: SEM CEBOLINHA","006"].every(x=>T48("conf").includes(x)));
});
test("V4.8 inherits every V4.6 semantic veto: no number or an unready view gives zero bytes",()=>{
 const noNumber=F.renderProductionTicketFigmaV48({...sushi30_3,identifiers:{...sushi30_3.identifiers,tata:"SEM"}});
 assert.deepEqual([noNumber.byte_count,noNumber.blocking_reasons.includes("TATA_SEQUENCE_NOT_PROVEN")],[0,true]);
 assert.ok(noNumber.text_trace.includes("iFood #5487  |  TEKNISA 1234  |  19:45"),"ids stay visible in the preview");
 const unready=F.renderOperationalTicketsFigmaV48({ready_for_semantic_preview:false,blocking_reasons:["X"],
  production:[sushi30_3],conference:conf20_9});
 assert.ok([...unready.production,unready.conference].every(v=>v.byte_count===0&&
  v.blocking_reasons.includes("GLOBAL_SOURCE_SEMANTIC_BLOCKED")));
});
test("virtual paper declares no physical effect",()=>{
 assert.deepEqual(L.sushi.effects,{print:false,spooler:false,device:false,network:false,file_write:false});
 assert.ok(L.sushi.assumptions.includes("GLYPHS_NOT_EPSON_BITMAPS"));
});
console.log("COMANDAS_VIRTUAL_PAPER_V1="+n+"/"+n+" FIGMA_30_3_20_9_MEASURED V46_DEVIATIONS_PINNED V48_ALIGNED NO_DEVICE");
