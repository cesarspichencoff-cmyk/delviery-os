/**
 * Edge -> Gerencial Watch handoff contract.
 *
 * IMPORTANT:
 * - This is NOT the Gerencial Watch / César Context Kernel implementation.
 * - The canonical higher-layer runtime exists separately.
 * - This module only exports a minimized, versioned operational envelope.
 * - It performs no HTTP call, D1 write, notification or other external effect.
 */
import type { EdgeManagerSnapshot } from "./managerSnapshot";

export const GERENCIAL_WATCH_EDGE_HANDOFF_VERSION =
  "edge-watch-handoff@0.1.0";

export interface EdgeWatchSourceCoverage {
  source: string;
  unit_id?: string;
  observation_count: number;
  first_observed_at: string;
  last_observed_at: string;
}

export interface EdgeWatchHardException {
  attention_id: string;
  kind:
    | "IFOOD_AUTH_HUMAN_REQUIRED"
    | "PRINT_SOFTWARE_ERROR"
    | "SOURCE_ADAPTER_FAILED";
  unit_id?: string;
  observed_at: string;
  reason_code: string;
}

export interface EdgeWatchHandoffEnvelope {
  contract_version: typeof GERENCIAL_WATCH_EDGE_HANDOFF_VERSION;
  source_system: "TATA_EDGE";
  source_mode: "synthetic" | "live_observed" | "empty";
  fact_class: "FACT" | "SIMULATION" | "EMPTY";
  generated_at: string;
  source_watermark_at?: string;
  observation_count: number;
  source_coverage: EdgeWatchSourceCoverage[];
  identity_counts: {
    proven: number;
    supported_inference: number;
    candidate: number;
    unknown: number;
  };
  hard_exceptions: EdgeWatchHardException[];
  /**
   * Edge has no authority to claim global source coverage for Gerencial Watch.
   * The higher runtime must evaluate its own critical-source freshness.
   */
  global_coverage_claim: "NOT_PROVIDED";
  external_effect_authorized: false;
}

export function managerSnapshotToWatchHandoff(
  snapshot: EdgeManagerSnapshot,
): EdgeWatchHandoffEnvelope {
  return {
    contract_version: GERENCIAL_WATCH_EDGE_HANDOFF_VERSION,
    source_system: "TATA_EDGE",
    source_mode: snapshot.source_mode,
    fact_class: snapshot.fact_class,
    generated_at: snapshot.generated_at,
    source_watermark_at: snapshot.latest_observed_at,
    observation_count: snapshot.observation_count,
    source_coverage: snapshot.source_coverage.map((coverage) => ({
      source: coverage.source,
      unit_id: coverage.unit_id,
      observation_count: coverage.observation_count,
      first_observed_at: coverage.first_observed_at,
      last_observed_at: coverage.last_observed_at,
    })),
    identity_counts: { ...snapshot.identity },
    hard_exceptions: snapshot.attention_candidates.map((candidate) => ({
      attention_id: candidate.attention_id,
      kind: candidate.kind,
      unit_id: candidate.unit_id,
      observed_at: candidate.observed_at,
      reason_code: candidate.reason_code,
    })),
    global_coverage_claim: "NOT_PROVIDED",
    external_effect_authorized: false,
  };
}
