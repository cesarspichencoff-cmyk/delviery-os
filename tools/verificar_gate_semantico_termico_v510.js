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

check("11 planner-declared blocking reasons reject a contradictory ready flag", () => {
  const f=archivedCompleteInput();
  assert.equal(f.production_plan.ready_for_shadow_payload,true);
  f.production_plan.blocking_reasons.push("TEST_SYNTHETIC_PRODUCTION_BLOCK");
  const result=projectOperationalTicketsV45({
    order_id:f.id,source_items:f.source_items,
    production_plan:f.production_plan,resource_projection:f.resource_projection,
    packaging_plan:f.packaging
  });
  assert.equal(result.ready_for_semantic_preview,false,
    "planner blockers must not be downgraded to warnings");
  assert.ok(result.blocking_reasons.includes("PRODUCTION_MOTOR:TEST_SYNTHETIC_PRODUCTION_BLOCK"));
  const {bundle}=bundleFrom(result,f.source_items);
  assert.deepEqual(bundle.jobs,[]);
  assert.ok(bundle.blocked_proofs.length>=3);
  assert.ok(bundle.blocked_proofs.every(item=>item.proof.bytes.length===0));
});

check("12 incomplete packaging blocks only the conference when stations remain proven", () => {
  function project(f) {
    return projectOperationalTicketsV45({
      order_id:f.id,source_items:f.source_items,
      production_plan:f.production_plan,resource_projection:f.resource_projection,
      packaging_plan:f.packaging
    });
  }
  // The resource projection alone cannot make an absent packaging plan proven.
  const missing=archivedCompleteInput();
  missing.packaging=null;
  const m=project(missing);
  assert.equal(m.conference.ready_for_semantic_preview,false);
  const {bundle:missingBundle}=bundleFrom(m,missing.source_items);
  assert.equal(missingBundle.jobs.some(x=>x.channel==="CONFERENCE"),false);
  assert.ok(missingBundle.blocked_proofs.some(x=>x.channel==="CONFERENCE"));

  // An explicit unknown must not demote fully proven station tickets.
  const unknown=archivedCompleteInput();
  unknown.packaging.has_unknown=true;
  const u=project(unknown);
  assert.equal(u.conference.ready_for_semantic_preview,false);
  assert.ok(u.production.every(x=>x.ready_for_semantic_preview));
  const {bundle:unknownBundle}=bundleFrom(u,unknown.source_items);
  assert.deepEqual(channels(unknownBundle),["KITCHEN_DISHES","OTHER_PRODUCTION"]);
  assert.ok(unknownBundle.blocked_proofs.some(x=>x.channel==="CONFERENCE"));

  // One unallocated product requires manual conference review.
  const partial=archivedCompleteInput();
  partial.packaging.groups.pop();
  const p=project(partial);
  assert.ok(p.conference.items_without_proven_box.length>0);
  assert.equal(p.conference.ready_for_semantic_preview,false);
  const {bundle:partialBundle}=bundleFrom(p,partial.source_items);
  assert.equal(partialBundle.jobs.some(x=>x.channel==="CONFERENCE"),false);
});

check("13 unrelated kitchen split cannot substitute another order's dishes", () => {
  const foreign=structuredClone(original);
  for(const p of foreign.production)p.identifiers={...p.identifiers,tata:"017"};
  foreign.conference.identifiers={...foreign.conference.identifiers,tata:"017"};
  const {split:foreignSplit}=bundleFrom(foreign,source);
  assert.ok(foreignSplit.dishes);
  const bundle=buildKitchenSeparatedBundleV47(original,foreignSplit);
  assert.ok(!bundle.jobs.some(x=>x.channel==="KITCHEN_DISHES"),
    "cross-order kitchen dishes must never enter eligible export jobs");
  assert.ok(bundle.blocked_proofs.some(x=>x.channel==="KITCHEN_DISHES"));
  assert.ok(bundle.review_reasons.some(x=>x.includes("KITCHEN_SPLIT_SOURCE_MISMATCH")));
  assert.ok(bundle.jobs.some(x=>x.channel==="OTHER_PRODUCTION"));
});
check("14 detached kitchen fingerprint must not masquerade as this order", () => {
  const foreign=structuredClone(original);
  const kitchen=foreign.production.find(p=>p.station==="COZINHA");
  assert.ok(kitchen);
  kitchen.fingerprint="f".repeat(64);
  const {split:foreignSplit}=bundleFrom(foreign,source);
  const bundle=buildKitchenSeparatedBundleV47(original,foreignSplit);
  assert.ok(!bundle.jobs.some(x=>x.channel==="KITCHEN_DISHES"));
  assert.ok(bundle.blocked_proofs.some(x=>x.channel==="KITCHEN_DISHES"));
  assert.ok(bundle.review_reasons.some(x=>x.includes("KITCHEN_SPLIT_SOURCE_MISMATCH")));
});

