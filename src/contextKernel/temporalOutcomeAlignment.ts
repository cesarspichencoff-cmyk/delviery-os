import type {
  ClosingTemporalReplay,
  ClosingTemporalReplayStep,
} from "./temporalBaseline";

export const TEMPORAL_OUTCOME_ALIGNMENT_VERSION =
  "temporal-outcome-alignment@0.1.0";

export type OutcomeEvidenceKind =
  | "CUSTOMER_REVIEW"
  | "PULSE_OCCURRENCE_CLUSTER"
  | "CRITICAL_INCIDENT"
  | "RECURRENCE_PATTERN";

export interface ObservedOutcomeEvidence {
  business_date: string;
  evidence_kinds: OutcomeEvidenceKind[];
  source_refs: string[];
  observed_outcome: true;
}

export type OutcomeAlignmentStatus =
  | "BASELINE_MISSING"
  | "BASELINE_INSUFFICIENT"
  | "TEMPORAL_CANDIDATE_OVERLAP"
  | "TEMPORAL_SILENT_ON_OBSERVED_OUTCOME";

export interface OutcomeAlignmentRow {
  business_date: string;
  evidence_kinds: OutcomeEvidenceKind[];
  source_refs: string[];
  baseline_status: ClosingTemporalReplayStep["baseline_status"] | "MISSING";
  temporal_candidate_count: number;
  status: OutcomeAlignmentStatus;
  causal_status: "UNPROVEN";
  incident_detection_claim_authorized: false;
  attention_authority: "NONE";
}

export interface TemporalOutcomeAlignmentSummary {
  alignment_version: typeof TEMPORAL_OUTCOME_ALIGNMENT_VERSION;
  observed_outcome_dates: number;
  baseline_missing_dates: number;
  baseline_insufficient_dates: number;
  ready_outcome_dates: number;
  temporal_candidate_overlap_dates: number;
  temporal_silent_on_observed_outcome_dates: number;
  non_outcome_dates_are_unknown: true;
  false_positive_rate_authorized: false;
  incident_detection_claim_authorized: false;
  external_effects_authorized: false;
}

export interface TemporalOutcomeAlignment {
  summary: TemporalOutcomeAlignmentSummary;
  rows: OutcomeAlignmentRow[];
}

export function alignObservedOutcomesToTemporalReplay(
  replay: ClosingTemporalReplay,
  evidence: readonly ObservedOutcomeEvidence[],
): TemporalOutcomeAlignment {
  const byDate = new Map(
    replay.steps.map((step) => [step.business_date, step] as const),
  );
  const seenDates = new Set<string>();
  const rows: OutcomeAlignmentRow[] = [];

  for (const item of evidence) {
    assertObservedOutcome(item);
    if (seenDates.has(item.business_date)) {
      throw new Error("duplicate_observed_outcome_date");
    }
    seenDates.add(item.business_date);

    const step = byDate.get(item.business_date);
    rows.push(buildRow(item, step));
  }

  const readyRows = rows.filter(
    (row) =>
      row.baseline_status === "READY",
  );

  return {
    summary: {
      alignment_version: TEMPORAL_OUTCOME_ALIGNMENT_VERSION,
      observed_outcome_dates: rows.length,
      baseline_missing_dates: countStatus(rows, "BASELINE_MISSING"),
      baseline_insufficient_dates: countStatus(
        rows,
        "BASELINE_INSUFFICIENT",
      ),
      ready_outcome_dates: readyRows.length,
      temporal_candidate_overlap_dates: countStatus(
        rows,
        "TEMPORAL_CANDIDATE_OVERLAP",
      ),
      temporal_silent_on_observed_outcome_dates: countStatus(
        rows,
        "TEMPORAL_SILENT_ON_OBSERVED_OUTCOME",
      ),
      non_outcome_dates_are_unknown: true,
      false_positive_rate_authorized: false,
      incident_detection_claim_authorized: false,
      external_effects_authorized: false,
    },
    rows,
  };
}

function buildRow(
  evidence: ObservedOutcomeEvidence,
  step: ClosingTemporalReplayStep | undefined,
): OutcomeAlignmentRow {
  let status: OutcomeAlignmentStatus;
  if (!step) {
    status = "BASELINE_MISSING";
  } else if (step.baseline_status !== "READY") {
    status = "BASELINE_INSUFFICIENT";
  } else if (step.anomaly_candidates.length > 0) {
    status = "TEMPORAL_CANDIDATE_OVERLAP";
  } else {
    status = "TEMPORAL_SILENT_ON_OBSERVED_OUTCOME";
  }
  return {
    business_date: evidence.business_date,
    evidence_kinds: [...evidence.evidence_kinds],
    source_refs: [...evidence.source_refs],
    baseline_status: step?.baseline_status ?? "MISSING",
    temporal_candidate_count: step?.anomaly_candidates.length ?? 0,
    status,
    causal_status: "UNPROVEN",
    incident_detection_claim_authorized: false,
    attention_authority: "NONE",
  };
}

function countStatus(
  rows: readonly OutcomeAlignmentRow[],
  status: OutcomeAlignmentStatus,
): number {
  return rows.filter((row) => row.status === status).length;
}

function assertObservedOutcome(item: ObservedOutcomeEvidence): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.business_date)) {
    throw new Error("invalid_outcome_business_date");
  }
  const parsed = new Date(item.business_date + "T00:00:00.000Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== item.business_date
  ) {
    throw new Error("invalid_outcome_business_date");
  }
  if (item.evidence_kinds.length === 0) {
    throw new Error("outcome_evidence_kind_required");
  }
  if (
    item.source_refs.length === 0 ||
    item.source_refs.some((ref) => !ref.trim())
  ) {
    throw new Error("outcome_source_ref_required");
  }
  if (item.observed_outcome !== true) {
    throw new Error("only_observed_outcomes_supported");
  }
}
