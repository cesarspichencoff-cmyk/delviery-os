"use strict";
/**
 * Typography decision audit: read-only on production inputs, writes only
 * human-readable offline evidence in docs/evidence when explicitly requested.
 * The 2x-width path is a CANDIDATE pending CAIXA paper comparison.
 */
const fs=require("node:fs");
const path=require("node:path");
const seed=require("../data/cardapio_knowledge_seed.json");
const prior=require("./auditar_legibilidade_cardapio_v51.js");
const policies=require("../data/thermal_test_target_policy_v53.json");
const ROOT=path.resolve(__dirname,"..");
const PAGE_DOTS=576;
function assess(qty,name){
  const displayed=String(qty)+"  "+String(name).toLocaleUpperCase("pt-BR");
  const columns=[...displayed].length;
  let candidate="BLOCK_UNTIL_HUMAN_APPROVED_ALIAS";
  let font=null, horizontalScale=null, verticalScale=null, pixelWidth=null;
  if(columns<=24){
    candidate="A_2X_WIDTH_HEIGHT__PHYSICAL_APPROVAL_REQUIRED";
    font="A";horizontalScale=2;verticalScale=2;pixelWidth=columns*24;
  }else if(columns<=48){
    candidate="A_2X_HEIGHT_ONLY__BASELINE";
    font="A";horizontalScale=1;verticalScale=2;pixelWidth=columns*12;
  }else if(columns<=64){
    candidate="B_2X_HEIGHT_ONLY__READABILITY_REVIEW_REQUIRED";
    font="B";horizontalScale=1;verticalScale=2;pixelWidth=columns*9;
  }
  const risk=(pixelWidth!==null && pixelWidth>=PAGE_DOTS-36);
  return {
    sold_quantity:qty,product_name:String(name),display_columns:columns,
    proposed_candidate:candidate,font,font_scale_x:horizontalScale,font_scale_y:verticalScale,
    nominal_print_width_dots:pixelWidth,nominal_width_ratio:pixelWidth===null?null:
       Math.round(pixelWidth/PAGE_DOTS*10000)/100,
    near_right_boundary_review:risk,
    current_print_code_changed:false,
  };
}
function audit(){
  const products=seed.itens.filter(x=>typeof x.nome==="string"&&x.nome.trim());
  const priorAudit=prior.build();
  const sets=[1,12].map(qty=>{
    const entries=products.map(p=>({id:p.id,station:p.praca_principal,
      ...assess(qty,p.nome)}));
    const tally=prefix=>entries.filter(x=>x.proposed_candidate.startsWith(prefix)).length;
    const count2=tally("A_2X_WIDTH_HEIGHT");
    const countA=tally("A_2X_HEIGHT_ONLY");
    const countB=tally("B_2X_HEIGHT_ONLY");
    const countBlocked=tally("BLOCK_UNTIL");
    if(count2+countA+countB+countBlocked!==products.length)throw Error("PARTITION_NOT_EXACT");
    const priorLabel=qty===1?"single":"double_digit";
    if(count2+countA!==priorAudit.result_counts[priorLabel].A ||
      countB!==priorAudit.result_counts[priorLabel].B ||
      countBlocked!==priorAudit.result_counts[priorLabel].BLOCKED)
      throw Error("V51_CLASSIFICATION_REGRESSION");
    return {
      sold_qty:qty,
      count_total:entries.length,
      distribution:{
        candidate_width_and_height_double:count2,
        double_width_with_48dot_reserve:entries.filter(x=>x.font_scale_x===2 &&
          x.nominal_print_width_dots<=528).length,
        double_width_with_less_than_48dot_reserve:entries.filter(x=>x.font_scale_x===2 &&
          x.nominal_print_width_dots>528).length,
        baseline_large_font_height_only:countA,
        longer_names_font_B:countB,
        blocked:countBlocked,
        near_right_boundary:entries.filter(x=>x.near_right_boundary_review).length,
      },
      dual_candidate_names:entries.filter(x=>x.font_scale_x===2).map(x=>x.product_name),
      edge_items:entries.filter(x=>x.near_right_boundary_review).map(x=>({
        name:x.product_name,nominal_print_width_dots:x.nominal_print_width_dots,
        font:x.font,font_scale_x:x.font_scale_x
      })),
      blocked_names:entries.filter(x=>x.font===null).map(x=>x.product_name),
      font_B_names:entries.filter(x=>x.font==="B").map(x=>x.product_name),
    };
  });
  return {
    schema:"deliveryos.tata-typography-candidate-audit.v55.offline",
    as_of:"2026-10-08",
    source_catalogue:"data/cardapio_knowledge_seed.json",
    source_is_historical:true,
    scope:"REVIEW_ONLY_NO_OPERATIONAL_FONT_CHANGE",
    paper_width_nominal_dots:PAGE_DOTS,
    all_products_current_menu_proven:false,
    approved_current_design_change:false,
    photo_B_printed:false,
    printing_allowed_queue:policies.physical_test_policy.strict_printer_queue_allowlist,
    counts:sets,
    effects:{print:false,spooler_write:false,driver_change:false,density_change:false,
      production_renderer_change:false,warehouse:false},
    next_gate:"SECOND_COMPARISON_ON_REAL_CAIXA_PAPER_WITH_PERMITTED_TOOL_AND_PHOTO",
  };
}
function render(a){
 const lines=[
  "# V5.5 — Cobertura das fontes do cardápio histórico",
  "",
  "Estado: ANÁLISE OFFLINE. Não autoriza impressão e não modifica o renderer em uso.",
  "",
  "Referência: 576 dots nominais, Font A 12 dots/coluna, Font B 9 dots/coluna.",
  "Amostra: "+a.counts[0].count_total+" produtos do catálogo HISTÓRICO de julho de 2026; não prova menu atual.",
  "",
  "| Qtde vendida | A largura+altura 2x (candidata) | Com ≥48 dots de reserva | Com <48 dots (rever) | A altura 2x (atual) | B altura 2x | Bloqueadas | Próximo à borda |",
  "|---|---:|---:|---:|---:|---:|---:|---:|",
 ];
 for(const row of a.counts){
  const d=row.distribution;
  lines.push("| "+row.sold_qty+" | "+d.candidate_width_and_height_double+" | "+d.double_width_with_48dot_reserve+" | "+d.double_width_with_less_than_48dot_reserve+" | "+d.baseline_large_font_height_only+" | "+d.longer_names_font_B+" | "+d.blocked+" | "+d.near_right_boundary+" |");
 }
 lines.push("","## Ponto técnico",
  "A fonte A ampliada horizontalmente só cabe em linha única para títulos de até **24 caracteres incluindo quantidade e espaços**. Usar 2x indiscriminadamente reduziria a cobertura dos nomes longos.",
  "Uma reserva NOMINAL de 48 dots à direita exige no máximo **22 caracteres** na fonte A com largura dupla. Margens e largura reais da TM-T20X ainda não foram medidas no papel.",
  "Ainda é apenas HIPÓTESE de ganho visual, pois a segunda folha de comparação V5.4 não está fisicamente provada. O baseline e os alertas de fonte B permanecem.",
  "","## Produtos cujo fallback compacto B exige leitura na CAIXA",
 );
 for(const name of a.counts[1].font_B_names)lines.push("- "+name);
 lines.push("","## Regras de qualidade",
   "Nenhum nome pode ser cortado ou alterado automaticamente. Se o nome ultrapassar 64 caracteres, a via deve bloquear até validação humana de alias ou outra solução aprovada.",
   "A fonte A ampliada em largura deve ser submetida ao teste B da V5.4 SOMENTE na CAIXA quando permitido. Não converter o estudo em regra produtiva, não mudar densidade nem driver.",
   "Nenhuma inferência de qualidade física da unidade ou de outros setores foi feita.",
 );
 return lines.join("\n")+"\n";
}
function write(){
 const data=audit();
 const folder=path.join(ROOT,"docs","evidence");
 fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(folder,"thermal_typography_coverage_v55_20261008.json"),
   JSON.stringify(data,null,2)+"\n","utf8");
 fs.writeFileSync(path.join(folder,"thermal_typography_coverage_v55_20261008.md"),
   render(data),"utf8");
 return data;
}
if(require.main===module){
 const d=process.argv.includes("--write-evidence")?write():audit();
 console.log(JSON.stringify(d.counts.map(x=>({qty:x.sold_qty,...x.distribution})),null,2));
 console.log("MODE=READ_ONLY_AUDIT_NO_PRINT");
}
module.exports={audit,assess,render,write};
