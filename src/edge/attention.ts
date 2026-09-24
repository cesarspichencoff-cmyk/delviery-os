/**
 * Edge attention projection.
 *
 * The Edge does not decide what should interrupt César.
 * It emits only explicit hard-exception candidates from observed states.
 * Delivery remains SHOW until the higher Attention Governor proves a stronger
 * policy through replay/pilot evidence.
 */
import type { EdgeSourceObservation } from "./simulator";
import type { AdapterCycleResult } from "./runtime/supervisor";

export type AttentionExceptionKind =
  | "IFOOD_AUTH_HUMAN_REQUIRED"
  | "PRINT_SOFTWARE_ERROR"
  | "SOURCE_ADAPTER_FAILED";

export interface AttentionCandidate {
  attention_id: string;
  kind: AttentionExceptionKind;
  attention_class: "HARD_EXCEPTION";
  delivery_hint: "SHOW";
  fact_class: "FACT";
  source: string;
  source_id: string;
  unit_id?: string;
  observed_at: string;
  reason_code: string;
}

const SAFE_COMPONENT = /^[A-Za-z0-9._:-]{1,160}$/;

export function projectObservationAttention(
  observation: EdgeSourceObservation,
): AttentionCandidate | null {
  if (
    observation.kind === "auth_state" &&
    (observation.payload.health === "HUMAN_REQUIRED" ||
      observation.payload.state === "AUTH_HUMAN_REQUIRED")
  ) {
    return buildCandidate(
      "IFOOD_AUTH_HUMAN_REQUIRED",
      observation,
      "explicit_auth_human_required",
    );
  }

  if (
    observation.kind === "print_job" &&
    observation.payload.state === "ERROR"
  ) {
    return buildCandidate(
      "PRINT_SOFTWARE_ERROR",
      observation,
      "explicit_print_error",
    );
  }

  return null;
}

export function projectAdapterFailureAttention(args: {
  result: AdapterCycleResult;
  observed_at: string;
  unit_id?: string;
}): AttentionCandidate | null {
  if (args.result.status !== "failed") return null;

  const adapterId = safeComponent(args.result.adapter_id, "redacted-adapter");
  return {
    attention_id: [
      "attention",
      "SOURCE_ADAPTER_FAILED",
      adapterId,
      args.observed_at,
    ].join(":"),
    kind: "SOURCE_ADAPTER_FAILED",
    attention_class: "HARD_EXCEPTION",
    delivery_hint: "SHOW",
    fact_class: "FACT",
    source: "edge_adapter",
    source_id: adapterId,
    unit_id: safeOptional(args.unit_id),
    observed_at: args.observed_at,
    reason_code: "adapter_failed",
  };
}

export function projectAttention(
  observations: readonly EdgeSourceObservation[],
): AttentionCandidate[] {
  return observations
    .map(projectObservationAttention)
    .filter((item): item is AttentionCandidate => item !== null)
    .sort((a, b) =>
      a.observed_at.localeCompare(b.observed_at) ||
      a.attention_id.localeCompare(b.attention_id),
    );
}

function buildCandidate(
  kind: AttentionExceptionKind,
  observation: EdgeSourceObservation,
  reasonCode: string,
): AttentionCandidate {
  return {
    attention_id: [
      "attention",
      kind,
      safeComponent(observation.source_ref.source, "redacted-source"),
      safeComponent(observation.source_ref.id, "redacted-id"),
      observation.observed_at,
    ].join(":"),
    kind,
    attention_class: "HARD_EXCEPTION",
    delivery_hint: "SHOW",
    fact_class: "FACT",
    source: safeComponent(observation.source_ref.source, "redacted-source"),
    source_id: safeComponent(observation.source_ref.id, "redacted-id"),
    unit_id: safeOptional(observation.source_ref.unit_id),
    observed_at: observation.observed_at,
    reason_code: reasonCode,
  };
}

function safeOptional(value?: string): string | undefined {
  if (value === undefined) return undefined;
  return safeComponent(value, "redacted-unit");
}

function safeComponent(value: string, fallback: string): string {
  return SAFE_COMPONENT.test(value) ? value : fallback;
}
