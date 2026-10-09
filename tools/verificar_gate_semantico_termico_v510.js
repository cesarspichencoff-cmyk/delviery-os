"use strict";
/** Pure SHADOW contract proof. No network, device, spooler, or print effects. */
const assert = require("node:assert/strict");
const {archivedCompleteInput, archivedResult} = require("./verificar_real_order_tickets_v46.js");
const {projectOperationalTicketsV45} = require("../dist/src/production/operationalTicketsV45.js");
const {renderOperationalTicketsProofV46} = require("../dist/src/production/operationalTicketEscposV46.js");
const {splitTwoKitchenTicketsV47} = require("../dist/src/production/twoKitchenTicketsV47.js");
const {buildKitchenSeparatedBundleV47} = require("../dist/src/production/kitchenSeparatedOfflineBundleV47.js");

let checks = 0;
function check(name, run) {
  run();
  checks++;
  console.log("PASS " + String(checks).padStart(2, "0") + " " + name);
}
function bundleFrom(ticket, source) {
  const split = splitTwoKitchenTicketsV47(source, ticket, null);
  return {split, bundle: buildKitchenSeparatedBundleV47(ticket, split)};
}
function channels(bundle) {
  return bundle.jobs.map(job => job.channel).sort();
}
function denied(proof, reason) {
  assert.equal(proof.ready_for_offline_preview, false);
  assert.equal(proof.ready_for_operational_print, false);
  assert.equal(proof.byte_count, 0);
  assert.deepEqual(proof.bytes, []);
  assert.ok(proof.blocking_reasons.some(x => x.includes(reason)), JSON.stringify(proof.blocking_reasons));
  assert.deepEqual(proof.effects, {print:false,spooler_write:false,odhen_write:false,cut:false});
}
const original = archivedResult();
const source = archivedCompleteInput().source_items;

check("01 archived replay unchanged and historical ticket lengths preserved", () => {
  assert.equal(original.ready_for_semantic_preview, true);
  const a = renderOperationalTicketsProofV46(original);
  assert.deepEqual([...a.production, a.conference].map(p => p.byte_count), [332,349,665]);
  const {split,bundle} = bundleFrom(original,source);
  assert.ok(split.review_reasons.includes("KITCHEN_NEEDS_MISSING"));
  assert.deepEqual(channels(bundle), ["CONFERENCE","KITCHEN_DISHES","OTHER_PRODUCTION"]);
  assert.equal(bundle.blocked_proofs.length,0);
  assert.equal(bundle.ready_for_automatic_operational_print,false);
});

check("02 synthetic resource motor global blocker propagates through projector", () => {
  const f=archivedCompleteInput();
  f.resource_projection.blocking_reasons.push("TEST_SYNTHETIC_SEMANTIC_BLOCK");
  const blocked = projectOperationalTicketsV45({
    order_id:f.id,source_items:f.source_items,
    production_plan:f.production_plan,resource_projection:f.resource_projection,
    packaging_plan:f.packaging
  });
  assert.equal(blocked.ready_for_semantic_preview,false);
  assert.ok(blocked.blocking_reasons.includes("RESOURCE_MOTOR:TEST_SYNTHETIC_SEMANTIC_BLOCK"));
  assert.ok(blocked.production.every(x=>x.ready_for_semantic_preview));
  const {bundle} = bundleFrom(blocked, f.source_items);
  assert.deepEqual(bundle.jobs,[]);
  assert.equal(bundle.blocked_proofs.length,3);
  for(const {proof} of bundle.blocked_proofs)denied(proof,"RESOURCE_MOTOR:TEST_SYNTHETIC_SEMANTIC_BLOCK");
  assert.ok(bundle.review_reasons.some(x=>x.includes("RESOURCE_MOTOR:TEST_SYNTHETIC_SEMANTIC_BLOCK")));
});

check("03 invalid source comparison is a global blocker, without changing item names", () => {
  const f=archivedCompleteInput();
  f.source_items[0].quantity += 1;
  const blocked=projectOperationalTicketsV45({
    order_id:f.id,source_items:f.source_items,production_plan:f.production_plan,
    resource_projection:f.resource_projection,packaging_plan:f.packaging
  });
  assert.equal(blocked.ready_for_semantic_preview,false);
  assert.ok(blocked.blocking_reasons.some(x=>x.startsWith("SOLD_ITEM_MISMATCH:")));
  const {bundle}=bundleFrom(blocked,f.source_items);
  assert.equal(bundle.jobs.length,0);
  assert.ok(bundle.blocked_proofs.every(x=>x.proof.bytes.length===0));
});

