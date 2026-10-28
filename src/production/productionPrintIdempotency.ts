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

  // Real-world journals can contain incomplete rows or an unknown state
  // after a schema change. Never equate those records with no prior attempt.
  // Do not trust runtime data merely because TypeScript describes a union.
  const knownStates = new Set<ProductionPrintEvidenceState>([
    "PLANNED",
    "PROVEN_NO_EFFECT_FAILURE",
    "SUBMISSION_RETURNED_UNOBSERVED",
    "SPOOLER_OBSERVED",
    "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
    "PHYSICALLY_CONFIRMED",
  ]);
  const invalidHistory = !Array.isArray(history) || history.some(
    (entry) => !entry || typeof entry !== "object" ||
      typeof entry.intent_fingerprint !== "string" ||
      !clean(entry.intent_fingerprint) ||
      typeof entry.attempt_id !== "string" || !clean(entry.attempt_id) ||
      !knownStates.has(entry.state),
  );
  if (invalidHistory) {
    return {
      schema: "deliveryos.production-print-submission-decision.v1",
      intent_fingerprint: fingerprint,
      decision: "BLOCK_RECONCILIATION_REQUIRED",
      blocking_reasons: ["ATTEMPT_HISTORY_INTEGRITY_UNPROVEN"],
      automatic_retry_allowed: false,
      effects: { print: false, spooler_write: false },
    };
  }

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


/** Cross-revision, SAME native order+station print-effect review.
 * Never convert a self-reported complete journal to physical authority.
 * A revised semantic fingerprint cannot erase an older print attempt.
 */
export interface NativeOrderPrintAttemptV1 extends ProductionPrintAttemptEvidence {
  order_key: string; // CDFILIAL|CDLOJA|NRVENDAREST|NRCOMANDA
  station_code: string; // native station identity, not meal shift
  operational_date: string; // Reader DTHRABERMESA day, no timezone inference.
  native_snapshot_sha256: string;
}
export interface OrderRevisionPrintReviewInputV1 {
  order_key: string;
  station_code: string;
  operational_date: string;
  native_snapshot_sha256: string;
  intent_fingerprint: string;
  history: readonly NativeOrderPrintAttemptV1[];
  history_complete_for_order_station: boolean;
  history_source_ref: string;
  current_native_revision_verified_latest: boolean;
  cancellation_revision_reconciled: boolean;
}
export interface OrderRevisionPrintReviewV1 {
  schema: "deliveryos.order-revision-print-review.v1";
  verdict: "HOLD" | "REVIEW_CANDIDATE_NO_PRINT_AUTHORITY";
  reasons: string[];
  ready_for_operational_print: false;
  automatic_retry_allowed: false;
  effects: { print: false; spooler_write: false; sequence_write: false };
}
const SHA256 = /^[a-fA-F0-9]{64}$/;
const NATIVE_TOKEN = /^[A-Z0-9_-]{1,48}$/;
const KNOWN_ATTEMPT_STATES = new Set<ProductionPrintEvidenceState>([
  "PLANNED", "PROVEN_NO_EFFECT_FAILURE",
  "SUBMISSION_RETURNED_UNOBSERVED", "SPOOLER_OBSERVED",
  "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION", "PHYSICALLY_CONFIRMED",
]);
const validOrderKey = (value: unknown): value is string =>
  typeof value === "string" && value.split("|").length === 4 &&
  value.split("|").every(part => NATIVE_TOKEN.test(part));
const validDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const instant = new Date(value + "T00:00:00Z");
  return !Number.isNaN(instant.valueOf()) &&
    instant.toISOString().slice(0, 10) === value;
};
const validStation = (value: unknown): value is string =>
  typeof value === "string" && NATIVE_TOKEN.test(value);
const validHash = (value: unknown): value is string =>
  typeof value === "string" && SHA256.test(value);
const validAttempt = (value: unknown): value is string =>
  typeof value === "string" &&
  (/^[A-Za-z0-9_-]{1,128}$/.test(value) ||
    /^attempt:[a-z0-9._-]{8,96}$/.test(value));

