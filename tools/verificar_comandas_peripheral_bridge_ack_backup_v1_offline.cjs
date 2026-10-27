"use strict";
const assert=require("node:assert/strict");
const {assessBridgeLegacyOutput:review,SCHEMA,EFFECTS}=
 require("./comandas_peripheral_bridge_ack_backup_v1_offline.cjs");
const h="a".repeat(64);
function fixture(){
 return {store_id:"0001",store_unit:"01",
  code_fingerprints:{routes_imp_js:h,src_imp_js:h,printer_handler_js:h},
  route_census:{scope:"TEKNISA_DLV_IFO_PRODUCTION_VIA_CLAIM",
   origin_ref:"SYNTHETIC_NO_ORDER_LOG",snapshot_sha256:h,
   backup_config_observed:true,backup_enabled:false,
   primary_destination_censused:true,
   primary_legacy_output_plan:"EXPLICITLY_COVERED"},
  receipt_claim:{kind:"JSON_STATUS_202_QUEUED"}};
}
let n=0;
function test(name,fn){fn();console.log("PASS "+(++n)+" "+name);}
function verify(x){
 const old=JSON.stringify(x),r=review(x);
 assert.equal(JSON.stringify(x),old,"no source mutation");
 assert.equal(r.schema,SCHEMA);
 assert.deepEqual(r.effects,EFFECTS);
 for(const key of ["bridge_202_is_paper_confirmation",
  "bridge_queue_saved_is_physical_delivery","backup_print_effect_verified",
  "all_physical_legacy_outputs_suppressed",
  "receipt_proves_canonical_order_identity",
  "runtime_backup_config_attested_here","first_print_event_proven",
  "ready_for_cutover","can_change_peripheral"])
  assert.equal(r[key],false,key);
 assert.equal(JSON.stringify(r).includes("SYNTHETIC_NO_ORDER_LOG"),false);
 return r;
}
function hold(x,reason){
 const r=verify(x);assert.equal(r.status,"HOLD",JSON.stringify(r));
 assert.equal(r.reason,reason);return r;
}
function candidate(x){
 const r=verify(x);
 assert.equal(r.status,"REVIEW_CANDIDATE_ONLY",JSON.stringify(r));
 return r;
}
test("JSON field status=JSON status=202 from /print is queue acceptance, not paper",()=>{
 const r=candidate(fixture());
 assert.equal(r.reason,"JSON_202_PROVES_QUEUE_ACCEPTANCE_ONLY_NOT_PHYSICAL_PAPER");
 assert.equal(r.physical_receipt_required_separately,true);
});
test("JSON field status=202 does not prove a canonical DLV_IFO first print event",()=>{
 const r=candidate(fixture());
 assert.equal(r.first_print_event_proven,false);
});
test("missing installed route fingerprint blocks branch inference",()=>{
 const x=fixture();x.code_fingerprints.src_imp_js="bad";
 hold(x,"PERIPHERAL_INSTALLED_CODE_OR_STORE_INVALID");
});
test("unit mismatch holds",()=>{
 const x=fixture();x.store_unit="02";
 hold(x,"PERIPHERAL_INSTALLED_CODE_OR_STORE_INVALID");
});
test("missing route inventory holds even with JSON field status=202",()=>{
 const x=fixture();delete x.route_census;
 hold(x,"PERIPHERAL_ROUTE_AND_BACKUP_CENSUS_MISSING");
});
test("backup configuration unobserved cannot mean no backup",()=>{
 const x=fixture();x.route_census.backup_config_observed=false;
 hold(x,"BACKUP_CONFIG_NOT_OBSERVED_ON_ORDER_PATH");
});
test("backup enabled with no destination census cannot enter cutover",()=>{
 const x=fixture();Object.assign(x.route_census,{backup_enabled:true,
  backup_destination_censused:false,backup_legacy_output_plan:"EXPLICITLY_COVERED"});
 hold(x,"BACKUP_PRINTER_COULD_EMIT_UNCONTROLLED_LEGACY_PAPER");
});
test("backup enabled but not explicitly neutralized remains hold",()=>{
 const x=fixture();Object.assign(x.route_census,{backup_enabled:true,
  backup_destination_censused:true,backup_legacy_output_plan:"UNCONTROLLED"});
 hold(x,"BACKUP_PRINTER_COULD_EMIT_UNCONTROLLED_LEGACY_PAPER");
});
test("known backup plus explicit primary coverage stays candidate review, never print",()=>{
 const x=fixture();Object.assign(x.route_census,{backup_enabled:true,
  backup_destination_censused:true,backup_legacy_output_plan:"EXPLICITLY_COVERED"});
 const r=candidate(x);
 assert.equal(r.all_physical_legacy_outputs_suppressed,false);
});
test("unknown backup enabled boolean refuses cutover",()=>{
 const x=fixture();x.route_census.backup_enabled="no";
 hold(x,"BACKUP_ENABLED_STATUS_UNRESOLVED");
});
test("missing primary route inventory refuses cutover",()=>{
 const x=fixture();x.route_census.primary_destination_censused=false;
 hold(x,"PRIMARY_PRINTER_CUTOVER_ROUTE_NOT_CENSUSED");
});
test("primary route still connected to old paper refuses cutover",()=>{
 const x=fixture();x.route_census.primary_legacy_output_plan="KEEP_OLD_PAPER";
 hold(x,"PRIMARY_PRINTER_CUTOVER_ROUTE_NOT_CENSUSED");
});
test("invalid delivery source claim cannot become an order identity",()=>{
 const x=fixture();x.route_census.scope="FISCAL_OUTPUT";
 hold(x,"PERIPHERAL_ROUTE_AND_BACKUP_CENSUS_MISSING");
});
test("failed or unknown response is not material paper proof",()=>{
 const x=fixture();x.receipt_claim.kind="UNKNOWN";
 const r=candidate(x);
 assert.equal(r.reason,"NON_202_BRIDGE_RECEIPT_NOT_A_PAPER_ATTESTATION");
});
test("unrecognized bridge response cannot be silently accepted",()=>{
 const x=fixture();x.receipt_claim.kind="PRINTED";
 hold(x,"BRIDGE_ACK_KIND_UNKNOWN");
});
test("positive self claims never authorize port or backup effects",()=>{
 const x=fixture();x.approved=true;x.paper_proven=true;
 x.route_census.backup_proven=true;
 const r=candidate(x);assert.equal(r.can_change_peripheral,false);
});
test("invalid inputs fail closed",()=>{
 for(const v of [null,{},[],false]) {
  const r=verify(v);assert.equal(r.status,"HOLD");
 }
});
console.log("COMANDAS_PERIPHERAL_BRIDGE_ACK_BACKUP_V1="+n+"/"+n+
 " JSON_202_NOT_PAPER BACKUP_ROUTE_NOT_IGNORED ZERO_EFFECTS");
