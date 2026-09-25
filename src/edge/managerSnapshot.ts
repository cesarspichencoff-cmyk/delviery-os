/**
 * Gerencial Watch bridge projection.
 *
 * This is the smallest safe operational snapshot the Edge can expose upward.
 * It intentionally does not decide personal/work mode, task priority, causality
 * or whether César must be interrupted. Those remain higher-layer concerns.
 */
import { projectAttention, type AttentionCandidate } from "./attention";
import { rebuildIdentityGraph } from "./projection";
import type {
  EdgeSourceObservation,
  ObservationKind,
  ObservationSourceMode,
} from "./simulator";

export const EDGE_MANAGER_SNAPSHOT_VERSION =
  "edge-manager-snapshot@0.1.0";

export interface ManagerSourceCoverage {
  source: string;
  unit_id?: string;
  observation_count: number;
  kinds: ObservationKind[];
  first_observed_at: string;
  last_observed_at: string;
}

export interface ManagerIdentitySummary {
  proven: number;
  supported_inference: number;
  candidate: number;
  unknown: number;
}

export interface EdgeManagerSnapshot {
  snapshot_version: typeof EDGE_MANAGER_SNAPSHOT_VERSION;
  source_mode: ObservationSourceMode | "empty";
  fact_class: "FACT" | "SIMULATION" | "EMPTY";
  generated_at: string;
  latest_observed_at?: string;
  observation_count: number;
  source_coverage: ManagerSourceCoverage[];
  identity: ManagerIdentitySummary;
  attention_candidates: AttentionCandidate[];
  attention_candidate_count: number;
  /**
   * Explicitly not an interruption decision.
   * The higher Attention Governor decides delivery policy.
   */
  interruption_decision: "UNDECIDED";
}

export function projectManagerSnapshot(
  observations: readonly EdgeSourceObservation[],
  generatedAt: string,
): EdgeManagerSnapshot {
  assertIsoTimestamp(generatedAt);

  if (observations.length === 0) {
    return {
      snapshot_version: EDGE_MANAGER_SNAPSHOT_VERSION,
      source_mode: "empty",
      fact_class: "EMPTY",
      generated_at: generatedAt,
      observation_count: 0,
      source_coverage: [],
      identity: {
        proven: 0,
        supported_inference: 0,
        candidate: 0,
        unknown: 0,
      },
      attention_candidates: [],
      attention_candidate_count: 0,
      interruption_decision: "UNDECIDED",
    };
  }

  const modes = new Set(observations.map((item) => item.source_mode));
  if (modes.size !== 1) {
    throw new Error("manager_snapshot_mixed_source_modes");
  }

  const sourceMode = observations[0].source_mode;
  const graph = rebuildIdentityGraph(observations);
  const links = graph.all();
  const attention = projectAttention(observations);

  return {
    snapshot_version: EDGE_MANAGER_SNAPSHOT_VERSION,
    source_mode: sourceMode,
    fact_class: sourceMode === "live_observed" ? "FACT" : "SIMULATION",
    generated_at: generatedAt,
    latest_observed_at: latestObservedAt(observations),
    observation_count: observations.length,
    source_coverage: projectSourceCoverage(observations),
    identity: {
      proven: links.filter((link) => link.confidence === "PROVEN").length,
      supported_inference: links.filter(
        (link) => link.confidence === "SUPPORTED_INFERENCE",
      ).length,
      candidate: links.filter((link) => link.confidence === "CANDIDATE").length,
      unknown: links.filter((link) => link.confidence === "UNKNOWN").length,
    },
    attention_candidates: attention,
    attention_candidate_count: attention.length,
    interruption_decision: "UNDECIDED",
  };
}

function projectSourceCoverage(
  observations: readonly EdgeSourceObservation[],
): ManagerSourceCoverage[] {
  const groups = new Map<string, EdgeSourceObservation[]>();

  for (const observation of observations) {
    const key = [
      observation.source_ref.source,
      observation.source_ref.unit_id ?? "",
    ].join("|");
    const group = groups.get(key) ?? [];
    group.push(observation);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => {
      const ordered = [...group].sort((a, b) =>
        a.observed_at.localeCompare(b.observed_at) ||
        a.observation_id.localeCompare(b.observation_id),
      );
      const kinds = [...new Set(group.map((item) => item.kind))].sort();

      return {
        source: ordered[0].source_ref.source,
        unit_id: ordered[0].source_ref.unit_id,
        observation_count: group.length,
        kinds,
        first_observed_at: ordered[0].observed_at,
        last_observed_at: ordered[ordered.length - 1].observed_at,
      };
    })
    .sort((a, b) =>
      a.source.localeCompare(b.source) ||
      (a.unit_id ?? "").localeCompare(b.unit_id ?? ""),
    );
}

function latestObservedAt(
  observations: readonly EdgeSourceObservation[],
): string {
  return [...observations]
    .map((item) => item.observed_at)
    .sort()
    .at(-1) as string;
}

function assertIsoTimestamp(value: string): void {
  if (!value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error("invalid_manager_snapshot_generated_at");
  }
}