export function decideProductionOrderRevisionReviewV1(
  input: OrderRevisionPrintReviewInputV1,
): OrderRevisionPrintReviewV1 {
  const result = (reason: string | null): OrderRevisionPrintReviewV1 => ({
    schema: "deliveryos.order-revision-print-review.v1",
    verdict: reason ? "HOLD" : "REVIEW_CANDIDATE_NO_PRINT_AUTHORITY",
    reasons: reason ? [reason] : ["HISTORY_CLAIM_IS_NOT_INDEPENDENT_ATTESTATION"],
    ready_for_operational_print: false,
    automatic_retry_allowed: false,
    effects: { print: false, spooler_write: false, sequence_write: false },
  });
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      !validOrderKey(input.order_key) || !validStation(input.station_code) ||
      !validDate(input.operational_date) ||
      !validHash(input.native_snapshot_sha256) ||
      !validHash(input.intent_fingerprint))
    return result("ORDER_STATION_OR_NATIVE_REVISION_IDENTITY_INVALID");
  if (input.history_complete_for_order_station !== true ||
      typeof input.history_source_ref !== "string" ||
      !/^[A-Za-z0-9:._/-]{8,256}$/.test(input.history_source_ref))
    return result("ORDER_STATION_HISTORY_COMPLETENESS_UNATTESTED");
  // Source state 3/P/X has no known release or cancellation semantics here.
  // Until the latest revision and cancellation history are reconciled,
  // even a supposedly complete attempt journal is not a review candidate.
  if (input.current_native_revision_verified_latest !== true ||
      input.cancellation_revision_reconciled !== true)
    return result("LATEST_NATIVE_REVISION_OR_CANCELLATION_UNRECONCILED");
  if (!Array.isArray(input.history) || input.history.length > 5000)
    return result("ORDER_STATION_ATTEMPT_HISTORY_INVALID");
  const attempts = new Map<string, string>();
  for (const item of input.history) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        !validOrderKey(item.order_key) || !validStation(item.station_code) ||
        !validDate(item.operational_date) ||
        !validHash(item.native_snapshot_sha256) ||
        !validHash(item.intent_fingerprint) ||
        !validAttempt(item.attempt_id) ||
        !KNOWN_ATTEMPT_STATES.has(item.state))
      return result("ORDER_STATION_ATTEMPT_HISTORY_INVALID");
    const key = JSON.stringify([
      item.order_key, item.station_code, item.operational_date, item.attempt_id,
    ]);
    const signature = JSON.stringify([
      item.native_snapshot_sha256.toLowerCase(),
      item.intent_fingerprint.toLowerCase(), item.state,
    ]);
    const previous = attempts.get(key);
    if (previous !== undefined && previous !== signature)
      return result("ORDER_STATION_ATTEMPT_IDENTITY_CONTRADICTED");
    attempts.set(key, signature);
  }
  // Same native four-part ID reappearing under another operational day
  // must be reconciled; silently discarding old attempts could cause paper
  // duplication across a midnight boundary or reused vendor identifiers.
  const sameNativeIdentity = input.history.filter(item =>
    item.order_key === input.order_key && item.station_code === input.station_code);
  if (sameNativeIdentity.some(item =>
    item.operational_date !== input.operational_date))
    return result("ORDER_STATION_OPERATIONAL_DAY_CONTRADICTED");
  const relevant = sameNativeIdentity;
  if (relevant.some(item => item.state === "PHYSICALLY_CONFIRMED"))
    return result("PRIOR_PHYSICAL_EFFECT_SAME_ORDER_STATION");
  if (relevant.some(item =>
    item.state === "SUBMISSION_RETURNED_UNOBSERVED" ||
    item.state === "SPOOLER_OBSERVED" ||
    item.state === "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION"))
    return result("PRIOR_EFFECT_UNKNOWN_SAME_ORDER_STATION");
  if (relevant.some(item =>
    item.native_snapshot_sha256.toLowerCase() ===
      input.native_snapshot_sha256.toLowerCase() &&
    item.intent_fingerprint.toLowerCase() !==
      input.intent_fingerprint.toLowerCase()))
    return result("SAME_NATIVE_REVISION_DIFFERENT_INTENT_IDENTITY");
  if (relevant.some(item =>
    item.intent_fingerprint.toLowerCase() ===
      input.intent_fingerprint.toLowerCase() &&
    item.native_snapshot_sha256.toLowerCase() !==
      input.native_snapshot_sha256.toLowerCase()))
    return result("PRINT_INTENT_REUSED_ACROSS_NATIVE_REVISIONS");
  return result(null);
}