check("15 foreign component ticket identity cannot enter offline export", () => {
  const {split}=bundleFrom(original,source);
  split.components={
    channel:"KITCHEN_COMPONENTS",
    title:"COZINHA - HOT / EBITEN / SHISO",
    identifiers:{...original.production[0].identifiers,tata:"017"},
    tasks:[{kind:"HOT",quantity:1,originating_products:["COMBINADO KIDS"]}],
    status:"PROVEN_COMPLETE",
    blocking_reasons:[],
  };
  split.ready_for_complete_components=true;
  const bundle=buildKitchenSeparatedBundleV47(original,split);
  assert.ok(!bundle.jobs.some(x=>x.channel==="KITCHEN_COMPONENTS"),
    "components bound to a different order cannot enter export");
  assert.ok(bundle.blocked_proofs.some(x=>x.channel==="KITCHEN_COMPONENTS"));
  assert.ok(bundle.review_reasons.some(x=>x.includes("KITCHEN_COMPONENT_IDENTIFIERS_MISMATCH")));
  assert.ok(bundle.jobs.some(x=>x.channel==="KITCHEN_DISHES"),
    "valid kitchen dishes must remain eligible");
});


// Synthetic complete rules are exclusively test fixtures; never operational approval.
const {splitTwoKitchenTicketsFromRulesV47} =
  require("../dist/src/production/twoKitchenTicketsV47.js");
function syntheticCompleteComponents(ticket) {
  const rules={
    schema:"deliveryos.kitchen-dependency-rules.v1",
    coverage:"COMPLETE",
    coverage_proof:"HUMAN_CONFIRMED",
    rules:source.map((s,i)=>({
      canonical_item_name:s.product_name,
      proof:"HUMAN_CONFIRMED",
      yields:i===0?{HOT:1}:{},
    })),
  };
  return splitTwoKitchenTicketsFromRulesV47(source,ticket,rules);
}
check("16 same order identifiers but different projection content must not mix component work", () => {
  const good=syntheticCompleteComponents(original);
  assert.equal(good.components?.status,"PROVEN_COMPLETE");
  assert.ok(buildKitchenSeparatedBundleV47(original,good).jobs.some(
    j=>j.channel==="KITCHEN_COMPONENTS"),"valid synthetic split must remain accepted");
  const foreign=structuredClone(original);
  foreign.production[0].fingerprint="e".repeat(64);
  assert.deepEqual(foreign.production[0].identifiers,original.production[0].identifiers);
  const foreignSplit=syntheticCompleteComponents(foreign);
  const mixed=buildKitchenSeparatedBundleV47(original,foreignSplit);
  assert.ok(!mixed.jobs.some(j=>j.channel==="KITCHEN_COMPONENTS"),
    "identifiers alone cannot prove the component source for this order");
  assert.ok(mixed.blocked_proofs.some(j=>j.channel==="KITCHEN_COMPONENTS"));
  assert.ok(mixed.review_reasons.some(x=>x.includes("KITCHEN_COMPONENT_PROJECTION_BINDING_MISMATCH")));
  assert.ok(mixed.jobs.some(j=>j.channel==="OTHER_PRODUCTION"),
    "unrelated proven station must remain eligible");
});

