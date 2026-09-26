import { readFileSync } from "node:fs";
import {
  adaptCaixaPulseOccurrences,
  type CaixaPulseOccurrenceRow,
} from "../src/contextKernel/caixaPulseEpisodeAdapter";
import { buildEpisodeRecurrenceMemory } from
  "../src/contextKernel/episodeRecurrence";
import { buildActionFollowupMemory } from
  "../src/contextKernel/actionFollowup";
import { buildExpectedBarrierAssessments } from
  "../src/contextKernel/expectedBarrier";
import { buildBarrierEvidenceDebtPlan } from
  "../src/contextKernel/barrierEvidenceDebt";
import { buildBarrierCapturePlan } from
  "../src/contextKernel/barrierCaptureContract";

type SourceRow = Record<string, unknown>;

function sourceRows(parsed: unknown): SourceRow[] {
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error("wrangler_json_shape_invalid");
  }
  const first = parsed[0] as Record<string, unknown>;
  if (!Array.isArray(first.results)) {
    throw new Error("wrangler_json_results_missing");
  }
  return first.results as SourceRow[];
}

function mapRow(row: SourceRow): CaixaPulseOccurrenceRow {
  return {
    business_date: String(row.business_date ?? ""),
    shift: String(row.shift ?? ""),
    mailbox_key: String(row.mailbox_key ?? ""),
    occurrence_index: Number(row.occurrence_index),
    domain: String(row.domain ?? ""),
    category: String(row.category ?? ""),
    status: String(row.status ?? ""),
    happened_text: String(row.happened_text ?? ""),
    action_text: String(row.action_text ?? ""),
  };
}

