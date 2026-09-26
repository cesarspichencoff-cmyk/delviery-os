/**
 * Action -> later evidence memory for classified operational episodes.
 *
 * This layer answers a narrow question:
 * after an episode with a recorded action, was the same classified mechanism
 * observed again on a later business date in the loaded evidence window?
 *
 * It deliberately does NOT infer:
 * - that the earlier action caused or failed to prevent the later episode;
 * - that no later recurrence means the action worked;
 * - that repeated mechanism keys share one root cause;
 * - that César must be interrupted.
 */
import {
  buildEpisodeRecurrenceMemory,
  type OperationalEpisodeEvidence,
} from "./episodeRecurrence";

export type ActionFollowupStatus =
  | "LATER_RECURRENCE_OBSERVED"
  | "NO_LATER_RECURRENCE_IN_LOADED_WINDOW";

export interface ActionFollowupRecord {
  action_episode_id: string;
  mechanism_key: string;
  action_business_date: string;
  action_kinds: string[];
  source_resolution_marker: OperationalEpisodeEvidence["resolution_marker"];
  followup_status: ActionFollowupStatus;
  next_recurrence_episode_id?: string;
  next_recurrence_business_date?: string;
  days_to_next_recurrence?: number;
  action_effectiveness_status: "UNKNOWN";
  shared_root_cause_status: "UNPROVEN";
  attention_authority: "NONE";
  external_effect_authorized: false;
}

export interface ActionFollowupMemory {
  loaded_window_end: string;
  coverage_exhaustive: boolean;
  total_episode_evidence: number;
  classified_action_episode_count: number;
  unclassified_action_episode_count: number;
  later_recurrence_observed_count: number;
  no_later_recurrence_in_loaded_window_count: number;
  action_effective_proven_count: 0;
  action_ineffective_proven_count: 0;
  source_concluded_is_action_effective: false;
  absence_in_loaded_window_is_resolution: false;
  later_recurrence_is_action_failure: false;
  recurrence_is_shared_root_cause: false;
  direct_attention_reasons_created: 0;
  external_effects_authorized: false;
  followups: ActionFollowupRecord[];
}

export function buildActionFollowupMemory(args: {
  evidence: readonly OperationalEpisodeEvidence[];
  loaded_window_end: string;
  coverage_exhaustive: boolean;
}): ActionFollowupMemory {
  assertDate(args.loaded_window_end);

  // Reuse the recurrence contract as the canonical validation boundary for
  // episode ids, dates, mechanism keys and duplicate evidence.
  buildEpisodeRecurrenceMemory(args.evidence);

  const ordered = [...args.evidence].sort(
    (a, b) =>
      a.business_date.localeCompare(b.business_date) ||
      a.episode_id.localeCompare(b.episode_id),
  );

  const latestEvidenceDate = ordered.at(-1)?.business_date;
  if (
    latestEvidenceDate !== undefined &&
    latestEvidenceDate > args.loaded_window_end
  ) {
    throw new Error("action_followup_window_ends_before_evidence");
  }

  const actionBearing = ordered.filter((item) => item.action_kinds.length > 0);
  const classifiedAction = actionBearing.filter(
    (item) => item.mechanism_key !== "UNCLASSIFIED",
  );
  const unclassifiedAction = actionBearing.filter(
    (item) => item.mechanism_key === "UNCLASSIFIED",
  );

  const followups = classifiedAction.map((item): ActionFollowupRecord => {
    const next = ordered.find(
      (candidate) =>
        candidate.mechanism_key === item.mechanism_key &&
        candidate.mechanism_key !== "UNCLASSIFIED" &&
        candidate.business_date > item.business_date,
    );

    if (next) {
      return {
        action_episode_id: item.episode_id,
        mechanism_key: item.mechanism_key,
        action_business_date: item.business_date,
        action_kinds: [...item.action_kinds],
        source_resolution_marker: item.resolution_marker,
        followup_status: "LATER_RECURRENCE_OBSERVED",
        next_recurrence_episode_id: next.episode_id,
        next_recurrence_business_date: next.business_date,
        days_to_next_recurrence: daysBetween(
          item.business_date,
          next.business_date,
        ),
        action_effectiveness_status: "UNKNOWN",
        shared_root_cause_status: "UNPROVEN",
        attention_authority: "NONE",
        external_effect_authorized: false,
      };
    }

    return {
      action_episode_id: item.episode_id,
      mechanism_key: item.mechanism_key,
      action_business_date: item.business_date,
      action_kinds: [...item.action_kinds],
      source_resolution_marker: item.resolution_marker,
      followup_status: "NO_LATER_RECURRENCE_IN_LOADED_WINDOW",
      action_effectiveness_status: "UNKNOWN",
      shared_root_cause_status: "UNPROVEN",
      attention_authority: "NONE",
      external_effect_authorized: false,
    };
  });

  return {
    loaded_window_end: args.loaded_window_end,
    coverage_exhaustive: args.coverage_exhaustive,
    total_episode_evidence: ordered.length,
    classified_action_episode_count: classifiedAction.length,
    unclassified_action_episode_count: unclassifiedAction.length,
    later_recurrence_observed_count: followups.filter(
      (item) => item.followup_status === "LATER_RECURRENCE_OBSERVED",
    ).length,
    no_later_recurrence_in_loaded_window_count: followups.filter(
      (item) =>
        item.followup_status === "NO_LATER_RECURRENCE_IN_LOADED_WINDOW",
    ).length,
    action_effective_proven_count: 0,
    action_ineffective_proven_count: 0,
    source_concluded_is_action_effective: false,
    absence_in_loaded_window_is_resolution: false,
    later_recurrence_is_action_failure: false,
    recurrence_is_shared_root_cause: false,
    direct_attention_reasons_created: 0,
    external_effects_authorized: false,
    followups,
  };
}

function daysBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(end + "T00:00:00.000Z") -
      Date.parse(start + "T00:00:00.000Z")) /
      86_400_000,
  );
}

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("action_followup_loaded_window_end_invalid");
  }
  const parsed = new Date(value + "T00:00:00.000Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("action_followup_loaded_window_end_invalid");
  }
}