check("17 component quantity manipulation cannot silently change the work instructions", () => {
  const split=syntheticCompleteComponents(original);
  assert.equal(split.components?.status,"PROVEN_COMPLETE");
  split.components.tasks[0].quantity+=100;
  const bundle=buildKitchenSeparatedBundleV47(original,split);
  assert.ok(!bundle.jobs.some(j=>j.channel==="KITCHEN_COMPONENTS"));
  assert.ok(bundle.blocked_proofs.some(j=>j.channel==="KITCHEN_COMPONENTS"));
  assert.ok(bundle.review_reasons.some(x=>x.includes("KITCHEN_COMPONENT_PROJECTION_BINDING_MISMATCH")));
  assert.ok(bundle.jobs.some(j=>j.channel==="KITCHEN_DISHES"));
});
check("18 absent source binding fails closed for components but preserves proven dishes", () => {
  const split=syntheticCompleteComponents(original);
  assert.ok(split.components?.source_projection_binding_v512);
  delete split.components.source_projection_binding_v512;
  const bundle=buildKitchenSeparatedBundleV47(original,split);
  assert.ok(!bundle.jobs.some(j=>j.channel==="KITCHEN_COMPONENTS"));
  assert.ok(bundle.blocked_proofs.some(j=>j.channel==="KITCHEN_COMPONENTS"));
  assert.ok(bundle.jobs.some(j=>j.channel==="KITCHEN_DISHES"));
});

check("19 component readiness revoked after binding must block export", () => {
  const split=syntheticCompleteComponents(original);
  assert.ok(split.components && split.ready_for_complete_components);
  split.ready_for_complete_components=false; // task payload/hash remains unchanged
  const bundle=buildKitchenSeparatedBundleV47(original,split);
  assert.ok(!bundle.jobs.some(j=>j.channel==="KITCHEN_COMPONENTS"),
    "revoked component readiness must never export an eligible job");
  assert.ok(bundle.blocked_proofs.some(j=>j.channel==="KITCHEN_COMPONENTS"));
  assert.ok(bundle.review_reasons.some(x=>x.includes("KITCHEN_COMPONENT_SPLIT_NOT_READY")));
  assert.ok(bundle.jobs.some(j=>j.channel==="KITCHEN_DISHES"));
});
check("20 new review blockers after binding must block only components", () => {
  const split=syntheticCompleteComponents(original);
  assert.ok(split.components && split.ready_for_complete_components);
  split.review_reasons.push("DEPENDENCY_RULES_NOT_COMPLETE");
  const bundle=buildKitchenSeparatedBundleV47(original,split);
  assert.ok(!bundle.jobs.some(j=>j.channel==="KITCHEN_COMPONENTS"),
    "review-required split cannot be elevated by stale component status");
  assert.ok(bundle.blocked_proofs.some(j=>j.channel==="KITCHEN_COMPONENTS"));
  assert.ok(bundle.review_reasons.some(x=>x.includes("KITCHEN_COMPONENT_SPLIT_REVIEW_BLOCKERS")));
  assert.ok(bundle.jobs.some(j=>j.channel==="OTHER_PRODUCTION"));
});

check("21 non-kitchen foreign identity must not export into this order", () => {
  const ticket=structuredClone(original);
  const station=ticket.production.find(p=>p.station!=="COZINHA");
  assert.ok(station && ticket.conference.identifiers);
  station.identifiers={...station.identifiers,tata:"017"};
  assert.notEqual(station.identifiers.tata,ticket.conference.identifiers.tata);
  const {bundle}=bundleFrom(ticket,source);
  assert.ok(!bundle.jobs.some(j=>j.channel==="OTHER_PRODUCTION"),
    "foreign order station was wrongly admitted to offline output");
  assert.ok(bundle.blocked_proofs.some(j=>j.channel==="OTHER_PRODUCTION"));
  assert.ok(bundle.review_reasons.some(x=>x.includes("STATION_ORDER_IDENTIFIERS_MISMATCH")));
  // The existing V4.7 splitter independently detects mixed order IDs
  // and must continue to fail closed on ambiguous kitchen dishes.
  assert.ok(!bundle.jobs.some(j=>j.channel==="KITCHEN_DISHES"));
  const kitchenBlocked=bundle.blocked_proofs.find(j=>j.channel==="KITCHEN_DISHES");
  assert.ok(kitchenBlocked);
  denied(kitchenBlocked.proof,"KITCHEN_DISH_IDENTITY_OR_ROUTE_AMBIGUOUS");
});

