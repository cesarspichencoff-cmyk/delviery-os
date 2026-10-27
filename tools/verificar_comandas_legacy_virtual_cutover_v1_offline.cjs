"use strict";
const assert=require("node:assert/strict");
const {reviewLegacyPrintCutover:review,SCHEMA,EFFECTS}=
 require("./comandas_legacy_virtual_cutover_review_v1_offline.cjs");
const h="a".repeat(64);
const proof=()=>({status:"CANDIDATE_EVIDENCE",evidence_ref:"SYNTHETIC_REVIEW_NOT_ATTESTED",
 snapshot_sha256:h});
const proofs=()=>Object.fromEntries([
 "native_reader_order_revision","native_first_print_trigger",
 "station_window_catalog","tata_sequence_persisted_and_readback",
 "new_printer_route_calibration","independent_source_coexistence",
 "legacy_source_path_census","fiscal_and_other_reports_isolated",
 "rollback_snapshot_and_reconciliation"
].map(k=>[k,proof()]));
const source=(origin,action="KEEP_LEGACY",path="UNKNOWN")=>({
 origin,path,proposed_legacy_action:action,route_evidence:"UNVERIFIED",
 route_ref:"SYNTHETIC_SOURCE_NO_HOST_READ",has_other_unobserved_output:false
});
const baseline=()=>({stage:"SHADOW",store_id:"0001",store_unit:"01",
 legacy_sources:[source("TEKNISA"),source("IFOOD_GESTOR")]});
