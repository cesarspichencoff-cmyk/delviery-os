import { strict as assert } from "node:assert";
import {
  buildActionFollowupMemory,
} from "../src/contextKernel/actionFollowup";
import type { OperationalEpisodeEvidence } from
  "../src/contextKernel/episodeRecurrence";

function episode(
  id: string,
  date: string,
  mechanism: string,
  actions: string[] = [],
  overrides: Partial<OperationalEpisodeEvidence> = {},
): OperationalEpisodeEvidence {
  return {
    episode_id: id,
    business_date: date,
    source_ref: "fixture:" + id,
    mechanism_key: mechanism,
    mechanism_basis: "RULE_INFERRED",
    resolution_marker: "SOURCE_MARKED_CONCLUDED",
    action_kinds: actions,
    outcome_observed: false,
    ...overrides,
  };
}

const memory = buildActionFollowupMemory({
  loaded_window_end: "2026-09-10",
  coverage_exhaustive: false,
  evidence: [
    episode("o1", "2026-09-01", "OMISSION", ["RESEND"]),
    // Same-day repetition is not a later-business-date follow-up.
    episode("o2", "2026-09-01", "OMISSION"),
    episode("w1", "2026-09-02", "WRONG_ITEM", ["REFUND"]),
    episode("o3", "2026-09-03", "OMISSION"),
    episode("u1", "2026-09-04", "UNCLASSIFIED", ["REFUND"]),
    episode("o4", "2026-09-05", "OMISSION", ["REFUND"], {
      resolution_marker: "SOURCE_MARKED_REVIEW_NEEDED",
    }),
  ],
});

assert.equal(memory.total_episode_evidence, 6);
assert.equal(memory.classified_action_episode_count, 3);
assert.equal(memory.unclassified_action_episode_count, 1);
assert.equal(memory.later_recurrence_observed_count, 1);
assert.equal(memory.no_later_recurrence_in_loaded_window_count, 2);
assert.equal(memory.action_effective_proven_count, 0);
assert.equal(memory.action_ineffective_proven_count, 0);
assert.equal(memory.source_concluded_is_action_effective, false);
assert.equal(memory.absence_in_loaded_window_is_resolution, false);
assert.equal(memory.later_recurrence_is_action_failure, false);
assert.equal(memory.recurrence_is_shared_root_cause, false);
assert.equal(memory.direct_attention_reasons_created, 0);
assert.equal(memory.external_effects_authorized, false);

const resend = memory.followups.find(
  (item) => item.action_episode_id === "o1",
);
assert.ok(resend);
assert.equal(resend.followup_status, "LATER_RECURRENCE_OBSERVED");
assert.equal(resend.next_recurrence_episode_id, "o3");
assert.equal(resend.next_recurrence_business_date, "2026-09-03");
assert.equal(resend.days_to_next_recurrence, 2);
assert.equal(resend.action_effectiveness_status, "UNKNOWN");
assert.equal(resend.shared_root_cause_status, "UNPROVEN");

const wrongItem = memory.followups.find(
  (item) => item.action_episode_id === "w1",
);
assert.ok(wrongItem);
assert.equal(
  wrongItem.followup_status,
  "NO_LATER_RECURRENCE_IN_LOADED_WINDOW",
);
assert.equal(wrongItem.action_effectiveness_status, "UNKNOWN");

const reviewNeeded = memory.followups.find(
  (item) => item.action_episode_id === "o4",
);
assert.ok(reviewNeeded);
assert.equal(
  reviewNeeded.followup_status,
  "NO_LATER_RECURRENCE_IN_LOADED_WINDOW",
);
assert.equal(reviewNeeded.action_effectiveness_status, "UNKNOWN");

assert.throws(
  () =>
    buildActionFollowupMemory({
      loaded_window_end: "2026-09-02",
      coverage_exhaustive: true,
      evidence: [
        episode("late", "2026-09-03", "OMISSION", ["RESEND"]),
      ],
    }),
  /action_followup_window_ends_before_evidence/,
);

console.log(JSON.stringify({
  status: "PASS",
  later_business_date_recurrence_is_observed_followup: true,
  same_day_repeat_is_not_later_followup: true,
  source_concluded_is_not_action_effective: true,
  no_recurrence_in_window_is_not_resolution: true,
  later_recurrence_is_not_action_failure: true,
  unclassified_action_is_not_promoted: true,
  attention_authority: "NONE",
  external_effect_authorized: false,
}, null, 2));
