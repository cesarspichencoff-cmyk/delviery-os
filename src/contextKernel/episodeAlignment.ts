/**
 * Descriptive alignment between temporal closing candidates and independently
 * recorded operational episodes.
 *
 * This module does NOT measure causality and does NOT create an attention
 * reason. Missing/partial episode evidence cannot be treated as evidence of
 * absence.
 */

export type EpisodeEvidenceCoverage =
  | "FULL_DAY"
  | "PARTIAL_DAY"
  | "NONE";

export interface TemporalDaySignal {
  business_date: string;
  temporal_candidate: boolean;
  candidate_count: number;
}

export interface EpisodeDayEvidence {
  business_date: string;
  coverage: EpisodeEvidenceCoverage;
  recorded_incidents: number;
  open_incidents: number;
  pause_minutes: number;
}

export type EpisodeAlignmentClass =
  | "CANDIDATE_AND_RECORDED_EPISODE"
  | "CANDIDATE_WITHOUT_RECORDED_EPISODE"
  | "RECORDED_EPISODE_WITHOUT_TEMPORAL_CANDIDATE"
  | "NEITHER_IN_FULL_DAY_EVIDENCE"
  | "EVIDENCE_INCOMPLETE_FOR_ABSENCE";

export interface EpisodeAlignmentDay {
  business_date: string;
  temporal_candidate: boolean;
  candidate_count: number;
  episode_coverage: EpisodeEvidenceCoverage;
  recorded_incidents: number;
  open_incidents: number;
  pause_minutes: number;
  recorded_episode_present: boolean;
  operational_pause_present: boolean;
  classification: EpisodeAlignmentClass;
  causal_status: "UNPROVEN";
  attention_reason_created: false;
  external_effect_authorized: false;
}

export interface EpisodeAlignmentSummary {
  total_days: number;
  full_day_evidence_days: number;
  partial_day_evidence_days: number;
  no_episode_evidence_days: number;
  temporal_candidate_days: number;
  candidate_days_with_full_day_evidence: number;
  candidate_and_recorded_episode_days: number;
  candidate_without_recorded_episode_days: number;
  recorded_episode_without_candidate_days: number;
  neither_full_day_days: number;
  incomplete_absence_days: number;
  causal_conclusions_created: 0;
  direct_attention_reasons_created: 0;
  external_effects_authorized: false;
}

export interface EpisodeAlignmentReplay {
  summary: EpisodeAlignmentSummary;
  days: EpisodeAlignmentDay[];
}

export function alignTemporalCandidatesWithEpisodes(args: {
  temporal: readonly TemporalDaySignal[];
  episodes: readonly EpisodeDayEvidence[];
}): EpisodeAlignmentReplay {
  const temporal = uniqueByDate(args.temporal, "temporal");
  const episodes = uniqueByDate(args.episodes, "episode");
  const dates = new Set([
    ...temporal.keys(),
    ...episodes.keys(),
  ]);

  const days = [...dates]
    .sort()
    .map((businessDate): EpisodeAlignmentDay => {
      const t = temporal.get(businessDate) ?? {
        business_date: businessDate,
        temporal_candidate: false,
        candidate_count: 0,
      };
      const e = episodes.get(businessDate) ?? {
        business_date: businessDate,
        coverage: "NONE" as const,
        recorded_incidents: 0,
        open_incidents: 0,
        pause_minutes: 0,
      };

      assertNonNegativeInteger(
        t.candidate_count,
        "episode_alignment_candidate_count_invalid",
      );
      assertNonNegativeInteger(
        e.recorded_incidents,
        "episode_alignment_incident_count_invalid",
      );
      assertNonNegativeInteger(
        e.open_incidents,
        "episode_alignment_open_count_invalid",
      );
      assertNonNegativeInteger(
        e.pause_minutes,
        "episode_alignment_pause_invalid",
      );
      if (e.open_incidents > e.recorded_incidents) {
        throw new Error("episode_alignment_open_exceeds_incidents");
      }

      const episodePresent = e.recorded_incidents > 0;
      const classification = classify({
        temporalCandidate: t.temporal_candidate,
        episodePresent,
        coverage: e.coverage,
      });

      return {
        business_date: businessDate,
        temporal_candidate: t.temporal_candidate,
        candidate_count: t.candidate_count,
        episode_coverage: e.coverage,
        recorded_incidents: e.recorded_incidents,
        open_incidents: e.open_incidents,
        pause_minutes: e.pause_minutes,
        recorded_episode_present: episodePresent,
        operational_pause_present: e.pause_minutes > 0,
        classification,
        causal_status: "UNPROVEN",
        attention_reason_created: false,
        external_effect_authorized: false,
      };
    });

  return {
    summary: summarize(days),
    days,
  };
}

