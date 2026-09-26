import { strict as assert } from "node:assert";
import type { OperationalEpisodeEvidence } from "../src/contextKernel/episodeRecurrence";
import {
  buildExpectedBarrierAssessments,
  EXPECTED_BARRIERS,
  TATA_ACADEMIA_BARRIER_SNAPSHOT,
} from "../src/contextKernel/expectedBarrier";

function episode(id: string, mechanism: string): OperationalEpisodeEvidence {
  return {
    episode_id: id,
    business_date: "2026-09-20",
    source_ref: "fixture:" + id,
    mechanism_key: mechanism,
    mechanism_basis: "RULE_INFERRED",
    resolution_marker: "SOURCE_MARKED_CONCLUDED",
    action_kinds: ["REFUND"],
    outcome_observed: false,
  };
}

const result = buildExpectedBarrierAssessments([
  episode("o1", "OMISSION"),
  episode("w1", "WRONG_ITEM"),
  episode("d1", "DELAY_LOGISTICS"),
]);

assert.equal(TATA_ACADEMIA_BARRIER_SNAPSHOT.head,
  "4d656c9eb6b3ab4e5314e6a62973c9f7cdac6779");
assert.equal(EXPECTED_BARRIERS.length, 7);
assert.equal(result.mapped_episode_count, 2);
assert.equal(result.unmapped_episode_count, 1);
assert.equal(result.execution_unknown_count, 2);
assert.equal(result.barrier_failure_proven_count, 0);
assert.equal(result.barrier_compliance_proven_count, 0);
assert.equal(result.direct_attention_reasons_created, 0);
assert.equal(result.external_effects_authorized, false);

const omission = result.assessments.find((item) => item.episode_id === "o1");
assert.ok(omission);
assert.equal(omission.knowledge_status, "MAPPED_EXPECTED_BARRIERS");
assert.deepEqual(omission.barrier_ids, [
  "FINAL_DIVERGENCE_CONFERENCE",
  "IDENTIFY_BEFORE_ADVANCE",
  "PHYSICAL_POST_PRINT_CHECK",
  "REUNITE_COMPLETE_ORDER",
]);
assert.ok(omission.academia_claim_ids.includes("BOQ-002"));
assert.ok(omission.academia_claim_ids.includes("CONF-001"));
assert.equal(omission.execution_status, "UNKNOWN");
assert.equal(omission.barrier_failure_proven, false);
assert.equal(omission.barrier_compliance_proven, false);
assert.equal(omission.manager_investigator_evidence_debt, true);

const wrong = result.assessments.find((item) => item.episode_id === "w1");
assert.ok(wrong);
assert.deepEqual(wrong.barrier_ids, [
  "CUSTOMER_OBSERVATION_CHECK",
  "EXACT_PRODUCT_QUANTITY_MATCH",
  "FINAL_DIVERGENCE_CONFERENCE",
  "MANUAL_CORRECTION_PHYSICAL_CHECK",
]);
assert.ok(wrong.academia_claim_ids.includes("ORDER-002"));
assert.ok(wrong.academia_claim_ids.includes("OBS-001"));

const delay = result.assessments.find((item) => item.episode_id === "d1");
assert.ok(delay);
assert.equal(delay.knowledge_status, "NO_MAPPED_BARRIER");
assert.equal(delay.manager_investigator_evidence_debt, false);
assert.deepEqual(delay.barrier_ids, []);

console.log(JSON.stringify({
  status: "PASS",
  academia_policy_is_expected_knowledge_only: true,
  incident_execution_remains_unknown: true,
  barrier_failure_not_inferred: true,
  barrier_compliance_not_inferred: true,
  omission_and_wrong_item_mapped: true,
  unmapped_family_stays_unmapped: true,
  attention_authority: "NONE",
  external_effects_authorized: false,
}, null, 2));
