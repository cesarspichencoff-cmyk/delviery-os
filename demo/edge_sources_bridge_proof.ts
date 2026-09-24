import { strict as assert } from "node:assert";
import { OrderIdentityGraph } from "../src/edge/identityGraph";
import { teknisaRecordToObservation, TEKNISA_KNOWN_RETAIL_FACTS } from "../src/edge/teknisa/adapter";
import { tataOsReceiptToObservation, TATA_OS_BRIDGE_CAPABILITIES } from "../src/edge/tataos/bridge";

const graph = new OrderIdentityGraph();

const mappedOnly = teknisaRecordToObservation({
  record_id: "sale-1", record_type: "sale", unit_id: "0001",
  observed_at: "2026-09-24T21:00:00.000Z", route: "structured_export",
  payment_mapping: "ONLINE_IFOOD", amount: 100,
});
assert.equal(mappedOnly.correlation_proposals?.length ?? 0, 0);
assert.equal(mappedOnly.payload.payment_mapping, "ONLINE_IFOOD");

const exact = teknisaRecordToObservation({
  record_id: "sale-2", record_type: "sale", unit_id: "0001",
  observed_at: "2026-09-24T21:01:00.000Z", route: "local_structured_observation",
  external_order_id: "IFOOD-ABC", payment_mapping: "ONLINE_IFOOD",
});
const exactProposal = exact.correlation_proposals?.[0];
if (!exactProposal) throw new Error("expected external-id proposal");
const exactLink = graph.upsert(exact.source_ref, exactProposal.target, exactProposal.evidence, exact.observed_at);
assert.equal(exactLink.confidence, "PROVEN");
assert.equal(TEKNISA_KNOWN_RETAIL_FACTS.integration_code, "002");
assert.equal(TEKNISA_KNOWN_RETAIL_FACTS.units.length, 2);

const tataReceipt = tataOsReceiptToObservation({
  receipt_id: "r-1", type: "software_print_status", unit_id: "0001",
  observed_at: "2026-09-24T21:05:00.000Z", job_id: "job-1",
  operation_id: "op-1", software_state: "provider_completed",
});
assert.equal(tataReceipt.inherited_print_authority, false);
assert.equal(tataReceipt.physical_effect, "UNKNOWN");
assert.deepEqual(TATA_OS_BRIDGE_CAPABILITIES, ["observe_agent_heartbeat", "observe_print_receipt"]);

console.log(JSON.stringify({
  status: "PASS",
  payment_mapping_identity_proven: false,
  explicit_external_id_proven: true,
  tata_os_print_authority_inherited: false,
  physical_effect_inferred: false,
}, null, 2));