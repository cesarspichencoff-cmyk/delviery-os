"use strict";
const assert = require("node:assert/strict");
const { projectOrderResources } = require("../dist/src/production/resourceConsumption.js");
const {
  projectOperationalTicketsV45,
  projectOperationalTicketsFromMotorsV45,
} = require("../dist/src/production/operationalTicketsV45.js");

const checks = [];
function check(name, fn) { fn(); checks.push(name); }
function copy(v) { return JSON.parse(JSON.stringify(v)); }

function fixture() {
  const source_items = [
    { item_index: 0, product_code: "COMB1", product_name: "Combinado Salmao 1 Pessoa",
      quantity: 1, observations: [], packaging_role: "CLOSED_COMBO" },
    { item_index: 1, product_code: "URA8", product_name: "Uramaki Skin (8)",
      quantity: 2, observations: ["SEM CEBOLINHA"], packaging_role: "OTHER" },
  ];
  const packaging_plan = {
    groups: [
      { box: "750", boxes: 1, status: "PROVEN_CURRENT_HUMAN_RULE",
        products: [{ name: "Combinado Salmao 1 Pessoa", quantity: 1 }] },
      { box: "750", boxes: 1, status: "PROVEN_CURRENT_HUMAN_RULE",
        products: [{ name: "Uramaki Skin (8)", quantity: 2 }] },
    ],
    bags: { minimum: 1, status: "FACT", exact_bag_count: 1,
      exact_bag_count_status: "FACT",
      group_sizes: [{ group: "FRIO", size: "M", status: "FACT" }] },
    has_unknown: false,
  };
  const sold_items = source_items.map((i) => ({
    product_code: i.product_code, product_name: i.product_name,
    quantity: i.quantity, cmv_basis: "NON_STOCK",
  }));
  const resourceInput = {
    order_id: "ORDER-18452",
    sold_items,
    packaging: packaging_plan,
    kits: { status: "FACT", kits: [{ kit: "Kit p/1", quantidade: 1 }] },
    kit_registry: { schema: "deliveryos.kit-component-registry.v1", kits: {
      "Kit p/1": { proof: "HUMAN_CONFIRMED", components: [
        { resource_key: "HASHI", label: "Hashi", quantity: 1, uom: "EA" },
        { resource_key: "WASABI_KIT", label: "Wasabi", quantity: 1, uom: "EA" },
      ] },
    } },
    complements: [
      { product_code: "EXTRA-GARI", product_name: "Gari", quantity: 1, proof: "HUMAN_CONFIRMED" },
      { product_code: "EXTRA-TARE", product_name: "Tare", quantity: 2, proof: "HUMAN_CONFIRMED" },
    ],
  };
  const fingerprint = "a".repeat(64);
  const production_plan = {
    schema: "deliveryos.production-print-plan.v1",
    ready_for_shadow_payload: true,
    blocking_reasons: [],
    print_intents: [{
      printer: { printer_name: "SUSHI", printer_code: "00003" },
      identifiers: { ifood_sequence: "5487", teknisa_sequence: "18452",
        tata_sequence: "006", order_time: "19:45" },
      intent_fingerprint: fingerprint,
      lines: [
        { item_index: 0, product_code: "COMB1", product_name: "Combinado Salmao 1 Pessoa",
          quantity: 1, item_observations: [], mount_group_id: "G1", box_label: "CX 750",
          prep_components: [] },
        { item_index: 1, product_code: "URA8", product_name: "Uramaki Skin (8)",
          quantity: 2, item_observations: ["SEM CEBOLINHA"], mount_group_id: "G2",
          box_label: "CX 750", prep_components: [] },
      ],
    }],
  };
  return {
    order_id: "ORDER-18452", source_items, resourceInput, packaging_plan, production_plan,
    fingerprint, finishing_rules: [], approved_aliases: [],
  };
}
function run(f) {
  const projection = projectOrderResources(f.resourceInput);
  return projectOperationalTicketsV45({
    order_id: f.order_id, source_items: f.source_items,
    production_plan: f.production_plan, resource_projection: projection,
    packaging_plan: f.packaging_plan, finishing_rules: f.finishing_rules,
    approved_aliases: f.approved_aliases, revision: f.revision,
    kitchen_needs_by_fingerprint: f.kitchen_needs_by_fingerprint,
  });
}

