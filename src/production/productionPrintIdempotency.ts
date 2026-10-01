import type { ProductionPrintEvidenceState } from "./productionPrintPlan";

export interface ProductionPrintAttemptEvidence {
  intent_fingerprint: string;
  attempt_id: string;
  state: ProductionPrintEvidenceState;
}

export interface ProductionPrintSubmissionDecision {
  schema: "deliveryos.production-print-submission-decision.v1";
  intent_fingerprint: string;
  decision:
    | "ALLOW_FIRST_SUBMISSION"
    | "ALLOW_RETRY_PROVEN_NO_EFFECT"
    | "BLOCK_RECONCILIATION_REQUIRED"
    | "BLOCK_ALREADY_PHYSICALLY_CONFIRMED";
  blocking_reasons: string[];
  automatic_retry_allowed: boolean;
  effects: {
    print: false;
    spooler_write: false;
  };
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Pure pre-effect gate for print submission.
 *
 * A deterministic fingerprint identifies one semantic production intent.
 * This function never submits, retries or prints. It only decides whether the
 * caller is still before the effect boundary.
 */
export function decideProductionPrintSubmission(
  intentFingerprint: string,
  history: readonly ProductionPrintAttemptEvidence[],
): ProductionPrintSubmissionDecision {
  const fingerprint = clean(intentFingerprint);
  if (!fingerprint) throw new Error("INTENT_FINGERPRINT_REQUIRED");

  const relevant = history.filter(
    (entry) => clean(entry.intent_fingerprint) === fingerprint,
  );

  const physicallyConfirmed = relevant.some(
    (entry) => entry.state === "PHYSICALLY_CONFIRMED",
  );
  if (physicallyConfirmed) {
    return {
      schema: "deliveryos.production-print-submission-decision.v1",
      intent_fingerprint: fingerprint,
      decision: "BLOCK_ALREADY_PHYSICALLY_CONFIRMED",
      blocking_reasons: ["SAME_INTENT_ALREADY_PHYSICALLY_CONFIRMED"],
      automatic_retry_allowed: false,
      effects: { print: false, spooler_write: false },
    };
  }

  const ambiguous = relevant.some((entry) =>
    [
      "SUBMISSION_RETURNED_UNOBSERVED",
      "SPOOLER_OBSERVED",
      "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
    ].includes(entry.state),
  );
  if (ambiguous) {
    return {
      schema: "deliveryos.production-print-submission-decision.v1",
      intent_fingerprint: fingerprint,
      decision: "BLOCK_RECONCILIATION_REQUIRED",
      blocking_reasons: ["PRIOR_EFFECT_NOT_PROVEN_ABSENT"],
      automatic_retry_allowed: false,
      effects: { print: false, spooler_write: false },
    };
  }

  const onlyProvenNoEffect =
    relevant.length > 0 &&
    relevant.every((entry) => entry.state === "PROVEN_NO_EFFECT_FAILURE");

  if (onlyProvenNoEffect) {
    return {
      schema: "deliveryos.production-print-submission-decision.v1",
      intent_fingerprint: fingerprint,
      decision: "ALLOW_RETRY_PROVEN_NO_EFFECT",
      blocking_reasons: [],
      automatic_retry_allowed: true,
      effects: { print: false, spooler_write: false },
    };
  }

  return {
    schema: "deliveryos.production-print-submission-decision.v1",
    intent_fingerprint: fingerprint,
    decision: "ALLOW_FIRST_SUBMISSION",
    blocking_reasons: [],
    automatic_retry_allowed: false,
    effects: { print: false, spooler_write: false },
  };
}