check("22 kitchen dish identity inconsistent with conference is blocked", () => {
  const ticket=structuredClone(original);
  const kitchen=ticket.production.find(p=>p.station==="COZINHA");
  assert.ok(kitchen && ticket.conference.identifiers);
  kitchen.identifiers={...kitchen.identifiers,tata:"017"};
  assert.notEqual(kitchen.identifiers.tata,ticket.conference.identifiers.tata);
  const {bundle}=bundleFrom(ticket,source);
  assert.ok(!bundle.jobs.some(j=>j.channel==="KITCHEN_DISHES"),
    "kitchen dishes for another order cannot join offline jobs");
  const blocked=bundle.blocked_proofs.find(j=>j.channel==="KITCHEN_DISHES");
  assert.ok(blocked);
  denied(blocked.proof,"KITCHEN_DISHES_ORDER_IDENTIFIERS_MISMATCH");
  assert.ok(bundle.jobs.some(j=>j.channel==="OTHER_PRODUCTION"),
    "verified unrelated production channel must remain eligible");
});
check("23 conference identity conflicting with stations fails closed", () => {
  const ticket=structuredClone(original);
  assert.ok(ticket.conference.identifiers);
  ticket.conference.identifiers={...ticket.conference.identifiers,tata:"017"};
  assert.notEqual(ticket.conference.identifiers.tata,ticket.production[0].identifiers.tata);
  const {bundle}=bundleFrom(ticket,source);
  assert.ok(!bundle.jobs.some(j=>j.channel==="CONFERENCE"),
    "a conference with conflicting order identity cannot be exported");
  const blocked=bundle.blocked_proofs.find(j=>j.channel==="CONFERENCE");
  assert.ok(blocked);
  denied(blocked.proof,"CONFERENCE_STATION_IDENTIFIERS_MISMATCH");
  assert.ok(!bundle.jobs.some(j=>j.channel==="OTHER_PRODUCTION"));
  assert.ok(!bundle.jobs.some(j=>j.channel==="KITCHEN_DISHES"));
});

check("24 contradictory production note must be zero-byte blocked at bundle export", () => {
  const f=archivedCompleteInput();
  const intent=f.production_plan.print_intents.find(p=>p.printer.printer_name!=="COZINHA");
  assert.ok(intent && intent.lines.length>0);
  const line=intent.lines[0];
  const sourceItem=f.source_items.find(s=>s.item_index===line.item_index);
  assert.ok(sourceItem);
  assert.deepEqual(sourceItem.observations,[],
    "archived source is required to have no customer observations");
  line.item_observations=["SEM SAL"]; // Synthetic contradiction, not operational data.
  const projected=projectOperationalTicketsV45({
    order_id:f.id,source_items:f.source_items,
    production_plan:f.production_plan,resource_projection:f.resource_projection,
    packaging_plan:f.packaging,
  });
  const station=projected.production.find(p=>p.station===intent.printer.printer_name);
  assert.ok(station);
  assert.equal(station.ready_for_semantic_preview,false);
  assert.ok(station.warnings.includes("PRODUCTION_OBSERVATIONS_SOURCE_MISMATCH:"+line.item_index));
  const {bundle}=bundleFrom(projected,f.source_items);
  assert.ok(!bundle.jobs.some(j=>j.channel==="OTHER_PRODUCTION"));
  const blocked=bundle.blocked_proofs.find(j=>j.channel==="OTHER_PRODUCTION");
  assert.ok(blocked);
  denied(blocked.proof,"STATION_SEMANTIC_NOT_READY");
  assert.ok(bundle.review_reasons.some(x=>x.includes("OTHER_PRODUCTION:STATION_SEMANTIC_NOT_READY")));
  assert.ok(bundle.jobs.some(j=>j.channel==="CONFERENCE"),
    "independently consistent conference preview remains available");
});

console.log("thermal-semantic-gate-v510: "+checks+"/"+checks+" PASS; SHADOW ONLY");
