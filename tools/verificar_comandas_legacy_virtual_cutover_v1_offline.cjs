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
 x.teknisa_transport_census={
  store_id:"0001",store_unit:"01",
  code_evidence:{impressao_pedido_sha256:h,impressao_util_sha256:h,
   printing_sha256:h},
  runtime_flags:{utiliza_impressao_ponte:true,utiliza_impressao_php:false,
   observation_sha256:h,provenance:"SYNTHETIC_RUNTIME_ONLY"},
  transport_destination:{kind:"DIRECT_OR_NETWORK_PORT",
   provenance:"SYNTHETIC_BRIDGE_DESTINATION",
   path_matches_order_print:true},
  proposed_action:"UPSTREAM_PRINT_OFF"
 };
 x.peripheral_bridge_evidence={
  store_id:"0001",store_unit:"01",
  code_fingerprints:{routes_imp_js:h,src_imp_js:h,printer_handler_js:h},
  route_census:{scope:"TEKNISA_DLV_IFO_PRODUCTION_VIA_CLAIM",
   origin_ref:"SYNTHETIC_BRIDGE_SOURCE",snapshot_sha256:h,
   backup_config_observed:true,backup_enabled:false,
   primary_destination_censused:true,
   primary_legacy_output_plan:"EXPLICITLY_COVERED",
   pending_legacy_jobs_censused:true,
   pending_or_ambiguous_attempts_reconciled:true},
  receipt_claim:{kind:"JSON_STATUS_202_QUEUED"}
 };
 x.teknisa_delivery_report_census={
  auto_branch:{store_id:"0001",store_unit:"01",
   installed_source_sha256:{venda:h,impressao_delivery:h,
    delivery_controller:h,msde_query:h},
   path:"SALE_FINALIZATION",evidence_level:"VENDAS_CODE_ONLY",
   sale_committed_without_error:true,is_delivery:true,
   gross_total_positive:true,caixa_auto_delivery_report_flag:"S"},
  manual_branch:{store_id:"0001",store_unit:"01",
   installed_source_sha256:{venda:h,impressao_delivery:h,
    delivery_controller:h,msde_query:h},
   path:"MANUAL_DELIVERY_REPORT_REQUEST",evidence_level:"VENDAS_CODE_ONLY"},
  cashier_global_setting_unchanged:true,
  auto_report_intent:"INDEPENDENT_REPORT_DISPOSITION_REVIEWED",
  manual_report_intent:"PRESERVE_ON_DEMAND_WITH_AUDIT"
 };
 x.ifood_installed_print_census={
  store_id:"0001",store_unit:"01",
  package_fingerprints:{gp_asar_sha256:h,gestor_asar_sha256:h},
  channels:["GP_HTTP_PRINT","GESTOR_IPC_PRINTORDER"].map(channel_id=>({
   channel_id,proposed_action:"SOURCE_OFF",
   runtime_auto_print_mode:"DISABLED",
   runtime_observation_ref:"SYNTHETIC_IFOOD_STATE_NOT_ATTESTED",
   runtime_observation_sha256:h,
   manual_print_path_censused:true,
   pending_or_ambiguous_jobs_reconciled:true,
   source_control_scope_isolated:true
  }))
 };
 x.teknisa_upstream_suppression={mechanism:"IDIMPPEDPROD_N",
  native_mode_evidence:{store_id:"0001",store_unit:"01",
   impressao_pedido_sha256:h,mode:"N",
   intended_scope:{origin:"DLV_IFO",
    kind:"DELIVERY_PRODUCTION_TICKET_ONLY",
    other_tek_orders_preserved:true,fiscal_outputs_preserved:true,
    callsite_evidence_ref:"SYNTHETIC_SCOPE_UNATTESTED",
    callsite_snapshot_sha256:h},
   proposed_application:{kind:"DELIVERY_ONLY_PER_INVOCATION_CLAIM",
    shared_cashier_setting_untouched:true,mesa_and_balcao_unchanged:true,
    override_evidence_ref:"SYNTHETIC_OVERRIDE_NOT_ATTESTED",
    override_snapshot_sha256:h}}};
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
 x.teknisa_transport_census.proposed_action="WINDOWS_NUL_REDIRECT";
 x.teknisa_transport_census.transport_destination.kind="WINDOWS_SPOOLER_QUEUE";
 x.teknisa_transport_census.nul_target_is_downstream_bridge=true;
 x.teknisa_transport_census.transport_destination.peripheral_backend="WINDOWS_WINSPOOL_API";
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
test("missing native active print mode is a HOLD despite every other claimed proof",()=>{
 const x=staged();delete x.teknisa_transport_census;
 holds(x,"TEKNISA_ACTIVE_PRINT_TRANSPORT_NOT_ATTESTED:SOURCE_FINGERPRINTS_OR_STORE_INVALID");
});
test("native Windows NUL claim cannot bypass an HTTP bridge outside that queue",()=>{
 const x=staged();x.legacy_sources[0].proposed_legacy_action="WINDOWS_NUL_REDIRECT";
 x.legacy_sources[0].path="WINDOWS_QUEUE";
 x.teknisa_transport_census.proposed_action="WINDOWS_NUL_REDIRECT";
 x.teknisa_transport_census.transport_destination.kind="WINDOWS_SPOOLER_QUEUE";
 holds(x,"TEKNISA_ACTIVE_PRINT_TRANSPORT_NOT_ATTESTED:BRIDGE_HTTP_NOT_PROVEN_TO_USE_SELECTED_WINDOWS_QUEUE");
});
test("native transport and legacy action must agree",()=>{
 const x=staged();x.teknisa_transport_census.proposed_action="WINDOWS_NUL_REDIRECT";
 x.teknisa_transport_census.transport_destination.kind="WINDOWS_SPOOLER_QUEUE";
 x.teknisa_transport_census.nul_target_is_downstream_bridge=true;
 x.teknisa_transport_census.transport_destination.peripheral_backend="WINDOWS_WINSPOOL_API";
 holds(x,"TEKNISA_TRANSPORT_AND_CUTOVER_ACTION_CONFLICT");
});
test("Epson native peripheral DLL keeps virtual NUL cutover in HOLD",()=>{
 const x=staged();x.legacy_sources[0].proposed_legacy_action="WINDOWS_NUL_REDIRECT";
 x.legacy_sources[0].path="WINDOWS_QUEUE";
 x.teknisa_transport_census.proposed_action="WINDOWS_NUL_REDIRECT";
 x.teknisa_transport_census.transport_destination.kind="WINDOWS_SPOOLER_QUEUE";
 x.teknisa_transport_census.nul_target_is_downstream_bridge=true;
 x.teknisa_transport_census.transport_destination.peripheral_backend="EPSON_VENDOR_DLL";
 holds(x,"TEKNISA_ACTIVE_PRINT_TRANSPORT_NOT_ATTESTED:EPSON_NATIVE_LIBRARY_NOT_PROVEN_TO_USE_WINDOWS_NUL");
});
test("unobserved runtime boolean flags cannot be invented from PHP source file",()=>{
 const x=staged();x.teknisa_transport_census.runtime_flags=null;
 holds(x,"TEKNISA_ACTIVE_PRINT_TRANSPORT_NOT_ATTESTED:ACTIVE_RUNTIME_PRINT_FLAGS_NOT_ATTESTED");
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
test("UPSTREAM_PRINT_OFF label alone cannot override native source-level guards",()=>{
 const x=staged();delete x.teknisa_upstream_suppression;
 holds(x,"NATIVE_UPSTREAM_SUPPRESSION_MECHANISM_NOT_IDENTIFIED");
});
test("N must be scoped to DLV_IFO only and preserve other orders",()=>{
 const x=staged();x.teknisa_upstream_suppression.native_mode_evidence.intended_scope.kind="ALL_ORDERS";
 holds(x,"NATIVE_UPSTREAM_SCOPE_NOT_ESTABLISHED:DELIVERY_ONLY_CALLSITE_AND_FISCAL_SCOPE_NOT_PROVEN");
});
test("N source candidate cannot disable fiscal outputs",()=>{
 const x=staged();x.teknisa_upstream_suppression.native_mode_evidence.intended_scope.fiscal_outputs_preserved=false;
 holds(x,"NATIVE_UPSTREAM_SCOPE_NOT_ESTABLISHED:DELIVERY_ONLY_CALLSITE_AND_FISCAL_SCOPE_NOT_PROVEN");
});
test("S mode cannot be misrepresented as native no-print",()=>{
 const x=staged();x.teknisa_upstream_suppression.native_mode_evidence.mode="S";
 holds(x,"NATIVE_UPSTREAM_SCOPE_NOT_ESTABLISHED:NATIVE_MODE_STILL_ALLOWS_SOME_PRODUCTION_OUTPUT");
});
test("other source-off configuration requires its own identifiable proof",()=>{
 const x=staged();
 x.teknisa_upstream_suppression={mechanism:"OTHER_SOURCE_SCOPED_PRINT_OFF",
  external_source_scoping:{status:"UNKNOWN"}};
 holds(x,"OTHER_UPSTREAM_SUPPRESSION_SCOPE_NOT_ATTESTED");
});
test("global cashier production print N must HOLD regardless of proposed cutover",()=>{
 const x=staged();x.teknisa_upstream_suppression.native_mode_evidence.proposed_application.kind="CASH_REGISTER_CONFIG_CHANGE";
 holds(x,"NATIVE_UPSTREAM_SCOPE_NOT_ESTABLISHED:CASHIER_WIDE_IDIMPPEDPROD_MUST_NOT_BE_CHANGED");
});
test("no attested per-delivery override is equivalent to unknown first print scope",()=>{
 const x=staged();delete x.teknisa_upstream_suppression.native_mode_evidence.proposed_application;
 holds(x,"NATIVE_UPSTREAM_SCOPE_NOT_ESTABLISHED:CASHIER_WIDE_IDIMPPEDPROD_MUST_NOT_BE_CHANGED");
});
test("preserving mesa and balcao is mandatory for candidate cutover",()=>{
 const x=staged();x.teknisa_upstream_suppression.native_mode_evidence.proposed_application.mesa_and_balcao_unchanged=false;
 holds(x,"NATIVE_UPSTREAM_SCOPE_NOT_ESTABLISHED:CASHIER_WIDE_IDIMPPEDPROD_MUST_NOT_BE_CHANGED");
});
test("JSON field status=202 and unknown Odhen internal queue backup are not a complete cutover",()=>{
 const x=staged();delete x.peripheral_bridge_evidence;
 holds(x,"BRIDGE_QUEUE_AND_BACKUP_PATH_NOT_ACCOUNTED_FOR:PERIPHERAL_INSTALLED_CODE_OR_STORE_INVALID");
});
test("backup enabled without destination census prevents old paper suppression",()=>{
 const x=staged();x.peripheral_bridge_evidence.route_census.backup_enabled=true;
 holds(x,"BRIDGE_QUEUE_AND_BACKUP_PATH_NOT_ACCOUNTED_FOR:BACKUP_PRINTER_COULD_EMIT_UNCONTROLLED_LEGACY_PAPER");
});
test("backup route declared but uncontrolled prevents old paper suppression",()=>{
 const x=staged();Object.assign(x.peripheral_bridge_evidence.route_census,{
  backup_enabled:true,backup_destination_censused:true,
  backup_legacy_output_plan:"KEEP_OLD_PAPER"});
 holds(x,"BRIDGE_QUEUE_AND_BACKUP_PATH_NOT_ACCOUNTED_FOR:BACKUP_PRINTER_COULD_EMIT_UNCONTROLLED_LEGACY_PAPER");
});
test("backup path must be observed on the specific order route",()=>{
 const x=staged();x.peripheral_bridge_evidence.route_census.backup_config_observed=false;
 holds(x,"BRIDGE_QUEUE_AND_BACKUP_PATH_NOT_ACCOUNTED_FOR:BACKUP_CONFIG_NOT_OBSERVED_ON_ORDER_PATH");
});
test("claim of JSON field status=202 as completed print cannot bypass bridge model",()=>{
 const x=staged();x.peripheral_bridge_evidence.receipt_claim.kind="PAPER_CONFIRMED";
 holds(x,"BRIDGE_QUEUE_AND_BACKUP_PATH_NOT_ACCOUNTED_FOR:BRIDGE_ACK_KIND_UNKNOWN");
});
test("backend not using Odhen HTTP bridge does not require that bridge model",()=>{
 const x=staged();x.teknisa_transport_census.runtime_flags.utiliza_impressao_ponte=false;
 x.teknisa_transport_census.runtime_flags.utiliza_impressao_php=true;
 delete x.peripheral_bridge_evidence;
 const r=check(x);
 assert.equal(r.status,"CUTOVER_CANDIDATE_NEEDS_EXTERNAL_ATTESTATION");
 assert.equal(r.can_activate,false);
});
test("Odhen old queued jobs are reconciled before any new paper cutover",()=>{
 const x=staged();x.peripheral_bridge_evidence.route_census.pending_legacy_jobs_censused=false;
 holds(x,"BRIDGE_QUEUE_AND_BACKUP_PATH_NOT_ACCOUNTED_FOR:QUEUED_OR_AMBIGUOUS_OLD_JOBS_NOT_RECONCILED");
});
test("ambiguous old print effect cannot be silently reprinted after switch",()=>{
 const x=staged();x.peripheral_bridge_evidence.route_census.pending_or_ambiguous_attempts_reconciled=false;
 holds(x,"BRIDGE_QUEUE_AND_BACKUP_PATH_NOT_ACCOUNTED_FOR:QUEUED_OR_AMBIGUOUS_OLD_JOBS_NOT_RECONCILED");
});
test("missing delivery auto and manual report paths keeps cutover blocked",()=>{
 const x=staged();delete x.teknisa_delivery_report_census;
 holds(x,"TEKNISA_POST_SALE_AND_MANUAL_REPORT_PATHS_UNCENSUSED");
});
test("post-sale auto report is not first production or kitchen print",()=>{
 const x=staged();x.teknisa_delivery_report_census.auto_branch.path="KITCHEN_FIRST_PRINT";
 holds(x,"TEKNISA_AUTO_REPORT_NOT_SOURCE_SCOPED");
});
test("manual delivery report remains possible even if auto branch is disabled",()=>{
 const x=staged();x.teknisa_delivery_report_census.manual_branch.path="SALE_FINALIZATION";
 holds(x,"TEKNISA_MANUAL_REPORT_ENDPOINT_NOT_ACCOUNTED");
});
test("changing global caixa report setting is not a delivery-only change",()=>{
 const x=staged();x.teknisa_delivery_report_census.cashier_global_setting_unchanged=false;
 holds(x,"REPORT_CASHIER_SCOPE_OR_MANUAL_PATH_UNSAFE");
});
test("manual report should remain accountable on demand",()=>{
 const x=staged();x.teknisa_delivery_report_census.manual_report_intent="DROP_ALL_REPORTS";
 holds(x,"REPORT_CASHIER_SCOPE_OR_MANUAL_PATH_UNSAFE");
});
test("report cannot vanish from inventory due to a guess about existing ifood output",()=>{
 const x=staged();x.teknisa_delivery_report_census.auto_report_intent="PROBABLY_DISABLED";
 holds(x,"REPORT_CASHIER_SCOPE_OR_MANUAL_PATH_UNSAFE");
});
test("missing installed iFood paths blocks whole old-new print cutover",()=>{
 const x=staged();delete x.ifood_installed_print_census;
 holds(x,"IFOOD_GP_AND_GESTOR_PRINT_PATHS_UNCENSUSED");
});
test("GP auto output disabled does not prove Gestor IPC output disabled",()=>{
 const x=staged();x.ifood_installed_print_census.channels.pop();
 holds(x,"IFOOD_GP_AND_GESTOR_PRINT_PATHS_UNCENSUSED");
});
test("Gestor IPC still emitting even if GP is off vetoes entire print cutover",()=>{
 const x=staged();
 x.ifood_installed_print_census.channels[1].proposed_action="KEEP_LEGACY";
 holds(x,"IFOOD_GP_AND_GESTOR_PRINT_PATHS_UNCENSUSED");
});
test("running local GP listener does not prove auto print off",()=>{
 const x=staged();x.ifood_installed_print_census.channels[0].runtime_auto_print_mode="UNKNOWN";
 holds(x,"IFOOD_GP_AND_GESTOR_PRINT_PATHS_UNCENSUSED");
});
test("iFood manual print path survives an automatic printing setting",()=>{
 const x=staged();x.ifood_installed_print_census.channels[1].manual_print_path_censused=false;
 holds(x,"IFOOD_GP_AND_GESTOR_PRINT_PATHS_UNCENSUSED");
});
test("iFood Windows sink cannot be proposed with shared fiscal queue",()=>{
 const x=staged();x.ifood_installed_print_census.channels[0].proposed_action="WINDOWS_QUEUE_SINK_REVIEW";
 holds(x,"IFOOD_GP_AND_GESTOR_PRINT_PATHS_UNCENSUSED");
});
test("iFood printed success and spooler job id never imply paper",()=>{
 const x=staged();Object.assign(x.ifood_installed_print_census,{
  gp_response:"Successfully printed",gestor_ipc_reply:"Successfully printed",
  windows_job_id:258});
 const r=check(x);
 assert.equal(r.status,"CUTOVER_CANDIDATE_NEEDS_EXTERNAL_ATTESTATION");
 assert.equal(r.paper_proven,false);
 assert.equal(r.can_activate,false);
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