check("01 two engines feed one production and one conference", () => {
  const result = run(fixture());
  assert.equal(result.schema, "deliveryos.operational-tickets.v45.shadow.v1");
  assert.equal(result.production.length, 1);
  assert.equal(result.production[0].boxes.length, 2);
  assert.equal(result.conference.boxes.length, 2);
  assert.deepEqual(result.blocking_reasons, []);
  assert.equal(result.ready_for_semantic_preview, true);
  assert.equal(result.ready_for_automatic_operational_print, false);
  assert.deepEqual(result.effects, {
    print: false, spooler_write: false, odhen_write: false, stock_write: false,
  });
});
check("02 product quantity and piece count are distinct", () => {
  const result = run(fixture());
  const item = result.conference.boxes[1].items[0];
  assert.equal(item.quantity, 2);
  assert.equal(item.print_name, "URAMAKI SKIN (8)");
  assert.equal(result.production[0].identifiers.tata, "006");
});
check("03 observation is physically attached to the relevant product", () => {
  const result = run(fixture());
  assert.deepEqual(result.production[0].boxes[1].items[0].observations, ["SEM CEBOLINHA"]);
  assert.deepEqual(result.production[0].boxes[0].items[0].observations, []);
  assert.equal(result.conference.boxes[1].operator_field, "Op. ________");
});
check("04 proven bags and kits, without disclosing kit components", () => {
  const result = run(fixture());
  assert.deepEqual(result.conference.bags, [{ label: "Sacola M", quantity: 1 }]);
  assert.deepEqual(result.conference.kits, [{ label: "Kit p/1", quantity: 1 }]);
  assert.ok(!JSON.stringify(result.conference.kits).includes("HASHI"));
  assert.deepEqual(result.conference.accompaniments, [
    { label: "GARI", quantity: 1 }, { label: "TARE", quantity: 2 },
  ]);
});
check("05 unlisted wasabi from kit registry never appears as accompaniment", () => {
  const result = run(fixture());
  assert.ok(!result.conference.accompaniments.some((c) => c.label === "WASABI"));
});
check("06 validated cold-finishing instruction applies only to its product", () => {
  const f = fixture();
  f.finishing_rules = [{ product_code: "URA8", station: "SUSHI", purpose: "COLD_FINISHING",
    proof: "LOCAL_RECIPE_VALIDATED", source_ref: "human:fixture:recipe-v1",
    components: ["Cebolinha", "Gergelim"] }];
  const items = run(f).production[0].boxes.flatMap((b) => b.items);
  assert.deepEqual(items[0].finishing, []);
  assert.deepEqual(items[1].finishing, ["CEBOLINHA", "GERGELIM"]);
});
check("07 absent recipe gives no invented cold ingredients", () => {
  const result = run(fixture());
  assert.ok(result.production[0].boxes.every((b) => b.items.every((i) => i.finishing.length === 0)));
});
check("08 uncertain finishing does not masquerade as recipe fact", () => {
  const f = fixture();
  f.finishing_rules = [{ product_code: "URA8", station: "SUSHI", purpose: "COLD_FINISHING",
    proof: "UNKNOWN", source_ref: "", components: ["Molho inventado"] }];
  const result = run(f);
  assert.deepEqual(result.production[0].boxes[1].items[0].finishing, []);
  assert.ok(result.production[0].warnings.some((w) => w.includes("UNPROVEN_FINISHING_RULE")));
});
check("09 kitchen dependency comes only from existing kitchen projection", () => {
  const f = fixture();
  f.kitchen_needs_by_fingerprint = { [f.fingerprint]: {
    blocking_reasons: [],
    contributions: [{ item_name: "Uramaki Skin (8)", item_quantity: 2, hot: 0, ebiten: 2, shiso: 0 }],
  } };
  const result = run(f);
  assert.deepEqual(result.production[0].boxes[1].items[0].kitchen_dependencies, ["2x EBITEN"]);
});
check("10 closed combo with an extra cannot share a physical box", () => {
  const f = fixture();
  f.packaging_plan.groups = [{ box: "750", boxes: 1, status: "PROVEN_CURRENT_HUMAN_RULE",
    products: [{ name: "Combinado Salmao 1 Pessoa", quantity: 1 },
      { name: "Uramaki Skin (8)", quantity: 2 }] }];
  f.resourceInput.packaging = f.packaging_plan;
  const result = run(f);
  assert.equal(result.conference.boxes.length, 0);
  assert.equal(result.conference.items_without_proven_box.length, 2);
  assert.ok(result.conference.warnings.some((x) => x.startsWith("CLOSED_COMBO_CANNOT_SHARE_BOX")));
});
check("11 no inferred box allocation from a numeric station ticket label", () => {
  const f = fixture();
  f.packaging_plan.groups[1].status = "INFERENCE";
  f.resourceInput.packaging = f.packaging_plan;
  const result = run(f);
  assert.equal(result.production[0].boxes.length, 1);
  assert.equal(result.production[0].items_without_proven_box.length, 1);
  assert.equal(result.conference.boxes.length, 1);
  assert.equal(result.ready_for_semantic_preview, false);
});
check("12 multi-box group without per-box membership is not fabricated", () => {
  const f = fixture();
  f.packaging_plan.groups[1].boxes = 2;
  f.resourceInput.packaging = f.packaging_plan;
  const result = run(f);
  assert.equal(result.conference.boxes.length, 1);
  assert.equal(result.conference.items_without_proven_box.length, 1);
});
check("13 unproven bag size and count do not enter ticket as fact", () => {
  const f = fixture();
  f.packaging_plan.bags.exact_bag_count = null;
  f.packaging_plan.bags.exact_bag_count_status = "UNKNOWN";
  f.resourceInput.packaging = f.packaging_plan;
  const result = run(f);
  assert.deepEqual(result.conference.bags, []);
  assert.ok(result.conference.warnings.some((x) => x.includes("BAG_SIZE_OR_COUNT_NOT_PROVEN")));
});
check("14 unproven kit is omitted rather than assumed", () => {
  const f = fixture();
  f.resourceInput.kits.status = "UNKNOWN";
  const result = run(f);
  assert.deepEqual(result.conference.kits, []);
});
check("15 source mismatching resource engine blocks semantic preview", () => {
  const f = fixture();
  f.source_items[0].quantity = 2;
  const result = run(f);
  assert.ok(result.blocking_reasons.some((r) => r.startsWith("SOLD_ITEM_MISMATCH")));
  assert.equal(result.ready_for_semantic_preview, false);
});
check("16 station line mismatching source never passes ready state", () => {
  const f = fixture();
  f.production_plan.print_intents[0].lines[0].product_name = "OUTRO";
  const result = run(f);
  assert.ok(result.production[0].warnings.some((w) => w.startsWith("PRODUCTION_SOURCE_MISMATCH")));
  assert.equal(result.ready_for_semantic_preview, false);
});
check("17 duplicate item indexes are rejected", () => {
  const f = fixture();
  f.source_items[1].item_index = 0;
  const result = run(f);
  assert.ok(result.blocking_reasons.some((r) => r.startsWith("INVALID_OR_DUPLICATE_ITEM_INDEX")));
});
check("18 only evidence-backed aliases replace the original name", () => {
  const f = fixture();
  f.approved_aliases = [{ product_code: "URA8", print_name: "URAMAKI SKIN 8 PECAS",
    approval: "HUMAN_APPROVED", source_ref: "human:approved-alias" }];
  const result = run(f);
  assert.equal(result.conference.boxes[1].items[0].print_name, "URAMAKI SKIN 8 PECAS");
});
check("19 unapproved alias is ignored and flagged", () => {
  const f = fixture();
  f.approved_aliases = [{ product_code: "URA8", print_name: "URY",
    approval: "HUMAN_APPROVED", source_ref: "" }];
  const result = run(f);
  assert.equal(result.conference.boxes[1].items[0].print_name, "URAMAKI SKIN (8)");
  assert.ok(result.blocking_reasons.some((r) => r.startsWith("UNPROVEN_ALIAS")));
});
check("20 revision requires source and leaves original items intact", () => {
  const f = fixture();
  f.revision = { number: 2, source_ref: "order:update:2" };
  const result = run(f);
  assert.equal(result.conference.revision, 2);
  assert.equal(result.conference.boxes.length, 2);
});
check("21 invalid revision is blocked", () => {
  const f = fixture();
  f.revision = { number: 2, source_ref: "" };
  const result = run(f);
  assert.ok(result.blocking_reasons.includes("INVALID_ORDER_REVISION"));
});
check("22 every unallocated item stays visible for manual review", () => {
  const f = fixture();
  f.packaging_plan.groups.pop();
  f.resourceInput.packaging = f.packaging_plan;
  const result = run(f);
  assert.equal(result.conference.items_without_proven_box.length, 1);
  assert.equal(result.conference.items_without_proven_box[0].print_name, "URAMAKI SKIN (8)");
});
check("23 the automatic adapter calls the existing resource motor", () => {
  const f = fixture();
  const direct = run(f);
  const automatic = projectOperationalTicketsFromMotorsV45({
    order_id: f.order_id,
    source_items: f.source_items,
    production_plan: f.production_plan,
    resource_input: f.resourceInput,
  });
  assert.deepEqual(automatic, direct);
  assert.equal(automatic.effects.print, false);
});
check("24 an unknown packaging role prevents pretending a box is verified", () => {
  const f = fixture();
  f.source_items[1].packaging_role = "UNKNOWN";
  const result = run(f);
  assert.equal(result.conference.boxes.length, 1);
  assert.equal(result.conference.items_without_proven_box.length, 1);
  assert.equal(result.production[0].boxes.length, 1);
  assert.ok(result.conference.warnings.some((w) => w.startsWith("PACKAGING_ROLE_NOT_CONFIRMED")));
});
check("25 a blocked production plan cannot be described as shadow-ready", () => {
  const f = fixture();
  f.production_plan.ready_for_shadow_payload = false;
  const result = run(f);
  assert.ok(result.blocking_reasons.includes("PRODUCTION_PLAN_NOT_SHADOW_READY"));
  assert.equal(result.ready_for_semantic_preview, false);
});
check("26 closed combo and extra share no validated station box even if source group matches", () => {
  const f = fixture();
  f.production_plan.print_intents[0].lines[1].mount_group_id = "G1";
  f.packaging_plan.groups = [{
    box: "750", boxes: 1, status: "PROVEN_CURRENT_HUMAN_RULE",
    products: [
      { name: "Combinado Salmao 1 Pessoa", quantity: 1 },
      { name: "Uramaki Skin (8)", quantity: 2 },
    ],
  }];
  f.resourceInput.packaging = f.packaging_plan;
  const result = run(f);
  assert.equal(result.production[0].boxes.length, 0);
  assert.equal(result.production[0].items_without_proven_box.length, 2);
  assert.ok(result.production[0].warnings.some((w) => w.startsWith("CLOSED_COMBO_CANNOT_SHARE_BOX")));
});
console.log("operational-tickets-v45: " + checks.length + "/" + checks.length + " shadow tests PASS");
for (const c of checks) console.log("  PASS " + c);
