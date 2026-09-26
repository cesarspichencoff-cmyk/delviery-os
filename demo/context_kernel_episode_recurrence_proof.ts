import { strict as assert } from "node:assert";
import {
  buildEpisodeRecurrenceMemory,
  type OperationalEpisodeEvidence,
} from "../src/contextKernel/episodeRecurrence";

function episode(
  id: string,
  date: string,
  mechanism: string,
  overrides: Partial<OperationalEpisodeEvidence> = {},
): OperationalEpisodeEvidence {
  return {
    episode_id: id,
    business_date: date,
    source_ref: "fixture:" + id,
    mechanism_key: mechanism,
    mechanism_basis: "RULE_INFERRED",
    resolution_marker: "SOURCE_MARKED_CONCLUDED",
    action_kinds: ["REFUND"],
    outcome_observed: false,
    ...overrides,
  };
}

const memory = buildEpisodeRecurrenceMemory([
  episode("o1", "2026-09-01", "OMISSION"),
  episode("o2", "2026-09-04", "OMISSION", {
    resolution_marker: "SOURCE_MARKED_REVIEW_NEEDED",
  }),
  episode("o3", "2026-09-10", "OMISSION", {
    outcome_observed: true,
  }),
  episode("b1", "2026-09-08", "BAG_SWAP_CUSTODY"),
  episode("b2", "2026-09-08", "BAG_SWAP_CUSTODY"),
  episode("u1", "2026-09-02", "UNCLASSIFIED"),
  episode("u2", "2026-09-07", "UNCLASSIFIED"),
]);

assert.equal(memory.total_episode_evidence, 7);
assert.equal(memory.classified_episode_evidence, 5);
assert.equal(memory.unclassified_episode_evidence, 2);
assert.equal(memory.recurrence_mechanism_count, 1);
assert.equal(memory.source_concluded_is_observed_outcome, false);
assert.equal(memory.recurrence_is_shared_root_cause, false);
assert.equal(memory.direct_attention_reasons_created, 0);
assert.equal(memory.external_effects_authorized, false);

const omission = memory.mechanisms.find(
  (item) => item.mechanism_key === "OMISSION",
);
assert.ok(omission);
assert.equal(omission.episode_count, 3);
assert.equal(omission.distinct_business_dates, 3);
assert.equal(omission.recurrence_observed, true);
assert.equal(omission.source_marked_concluded_count, 2);
assert.equal(omission.source_marked_review_needed_count, 1);
assert.equal(omission.observed_outcome_count, 1);
assert.equal(omission.shared_root_cause_status, "UNPROVEN");
assert.equal(omission.attention_authority, "NONE");

const custody = memory.mechanisms.find(
  (item) => item.mechanism_key === "BAG_SWAP_CUSTODY",
);
assert.ok(custody);
assert.equal(custody.episode_count, 2);
assert.equal(custody.distinct_business_dates, 1);
assert.equal(custody.recurrence_observed, false);

assert.throws(
  () =>
    buildEpisodeRecurrenceMemory([
      episode("dup", "2026-09-01", "OMISSION"),
      episode("dup", "2026-09-02", "OMISSION"),
    ]),
  /episode_recurrence_duplicate_episode_id/,
);

assert.throws(
  () =>
    buildEpisodeRecurrenceMemory([
      episode("bad-date", "2026-02-31", "OMISSION"),
    ]),
  /episode_recurrence_business_date_invalid/,
);

console.log(JSON.stringify({
  status: "PASS",
  recurrence_requires_multiple_business_dates: true,
  source_concluded_is_not_outcome_proof: true,
  recurrence_is_not_shared_root_cause: true,
  unclassified_evidence_is_not_promoted_to_mechanism: true,
  attention_authority: "NONE",
  external_effect_authorized: false,
}, null, 2));