const staged=()=>{
 const x=baseline();x.stage="PREPARE_CUTOVER";
 x.legacy_sources=[
 {...source("TEKNISA","UPSTREAM_PRINT_OFF","APP_LEVEL"),
 route_evidence:"OBSERVED_ROUTE_CANDIDATE"},
 {...source("IFOOD_GESTOR","UPSTREAM_PRINT_OFF","APP_LEVEL"),
 route_evidence:"OBSERVED_ROUTE_CANDIDATE"}];
 x.proofs=proofs();
 return x;
};
let n=0;
function test(name,cb){cb();console.log("PASS "+(++n)+" "+name);}
function check(x){
 const before=JSON.stringify(x);const r=review(x);
 assert.equal(JSON.stringify(x),before,"pure non mutating");
 assert.equal(r.schema,SCHEMA);
 assert.deepEqual(r.effects,EFFECTS);
 for(const f of ["legacy_printers_changed","legacy_paper_suppressed_proven",
  "virtual_output_is_an_order_trigger","old_print_completed_implies_new_print_completed",
  "live_order_ingress_proven","source_disabling_proven",
  "new_emitter_exclusive_proven","roll_back_executed","paper_proven",
  "customer_facing_cutover_authorized","installation_authorized",
  "can_activate"])assert.equal(r[f],false,f);
 assert.equal(JSON.stringify(r).includes("SYNTHETIC_SOURCE_NO_HOST_READ"),false,
  "no source trail or order content disclosed in result");
 return r;
}
function holds(x,expected){
 const r=check(x);assert.equal(r.status,"HOLD");
 assert.ok(r.reasons.some(t=>t.includes(expected)),r.reasons.join("; "));
 return r;
}
test("shadow leaves legacy output active without proving any new physical printing",()=>{
 const r=check(baseline());assert.equal(r.status,"SHADOW_SAFE_REVIEW_ONLY");
 assert.equal(r.cutover_gates_not_evaluated,true);
});
test("new output never becomes authorized by mere shadow state",()=>{
 const x=baseline();x.new_emitter_ready=true;x.install_authorized=true;
 assert.equal(check(x).can_activate,false);
});
test("cutover without full explicit source census is blocked",()=>{
 const x=staged();x.legacy_sources.pop();holds(x,"COVERAGE_OR_STAGE_INVALID");
});
test("duplicate source IDs cannot conceal missing iFood Gestor path",()=>{
 const x=staged();x.legacy_sources[1].origin="TEKNISA";holds(x,"DUPLICATE_ORIGIN");
});
test("cross-store source cannot authorize Itaim changes",()=>{
 const x=staged();x.store_id="0002";holds(x,"COVERAGE_OR_STAGE_INVALID");
});
test("an upstream source print still active blocks duplicate new emitter",()=>{
 const x=staged();x.legacy_sources[0].proposed_legacy_action="KEEP_LEGACY";
 holds(x,"OLD_PHYSICAL_OUTPUT_REMAINS_ACTIVE");
});
test("WINDOWS NUL does not intercept direct IP socket printing",()=>{
 const x=staged();x.legacy_sources[0].proposed_legacy_action="WINDOWS_NUL_REDIRECT";
 x.legacy_sources[0].path="DIRECT_PRINTER";
 holds(x,"NUL_DOES_NOT_INTERCEPT_NON_WINDOWS_OUTPUT");
});
test("NUL cannot suppress an app's second unobserved output",()=>{
 const x=staged();x.legacy_sources[0].proposed_legacy_action="WINDOWS_NUL_REDIRECT";
 x.legacy_sources[0].path="WINDOWS_QUEUE";
 x.legacy_sources[0].has_other_unobserved_output=true;
 holds(x,"NUL_CANNOT_SUPPRESS_OTHER_PRINT_PATH");
});
test("Windows NUL can be reviewed as a sink only after source claims, never as trigger",()=>{
 const x=staged();x.legacy_sources[0].proposed_legacy_action="WINDOWS_NUL_REDIRECT";
 x.legacy_sources[0].path="WINDOWS_QUEUE";
 const r=check(x);
 assert.equal(r.status,"CUTOVER_CANDIDATE_NEEDS_EXTERNAL_ATTESTATION");
 assert.equal(r.virtual_sink_needs_independent_order_reader,true);
 assert.equal(r.windows_nul_is_only_paperless_sink,true);
 assert.equal(r.virtual_output_is_an_order_trigger,false);
 assert.equal(r.can_activate,false);
});
test("Windows NUL alone cannot substitute for native first-print event proof",()=>{
 const x=staged();x.legacy_sources[0].proposed_legacy_action="WINDOWS_NUL_REDIRECT";
 x.legacy_sources[0].path="WINDOWS_QUEUE";
 delete x.proofs.native_first_print_trigger;
 holds(x,"PROOF_MISSING_OR_INVALID:native_first_print_trigger");
});
test("shadow cannot quietly redirect or disable the original paper output",()=>{
 const x=baseline();x.legacy_sources[0].proposed_legacy_action="UPSTREAM_PRINT_OFF";
 holds(x,"SHADOW_MUST_KEEP_LEGACY_OUTPUT_UNCHANGED");
});
test("bare statement that iFood printing was off last week is not route attestation",()=>{
 const x=staged();x.legacy_sources[1].route_evidence="UNVERIFIED";
 holds(x,"LEGACY_PATH_NOT_OBSERVED");
});
test("unknown alternative origin blocks cutover even if primary path is known",()=>{
 const x=staged();x.legacy_sources[0].has_other_unobserved_output=true;
 holds(x,"UNOBSERVED_LEGACY_PRINT_PATH");
});
test("missing first native production event proof refuses cutover candidate",()=>{
 const x=staged();delete x.proofs.native_first_print_trigger;
 holds(x,"PROOF_MISSING_OR_INVALID:native_first_print_trigger");
});
test("without independently consistent Reader revision no origin from print queue",()=>{
 const x=staged();delete x.proofs.native_reader_order_revision;
 holds(x,"PROOF_MISSING_OR_INVALID:native_reader_order_revision");
});
test("without persisted TATA 3-digit binding cannot put new papers into service",()=>{
 const x=staged();delete x.proofs.tata_sequence_persisted_and_readback;
 holds(x,"PROOF_MISSING_OR_INVALID:tata_sequence_persisted_and_readback");
});
test("without correct shift route print cutover is unsafe",()=>{
 const x=staged();delete x.proofs.station_window_catalog;
 holds(x,"PROOF_MISSING_OR_INVALID:station_window_catalog");
});
test("without confirmed paper route cannot promote 3-view renderer",()=>{
 const x=staged();delete x.proofs.new_printer_route_calibration;
 holds(x,"PROOF_MISSING_OR_INVALID:new_printer_route_calibration");
});
test("fiscal and essential non-ticket output must be separately protected",()=>{
 const x=staged();delete x.proofs.fiscal_and_other_reports_isolated;
 holds(x,"PROOF_MISSING_OR_INVALID:fiscal_and_other_reports_isolated");
});
test("without cross-app exclusivity old/new can print twice",()=>{
 const x=staged();delete x.proofs.independent_source_coexistence;
 holds(x,"PROOF_MISSING_OR_INVALID:independent_source_coexistence");
});
test("cutover needs an exact snapshot and reversible plan",()=>{
 const x=staged();delete x.proofs.rollback_snapshot_and_reconciliation;
 holds(x,"PROOF_MISSING_OR_INVALID:rollback_snapshot_and_reconciliation");
});
test("self-asserted all nine proofs grants candidate review only, NEVER activation",()=>{
 const x=staged();const r=check(x);
 assert.equal(r.status,"CUTOVER_CANDIDATE_NEEDS_EXTERNAL_ATTESTATION");
 assert.deepEqual(r.selected_legacy_actions,[
  {origin:"TEKNISA",proposed_action:"UPSTREAM_PRINT_OFF"},
  {origin:"IFOOD_GESTOR",proposed_action:"UPSTREAM_PRINT_OFF"}]);
});
test("recovery never automatically re-enables original printing and duplicates",()=>{
 const x=staged();x.stage="RECOVERY_REVIEW";
 holds(x,"MANUAL_ROLLBACK_AND_DUPLICATE_RECONCILIATION_REQUIRED");
});
test("physical print user flags cannot self promote an unproven plan",()=>{
 const x=staged();Object.assign(x,{approved:true,has_paper:true,
  print_authorized:true,authorized_by_manager:true});
 assert.equal(check(x).can_activate,false);
});
test("arbitrary source origins blocked",()=>{
 const x=staged();x.legacy_sources[0].origin="TEKNISA_PDF";
 holds(x,"LEGACY_SOURCE_SCHEMA_INVALID");
});
test("invalid or partial proof digest rejects even strong-looking flags",()=>{
 const x=staged();x.proofs.native_reader_order_revision.snapshot_sha256="bad";
 holds(x,"PROOF_MISSING_OR_INVALID:native_reader_order_revision");
});
test("incomplete rollback claim blocked",()=>{
 const x=staged();x.proofs.rollback_snapshot_and_reconciliation.evidence_ref="";
 holds(x,"PROOF_MISSING_OR_INVALID:rollback_snapshot_and_reconciliation");
});
test("invalid non-object input fails closed",()=>{
 for(const v of [null,[],{},0,"SHADOW"]) {
  const r=review(v);assert.equal(r.status,"HOLD");
  assert.equal(r.can_activate,false);
 }
});
console.log("COMANDAS_VIRTUAL_LEGACY_CUTOVER_V1="+n+"/"+n+
 " NO_DIRECT_PRINT NO_CUTOVER NO_NUL_TRIGGER NO_PREMATURE_PAPER");
