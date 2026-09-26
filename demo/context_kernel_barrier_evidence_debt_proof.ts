import { strict as assert } from "node:assert";
import {
  buildBarrierEvidenceDebtPlan,
} from "../src/contextKernel/barrierEvidenceDebt";
import {
  buildExpectedBarrierAssessments,
} from "../src/contextKernel/expectedBarrier";
import type { OperationalEpisodeEvidence } from
  "../src/contextKernel/episodeRecurrence";

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

const assessments = buildExpectedBarrierAssessments([
  episode("o1", "OMISSION"),
  episode("w1", "WRONG_ITEM"),
  episode("d1", "DELAY_LOGISTICS"),
]);
const defaults = buildBarrierEvidenceDebtPlan({ assessments });
assert.equal(defaults.mapped_episode_count, 2);
assert.equal(defaults.debt_count, 8);
assert.equal(defaults.unique_capture_requirement_count, 7);
assert.equal(defaults.route_counts.CAPTURE_NEXT_TIME, 8);
assert.equal(defaults.route_counts.CESAR, 0);
assert.equal(defaults.cesar_route_count, 0);
assert.equal(defaults.barrier_failure_proven_count, 0);
assert.equal(defaults.barrier_compliance_proven_count, 0);
assert.equal(defaults.direct_attention_reasons_created, 0);
assert.equal(defaults.external_effects_authorized, false);
assert.ok(defaults.debts.every((item) => item.evidence_status === "UNKNOWN"));
assert.ok(defaults.debts.every((item) => item.guilt_inferred === false));
assert.ok(defaults.debts.every((item) => item.cause_proven === false));
assert.ok(defaults.debts.every((item) => item.cesar_context_needed === false));
assert.ok(
  defaults.debts.every((item) => item.capture_contract_status === "DESIGN_ONLY"),
);

const routed = buildBarrierEvidenceDebtPlan({
  assessments,
  hints: [
    {
      episode_id: "o1",
      barrier_id: "PHYSICAL_POST_PRINT_CHECK",
      trusted_source_available: true,
    },
    {
      episode_id: "w1",
      barrier_id: "CUSTOMER_OBSERVATION_CHECK",
      operational_owner_available: true,
    },
    {
      episode_id: "w1",
      barrier_id: "MANUAL_CORRECTION_PHYSICAL_CHECK",
      capture_next_time_possible: false,
    },
  ],
});
assert.equal(routed.route_counts.TRUSTED_SOURCE, 1);
assert.equal(routed.route_counts.OPERATIONAL_OWNER, 1);
assert.equal(routed.route_counts.KEEP_UNKNOWN, 1);
assert.equal(routed.route_counts.CAPTURE_NEXT_TIME, 5);
assert.equal(routed.route_counts.CESAR, 0);

assert.throws(
  () =>
    buildBarrierEvidenceDebtPlan({
      assessments,
      hints: [
        {
          episode_id: "d1",
          barrier_id: "FINAL_DIVERGENCE_CONFERENCE",
          trusted_source_available: true,
        },
      ],
    }),
  /barrier_evidence_hint_without_debt/,
);
assert.throws(
  () =>
    buildBarrierEvidenceDebtPlan({
      assessments,
      hints: [
        {
          episode_id: "o1",
          barrier_id: "IDENTIFY_BEFORE_ADVANCE",
        },
        {
          episode_id: "o1",
          barrier_id: "IDENTIFY_BEFORE_ADVANCE",
        },
      ],
    }),
  /barrier_evidence_duplicate_hint/,
);

console.log(JSON.stringify({
  status: "PASS",
  mapped_unknown_becomes_explicit_evidence_debt: true,
  default_route_is_future_capture_not_cesar: true,
  trusted_source_has_priority: true,
  operational_owner_precedes_future_capture: true,
  missing_capture_can_remain_unknown: true,
  academia_mapping_never_routes_to_cesar: true,
  missing_evidence_is_not_barrier_failure: true,
  guilt_inferred: false,
  cause_proven: false,
  external_effects_authorized: false,
}, null, 2));
