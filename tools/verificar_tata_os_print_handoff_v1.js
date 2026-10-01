"use strict";

const assert = require("node:assert/strict");
const {
  buildStationProductionTicketV2,
} = require("../dist/src/production/productionTicketV2.js");
const {
  buildTataOsPrintHandoff,
} = require("../dist/src/production/tataOsPrintHandoff.js");

const fingerprint = "a".repeat(64);
const intent = {
  printer: {
    printer_code: "00003",
    printer_name: "DELIVERY SUSHI 1",
    printer_ip: "192.168.0.153",
    printer_port: null,
    peripherals_server: "192.168.0.24:3000",
  },
  template_version: "production-ticket-v2-shadow",
  service_resolution: {
    service: "DINNER",
    evidence: "HUMAN_CONFIRMED_RULE",
    source_ref: "human:cesar:service-rule-2026-09-30",
  },
  order_observations: ["MOLHO SEPARADO"],
  semantic_key_material: "semantic-material",
  intent_fingerprint: fingerprint,
  identifiers: {
    ifood_sequence: "A1B2C3",
    teknisa_sequence: "18452",
    tata_sequence: "037",
    order_time: "19:42",
  },
  lines: [
    {
      item_index: 0,
      product_code: "9.15.00.075.00",
      product_name: "COMBINADO SALMAO 1 PESSOA",
      quantity: 1,
      item_observations: ["SEM CEBOLINHA"],
      mount_group_id: "G1",
      box_label: "CX 750",
      prep_components: [],
    },
  ],
  evidence: "PLANNED",
  calibration_status: "READY_FOR_RENDER_CALIBRATION_PROVEN",
  physical_effect_authorized: false,
};

const ticket = buildStationProductionTicketV2(intent);
const input = {
  intent,
  ticket,
  operation_id: "OP-TEST-1",
  request_id: "RQ-TEST-1",
  object_id: "OBJ-18452-00003",
  template_version_id: "TPL-PROD-V2",
  template_hash: "sha256:template",
  printer_profile_id: "PRINTER-00003",
  requested_by: "deliveryos-shadow-test",
  requested_at: "2026-10-01T19:42:00-03:00",
  reason: "PRODUCTION_TICKET",
  reprint_of: null,
  copies: 1,
};

const handoff = buildTataOsPrintHandoff(input);
assert.equal(handoff.contract_complete, true);
assert.equal(handoff.submission_authorized, false);
assert.deepEqual(handoff.blocking_reasons, []);
assert.equal(handoff.request.semantic_payload_hash, `sha256:${fingerprint}`);
assert.equal(handoff.request.variables_snapshot.intent_fingerprint, fingerprint);
assert.equal(handoff.request.variables_snapshot.ticket.intent_fingerprint, fingerprint);

const fingerprintMismatch = buildTataOsPrintHandoff({
  ...input,
  ticket: { ...ticket, intent_fingerprint: "b".repeat(64) },
});
assert.equal(fingerprintMismatch.contract_complete, false);
assert.ok(
  fingerprintMismatch.blocking_reasons.includes(
    "INTENT_TICKET_FINGERPRINT_MISMATCH",
  ),
);

const serviceMismatch = buildTataOsPrintHandoff({
  ...input,
  ticket: {
    ...ticket,
    service_resolution: {
      ...ticket.service_resolution,
      service: "LUNCH",
    },
  },
});
assert.equal(serviceMismatch.contract_complete, false);
assert.ok(
  serviceMismatch.blocking_reasons.includes(
    "INTENT_TICKET_SERVICE_RESOLUTION_MISMATCH",
  ),
);

const observationMismatch = buildTataOsPrintHandoff({
  ...input,
  ticket: {
    ...ticket,
    order_observations: ["OUTRA OBSERVACAO"],
  },
});
assert.equal(observationMismatch.contract_complete, false);
assert.ok(
  observationMismatch.blocking_reasons.includes(
    "INTENT_TICKET_ORDER_OBSERVATIONS_MISMATCH",
  ),
);

const invalidFingerprint = buildTataOsPrintHandoff({
  ...input,
  intent: {
    ...intent,
    intent_fingerprint: "not-a-hash",
  },
  ticket: {
    ...ticket,
    intent_fingerprint: "not-a-hash",
  },
});
assert.equal(invalidFingerprint.contract_complete, false);
assert.ok(
  invalidFingerprint.blocking_reasons.includes("INTENT_FINGERPRINT_INVALID"),
);

console.log("tata-os-print-handoff-v1: ok");
