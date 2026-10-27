"use strict";
/**
 * Replay two already-recorded real orders. This does NOT read live orders,
 * query the point of sale or send a printer job.
 */
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { projectOrderResources } = require("../dist/src/production/resourceConsumption.js");
const { projectOperationalTicketsV45 } = require("../dist/src/production/operationalTicketsV45.js");

const repo = path.join(__dirname, "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(repo, "data", name), "utf8"));
const routes = read("tata_reader_real_order_expected_route_cdarvprod_20261005_v1.json");
const bagsAndBoxes = read("tata_reader_real_order_packaging_reference_20261005_v3.json");
const replay = read("tata_reader_real_order_unified_replay_success_20261005_v2.json");
const observations = read("tata_reader_real_order_observation_sanitized_20261005_v1.json");
const livePartial = read("tata_reader_post_cutover_first_live_order_20261005_v1.json");

function archivedCompleteInput() {
  const id = routes.order.NRCOMANDA;
  assert.equal(id, bagsAndBoxes.order.NRCOMANDA);
  assert.equal(id, replay.order.NRCOMANDA);
  assert.equal(id, observations.exact_order.NRCOMANDA);
  assert.equal(routes.status, "PROVEN_EXPECTED_ROUTE_FOR_REAL_ORDER_WITH_CDARVPROD_NO_PRINT");
  assert.equal(bagsAndBoxes.status, "EXACT_REAL_ORDER_BOXES_KITS_AND_EXTERNAL_BAG_PROVEN");
  assert.equal(observations.production_relevance.item_observation_state, "PROVEN_NONE_FOR_THIS_ORDER");
  assert.equal(replay.sequences.tata_policy.reprint_reuses_binding, true);

  const catalog = new Map(replay.production.flatMap((p) => p.lines.map((l) => [l.product_code, l])));
  const source_items = routes.items.map((r, item_index) => {
    const l = catalog.get(r.retail_product_code);
    assert.ok(l, "retail identity must join to an archived production line");
    assert.equal(l.quantity, Number(r.quantity));
    return {
      item_index,
      product_code: r.retail_product_code,
      product_name: l.product_name,
      quantity: l.quantity,
      observations: [],
      packaging_role: l.product_name === "COMBINADO KIDS" ? "CLOSED_COMBO" : "OTHER",
    };
  });
  assert.equal(source_items.length, 4);
  assert.equal(source_items.reduce((sum, x) => sum + x.quantity, 0), 6);
  const packaging = {
    groups: bagsAndBoxes.boxes.map((b) => ({
      box: b.box,
      boxes: b.physical_boxes,
      status: b.status === "PROVEN" ? "PROVEN_CURRENT_HUMAN_RULE" : "UNKNOWN",
      products: [{ name: b.product, quantity: b.quantity }],
    })),
    bags: {
      minimum: bagsAndBoxes.external_transport.exact_bag_count,
      status: "FACT",
      exact_bag_count: bagsAndBoxes.external_transport.exact_bag_count,
      exact_bag_count_status: "FACT",
      group_sizes: bagsAndBoxes.external_transport.bags.map((b) => ({
        group: "EXTERNAL_MEASURED",
        size: b.label.replace(/^Sacola /i, ""),
        status: b.status === "FACT_HUMAN_CONFIRMED_MEASURED_FIT" ? "FACT" : "UNKNOWN",
      })),
    },
    has_unknown: false,
  };
  assert.equal(packaging.groups.reduce((a, x) => a + x.boxes, 0), bagsAndBoxes.total_boxes);
  assert.equal(packaging.bags.exact_bag_count, 1);
  assert.equal(packaging.bags.group_sizes[0].size, "G");
  assert.equal(bagsAndBoxes.external_transport.internal_separation.hot_cold, true);

  const resource_projection = projectOrderResources({
    order_id: id,
    sold_items: source_items.map((s) => ({
      product_code: s.product_code, product_name: s.product_name,
      quantity: s.quantity, cmv_basis: "NON_STOCK",
    })),
    packaging,
  });
  assert.deepEqual(resource_projection.blocking_reasons, []);
  // The archived EXACT-ORDER kit labels were confirmed, but the old kit
  // component registry has been superseded. Add reference-only kit usage for
  // this archived replay, NEVER infer components or write inventory.
  const archiveKits = bagsAndBoxes.kits.map((k) => ({
    resource_key: "ARCHIVED_KIT:" + k.label,
    label: k.label, kind: "KIT", quantity: k.quantity, uom: "EA",
    proof: "KIT_RULE_FACT", stock_semantics: "REFERENCE_ONLY",
  }));
  assert.ok(bagsAndBoxes.kits.every((k) => k.status === "FACT"));
  resource_projection.usages.push(...archiveKits);
  resource_projection.unknowns = resource_projection.unknowns.filter((x) => x !== "KIT_PLAN_MISSING");
  const production_plan = {
    ready_for_shadow_payload: true,
    blocking_reasons: [],
    print_intents: replay.production.map((station) => ({
      printer: { printer_code: station.printer_code, printer_name: station.printer_name },
      intent_fingerprint: station.fingerprint,
      identifiers: {
        ifood_sequence: replay.sequences.ifood,
        teknisa_sequence: replay.sequences.teknisa,
        tata_sequence: replay.sequences.tata, // Proven isolated REPLAY binding, not a live print.
        order_time: routes.order.DTHRABERMESA.slice(11, 16),
      },
      lines: station.lines.map((line, idx) => {
        const src = source_items.find((s) => s.product_code === line.product_code);
        assert.ok(src);
        return {
          item_index: src.item_index, product_code: src.product_code,
          product_name: src.product_name, quantity: src.quantity,
          item_observations: [], mount_group_id: "ARCHIVE:" + src.item_index,
          box_label: "CX " + line.box, prep_components: [],
        };
      }),
    })),
  };
  return { id, source_items, packaging, resource_projection, production_plan };
}
function archivedResult() {
  const f = archivedCompleteInput();
  return projectOperationalTicketsV45({
    order_id: f.id, source_items: f.source_items,
    production_plan: f.production_plan,
    resource_projection: f.resource_projection, packaging_plan: f.packaging,
  });
}
function partiallyKnownInput() {
  assert.equal(livePartial.status, "PROVEN_STABLE_LIVE_EVENT_READY_FOR_SHADOW_DECISION");
  assert.equal(livePartial.packaging.status, "BLOCKED_BY_ONE_HUMAN_RULE");
  const id = livePartial.order.NRCOMANDA;
  const source_items = livePartial.order.items.map((x, item_index) => ({
    item_index, product_code: x.canonical, product_name: x.name,
    quantity: x.quantity, observations: [],
    packaging_role: x.name.startsWith("COMB ") ? "CLOSED_COMBO" : "UNKNOWN",
  }));
  const resource_projection = projectOrderResources({
    order_id: id,
    sold_items: source_items.map((s) => ({
      product_code: s.product_code, product_name: s.product_name,
      quantity: s.quantity, cmv_basis: "NON_STOCK",
    })),
    packaging: null,
  });
  // No supported production plan, item observation proof, pack-out allocation,
  // bag count or kit composition in this record. Do not silently invent any.
  const production_plan = {
    ready_for_shadow_payload: false,
    blocking_reasons: ["ARCHIVED_PRODUCTION_PLAN_NOT_AVAILABLE", "ITEM_OBSERVATIONS_NOT_CAPTURED"],
    print_intents: [],
  };
  return { id, source_items, resource_projection, production_plan };
}
function partiallyKnownResult() {
  const f = partiallyKnownInput();
  return projectOperationalTicketsV45({
    order_id: f.id, source_items: f.source_items,
    production_plan: f.production_plan,
    resource_projection: f.resource_projection, packaging_plan: null,
  });
}
function smoke() {
  const complete = archivedResult();
  const conference = complete.conference;
  assert.deepEqual(complete.blocking_reasons, []);
  assert.equal(complete.ready_for_semantic_preview, true);
  assert.equal(complete.ready_for_automatic_operational_print, false);
  assert.equal(complete.production.length, 2);
  assert.equal(conference.boxes.length, 6, "3 kids + 2 kitchen + 1 sushi");
  assert.deepEqual(conference.boxes.map((b) => b.model), ["750","750","750","650","650","240"]);
  assert.deepEqual(conference.boxes.slice(0, 3).map((b) => b.items[0].quantity), [1,1,1]);
  assert.ok(conference.boxes.every((b) => b.operator_field === "Op. ________"));
  assert.equal(conference.items_without_proven_box.length, 0);
  assert.deepEqual(conference.bags, [{label:"Sacola G", quantity:1}]);
  assert.deepEqual(conference.kits, [
    {label:"Kit Kids", quantity:3},{label:"Kit Quente",quantity:1},
  ]);
  assert.deepEqual(conference.accompaniments, []);
  assert.equal(conference.identifiers.ifood, "9627");
  assert.equal(conference.identifiers.tata, "001");
  assert.ok(complete.production.some((p) => p.station === "COZINHA"));
  assert.ok(complete.production.some((p) => p.station === "BALCAOSUSHI1" &&
    p.boxes.some((b) => b.physical_box_count === 3 && b.model === "750")));
  assert.equal(complete.effects.print,false);
  const unknown=partiallyKnownResult();
  assert.equal(unknown.ready_for_semantic_preview,false);
  assert.equal(unknown.production.length,0);
  assert.equal(unknown.conference.boxes.length,0);
  assert.equal(unknown.conference.items_without_proven_box.length,3);
  assert.deepEqual(unknown.conference.bags,[]);
  assert.deepEqual(unknown.conference.kits,[]);
  assert.ok(unknown.conference.warnings.some((w)=>w.includes("PACKAGING_PLAN_MISSING")));
  assert.ok(unknown.blocking_reasons.includes("PRODUCTION_PLAN_NOT_SHADOW_READY"));
  assert.equal(unknown.effects.print,false);

  // Negative regression: every sold line is allocated, yet the package plan
  // contains an additional unverified group. A green conference is false.
  const ghost=archivedCompleteInput();
  ghost.packaging.groups.push({
    box:"750",boxes:1,status:"UNKNOWN",
    products:[{name:"SYNTHETIC UNMATCHED",quantity:1}],
  });
  const ghostReview=projectOperationalTicketsV45({
    order_id:ghost.id,source_items:ghost.source_items,
    production_plan:ghost.production_plan,
    resource_projection:ghost.resource_projection,packaging_plan:ghost.packaging,
  });
  assert.equal(ghostReview.conference.items_without_proven_box.length,0);
  assert.equal(ghostReview.conference.ready_for_semantic_preview,false,
    "unverified extra packaging group cannot be hidden by covered source items");
  assert.ok(ghostReview.blocking_reasons.includes(
    "PACKAGING_GROUP_COVERAGE_NOT_PROVEN"));
  assert.equal(ghostReview.ready_for_automatic_operational_print,false);

  // Previous signature collision:
  // "A|1;B" x1 -> "A|1;B|1" == ("A" x1 + "B" x1).
  // Only the source's real SINGLE product is permitted to prove that box.
  const collision=archivedCompleteInput();
  const changed=collision.source_items.find(s=>s.item_index===1);
  assert.ok(changed&&changed.quantity===1);
  const originalName=changed.product_name;
  const grp=collision.packaging.groups.find(g=>
    g.products.length===1 && g.products[0].name===originalName &&
    g.products[0].quantity===1);
  assert.ok(grp,"archived one-unit group needed for adversarial fixture");
  changed.product_name="A|1;B";
  for(const intent of collision.production_plan.print_intents){
    for(const line of intent.lines){
      if(line.item_index===changed.item_index)line.product_name=changed.product_name;
    }
  }
  grp.products=[{name:"A",quantity:1},{name:"B",quantity:1}];
  const collided=projectOperationalTicketsV45({
    order_id:collision.id,source_items:collision.source_items,
    production_plan:collision.production_plan,
    resource_projection:collision.resource_projection,packaging_plan:collision.packaging,
  });
  const relevant=collided.production.filter(station=>
    station.items_without_proven_box.some(x=>x.source_item_index===changed.item_index) ||
    station.boxes.some(box=>box.items.some(x=>x.source_item_index===changed.item_index)));
  assert.ok(relevant.length>0);
  assert.ok(relevant.every(station=>
    station.warnings.some(w=>w.startsWith("STATION_BOX_ALLOCATION_NOT_PROVEN:"))),
    "separate products must not prove the source item's physical box");
  assert.equal(collided.ready_for_automatic_operational_print,false);

  // Missing product code cannot be silently treated as identity equality.
  const missingCode=archivedCompleteInput();
  const first=missingCode.production_plan.print_intents
    .flatMap(intent=>intent.lines).find(line=>line.product_code);
  assert.ok(first);
  for(const intent of missingCode.production_plan.print_intents){
    for(const line of intent.lines){
      if(line.item_index===first.item_index)line.product_code=null;
    }
  }
  const codeReview=projectOperationalTicketsV45({
    order_id:missingCode.id,source_items:missingCode.source_items,
    production_plan:missingCode.production_plan,
    resource_projection:missingCode.resource_projection,
    packaging_plan:missingCode.packaging,
  });
  assert.ok(codeReview.production.some(station=>
    station.warnings.includes("PRODUCTION_SOURCE_MISMATCH:"+first.item_index)),
    "a missing planned product code must never inherit source identity proof");
  assert.equal(codeReview.ready_for_semantic_preview,false);
  assert.equal(codeReview.effects.print,false);
  // Countable resources must never be presented as ready without whole
  // quantities and exact, independently evidenced bag allocation.
  const reviewPackingFault=(modify, reason)=>{
    const f=archivedCompleteInput();
    modify(f);
    const result=projectOperationalTicketsV45({
      order_id:f.id,source_items:f.source_items,
      production_plan:f.production_plan,
      resource_projection:f.resource_projection,packaging_plan:f.packaging,
    });
    assert.ok(result.blocking_reasons.includes(reason),reason);
    assert.equal(result.conference.ready_for_semantic_preview,false,reason);
    assert.equal(result.ready_for_semantic_preview,false,reason);
    assert.equal(result.ready_for_automatic_operational_print,false,reason);
    assert.equal(result.effects.print,false,reason);
    return result;
  };
  for (const unknownReason of ["EXACT_BAG_COUNT_UNKNOWN",
    "KIT_PLAN_MISSING","PACKAGING_BOX_UNKNOWN_GROUP_99"]) {
    reviewPackingFault(f=>f.resource_projection.unknowns.push(unknownReason),
      "PACKAGING_RESOURCE_EVIDENCE_INCOMPLETE");
  }
  reviewPackingFault(f=>{f.packaging.bags.exact_bag_count=2;},
    "EXACT_BAG_ALLOCATION_NOT_PROVEN");
  reviewPackingFault(f=>{
    f.resource_projection.usages=f.resource_projection.usages.filter(u=>u.kind!=="BAG");
  },"EXACT_BAG_ALLOCATION_NOT_PROVEN");
  reviewPackingFault(f=>{
    f.resource_projection.usages.find(u=>u.kind==="BAG").quantity=0.5;
  },"BAG_OR_KIT_QUANTITY_NOT_WHOLE");
  reviewPackingFault(f=>{
    f.resource_projection.usages.find(u=>u.kind==="KIT").quantity=1.5;
  },"BAG_OR_KIT_QUANTITY_NOT_WHOLE");
  reviewPackingFault(f=>{f.packaging.bags.exact_bag_count_status="UNKNOWN";},
    "EXACT_BAG_ALLOCATION_NOT_PROVEN");
  const undefinedPlan=reviewPackingFault(f=>{f.packaging=undefined;},
    "EXACT_BAG_ALLOCATION_NOT_PROVEN");
  assert.ok(undefinedPlan.conference.warnings.includes("PACKAGING_PLAN_MISSING"));
  console.log("real-order-tickets-v46: 2 verified archived real-order scenarios PASS (no print)");
  return {complete,unknown};
}
if (require.main === module) {
  const {complete,unknown}=smoke();
  if (process.argv.includes("--json")) process.stdout.write(JSON.stringify({
    schema:"deliveryos.real-order-tickets-replay.v46.no-effects",
    archival_proven_complete_order:complete,
    partial_order_unknown:unknown,
    metadata:{
      originalOrderDate:"2026-10-04",
      proofCaptureDate:"2026-10-05",
      tataSequenceScope:"ISOLATED_REPLAY_ONLY",
      kitProof:"EXACT_ORDER_REFERENCE_NOT_NEW_RECIPE",
      hotColdOuterBagPolicy:"EXACT_ORDER_MEASURED_ONE_G_INTERNAL_SEPARATION",
      runtime_authority:false,
    },
  },null,2)+"\n");
}
module.exports = {archivedResult,archivedCompleteInput,partiallyKnownResult,smoke};
