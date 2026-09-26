/**
 * Cross-day recurrence memory for operational episode categories.
 *
 * COMPATIBILITY HARNESS ONLY:
 * - receives already-classified episode evidence;
 * - does not infer a mechanism from free text;
 * - recurrence of a category does not prove a shared root cause;
 * - source "concluded" status does not prove the action solved the problem;
 * - creates no attention authority and no external effect.
 */

export type EpisodeMechanismBasis =
  | "SOURCE_DECLARED"
  | "RULE_INFERRED"
  | "HUMAN_CONFIRMED";

export type EpisodeResolutionMarker =
  | "SOURCE_MARKED_CONCLUDED"
  | "SOURCE_MARKED_REVIEW_NEEDED"
  | "SOURCE_STATUS_OTHER";

export interface OperationalEpisodeEvidence {
  episode_id: string;
  business_date: string;
  source_ref: string;
  mechanism_key: string;
  mechanism_basis: EpisodeMechanismBasis;
  resolution_marker: EpisodeResolutionMarker;
  action_kinds: string[];
  outcome_observed: boolean;
}

export interface MechanismRecurrence {
  mechanism_key: string;
  episode_count: number;
  distinct_business_dates: number;
  first_business_date: string;
  last_business_date: string;
  source_marked_concluded_count: number;
  source_marked_review_needed_count: number;
  observed_outcome_count: number;
  recurrence_observed: boolean;
  shared_root_cause_status: "UNPROVEN";
  attention_authority: "NONE";
  external_effect_authorized: false;
}

export interface EpisodeRecurrenceMemory {
  total_episode_evidence: number;
  classified_episode_evidence: number;
  unclassified_episode_evidence: number;
  recurrence_mechanism_count: number;
  mechanisms: MechanismRecurrence[];
  source_concluded_is_observed_outcome: false;
  recurrence_is_shared_root_cause: false;
  direct_attention_reasons_created: 0;
  external_effects_authorized: false;
}

const SAFE_MECHANISM = /^[A-Z][A-Z0-9_]{0,79}$/;

export function buildEpisodeRecurrenceMemory(
  evidence: readonly OperationalEpisodeEvidence[],
): EpisodeRecurrenceMemory {
  const seen = new Set<string>();
  const classified: OperationalEpisodeEvidence[] = [];
  let unclassified = 0;

  for (const item of evidence) {
    validateEpisode(item);
    if (seen.has(item.episode_id)) {
      throw new Error("episode_recurrence_duplicate_episode_id");
    }
    seen.add(item.episode_id);

    if (item.mechanism_key === "UNCLASSIFIED") {
      unclassified += 1;
      continue;
    }
    classified.push(item);
  }

  const grouped = new Map<string, OperationalEpisodeEvidence[]>();
  for (const item of classified) {
    const bucket = grouped.get(item.mechanism_key) ?? [];
    bucket.push(item);
    grouped.set(item.mechanism_key, bucket);
  }

  const mechanisms = [...grouped.entries()]
    .map(([mechanismKey, items]): MechanismRecurrence => {
      const dates = [...new Set(items.map((item) => item.business_date))]
        .sort();

      return {
        mechanism_key: mechanismKey,
        episode_count: items.length,
        distinct_business_dates: dates.length,
        first_business_date: dates[0],
        last_business_date: dates[dates.length - 1],
        source_marked_concluded_count: items.filter(
          (item) =>
            item.resolution_marker === "SOURCE_MARKED_CONCLUDED",
        ).length,
        source_marked_review_needed_count: items.filter(
          (item) =>
            item.resolution_marker === "SOURCE_MARKED_REVIEW_NEEDED",
        ).length,
        observed_outcome_count: items.filter(
          (item) => item.outcome_observed,
        ).length,
        recurrence_observed: dates.length >= 2,
        shared_root_cause_status: "UNPROVEN",
        attention_authority: "NONE",
        external_effect_authorized: false,
      };
    })
    .sort(
      (a, b) =>
        b.episode_count - a.episode_count ||
        a.mechanism_key.localeCompare(b.mechanism_key),
    );

  return {
    total_episode_evidence: evidence.length,
    classified_episode_evidence: classified.length,
    unclassified_episode_evidence: unclassified,
    recurrence_mechanism_count:
      mechanisms.filter((item) => item.recurrence_observed).length,
    mechanisms,
    source_concluded_is_observed_outcome: false,
    recurrence_is_shared_root_cause: false,
    direct_attention_reasons_created: 0,
    external_effects_authorized: false,
  };
}

function validateEpisode(
  item: OperationalEpisodeEvidence,
): void {
  if (!item.episode_id.trim()) {
    throw new Error("episode_recurrence_episode_id_required");
  }
  assertDate(item.business_date);
  if (!item.source_ref.trim()) {
    throw new Error("episode_recurrence_source_ref_required");
  }
  if (!SAFE_MECHANISM.test(item.mechanism_key)) {
    throw new Error("episode_recurrence_mechanism_key_invalid");
  }
  if (
    item.action_kinds.some(
      (action) => !action.trim(),
    )
  ) {
    throw new Error("episode_recurrence_action_kind_invalid");
  }
}

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("episode_recurrence_business_date_invalid");
  }
  const parsed = new Date(value + "T00:00:00.000Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("episode_recurrence_business_date_invalid");
  }
}
