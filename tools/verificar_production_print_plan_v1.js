"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { projectExpectedRouting } = require("../dist/src/shadow/expectedRouting.js");
const { planProductionPrintIntents } = require("../dist/src/production/productionPrintPlan.js");
const {
  decideProductionPrintSubmission, decideProductionOrderRevisionReviewV1,
} = require("../dist/src/production/productionPrintIdempotency.js");

const routing = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "odhen_product_routing_compact_v1.json"), "utf8"),
);
const printers = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "runtime_printer_map_v1.json"), "utf8"),
);
const nonProduction = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "non_production_delivery_items_v1.json"), "utf8"),
);
const calibration = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "production_printer_calibration_registry_v1.json"), "utf8"),
);

const order = {
  ids: { pedido_interno: "18452" },
  items: [
    {
      item_index: 0,
      codigo: "9150007500",
      nome: "COMBINADO SALMAO 1 PESSOA",
      quantidade: 1,
    },
    {
      item_index: 1,
      codigo: "9500000000",
      nome: "URAMAKI DE SALMAO",
      quantidade: 2,
    },
    {
      item_index: 2,
      codigo: "9750003000",
      nome: "WASABI",
      quantidade: 1,
    },
  ],
};

// Historical fixture contains ambiguous dual sushi destinations. Use explicitly
// single-destination SYNTHETIC entries to continue exercising the independent
// content, observation, calibration and idempotency contracts below.
const singleRouteFixture=structuredClone(routing);
singleRouteFixture.products["9.15.00.075.00"]=["00003"];
singleRouteFixture.products["9.50.00.000.00"]=["00004"];
const projection = projectExpectedRouting(order, singleRouteFixture, printers, nonProduction);
assert.equal(projection.ready, true);
const ambiguousProjection=projectExpectedRouting(order,routing,printers,nonProduction);
const ambiguousPlan=planProductionPrintIntents(ambiguousProjection,{
 tata_sequence:"037",teknisa_sequence:"18452",ifood_sequence:"A1B2C3",
 order_time:"19:42",
 service_resolution:{service:"DINNER",evidence:"HUMAN_CONFIRMED_RULE",
  source_ref:"synthetic:legacy-service"},
 template_version:"production-ticket-v2-shadow",ticket_items:[]
},calibration);
assert.equal(ambiguousPlan.ready_for_shadow_payload,false,
 "historical dual roles remain unproved even with DINNER label");
assert.ok(ambiguousPlan.blocking_reasons.some(x=>x.includes("DUAL_PRODUCTION_ROLE_UNPROVEN")));
assert.equal(ambiguousPlan.print_intents.length,0);

const plan = planProductionPrintIntents(
  projection,
  {
    tata_sequence: "037",
    teknisa_sequence: "18452",
    ifood_sequence: "A1B2C3",
    order_time: "19:42",
    service_resolution: {
      service: "DINNER",
      evidence: "HUMAN_CONFIRMED_RULE",
      source_ref: "human:cesar:service-rule-2026-09-30",
    },
    template_version: "production-ticket-v2-shadow",
    ticket_items: [
      {
        item_index: 0,
        mount_group_id: "G1",
        box_label: "CX 750",
        item_observations: ["SEM CEBOLINHA"],
      },
      {
        item_index: 1,
        mount_group_id: "G2",
        box_label: "CX 750",
      },
    ],
  },
  calibration,
);

assert.equal(plan.ready_for_shadow_payload, true);
assert.equal(plan.ready_for_physical_print, false);
assert.equal(plan.print_intents.length, 2);

const byPrinter = new Map(plan.print_intents.map((x) => [x.printer.printer_code, x]));

assert.deepEqual(
  [...byPrinter.keys()].sort(),
  ["00003", "00004"],
);

assert.deepEqual(
  byPrinter.get("00003").lines.map((x) => [x.product_name, x.quantity]),
  [["COMBINADO SALMAO 1 PESSOA", 1]],
);
assert.deepEqual(
  byPrinter.get("00004").lines.map((x) => [x.product_name, x.quantity]),
  [["URAMAKI DE SALMAO", 2]],
);