function distribution(values: readonly number[]) {
  if (values.length === 0) {
    return { count: 0, min: null, median: null, max: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  return {
    count: sorted.length,
    min: sorted[0],
    median,
    max: sorted[sorted.length - 1],
  };
}

const inputPath = process.argv[2];
if (!inputPath) throw new Error("caixa_pulse_export_path_required");

const raw = readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const rows = sourceRows(JSON.parse(raw)).map(mapRow);
const adaptation = adaptCaixaPulseOccurrences(rows);
const recurrence = buildEpisodeRecurrenceMemory(adaptation.evidence);
const businessDates = [...new Set(rows.map((row) => row.business_date))].sort();
const loadedWindowEnd = businessDates.at(-1);
if (!loadedWindowEnd) throw new Error("caixa_pulse_empty_export");

const followup = buildActionFollowupMemory({
  evidence: adaptation.evidence,
  loaded_window_end: loadedWindowEnd,
  coverage_exhaustive: false,
});
const expectedBarriers = buildExpectedBarrierAssessments(adaptation.evidence);
const barrierEvidenceDebt = buildBarrierEvidenceDebtPlan({
  assessments: expectedBarriers,
});
const historicalCapturePlans = adaptation.evidence.map((episode) =>
  buildBarrierCapturePlan(
    episode.mechanism_key === "OMISSION"
      ? "ITEM_MISSING"
      : episode.mechanism_key === "WRONG_ITEM"
        ? "WRONG_ITEM"
        : "OTHER",
  ),
);
const historicalMatrixEpisodes = historicalCapturePlans.filter(
  (plan) => plan.show_matrix,
).length;
const historicalMatrixSelections = historicalCapturePlans.reduce(
  (sum, plan) => sum + plan.prompts.length,
  0,
);
const historicalSubtypeSelections = adaptation.evidence.length;
const historicalTotalSelections =
  historicalSubtypeSelections + historicalMatrixSelections;

const recurrenceDays = followup.followups
  .filter(
    (item) =>
      item.followup_status === "LATER_RECURRENCE_OBSERVED" &&
      item.days_to_next_recurrence !== undefined,
  )
  .map((item) => item.days_to_next_recurrence as number);

const actionKinds = new Map<string, number>();
for (const item of adaptation.evidence) {
  for (const action of item.action_kinds) {
    actionKinds.set(action, (actionKinds.get(action) ?? 0) + 1);
  }
}

const mechanisms = recurrence.mechanisms.map((item) => ({
  mechanism_key: item.mechanism_key,
  episode_count: item.episode_count,
  distinct_business_dates: item.distinct_business_dates,
  recurrence_observed: item.recurrence_observed,
  source_marked_concluded_count: item.source_marked_concluded_count,
  source_marked_review_needed_count: item.source_marked_review_needed_count,
  observed_outcome_count: item.observed_outcome_count,
}));

const followupByMechanism = mechanisms.map((mechanism) => {
  const items = followup.followups.filter(
    (item) => item.mechanism_key === mechanism.mechanism_key,
  );
  const recurred = items.filter(
    (item) => item.followup_status === "LATER_RECURRENCE_OBSERVED",
  );
  const days = recurred
    .map((item) => item.days_to_next_recurrence)
    .filter((value): value is number => value !== undefined);
  return {
    mechanism_key: mechanism.mechanism_key,
    action_episode_count: items.length,
    later_recurrence_observed_count: recurred.length,
    no_later_recurrence_in_loaded_window_count:
      items.length - recurred.length,
    days_to_next_recurrence: distribution(days),
  };
});

const barrierUse = new Map<string, number>();
for (const assessment of expectedBarriers.assessments) {
  for (const barrierId of assessment.barrier_ids) {
    barrierUse.set(barrierId, (barrierUse.get(barrierId) ?? 0) + 1);
  }
}
const mappedBarrierByMechanism = mechanisms.map((mechanism) => ({
  mechanism_key: mechanism.mechanism_key,
  mapped_episode_count: expectedBarriers.assessments.filter(
    (item) =>
      item.mechanism_key === mechanism.mechanism_key &&
      item.knowledge_status === "MAPPED_EXPECTED_BARRIERS",
  ).length,
}));

console.log(JSON.stringify({
  status: "PASS",
  source: "D1:cesar-gerencial-mail-bridge.caixa_pulse_* canonical rows",
  source_scope: {
    canonical_occurrence_rows: rows.length,
    distinct_business_dates: businessDates.length,
    first_business_date: businessDates[0],
    last_business_date: loadedWindowEnd,
    coverage_exhaustive: false,
  },
  adaptation: {
    classified_count: adaptation.classified_count,
    unclassified_count: adaptation.unclassified_count,
    ambiguous_multi_signal_count: adaptation.ambiguous_multi_signal_count,
    mechanism_basis: adaptation.mechanism_basis,
    causal_status: adaptation.causal_status,
  },
  actions: {
    inferred_action_kind_counts: Object.fromEntries(
      [...actionKinds.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    ),
    action_effectiveness_claim_authorized: false,
  },
  recurrence: {
    recurrence_mechanism_count: recurrence.recurrence_mechanism_count,
    mechanisms,
    shared_root_cause_status: "UNPROVEN",
  },
  expected_barriers: {
    academia_snapshot: expectedBarriers.academia_snapshot,
    mapped_episode_count: expectedBarriers.mapped_episode_count,
    unmapped_episode_count: expectedBarriers.unmapped_episode_count,
    execution_unknown_count: expectedBarriers.execution_unknown_count,
    mapped_by_mechanism: mappedBarrierByMechanism,
    barrier_use_counts: Object.fromEntries(
      [...barrierUse.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    ),
    barrier_failure_proven_count:
      expectedBarriers.barrier_failure_proven_count,
    barrier_compliance_proven_count:
      expectedBarriers.barrier_compliance_proven_count,
  },
  barrier_capture_shadow: {
    basis: "RULE_INFERRED_HISTORICAL_ESTIMATE",
    live_form_modified: false,
    existing_type_taxonomy_preserved: true,
    subtype_selections_if_one_per_occurrence:
      historicalSubtypeSelections,
    matrix_triggered_episode_count: historicalMatrixEpisodes,
    matrix_row_selections: historicalMatrixSelections,
    total_incremental_selections: historicalTotalSelections,
    average_incremental_selections_per_occurrence:
      historicalTotalSelections / adaptation.evidence.length,
    capture_evidence_basis: "OPERATOR_SELF_REPORT",
    independent_execution_proof_claimed: false,
    external_effects_authorized: false,
  },
  barrier_evidence_debt: {
    debt_count: barrierEvidenceDebt.debt_count,
    unique_capture_requirement_count:
      barrierEvidenceDebt.unique_capture_requirement_count,
    route_counts: barrierEvidenceDebt.route_counts,
    cesar_route_count: barrierEvidenceDebt.cesar_route_count,
    barrier_failure_proven_count:
      barrierEvidenceDebt.barrier_failure_proven_count,
    barrier_compliance_proven_count:
      barrierEvidenceDebt.barrier_compliance_proven_count,
    direct_attention_reasons_created:
      barrierEvidenceDebt.direct_attention_reasons_created,
    external_effects_authorized:
      barrierEvidenceDebt.external_effects_authorized,
  },
  action_followup: {
    classified_action_episode_count:
      followup.classified_action_episode_count,
    unclassified_action_episode_count:
      followup.unclassified_action_episode_count,
    later_recurrence_observed_count:
      followup.later_recurrence_observed_count,
    no_later_recurrence_in_loaded_window_count:
      followup.no_later_recurrence_in_loaded_window_count,
    days_to_next_recurrence: distribution(recurrenceDays),
    by_mechanism: followupByMechanism,
    action_effective_proven_count: followup.action_effective_proven_count,
    action_ineffective_proven_count:
      followup.action_ineffective_proven_count,
    source_concluded_is_action_effective:
      followup.source_concluded_is_action_effective,
    absence_in_loaded_window_is_resolution:
      followup.absence_in_loaded_window_is_resolution,
    later_recurrence_is_action_failure:
      followup.later_recurrence_is_action_failure,
  },
  boundaries: {
    direct_attention_reasons_created:
      followup.direct_attention_reasons_created,
    attention_authority: "NONE",
    external_effects_authorized: followup.external_effects_authorized,
  },
}, null, 2));
