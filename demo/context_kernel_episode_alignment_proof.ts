import { strict as assert } from "node:assert";
import {
  alignTemporalCandidatesWithEpisodes,
  type EpisodeDayEvidence,
  type TemporalDaySignal,
} from "../src/contextKernel/episodeAlignment";

const temporal: TemporalDaySignal[] = [
  { business_date: "2026-09-01", temporal_candidate: true, candidate_count: 3 },
  { business_date: "2026-09-02", temporal_candidate: true, candidate_count: 1 },
  { business_date: "2026-09-03", temporal_candidate: false, candidate_count: 0 },
  { business_date: "2026-09-04", temporal_candidate: false, candidate_count: 0 },
  { business_date: "2026-09-05", temporal_candidate: true, candidate_count: 2 },
];

const episodes: EpisodeDayEvidence[] = [
  {
    business_date: "2026-09-01",
    coverage: "FULL_DAY",
    recorded_incidents: 2,
    open_incidents: 0,
    pause_minutes: 0,
  },
  {
    business_date: "2026-09-02",
    coverage: "FULL_DAY",
    recorded_incidents: 0,
    open_incidents: 0,
    pause_minutes: 15,
  },
  {
    business_date: "2026-09-03",
    coverage: "FULL_DAY",
    recorded_incidents: 4,
    open_incidents: 1,
    pause_minutes: 0,
  },
  {
    business_date: "2026-09-04",
    coverage: "FULL_DAY",
    recorded_incidents: 0,
    open_incidents: 0,
    pause_minutes: 0,
  },
  {
    business_date: "2026-09-05",
    coverage: "PARTIAL_DAY",
    recorded_incidents: 0,
    open_incidents: 0,
    pause_minutes: 0,
  },
];

const replay = alignTemporalCandidatesWithEpisodes({
  temporal,
  episodes,
});

assert.equal(replay.summary.total_days, 5);
assert.equal(replay.summary.full_day_evidence_days, 4);
assert.equal(replay.summary.partial_day_evidence_days, 1);
assert.equal(replay.summary.temporal_candidate_days, 3);
assert.equal(replay.summary.candidate_days_with_full_day_evidence, 2);
assert.equal(replay.summary.candidate_and_recorded_episode_days, 1);
assert.equal(replay.summary.candidate_without_recorded_episode_days, 1);
assert.equal(replay.summary.recorded_episode_without_candidate_days, 1);
assert.equal(replay.summary.neither_full_day_days, 1);
assert.equal(replay.summary.incomplete_absence_days, 1);
assert.equal(replay.summary.causal_conclusions_created, 0);
assert.equal(replay.summary.direct_attention_reasons_created, 0);
assert.equal(replay.summary.external_effects_authorized, false);

const byDate = new Map(
  replay.days.map((day) => [day.business_date, day]),
);

assert.equal(
  byDate.get("2026-09-01")?.classification,
  "CANDIDATE_AND_RECORDED_EPISODE",
);
assert.equal(
  byDate.get("2026-09-02")?.classification,
  "CANDIDATE_WITHOUT_RECORDED_EPISODE",
);
assert.equal(
  byDate.get("2026-09-02")?.operational_pause_present,
  true,
);
assert.equal(
  byDate.get("2026-09-03")?.classification,
  "RECORDED_EPISODE_WITHOUT_TEMPORAL_CANDIDATE",
);
assert.equal(
  byDate.get("2026-09-04")?.classification,
  "NEITHER_IN_FULL_DAY_EVIDENCE",
);
assert.equal(
  byDate.get("2026-09-05")?.classification,
  "EVIDENCE_INCOMPLETE_FOR_ABSENCE",
);

for (const day of replay.days) {
  assert.equal(day.causal_status, "UNPROVEN");
  assert.equal(day.attention_reason_created, false);
  assert.equal(day.external_effect_authorized, false);
}

assert.throws(
  () =>
    alignTemporalCandidatesWithEpisodes({
      temporal: [
        { business_date: "2026-02-31", temporal_candidate: true, candidate_count: 1 },
      ],
      episodes: [],
    }),
  /episode_alignment_business_date_invalid/,
);

assert.throws(
  () =>
    alignTemporalCandidatesWithEpisodes({
      temporal: [
        { business_date: "2026-09-01", temporal_candidate: true, candidate_count: 1 },
        { business_date: "2026-09-01", temporal_candidate: false, candidate_count: 0 },
      ],
      episodes: [],
    }),
  /episode_alignment_duplicate_temporal_date/,
);

console.log(JSON.stringify({
  status: "PASS",
  positive_episode_evidence_is_usable_with_partial_coverage: true,
  absence_requires_full_day_evidence: true,
  pause_is_not_silently_promoted_to_episode: true,
  temporal_candidate_is_not_causal_claim: true,
  temporal_candidate_does_not_create_attention_reason: true,
  external_effect_authorized: false,
}, null, 2));