const lunchPlan = planProductionPrintIntents(
  projection,
  {
    tata_sequence: "037",
    teknisa_sequence: "18452",
    ifood_sequence: "A1B2C3",
    order_time: "13:42",
    service_resolution: {
      service: "LUNCH",
      evidence: "HUMAN_CONFIRMED_RULE",
      source_ref: "human:cesar:service-rule-2026-09-30",
    },
    template_version: "production-ticket-v2-shadow",
    ticket_items: [],
  },
  calibration,
);
assert.equal(lunchPlan.ready_for_shadow_payload, true);
assert.deepEqual(
  lunchPlan.print_intents.map((x) => x.printer.printer_code).sort(),
  ["00003", "00004"],
);

for (const intent of plan.print_intents) {
  assert.equal(intent.identifiers.ifood_sequence, "A1B2C3");
  assert.equal(intent.identifiers.teknisa_sequence, "18452");
  assert.equal(intent.identifiers.tata_sequence, "037");
  assert.equal(intent.evidence, "PLANNED");
  assert.equal(intent.calibration_status, "CALIBRATION_REQUIRED");
  assert.equal(intent.physical_effect_authorized, false);
  assert.equal(intent.service_resolution.service, "DINNER");
  assert.equal(intent.intent_fingerprint.length, 64);
  assert.match(intent.intent_fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(intent.semantic_key_material.startsWith(
    '["production-ticket-v3-canonical-json","18452",'
  ));
}

assert.deepEqual(plan.no_own_production_ticket_items, [
  {
    item_index: 2,
    product_code: "9.75.00.030.00",
    product_name: "WASABI",
    quantity: 1,
    reason: nonProduction.items["9.75.00.030.00"].reason,
  },
]);

const missingSequencePlan = planProductionPrintIntents(
  projection,
  {
    tata_sequence: "037",
    teknisa_sequence: "18452",
    ifood_sequence: null,
    order_time: "19:42",
    service_resolution: {
      service: "DINNER",
      evidence: "HUMAN_CONFIRMED_RULE",
      source_ref: "human:cesar:service-rule-2026-09-30",
    },
    template_version: "production-ticket-v2-shadow",
    ticket_items: [],
  },
  calibration,
);
assert.equal(missingSequencePlan.ready_for_shadow_payload, false);
assert.ok(missingSequencePlan.blocking_reasons.includes("IFOOD_SEQUENCE_REQUIRED"));

const missingServicePlan = planProductionPrintIntents(
  projection,
  {
    tata_sequence: "037",
    teknisa_sequence: "18452",
    ifood_sequence: "A1B2C3",
    order_time: "19:42",
    service_resolution: {
      service: null,
      evidence: "UNKNOWN",
      source_ref: null,
    },
    template_version: "production-ticket-v2-shadow",
    ticket_items: [],
  },
  calibration,
);
assert.equal(missingServicePlan.ready_for_shadow_payload, true,
 "a single-proved physical route has no daily-service approval dependency");
assert.deepEqual(missingServicePlan.print_intents.map(
 x=>x.printer.printer_code).sort(),["00003","00004"]);

const unprovenServicePlan = planProductionPrintIntents(
  projection,
  {
    tata_sequence: "037",
    teknisa_sequence: "18452",
    ifood_sequence: "A1B2C3",
    order_time: "19:42",
    service_resolution: {
      service: "DINNER",
      evidence: "UNKNOWN",
      source_ref: null,
    },
    template_version: "production-ticket-v2-shadow",
    ticket_items: [],
  },
  calibration,
);
assert.equal(unprovenServicePlan.ready_for_shadow_payload, false);
assert.ok(
  unprovenServicePlan.blocking_reasons.includes(
    "PRODUCTION_SERVICE_EVIDENCE_REQUIRED",
  ),
);
assert.ok(
  unprovenServicePlan.blocking_reasons.includes(
    "PRODUCTION_SERVICE_SOURCE_REF_REQUIRED",
  ),
);

const unclassifiedOrderObservationPlan = planProductionPrintIntents(
  projection,
  {
    tata_sequence: "037",
    teknisa_sequence: "18452",
    ifood_sequence: "A1B2C3",
    order_time: "19:42",
    service_resolution: {
      service: "DINNER",
      evidence: "REAL_OBSERVED",
      source_ref: "odhen:explicit-service-context",
    },
    order_observations: [{
      value: "TEXTO ORDER-LEVEL AINDA NAO CLASSIFICADO",
      source_ref: "odhen:DSOBSCOMANDA",
      relevance: "UNKNOWN",
      proof: "REAL_OBSERVED",
    }],
    template_version: "production-ticket-v2-shadow",
    ticket_items: [],
  },
  calibration,
);
assert.equal(unclassifiedOrderObservationPlan.ready_for_shadow_payload, false);
assert.ok(
  unclassifiedOrderObservationPlan.blocking_reasons.includes(
    "ORDER_OBSERVATION_RELEVANCE_UNPROVEN_0",
  ),
);
assert.ok(
  unclassifiedOrderObservationPlan.print_intents.every(
    (x) => x.order_observations.length === 0,
  ),
);

const fingerprintBase = planProductionPrintIntents(
  projection,
  {
    tata_sequence: "037",
    teknisa_sequence: "18452",
    ifood_sequence: "A1B2C3",
    order_time: "19:42",
    service_resolution: {
      service: "DINNER",
      evidence: "REAL_OBSERVED",
      source_ref: "odhen:explicit-service-context",
    },
    order_observations: [{
      value: "SEM MOLHO NO PEDIDO",
      source_ref: "synthetic:order-observation",
      relevance: "PRODUCTION_RELEVANT",
      proof: "REAL_OBSERVED",
    }],
    template_version: "production-ticket-v2-shadow",
    ticket_items: [
      {
        item_index: 0,
        mount_group_id: "G1",
        box_label: "CX 750",
        item_observations: ["SEM CEBOLINHA"],
        prep_components: [
          {
            component_key: "EBITEN",
            label: "Ebiten",
            quantity: 2,
            unit: "EA",
            proof: "HUMAN_CONFIRMED_RULE",
          },
        ],
      },
    ],
  },
  calibration,
);
// V2 delimiter collision: the two different component tuples below both
// serialized as "A~B~C~2~EA~HUMAN_CONFIRMED_RULE" in the old key.
const collisionContext=(component)=>({
 tata_sequence:"037",teknisa_sequence:"18452",ifood_sequence:"A1B2C3",
 order_time:"19:42",template_version:"production-ticket-v2-shadow",
 ticket_items:[{item_index:0,prep_components:[component]}]
});
const componentBase={quantity:2,unit:"EA",proof:"HUMAN_CONFIRMED_RULE"};
const collisionA=planProductionPrintIntents(projection,
 collisionContext({...componentBase,component_key:"A~B",label:"C"}),calibration);
const collisionB=planProductionPrintIntents(projection,
 collisionContext({...componentBase,component_key:"A",label:"B~C"}),calibration);
const kitchenIntent=plan=>plan.print_intents.find(x=>x.printer.printer_code==="00003");
assert.ok(collisionA.ready_for_shadow_payload&&collisionB.ready_for_shadow_payload);
assert.notEqual(kitchenIntent(collisionA).intent_fingerprint,
 kitchenIntent(collisionB).intent_fingerprint,
 "distinct prep components must never deduplicate as the same print intent");
assert.equal(collisionA.ready_for_physical_print,false);
assert.equal(collisionB.ready_for_physical_print,false);

// V2 observation collision: a single text containing "|" vs two notes.
const observationContext=(notes)=>({
 tata_sequence:"037",teknisa_sequence:"18452",ifood_sequence:"A1B2C3",
 order_time:"19:42",template_version:"production-ticket-v2-shadow",
 order_observations:notes.map(value=>({
  value,source_ref:"synthetic:review",relevance:"PRODUCTION_RELEVANT",
  proof:"REAL_OBSERVED"
 }))
});
const singleNote=planProductionPrintIntents(projection,
 observationContext(["SEM MOLHO | NA CAIXA"]),calibration);
const separateNotes=planProductionPrintIntents(projection,
 observationContext(["SEM MOLHO","NA CAIXA"]),calibration);
assert.notEqual(kitchenIntent(singleNote).intent_fingerprint,
 kitchenIntent(separateNotes).intent_fingerprint,
 "note boundaries must be structurally preserved");

// Prep component order may vary in equivalent readbacks; canonical key stays stable.
const comp1={...componentBase,component_key:"EBITEN",label:"Ebiten"};
const comp2={...componentBase,component_key:"ARROZ",label:"Arroz"};
const reorder=(components)=>planProductionPrintIntents(projection,{
 ...collisionContext(comp1),
 ticket_items:[{item_index:0,prep_components:components}]
},calibration);
assert.equal(kitchenIntent(reorder([comp1,comp2])).intent_fingerprint,
 kitchenIntent(reorder([comp2,comp1])).intent_fingerprint,
 "equivalent component sets require a stable fingerprint");

const fingerprintReplay = planProductionPrintIntents(
  projection,
  {
    tata_sequence: "037",
    teknisa_sequence: "18452",
    ifood_sequence: "A1B2C3",
    order_time: "19:42",
    service_resolution: {
      service: "DINNER",
      evidence: "REAL_OBSERVED",
      source_ref: "odhen:explicit-service-context",
    },
    order_observations: [{
      value: "SEM MOLHO NO PEDIDO",
      source_ref: "synthetic:order-observation",
      relevance: "PRODUCTION_RELEVANT",
      proof: "REAL_OBSERVED",
    }],
    template_version: "production-ticket-v2-shadow",
    ticket_items: [
      {
        item_index: 0,
        mount_group_id: "G1",
        box_label: "CX 750",
        item_observations: ["SEM CEBOLINHA"],
        prep_components: [
          {
            component_key: "EBITEN",
            label: "Ebiten",
            quantity: 2,
            unit: "EA",
            proof: "HUMAN_CONFIRMED_RULE",
          },
        ],
      },
    ],
  },
  calibration,
);
assert.deepEqual(
  fingerprintReplay.print_intents.map((x) => x.intent_fingerprint),
  fingerprintBase.print_intents.map((x) => x.intent_fingerprint),
);

const fingerprintChangedObservation = planProductionPrintIntents(
  projection,
  {
    tata_sequence: "037",
    teknisa_sequence: "18452",
    ifood_sequence: "A1B2C3",
    order_time: "19:42",
    service_resolution: {
      service: "DINNER",
      evidence: "REAL_OBSERVED",
      source_ref: "odhen:explicit-service-context",
    },
    order_observations: [{
      value: "COM MOLHO SEPARADO",
      source_ref: "synthetic:order-observation",
      relevance: "PRODUCTION_RELEVANT",
      proof: "REAL_OBSERVED",
    }],
    template_version: "production-ticket-v2-shadow",
    ticket_items: [],
  },
  calibration,
);
assert.notEqual(
  fingerprintChangedObservation.print_intents[0].intent_fingerprint,
  fingerprintBase.print_intents[0].intent_fingerprint,
);

function targetFromRuntimeMap(printerCode) {
  const printer = printers.mappings.find((x) => x.printer_code === printerCode);
  assert.ok(printer, `missing runtime printer ${printerCode}`);
  assert.ok(printer.printer_ip, `missing runtime printer ip ${printerCode}`);
  return {
    printer_code: printer.printer_code,
    printer_name: printer.printer_name,
    printer_ip: printer.printer_ip,
    printer_port: printer.printer_port,
    peripherals_server: printer.peripherals_server,
  };
}

const independentKitchenProjection = {
  ...projection,
  order_id: "18453",
  items: [
    {
      item_index: 0,
      source_product_code: "SYNTHETIC",
      product_code: "SYNTHETIC",
      product_name: "SYNTHETIC SUSHI 2 + KITCHEN",
      quantity: 1,
      routing_status: "ROUTED",
      non_production_reason: null,
      targets: [
        targetFromRuntimeMap("00006"),
        targetFromRuntimeMap("00004"),
        targetFromRuntimeMap("00002"),
      ],
    },
  ],
};

const dinnerWithIndependentKitchen = planProductionPrintIntents(
  independentKitchenProjection,
  {
    tata_sequence: "038",
    teknisa_sequence: "18453",
    ifood_sequence: "A1B2C4",
    order_time: "19:43",
    service_resolution: {
      service: "DINNER",
      evidence: "HUMAN_CONFIRMED_RULE",
      source_ref: "human:cesar:service-rule-2026-09-30",
    },
    template_version: "production-ticket-v2-shadow",
    ticket_items: [],
  },
  calibration,
);
assert.equal(dinnerWithIndependentKitchen.ready_for_shadow_payload, false,
 "independent kitchen output cannot cancel unproved sushi routes");
assert.ok(dinnerWithIndependentKitchen.blocking_reasons.includes(
 "SUSHI_2_DUAL_PRODUCTION_ROLE_UNPROVEN_ITEM_0"));
assert.deepEqual(
  dinnerWithIndependentKitchen.print_intents
    .map((x) => x.printer.printer_code)
    .sort(),
  ["00002"],
);

const calibratedRegistry = structuredClone(calibration);
for (const entry of calibratedRegistry.printers) {
  entry.calibration = {
    actual_device_variant: "TM-T20_STORE_PROVEN",
    actual_media_width_mm: 80,
    printable_width_dots: 576,
    windows_queue_name: "STORE_QUEUE_PROVEN",
    windows_driver_name: "STORE_DRIVER_PROVEN",
    windows_port_name: "STORE_PORT_PROVEN",
    direct_network_print_port: 9100,
    transport_selected: "STORE_TRANSPORT_PROVEN",
    character_mode: "STORE_CHARACTER_MODE_PROVEN",
    accent_test: "PASS",
    cutter_test: "PASS",
    feed_after_cut_test: "PASS",
    bold_double_size_legibility: "PASS",
    density_legibility: "PASS",
    paperout_observation: "PASS",
    cover_open_observation: "PASS",
    offline_observation: "PASS",
    spooler_job_observation: "PASS",
    one_physical_ticket_proof: "PASS",
  };
}

const calibratedPlan = planProductionPrintIntents(
  projection,
  {
    tata_sequence: "037",
    teknisa_sequence: "18452",
    ifood_sequence: "A1B2C3",
    order_time: "19:42",
    service_resolution: {
      service: "DINNER",
      evidence: "HUMAN_CONFIRMED_RULE",
      source_ref: "human:cesar:service-rule-2026-09-30",
    },
    template_version: "production-ticket-v2-shadow",
    ticket_items: [],
  },
  calibratedRegistry,
);
assert.ok(
  calibratedPlan.print_intents.every(
    (x) => x.calibration_status === "READY_FOR_RENDER_CALIBRATION_PROVEN",
  ),
);
assert.equal(calibratedPlan.ready_for_physical_print, false);

const coverOpenUnknownRegistry = structuredClone(calibratedRegistry);
coverOpenUnknownRegistry.printers.find(
  (x) => x.printer_code === "00003",
).calibration.cover_open_observation = "UNKNOWN";
const coverOpenUnknownPlan = planProductionPrintIntents(
  projection,
  {
    tata_sequence: "037",
    teknisa_sequence: "18452",
    ifood_sequence: "A1B2C3",
    order_time: "19:42",
    service_resolution: {
      service: "DINNER",
      evidence: "HUMAN_CONFIRMED_RULE",
      source_ref: "human:cesar:service-rule-2026-09-30",
    },
    template_version: "production-ticket-v2-shadow",
    ticket_items: [],
  },
  coverOpenUnknownRegistry,
);
assert.equal(
  coverOpenUnknownPlan.print_intents.find(
    (x) => x.printer.printer_code === "00003",
  ).calibration_status,
  "CALIBRATION_REQUIRED",
);

// Blank or impossible values are not printer calibration evidence.
function assertInvalidCalibration(modify,label){
 const reg=structuredClone(calibratedRegistry);
 const entry=reg.printers.find(x=>x.printer_code==="00003");
 modify(entry.calibration);
 const p=planProductionPrintIntents(projection,{
  tata_sequence:"037",teknisa_sequence:"18452",ifood_sequence:"A1B2C3",
  order_time:"19:42",template_version:"production-ticket-v2-shadow",
  ticket_items:[]
 },reg);
 assert.equal(p.print_intents.find(x=>
  x.printer.printer_code==="00003").calibration_status,
  "CALIBRATION_REQUIRED",label);
 assert.equal(p.ready_for_physical_print,false,label);
}
for(const bad of ["","   ","UNKNOWN","unknown"]){
 for(const field of ["actual_device_variant","transport_selected",
  "character_mode","cutter_test","one_physical_ticket_proof"]){
  assertInvalidCalibration(c=>{c[field]=bad;},
   "empty/unknown calibration "+field);
 }
}
for(const bad of [0,-1,NaN,Infinity]){
 for(const field of ["actual_media_width_mm","printable_width_dots"]){
  assertInvalidCalibration(c=>{c[field]=bad;},
   "invalid numeric calibration "+field);
 }
}
assertInvalidCalibration(c=>{c.printable_width_dots=577.25;},
 "noninteger dots cannot prove calibration");

const intentFingerprint = plan.print_intents[0].intent_fingerprint;
assert.equal(
  decideProductionPrintSubmission(intentFingerprint, []).decision,
  "ALLOW_FIRST_SUBMISSION",
);
assert.equal(
  decideProductionPrintSubmission(intentFingerprint, [
    {
      intent_fingerprint: intentFingerprint,
      attempt_id: "A1",
      state: "SUBMISSION_RETURNED_UNOBSERVED",
    },
  ]).decision,
  "BLOCK_RECONCILIATION_REQUIRED",
);
assert.equal(
  decideProductionPrintSubmission(intentFingerprint, [
    {
      intent_fingerprint: intentFingerprint,
      attempt_id: "A2",
      state: "SPOOLER_OBSERVED",
    },
  ]).decision,
  "BLOCK_RECONCILIATION_REQUIRED",
);
assert.equal(
  decideProductionPrintSubmission(intentFingerprint, [
    {
      intent_fingerprint: intentFingerprint,
      attempt_id: "A3",
      state: "PHYSICALLY_CONFIRMED",
    },
  ]).decision,
  "BLOCK_ALREADY_PHYSICALLY_CONFIRMED",
);
assert.equal(
  decideProductionPrintSubmission("different-fingerprint", [
    {
      intent_fingerprint: intentFingerprint,
      attempt_id: "A4",
      state: "PHYSICALLY_CONFIRMED",
    },
  ]).decision,
  "ALLOW_FIRST_SUBMISSION",
);

// Adversarial journal entries cannot become an apparent first print.
const malformedHistories=[
 [{intent_fingerprint:intentFingerprint,attempt_id:"A5",state:"UNRECOGNIZED_STATE"}],
 [{intent_fingerprint:intentFingerprint,attempt_id:"",state:"PLANNED"}],
 [{intent_fingerprint:"",attempt_id:"A6",state:"PLANNED"}],
 [null],
 [{}],
 null,
];
for(const history of malformedHistories){
 const gate=decideProductionPrintSubmission(intentFingerprint,history);
 assert.equal(gate.decision,"BLOCK_RECONCILIATION_REQUIRED");
 assert.deepEqual(gate.blocking_reasons,["ATTEMPT_HISTORY_INTEGRITY_UNPROVEN"]);
 assert.equal(gate.automatic_retry_allowed,false);
 assert.deepEqual(gate.effects,{print:false,spooler_write:false});
}
const selfDeclaredNoEffect=decideProductionPrintSubmission(intentFingerprint,[{
 intent_fingerprint:intentFingerprint,attempt_id:"A7",
 state:"PROVEN_NO_EFFECT_FAILURE"
}]);
assert.equal(selfDeclaredNoEffect.decision,"BLOCK_RECONCILIATION_REQUIRED");
assert.deepEqual(selfDeclaredNoEffect.blocking_reasons,
 ["NO_EFFECT_HISTORY_LACKS_INDEPENDENT_ATTESTATION"]);
assert.equal(selfDeclaredNoEffect.automatic_retry_allowed,false);
assert.deepEqual(selfDeclaredNoEffect.effects,{print:false,spooler_write:false});
const priorPlanned=decideProductionPrintSubmission(intentFingerprint,[{
 intent_fingerprint:intentFingerprint,attempt_id:"A8",
 state:"PLANNED"
}]);
assert.equal(priorPlanned.decision,"BLOCK_RECONCILIATION_REQUIRED");
assert.deepEqual(priorPlanned.blocking_reasons,
 ["PRIOR_PLANNED_ATTEMPT_NOT_RECONCILED"]);
assert.equal(priorPlanned.automatic_retry_allowed,false);
const concurrentPlanned=decideProductionPrintSubmission(intentFingerprint,[
 {intent_fingerprint:intentFingerprint,attempt_id:"A8",state:"PLANNED"},
 {intent_fingerprint:intentFingerprint,attempt_id:"A9",state:"PLANNED"}
]);
assert.deepEqual(concurrentPlanned.blocking_reasons,
 ["PRIOR_PLANNED_ATTEMPT_NOT_RECONCILED"]);
const reusedAcrossIntent=decideProductionPrintSubmission(intentFingerprint,[
 {intent_fingerprint:intentFingerprint,attempt_id:"A9",state:"PROVEN_NO_EFFECT_FAILURE"},
 {intent_fingerprint:"another-native-revision",attempt_id:"A9",state:"PLANNED"}
]);
assert.equal(reusedAcrossIntent.decision,"BLOCK_RECONCILIATION_REQUIRED");
assert.deepEqual(reusedAcrossIntent.blocking_reasons,
 ["ATTEMPT_ID_REUSED_FOR_DIFFERENT_INTENTS"]);


const shaA="a".repeat(64),shaB="b".repeat(64),shaC="c".repeat(64);
const scopedBase=()=>({
 order_key:"0001|01|0000349281|0000348850",station_code:"00003",
 operational_date:"2026-10-20",native_snapshot_sha256:shaB,intent_fingerprint:shaC,
 history:[],history_complete_for_order_station:true,
 history_source_ref:"OFFLINE_FIXTURE_NOT_AN_ATTESTATION",
 current_native_revision_verified_latest:true,
 cancellation_revision_reconciled:true
});
const orderRow=(state,changes={})=>({
 order_key:"0001|01|0000349281|0000348850",station_code:"00003",
 operational_date:"2026-10-20",native_snapshot_sha256:shaA,intent_fingerprint:shaA,attempt_id:"A1",
 state,...changes
});
function assertOrderReview(input,verdict,reason){
 const before=JSON.stringify(input);
 const output=decideProductionOrderRevisionReviewV1(input);
 assert.equal(JSON.stringify(input),before,"input must not mutate");
 assert.equal(output.schema,"deliveryos.order-revision-print-review.v1");
 assert.equal(output.verdict,verdict);
 assert.ok(output.reasons.includes(reason),JSON.stringify(output.reasons));
 assert.equal(output.ready_for_operational_print,false);
 assert.equal(output.automatic_retry_allowed,false);
 assert.deepEqual(output.effects,{print:false,spooler_write:false,sequence_write:false});
}
for(const state of ["PHYSICALLY_CONFIRMED"]){
 const x=scopedBase();x.history=[orderRow(state)];
 assertOrderReview(x,"HOLD","PRIOR_PHYSICAL_EFFECT_SAME_ORDER_STATION");
}
for(const state of ["SUBMISSION_RETURNED_UNOBSERVED","SPOOLER_OBSERVED",
 "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION"]){
 const x=scopedBase();x.history=[orderRow(state)];
 assertOrderReview(x,"HOLD","PRIOR_EFFECT_UNKNOWN_SAME_ORDER_STATION");
}
{
 const x=scopedBase();x.history=[orderRow("PLANNED")];
 assertOrderReview(x,"HOLD","PRIOR_PLANNED_ATTEMPT_NOT_RECONCILED");
}
{
 const x=scopedBase();x.history=[orderRow("PROVEN_NO_EFFECT_FAILURE")];
 assertOrderReview(x,"REVIEW_CANDIDATE_NO_PRINT_AUTHORITY",
  "HISTORY_CLAIM_IS_NOT_INDEPENDENT_ATTESTATION");
}
for(const field of ["order_key","station_code"]){
 const x=scopedBase();x.history=[orderRow("PHYSICALLY_CONFIRMED",{
  [field]:field==="order_key"?"0001|01|OTHER|ANOTHER":"00002"
 })];
 assertOrderReview(x,"REVIEW_CANDIDATE_NO_PRINT_AUTHORITY",
  "HISTORY_CLAIM_IS_NOT_INDEPENDENT_ATTESTATION");
}
for(const field of ["current_native_revision_verified_latest",
 "cancellation_revision_reconciled"]){
 const x=scopedBase();x[field]=false;
 assertOrderReview(x,"HOLD",
  "LATEST_NATIVE_REVISION_OR_CANCELLATION_UNRECONCILED");
}
const staleAndPrinted=scopedBase();
staleAndPrinted.current_native_revision_verified_latest=false;
staleAndPrinted.history=[orderRow("PHYSICALLY_CONFIRMED")];
assertOrderReview(staleAndPrinted,"HOLD",
 "LATEST_NATIVE_REVISION_OR_CANCELLATION_UNRECONCILED");

const incomplete=scopedBase();incomplete.history_complete_for_order_station=false;
assertOrderReview(incomplete,"HOLD","ORDER_STATION_HISTORY_COMPLETENESS_UNATTESTED");
const noSource=scopedBase();noSource.history_source_ref="";
assertOrderReview(noSource,"HOLD","ORDER_STATION_HISTORY_COMPLETENESS_UNATTESTED");
for(const bad of [null,[null],[orderRow("UNRECOGNIZED")],
 [orderRow("PLANNED",{attempt_id:""})]]){
 const x=scopedBase();x.history=bad;
 assertOrderReview(x,"HOLD","ORDER_STATION_ATTEMPT_HISTORY_INVALID");
}
for(const invalid of ["2026-02-30","2026-13-01","2026-2-1",""]){
 const x=scopedBase();x.operational_date=invalid;
 assertOrderReview(x,"HOLD","ORDER_STATION_OR_NATIVE_REVISION_IDENTITY_INVALID");
 const y=scopedBase();y.history=[orderRow("PLANNED",{operational_date:invalid})];
 assertOrderReview(y,"HOLD","ORDER_STATION_ATTEMPT_HISTORY_INVALID");
}
const differentDay=scopedBase();
differentDay.history=[orderRow("PHYSICALLY_CONFIRMED",{
 operational_date:"2026-10-19"})];
assertOrderReview(differentDay,"HOLD","ORDER_STATION_OPERATIONAL_DAY_CONTRADICTED");
const differentDayNoEffect=scopedBase();
differentDayNoEffect.history=[orderRow("PROVEN_NO_EFFECT_FAILURE",{
 operational_date:"2026-10-21"})];
assertOrderReview(differentDayNoEffect,"HOLD","ORDER_STATION_OPERATIONAL_DAY_CONTRADICTED");
const repeatedAttempt=scopedBase();
repeatedAttempt.history=[orderRow("PLANNED"),orderRow("PROVEN_NO_EFFECT_FAILURE")];
assertOrderReview(repeatedAttempt,"HOLD","ORDER_STATION_ATTEMPT_IDENTITY_CONTRADICTED");
const sameRevisionDiffIntent=scopedBase();
sameRevisionDiffIntent.history=[orderRow("PLANNED",{
 native_snapshot_sha256:shaB,intent_fingerprint:shaA})];
assertOrderReview(sameRevisionDiffIntent,"HOLD",
 "SAME_NATIVE_REVISION_DIFFERENT_INTENT_IDENTITY");
const sameIntentDiffRevision=scopedBase();
sameIntentDiffRevision.history=[orderRow("PLANNED",{intent_fingerprint:shaC})];
assertOrderReview(sameIntentDiffRevision,"HOLD",
 "PRINT_INTENT_REUSED_ACROSS_NATIVE_REVISIONS");
const exactDuplicate=scopedBase();exactDuplicate.history=[
 orderRow("PLANNED"),orderRow("PLANNED")];
assertOrderReview(exactDuplicate,"HOLD",
 "PRIOR_PLANNED_ATTEMPT_NOT_RECONCILED");
const completedAndPlanned=scopedBase();
completedAndPlanned.history=[
 orderRow("PROVEN_NO_EFFECT_FAILURE"),
 orderRow("PLANNED",{attempt_id:"A2",native_snapshot_sha256:shaB,
  intent_fingerprint:shaC})];
assertOrderReview(completedAndPlanned,"HOLD",
 "PRIOR_PLANNED_ATTEMPT_NOT_RECONCILED");

assert.deepEqual(plan.effects, {
  print: false,
  spooler_write: false,
  odhen_write: false,
  fiscal_action: false,
  cutover: false,
});

console.log("production-print-plan-v1: ok");
