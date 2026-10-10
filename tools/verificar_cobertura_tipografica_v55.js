"use strict";
const assert=require("node:assert/strict");
const {audit,assess}=require("./auditar_cobertura_tipografica_v55.js");
const result=audit();
let tests=0;
function check(label,fn){fn();tests++;console.log("PASS "+tests+" "+label);}
const one=result.counts.find(x=>x.sold_qty===1);
const twelve=result.counts.find(x=>x.sold_qty===12);
check("01 explicit offline mode, strict CAIXA-only test policy",()=>{
 assert.equal(result.scope,"REVIEW_ONLY_NO_OPERATIONAL_FONT_CHANGE");
 assert.deepEqual(result.printing_allowed_queue,["CAIXA"]);
 assert.equal(result.photo_B_printed,false);
 assert.equal(result.approved_current_design_change,false);
});
check("02 known historical catalogue coverage remains exactly 199",()=>{
 assert.equal(one.count_total,199);assert.equal(twelve.count_total,199);
 assert.equal(result.source_is_historical,true);
 assert.equal(result.all_products_current_menu_proven,false);
});
check("03 one-digit quantity partition preserves 193 Font A + 6 Font B",()=>{
 const x=one.distribution;
 assert.equal(x.candidate_width_and_height_double,115);
 assert.equal(x.baseline_large_font_height_only,78);
 assert.equal(x.longer_names_font_B,6);
 assert.equal(x.blocked,0);
 assert.equal(115+78,193);
});
check("04 two-digit quantity partition preserves 193 Font A + 6 Font B",()=>{
 const x=twelve.distribution;
 assert.equal(x.candidate_width_and_height_double,107);
 assert.equal(x.baseline_large_font_height_only,86);
 assert.equal(x.longer_names_font_B,6);
 assert.equal(x.blocked,0);
});
check("05 nominal 48-dot reserve distinguishes edge risk",()=>{
 assert.equal(one.distribution.double_width_with_48dot_reserve,98);
 assert.equal(one.distribution.double_width_with_less_than_48dot_reserve,17);
 assert.equal(twelve.distribution.double_width_with_48dot_reserve,92);
 assert.equal(twelve.distribution.double_width_with_less_than_48dot_reserve,15);
 assert.equal(one.distribution.double_width_with_48dot_reserve+
  one.distribution.double_width_with_less_than_48dot_reserve,
  one.distribution.candidate_width_and_height_double);
});
check("06 Epson full-line double width at exactly 24 chars is risky, not clipped",()=>{
 const x=assess(1,"A".repeat(21));
 assert.equal(x.display_columns,24);
 assert.equal(x.nominal_print_width_dots,576);
 assert.equal(x.near_right_boundary_review,true);
 assert.equal(x.font_scale_x,2);
});
check("07 22 chars in double-width A leave a nominal 48-dot reserve",()=>{
 const x=assess(1,"A".repeat(19));
 assert.equal(x.display_columns,22);
 assert.equal(x.nominal_print_width_dots,528);
 assert.equal(x.near_right_boundary_review,false);
});
check("08 adding a quantity digit can require retaining normal-width A",()=>{
 const x=assess(12,"A".repeat(21));
 assert.equal(x.display_columns,25);
 assert.equal(x.font,"A");
 assert.equal(x.font_scale_x,1);
 assert.equal(x.font_scale_y,2);
});
check("09 48 columns still fit native Font A, keeping full product name",()=>{
 const x=assess(12,"A".repeat(44));
 assert.equal(x.display_columns,48);
 assert.equal(x.nominal_print_width_dots,576);
 assert.equal(x.font,"A");
});
check("10 64 columns fit condensed Font B; 65 block without truncation",()=>{
 const b=assess(12,"A".repeat(60));
 const block=assess(12,"A".repeat(61));
 assert.equal(b.font,"B");assert.equal(b.nominal_print_width_dots,576);
 assert.equal(block.nominal_print_width_dots,null);
 assert.equal(block.proposed_candidate,"BLOCK_UNTIL_HUMAN_APPROVED_ALIAS");
});
check("11 actual V5.4 short-title sample is double-width candidate with reserve",()=>{
 const x=assess(12,"URAMAKI EBITEN");
 assert.equal(x.font_scale_x,2);
 assert.ok(x.nominal_print_width_dots<=528);
 assert.equal(x.current_print_code_changed,false);
});
check("12 all historical candidates are known or marked for human approval",()=>{
 for(const item of one.dual_candidate_names){assert.equal(typeof item,"string");}
 assert.equal(twelve.font_B_names.length,6);
 assert.deepEqual(one.font_B_names.slice().sort(),twelve.font_B_names.slice().sort());
 assert.deepEqual(one.blocked_names,[]);
 assert.deepEqual(twelve.blocked_names,[]);
});
check("13 no operational effects are authorized by this audit",()=>{
 assert.deepEqual(result.effects,{
  print:false,spooler_write:false,driver_change:false,density_change:false,
  production_renderer_change:false,warehouse:false
 });
 assert.equal(result.next_gate,"SECOND_COMPARISON_ON_REAL_CAIXA_PAPER_WITH_PERMITTED_TOOL_AND_PHOTO");
});
console.log("v55-offline-typography-coverage: "+tests+"/"+tests+" tests PASS; no printer contact");
