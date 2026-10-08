"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const policy=require(path.join(root,"data/thermal_test_target_policy_v53.json"));
const evidence=require(path.join(root,"docs/evidence/caixa_only_print_job_233_v53_20261008.json"));
let pass=0;
function test(label,fn){fn();pass++;console.log("PASS "+String(pass).padStart(2,"0")+" "+label);}
test("only CAIXA is authorized for PHYSICAL test printing",()=>{
  assert.equal(policy.site,"TATA ITAIM");
  assert.equal(policy.authority,"CESAR_DIRECT_CHAT");
  assert.deepEqual(policy.physical_test_policy.strict_printer_queue_allowlist,["CAIXA"]);
  assert.equal(policy.physical_test_policy.allow_print_to_other_queues,false);
  assert.equal(policy.physical_test_policy.other_queues,"NO_PHYSICAL_TEST_PRINT");
});
test("computer location confirmation is explicit human authority",()=>{
  assert.equal(policy.site_computer_confirmed_physically,"CAIXA_MOOCA");
  assert.equal(evidence.computer,"CAIXA_MOOCA");
  assert.equal(evidence.site,"TATA_ITAIM_HUMAN_CONFIRMED");
});
test("the one test job targeted exact USB Epson receipt queue",()=>{
  assert.equal(evidence.target_queue,"CAIXA");
  assert.equal(evidence.port,"ESDPRT001");
  assert.equal(evidence.driver,"EPSON TM-T20 ReceiptE4");
  assert.equal(evidence.usb_model_identification,"EPSON TM-T20X");
  assert.equal(evidence.usb_present,true);
});
test("source proof integrity was verified before sending",()=>{
  assert.equal(evidence.source_payload_bytes,424);
  assert.equal(evidence.source_sha256,"8f6b02ea56f2daf6261fa6a5ce45d533ea68fa3e83d4344ad4fd860254dc1249");
  assert.equal(evidence.document_kind,"CALIBRATION_TEST_NOT_CUSTOMER_ORDER");
});
test("WinPrint independent success event 307 establishes job processing",()=>{
  assert.equal(evidence.job_id,233);
  assert.equal(evidence.printservice_event.event_id,307);
  assert.equal(evidence.printservice_event.event_says_printed_caixa_usb,true);
  assert.equal(evidence.printservice_event.event_says_424_bytes,true);
});
test("post-job queue returned to normal and zero pending",()=>{
  assert.equal(evidence.post_job.printer_status,"Normal");
  assert.equal(evidence.post_job.queue_jobs_remaining,0);
});
test("no other printer, drawer, cut, density or drivers affected by this action",()=>{
  assert.equal(evidence.effects.printed_other_queues,false);
  assert.equal(evidence.effects.drawer_pulse_sent,false);
  assert.equal(evidence.effects.cut_command_sent,false);
  assert.equal(evidence.effects.driver_changed,false);
  assert.equal(evidence.effects.density_changed,false);
  assert.equal(evidence.effects.spooler_queues_reconfigured,false);
});
test("photo, actual optical printing and low-light acceptance remain open",()=>{
  assert.equal(evidence.proof_limits.physical_sheet_seen_by_assistant,false);
  assert.equal(evidence.proof_limits.photo_review_complete,false);
  assert.equal(evidence.proof_limits.dark_environment_legibility_proven,false);
  assert.equal(evidence.proof_limits.accent_raster_verified,false);
  assert.equal(evidence.proof_limits.not_world_proven,true);
});
test("other printers are not asserted as proven by CAIXA test",()=>{
  assert.equal(evidence.proof_limits.other_printers_physically_tested,false);
  assert.equal(policy.printers_other_than_caixa_physically_proven_by_this_test,false);
  assert.equal(policy.all_stations_quality_claim,"UNPROVEN");
});
test("avoid accidental reprints and customer orders",()=>{
  assert.equal(policy.physical_test_policy.limit_to_one_authorized_test_job_per_execution,true);
  assert.equal(policy.physical_test_policy.no_automatic_repeat_after_attempt,true);
  assert.equal(policy.physical_test_policy.allow_customer_order_test_prints,false);
  assert.equal(policy.physical_test_policy.require_obviously_labeled_test_sheet,true);
});
test("read-only diagnostics are distinct from physical printing",()=>{
  assert.equal(policy.physical_test_policy.other_printer_readonly_diagnostics_allowed,true);
  assert.equal(policy.physical_test_policy.forbid_unapproved_driver_or_density_changes,true);
  assert.equal(policy.physical_test_policy.do_not_deploy_or_route_production_using_this_test,true);
});
console.log("caixa-only-thermal-policy-v53: "+pass+"/"+pass+" checks PASS; no printer contact");
