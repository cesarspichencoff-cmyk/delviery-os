import { strict as assert } from "node:assert";
import { buildActionFollowupMemory } from "../src/contextKernel/actionFollowup";
import { buildAttentionDeliveryPlan } from "../src/contextKernel/attentionPolicy";
import { adaptCaixaPulseOccurrences } from "../src/contextKernel/caixaPulseEpisodeAdapter";
import { buildEpisodeRecurrenceMemory } from "../src/contextKernel/episodeRecurrence";
import { buildContextKernelSnapshot } from "../src/contextKernel/kernel";

const adapted = adaptCaixaPulseOccurrences([
  {
    business_date: "2026-09-29",
    shift: "NOITE",
    mailbox_key: "999999:1",
    occurrence_index: 0,
    domain: "DELIVERY",
    category: "Problema no Delivery",
    status: "Necessário Revisão",
    happened_text: "Carlos não mandou o hot",
    action_text: "reembolso",
  },
]);

assert.equal(adapted.classified_count, 1);
assert.equal(adapted.unclassified_count, 0);
assert.equal(adapted.attention_authority, "NONE");
assert.equal(adapted.external_effect_authorized, false);

const recurrence = buildEpisodeRecurrenceMemory(adapted.evidence);
assert.equal(recurrence.direct_attention_reasons_created, 0);
assert.equal(recurrence.external_effects_authorized, false);

const omission = recurrence.mechanisms.find(
  (item) => item.mechanism_key === "OMISSION",
);
assert.ok(omission);
assert.equal(omission.source_marked_review_needed_count, 1);
assert.equal(omission.attention_authority, "NONE");

const followup = buildActionFollowupMemory({
  evidence: adapted.evidence,
  loaded_window_end: "2026-09-29",
  coverage_exhaustive: false,
});
assert.equal(followup.direct_attention_reasons_created, 0);
assert.equal(followup.action_effective_proven_count, 0);
assert.equal(followup.action_ineffective_proven_count, 0);
assert.equal(followup.no_post_action_window_count, 1);
assert.equal(followup.external_effects_authorized, false);

// Review-needed status alone creates no Evidence Debt and no César route.
// A future explicit evidence debt must be justified independently.
const kernel = buildContextKernelSnapshot({
  now: "2026-09-29T23:00:00.000Z",
  signals: [
    {
      signal_id: "work-review-guard",
      source: "caixa-pulse",
      domain: "WORK",
      kind: "work_activity",
      observed_at: "2026-09-29T22:59:00.000Z",
      active: true,
    },
  ],
  commitment_events: [],
  evidence_debt: [],
});

assert.equal(kernel.mode.mode, "TRABALHO");
assert.equal(kernel.investigations.length, 0);
assert.equal(kernel.needs_me.state, "NO_KNOWN_NEED");
assert.deepEqual(kernel.needs_me.reasons, []);
assert.equal(kernel.needs_me.global_clearance_claimed, false);

const attention = buildAttentionDeliveryPlan({
  needs_me: kernel.needs_me,
  policy: [],
});
assert.equal(attention.needs_me_state, "NO_KNOWN_NEED");
assert.deepEqual(attention.reason_decisions, []);
assert.equal(attention.fully_configured, true);
assert.equal(attention.effect_authorized, false);

console.log(JSON.stringify({
  status: "PASS",
  source_marked_review_needed_is_not_cesar_need: true,
  review_needed_does_not_create_evidence_debt: true,
  review_needed_does_not_create_attention_reason: true,
  action_effectiveness_stays_unknown: true,
  attention_authority: "NONE",
  external_effect_authorized: false,
}, null, 2));
