"use strict";
/**
 * No printing. Generates one calibration-only proof for studying how long
 * observations could remain readable with the existing native Font A/B.
 */
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {OfflinePrinter}=require("../dist/src/production/operationalTicketEscposV46.js");
const {inspectEscPos}=require("./escposByteInspectorV51.js");
const {toGeometricSvg}=require("./gerar_kit_qualidade_epson_v51.js");
const {createAnnotationPlan}=require("./planejar_observacoes_legiveis_v56.js");
function generate(){
 const note="SEM PIMENTA NENHUMA SEM CEBOLA CRUA E SEM CEBOLINHA POR FAVOR COLOCAR MOLHO A PARTE CONFIRMAR QUE O PEDIDO NAO TEM AMENDOIM";
 const plan=createAnnotationPlan("OBS",note);
 if(plan.status!=="PREVIEW_ONLY")throw Error(plan.reason);
 const p=new OfflinePrinter();
 p.font("A");p.bold(true);p.line("TESTE C - NAO E PEDIDO");
 p.line("LEITURA DE OBSERVACAO LONGA");
 p.bold(false);p.line("--------------------------------");
 p.bold(true);p.heightDouble(true);
 p.line("1  URAMAKI EBITEN");p.heightDouble(false);p.bold(false);
 for(const line of plan.lines){
   p.font(line.font);p.bold(false);p.line(line.text,"ANNOTATION");
 }
 p.line("--------------------------------");
 p.line("NENHUMA INSTRUCAO FOI OMITIDA");
 p.ending("997");
 const proof=p.result("OBSERVATION_WRAP_OFFLINE_ONLY");
 if(!proof.ready_for_offline_preview)throw Error(proof.blocking_reasons.join(", "));
 const inspection=inspectEscPos(proof.bytes);
 if(!inspection.pass)throw Error(inspection.errors.join(", "));
 const rows=inspection.lines.map(x=>x.text);
 if(!rows.includes("TESTE C - NAO E PEDIDO"))throw Error("SAFETY_BANNER_MISSING");
 if(!rows.some(x=>x.startsWith("OBS > ")))throw Error("CONTINUATION_MISSING");
 const data=Buffer.from(proof.bytes);
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),"tata-annotation-v56-offline-"));
 const prefix="v56_annotation_readability_sample";
 fs.writeFileSync(path.join(folder,prefix+".escpos"),data);
 fs.writeFileSync(path.join(folder,prefix+".txt"),proof.text_trace+"\n");
 fs.writeFileSync(path.join(folder,prefix+".svg"),toGeometricSvg(inspection,prefix));
 const manifest={
  schema:"deliveryos.note-readability-proof.v56.offline",
  sample_kind:"SYNTHETIC_NOT_REAL_ORDER",
  content_label:"TESTE C - NAO E PEDIDO",
  station:"NONE",
  printer_allowlist:["CAIXA"],
  nominal_width_dots:576,
  sha256:crypto.createHash("sha256").update(data).digest("hex"),
  size_bytes:data.length,
  note_line_count:plan.lines.length,
  preserves_original_word_order:true,
  all_lines_fit_native_print_area:inspection.lines.every(x=>x.width_dots<=576),
  optical_paper_accepted:false,
  production_renderer_integrated:false,
  effects:{print:false,spooler_write:false,cut:false,driver_change:false,density_change:false},
  files:[prefix+".escpos",prefix+".txt",prefix+".svg"],
 };
 fs.writeFileSync(path.join(folder,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
 return {folder,manifest,plan};
}
if(require.main===module){
 const x=generate();
 console.log("OFFLINE_DIRECTORY="+x.folder);
 console.log("PREVIEW_SHA256="+x.manifest.sha256);
 console.log("PREVIEW_BYTES="+x.manifest.size_bytes);
 console.log("NOTES_LINES="+x.manifest.note_line_count);
 console.log("EFFECTS_PRINT=false");
}
module.exports={generate};