function classify(args: {
  temporalCandidate: boolean;
  episodePresent: boolean;
  coverage: EpisodeEvidenceCoverage;
}): EpisodeAlignmentClass {
  if (args.temporalCandidate && args.episodePresent) {
    return "CANDIDATE_AND_RECORDED_EPISODE";
  }

  if (!args.temporalCandidate && args.episodePresent) {
    return "RECORDED_EPISODE_WITHOUT_TEMPORAL_CANDIDATE";
  }

  if (args.coverage !== "FULL_DAY") {
    return "EVIDENCE_INCOMPLETE_FOR_ABSENCE";
  }

  if (args.temporalCandidate) {
    return "CANDIDATE_WITHOUT_RECORDED_EPISODE";
  }

  return "NEITHER_IN_FULL_DAY_EVIDENCE";
}

function summarize(
  days: readonly EpisodeAlignmentDay[],
): EpisodeAlignmentSummary {
  return {
    total_days: days.length,
    full_day_evidence_days:
      days.filter((day) => day.episode_coverage === "FULL_DAY").length,
    partial_day_evidence_days:
      days.filter((day) => day.episode_coverage === "PARTIAL_DAY").length,
    no_episode_evidence_days:
      days.filter((day) => day.episode_coverage === "NONE").length,
    temporal_candidate_days:
      days.filter((day) => day.temporal_candidate).length,
    candidate_days_with_full_day_evidence:
      days.filter(
        (day) =>
          day.temporal_candidate &&
          day.episode_coverage === "FULL_DAY",
      ).length,
    candidate_and_recorded_episode_days:
      days.filter(
        (day) =>
          day.classification ===
          "CANDIDATE_AND_RECORDED_EPISODE",
      ).length,
    candidate_without_recorded_episode_days:
      days.filter(
        (day) =>
          day.classification ===
          "CANDIDATE_WITHOUT_RECORDED_EPISODE",
      ).length,
    recorded_episode_without_candidate_days:
      days.filter(
        (day) =>
          day.classification ===
          "RECORDED_EPISODE_WITHOUT_TEMPORAL_CANDIDATE",
      ).length,
    neither_full_day_days:
      days.filter(
        (day) =>
          day.classification ===
          "NEITHER_IN_FULL_DAY_EVIDENCE",
      ).length,
    incomplete_absence_days:
      days.filter(
        (day) =>
          day.classification ===
          "EVIDENCE_INCOMPLETE_FOR_ABSENCE",
      ).length,
    causal_conclusions_created: 0,
    direct_attention_reasons_created: 0,
    external_effects_authorized: false,
  };
}

function uniqueByDate<T extends { business_date: string }>(
  rows: readonly T[],
  source: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    assertDate(row.business_date);
    if (result.has(row.business_date)) {
      throw new Error(
        `episode_alignment_duplicate_${source}_date:${row.business_date}`,
      );
    }
    result.set(row.business_date, row);
  }
  return result;
}

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("episode_alignment_business_date_invalid");
  }
  const parsed = new Date(value + "T00:00:00.000Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("episode_alignment_business_date_invalid");
  }
}

function assertNonNegativeInteger(
  value: number,
  code: string,
): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(code);
  }
}
