"use strict";
/** Only OFFLINE files. Never writes to a printer/network/driver/spooler. */
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const crypto=require("node:crypto");
const {OfflinePrinter,renderOperationalTicketsProofV46}=
 require("../dist/src/production/operationalTicketEscposV46.js");
const {archivedResult}=require("./verificar_real_order_tickets_v46.js");
const {inspectEscPos}=require("./escposByteInspectorV51.js");
const printers=require("../data/production_printer_calibration_registry_v1.json");
function escapeXml(text){return String(text).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
 .replace(/"/g,"&quot;").replace(/'/g,"&apos;");}
function makeCalibrationChart(){
 const p=new OfflinePrinter();
 p.font("A");p.bold(true);
 p.line("CALIBRACAO EPSON 80MM");
 p.line("TESTE - NAO E PEDIDO");
 p.bold(false);p.line("--------------------------------");
 p.bold(true);p.font("A");p.heightDouble(true);
 p.line("3  HOT ROLL TATA","BIG_TEST");
 p.line("12  URAMAKI EBITEN","BIG_TEST");
 p.heightDouble(false);p.bold(false);
 p.line("OBS: SEM PIMENTA E SEM SAL");
 p.line("ACENTOS: AÇÃO PÃO É Ç SHISÔ","ACCENT_TEST");
 p.line("DISTINGUIR: O 0   I l 1   B 8   S 5");
 p.line("FONT A / 12 DOTS POR CARACTERE");
 p.font("B");
 p.line("FONT B / 9 DOTS POR CARACTERE / TEXTO LONGO COMPACTO");
 p.font("A");p.bold(true);p.line("--------------------------------");
 p.line("SIMULAR PAPEL EM AMBIENTE ESCURO");
 p.bold(false);p.ending("999");
 const proof=p.result("FOLHA_DE_CALIBRACAO_SEM_PEDIDO");
 if(!proof.ready_for_offline_preview)throw Error(proof.blocking_reasons.join("; "));
 return proof;
}
function toGeometricSvg(report,title){
 if(!report.pass)throw Error(report.errors.join("; "));
 const pad=24,w=576+pad*2;
 let y=62;
 const lines=[];
 for(const line of report.lines){
  const left=pad+(line.alignment==="RIGHT"?576-line.width_dots:
    line.alignment==="CENTER"?(576-line.width_dots)/2:0);
  for(const seg of line.segments){
   // Native printer bitmap glyphs are NOT equivalent to the host sans/mono;
   // this is an annotated GEOMETRIC projection of actual ESC/POS commands.
   const x=left+seg.start_dot;
   const fontSize=Math.max(11,Math.min(46,
     (seg.font==="A"?24:17)*seg.scale_height*.78));
   lines.push('<text x="'+x+'" y="'+(y+Math.max(21,Math.min(49,line.effective_height_dots))-5)+
    '" font-family="monospace" font-size="'+fontSize+'" font-weight="'+(seg.bold?"bold":"normal")+
    '" textLength="'+Math.max(1,seg.width_dots)+'" lengthAdjust="spacingAndGlyphs">'+
     escapeXml(seg.text)+'</text>');
  }
  y+=Math.max(30,line.effective_height_dots)+2;
 }
 const h=y+45;
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
 '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+
 '" viewBox="0 0 '+w+' '+h+'">'+
 '<rect width="100%" height="100%" fill="white"/>'+
 '<text x="'+pad+'" y="24" font-family="monospace" font-size="13" font-weight="bold">'+
 escapeXml(title)+'</text>'+
 '<text x="'+pad+'" y="43" font-family="monospace" font-size="10">'+
 'SIMULACAO GEOMETRICA - NAO E FOTO DO PAPEL</text>'+
 '<line x1="'+pad+'" y1="47" x2="'+(pad+576)+'" y2="47" stroke="black" stroke-width="1"/>'+
 lines.join("\n")+
 '<line x1="'+pad+'" y1="'+(h-28)+'" x2="'+(pad+576)+'" y2="'+(h-28)+
 '" stroke="black" stroke-width="1"/>'+
 '</svg>\n';
}
function generate(){
 const chart=makeCalibrationChart();
 const proofs=renderOperationalTicketsProofV46(archivedResult());
 const sources=[
  {name:"00_calibracao_sem_pedido",ticket:chart},
  ...proofs.production.map((p,i)=>({name:"0"+(i+1)+"_producao_"+i,ticket:p})),
  {name:"03_conferencia_real_arquivada",ticket:proofs.conference},
 ];
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"tata-epson-quality-v51-"));
 const files=[];
 for(const row of sources){
  const inspection=inspectEscPos(row.ticket.bytes);
  if(!inspection.pass)throw Error(row.name+":"+inspection.errors.join(", "));
  fs.writeFileSync(path.join(temp,row.name+".escpos"),Buffer.from(row.ticket.bytes));
  fs.writeFileSync(path.join(temp,row.name+".txt"),row.ticket.text_trace+"\n");
  fs.writeFileSync(path.join(temp,row.name+".svg"),
    toGeometricSvg(inspection,row.name));
  const B=inspection.lines.filter(l=>l.segments.some(seg=>
     seg.font==="B" && /^\d+\s{2}[A-Z]/.test(l.text)));
  files.push({name:row.name,sha256:crypto.createHash("sha256")
   .update(Buffer.from(row.ticket.bytes)).digest("hex"),
   bytes:row.ticket.bytes.length,lines:inspection.lines.length,
   line_issues:inspection.errors,small_product_lines_requiring_physical_review:B.map(l=>l.text),
   files:[row.name+".escpos",row.name+".txt",row.name+".svg"]});
 }
 const manifest={
  schema:"deliveryos.epson-quality-package.v51.offline",
  printer_model_family:"Epson TM-T20",
  source:"real archived replay plus calibration chart, no customer live data",
  dpi_assumed:203,print_width_dots_assumed:576,
  svg_precision:"GEOMETRIC_ONLY_NOT_FIGMA_OR_NATIVE_EPSON_BITMAP",
  code_page_requested:"ESC t 16 (WPC1252)",
  commands_based_on:"Epson ESC/POS official reference",
  printer_variants:printers.printers.map(x=>({
    name:x.printer_name,queue:x.calibration.windows_queue_name,
    driver:x.calibration.windows_driver_name,physical_proof:"UNKNOWN",
    calibration_required:true,
  })),
  physical_checks:["model_variant","paper_actual_width","self_test",
   "accent_glyphs","Font_A_vs_Font_B_in_low_light","density_against_paper",
   "speed_against_density","feed_and_cut","queue_specific_route",
   "operator_and_item_legibility","print_head_and_roller_cleanliness"],
  files,ready_for_automatic_print:false,
  effects:{print:false,spooler:false,cut:false,stock:false,odhen:false},
 };
 fs.writeFileSync(path.join(temp,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
 return {directory:temp,manifest};
}
if(require.main===module){
 const output=generate();
 console.log("OFFLINE_QUALITY_DIR="+output.directory);
 console.log("OUTPUT_PROOFS="+output.manifest.files.length);
 console.log("COVERED_PRINTER_QUEUES="+output.manifest.printer_variants.length);
 console.log("NO_PRINT_NO_CUT=true");
}
module.exports={makeCalibrationChart,toGeometricSvg,generate};
