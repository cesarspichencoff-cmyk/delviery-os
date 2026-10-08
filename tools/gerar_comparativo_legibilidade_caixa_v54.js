"use strict";
/**
 * OFFLINE ONLY. Side-by-side Epson typography comparison for a later
 * human-authorized CAIXA-only test. No network/USB/spooler/cut access.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const {OfflinePrinter}=require("../dist/src/production/operationalTicketEscposV46.js");
const {inspectEscPos}=require("./escposByteInspectorV51.js");
const {toGeometricSvg}=require("./gerar_kit_qualidade_epson_v51.js");
const policy=require("../data/thermal_test_target_policy_v53.json");
function build(){
 const p=new OfflinePrinter();
 p.font("A");p.bold(true);
 p.line("CALIBRACAO VISUAL TATA 80MM");
 p.line("TESTE B - NAO E PEDIDO");
 p.bold(false);
 p.line("--------------------------------");
 p.bold(true);
 p.line("A - REFERENCIA: ALTURA DUPLA");
 p.font("A");p.heightDouble(true);
 p.line("3  HOT ROLL TATA","A");
 p.line("12  URAMAKI EBITEN","A");
 p.heightDouble(false);
 p.line("--------------------------------");
 p.line("B - PROPOSTA: ALTURA E LARGURA");
 p.font("A");p.bothDouble(true);
 p.line("3  HOT ROLL TATA","B");
 p.line("12  URAMAKI EBITEN","B");
 p.bothDouble(false);
 p.line("--------------------------------");
 p.line("C - OBSERVACAO COM DESTAQUE");
 p.line("OBS: SEM PIMENTA E SEM SAL","OBS_BOLD");
 p.bold(false);
 p.line("OBS: SEM PIMENTA E SEM SAL","OBS_NORMAL");
 p.line("ACENTOS: AÇÃO PÃO É Ç SHISÔ","ACCENT");
 p.bold(true);
 p.line("C - FONT B SOMENTE LONGO");
 p.font("B");
 p.line("FONT B COMPARACAO LONGA E LEGIBILIDADE NO ESCURO","FONT_B");
 p.font("A");p.bold(false);
 p.line("--------------------------------");
 p.line("NAO E COMANDA / NAO PRODUZIR");
 p.ending("998");
 const proof=p.result("VISUAL_COMPARATIVO_CAIXA_20261008");
 if(!proof.ready_for_offline_preview)throw Error("OFFLINE_PROOF_BLOCKED:"+proof.blocking_reasons.join(","));
 const parsed=inspectEscPos(proof.bytes);
 if(!parsed.pass)throw Error("ESC_POS_BYTE_INSPECTION_FAILED:"+parsed.errors.join(","));
 return {proof,parsed};
}
function validateOnlyCaixa(){
 assert.deepEqual(policy.physical_test_policy.strict_printer_queue_allowlist,["CAIXA"]);
 assert.equal(policy.physical_test_policy.allow_print_to_other_queues,false);
}
function generate(){
 validateOnlyCaixa();
 const {proof,parsed}=build();
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),"tata-caixa-typography-v54-offline-"));
 const prefix="caixa_legibilidade_comparativo_v54";
 const bytes=Buffer.from(proof.bytes);
 fs.writeFileSync(path.join(folder,prefix+".escpos"),bytes);
 fs.writeFileSync(path.join(folder,prefix+".txt"),proof.text_trace+"\n");
 fs.writeFileSync(path.join(folder,prefix+".svg"),toGeometricSvg(parsed,prefix));
 const variants=["A - REFERENCIA","B - PROPOSTA","C - OBSERVACAO"];
 const report={
  schema:"deliveryos.caixa-typography-comparison-v54.offline",
  kind:"SIDE_BY_SIDE_OPTICAL_TEST_NOT_PRODUCTION_TICKET",
  comparisons:variants,
  scope:"CAIXA_ONLY",
  printer_selected_or_connected:false,
  render_profile:"EPSON_TM_T20X_FONT_A_B_CP1252_REFERENCE_UNCALIBRATED",
  source_photo_description:"V5.3 printed CAIXA sheet provided by human, visually tall narrow headlines, weak perceived contrast under dark camera lighting",
  print_requires_explicit_human_approval:true,
  print_authorized:false,
  source_file_sha256:crypto.createHash("sha256").update(bytes).digest("hex"),
  byte_count:bytes.length,
  byte_inspector_pass:parsed.pass,
  max_observed_line_dots:Math.max(...parsed.lines.map(x=>x.width_dots)),
  line_count:parsed.lines.length,
  source_files:[prefix+".escpos",prefix+".txt",prefix+".svg"],
  effects:{print:false,spooler_write:false,cut:false,density_change:false,driver_change:false},
 };
 fs.writeFileSync(path.join(folder,"manifest.json"),JSON.stringify(report,null,2)+"\n");
 return {folder,report,parsed};
}
if(require.main===module){
 const result=generate();
 console.log("CALIBRATION_COMPARISON_DIR="+result.folder);
 console.log("PROOF_SHA256="+result.report.source_file_sha256);
 console.log("BYTES="+result.report.byte_count);
 console.log("MAX_DOTS="+result.report.max_observed_line_dots);
 console.log("INSPECTOR_PASS="+result.report.byte_inspector_pass);
 console.log("NO_PRINT=true");
}
module.exports={build,generate};