check("04 non-kitchen station blocked locally without disabling known kitchen dishes", () => {
  const ticket=structuredClone(original);
  const station=ticket.production.find(p=>p.station!=="COZINHA");
  assert.ok(station);
  station.ready_for_semantic_preview=false;
  station.warnings.push("TEST_STATION_SOURCE_MISMATCH");
  ticket.ready_for_semantic_preview=false;
  const {bundle}=bundleFrom(ticket,source);
  assert.deepEqual(channels(bundle),["CONFERENCE","KITCHEN_DISHES"]);
  assert.equal(bundle.blocked_proofs.length,1);
  assert.equal(bundle.blocked_proofs[0].channel,"OTHER_PRODUCTION");
  denied(bundle.blocked_proofs[0].proof,"STATION_SEMANTIC_NOT_READY");
});

check("05 kitchen station locally blocked, other station and conference survive", () => {
  const ticket=structuredClone(original);
  const station=ticket.production.find(p=>p.station==="COZINHA");
  assert.ok(station);
  station.ready_for_semantic_preview=false;
  ticket.ready_for_semantic_preview=false;
  const {bundle}=bundleFrom(ticket,source);
  assert.deepEqual(channels(bundle),["CONFERENCE","OTHER_PRODUCTION"]);
  assert.equal(bundle.blocked_proofs.length,1);
  assert.equal(bundle.blocked_proofs[0].channel,"KITCHEN_DISHES");
  denied(bundle.blocked_proofs[0].proof,"STATION_SEMANTIC_NOT_READY");
});

check("06 conference-only failure blocks only conference", () => {
  const ticket=structuredClone(original);
  ticket.conference.ready_for_semantic_preview=false;
  ticket.ready_for_semantic_preview=false;
  const {bundle}=bundleFrom(ticket,source);
  assert.deepEqual(channels(bundle),["KITCHEN_DISHES","OTHER_PRODUCTION"]);
  assert.equal(bundle.blocked_proofs.length,1);
  assert.equal(bundle.blocked_proofs[0].channel,"CONFERENCE");
  denied(bundle.blocked_proofs[0].proof,"CONFERENCE_SEMANTIC_NOT_READY");
});

check("07 inconsistent aggregate approval with no scoped reason fails closed", () => {
  const ticket=structuredClone(original);
  ticket.ready_for_semantic_preview=false;
  const {bundle}=bundleFrom(ticket,source);
  assert.equal(bundle.jobs.length,0);
  assert.equal(bundle.blocked_proofs.length,3);
  for(const {proof} of bundle.blocked_proofs)denied(proof,"GLOBAL_SEMANTIC_STATUS_INCONSISTENT");
});

check("08 review for missing component rules is not an automatic global blocker", () => {
  const {split,bundle}=bundleFrom(original,source);
  assert.equal(split.ready_for_complete_components,false);
  assert.ok(split.review_reasons.includes("KITCHEN_NEEDS_MISSING"));
  assert.equal(bundle.jobs.length,3);
  assert.equal(bundle.jobs.some(x=>x.channel==="KITCHEN_COMPONENTS"),false);
  assert.equal(bundle.jobs.every(x=>x.proof.ready_for_operational_print===false),true);
  assert.deepEqual(bundle.effects,{print:false,spooler_write:false,odhen_write:false,stock_write:false});
});

check("09 isolated mutations do not alter the archived source object", () => {
  const fresh=archivedResult();
  assert.deepEqual(fresh,original);
});

check("10 each blocked proof has a channel-qualified reason in bundle review summary", () => {
  const scenarios = [];
  const a=structuredClone(original);
  a.production[0].ready_for_semantic_preview=false;
  a.ready_for_semantic_preview=false;
  scenarios.push(a);
  const b=structuredClone(original);
  b.conference.ready_for_semantic_preview=false;
  b.ready_for_semantic_preview=false;
  scenarios.push(b);
  const c=structuredClone(original);
  c.blocking_reasons.push("SYNTHETIC_GLOBAL_FAILURE");
  c.ready_for_semantic_preview=false;
  scenarios.push(c);
  for(const ticket of scenarios) {
    const {bundle}=bundleFrom(ticket,source);
    assert.ok(bundle.blocked_proofs.length>0);
    for(const {channel,proof} of bundle.blocked_proofs) {
      for(const reason of proof.blocking_reasons) {
        const reported=channel+":"+reason;
        assert.ok(bundle.review_reasons.includes(reported),"UNREPORTED_BLOCK_REASON:"+reported);
      }
    }
  }
});

console.log("thermal-semantic-gate-v510: "+checks+"/"+checks+" PASS; SHADOW ONLY");
