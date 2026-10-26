import {
  createHash,
  createPublicKey,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";
import type { ProductionPrintEvidenceState } from "./productionPrintPlan";
import {
  classifyWindowsSpoolerObservation,
  type WindowsSpoolerObservation,
} from "./windowsSpoolerEvidence";

export interface PrintAttemptWitnessRecordV882 {
  schema: "deliveryos.print-attempt-source-witness.v882";
  witness_instance_id: string;
  revision: number;
  store_id: string;
  order_binding_sha256: string;
  intent_fingerprint: string;
  attempt_id: string;
  route_contract_sha256: string;
  collector_instance_id: string;
  submitter_instance_id: string;
  source_channel: "WINDOWS_SPOOLER_READONLY";
  source_read_succeeded: boolean;
  source_snapshot_sha256: string;
  observation_started_at: string;
  observed_at: string;
  nonce: string;
  spooler_observation: WindowsSpoolerObservation;
  claimed_evidence_state: ProductionPrintEvidenceState;
  signature_base64: string;
}

export interface PrintAttemptWitnessTrustV882 {
  schema: "deliveryos.print-attempt-witness-trust.v882";
  authority: "REVIEW_ONLY_SUPPLIED_TRUST";
  expected_witness_instance_id: string;
  required_revision: number;
  required_record_sha256: string;
  expected_store_id: string;
  expected_order_binding_sha256: string;
  expected_intent_fingerprint: string;
  expected_attempt_id: string;
  expected_route_contract_sha256: string;
  expected_collector_instance_id: string;
  expected_submitter_instance_id: string;
  expected_source_snapshot_sha256: string;
  public_key_spki_pem: string;
  public_key_sha256: string;
  valid_from: string;
  valid_until: string;
  max_observation_age_seconds: number;
  max_observation_duration_seconds: number;
  revoked_nonces: string[];
}

export interface PrintAttemptWitnessVerificationV882 {
  schema: "deliveryos.print-attempt-witness-verification.v882";
  status:
    | "WITNESS_HOLD"
    | "SIGNED_SOURCE_SEPARATION_MATCH_RECONCILIATION_ONLY";
  reason_codes: string[];
  signed_witness_verified: boolean;
  identity_binding_verified: boolean;
  freshness_verified: boolean;
  source_separation_contract_satisfied: boolean;
  witnessed_spooler_state: ProductionPrintEvidenceState | null;
  witnessed_spooler_blocking_reasons: string[];
  recommended_evidence_state: "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION";
  independently_custodied_trust_proven: false;
  independent_failure_domain_proven: false;
  physical_print_proven: false;
  proven_no_effect: false;
  fiscal_dispatch_ready: false;
  automatic_retry_allowed: false;
  authorize_print: false;
  authorize_reprint: false;
  manual_reconciliation_required: true;
  effects: {
    print: false;
    reprint: false;
    spooler_write: false;
    filesystem_write: false;
    network: false;
    service_change: false;
    fiscal_action: false;
  };
}

const RECORD_FIELDS = [
  "schema",
  "witness_instance_id",
  "revision",
  "store_id",
  "order_binding_sha256",
  "intent_fingerprint",
  "attempt_id",
  "route_contract_sha256",
  "collector_instance_id",
  "submitter_instance_id",
  "source_channel",
  "source_read_succeeded",
  "source_snapshot_sha256",
  "observation_started_at",
  "observed_at",
  "nonce",
  "spooler_observation",
  "claimed_evidence_state",
  "signature_base64",
] as const;

const TRUST_FIELDS = [
  "schema",
  "authority",
  "expected_witness_instance_id",
  "required_revision",
  "required_record_sha256",
  "expected_store_id",
  "expected_order_binding_sha256",
  "expected_intent_fingerprint",
  "expected_attempt_id",
  "expected_route_contract_sha256",
  "expected_collector_instance_id",
  "expected_submitter_instance_id",
  "expected_source_snapshot_sha256",
  "public_key_spki_pem",
  "public_key_sha256",
  "valid_from",
  "valid_until",
  "max_observation_age_seconds",
  "max_observation_duration_seconds",
  "revoked_nonces",
] as const;

const OBSERVATION_FIELDS = [
  "job_exists",
  "submission_rejected_before_job_creation",
  "job_statuses",
  "printer_statuses",
] as const;

const HEX = /^[0-9a-f]{64}$/;
const INSTANCE = /^(?:witness|collector|submitter):[a-z0-9._-]{8,96}$/;
const ATTEMPT = /^attempt:[a-z0-9._-]{8,96}$/;
const NONCE = /^nonce:[a-z0-9_-]{16,96}$/;
const STORE = /^[A-Z0-9][A-Z0-9 _.-]{0,63}$/;
const EVIDENCE_STATES = new Set<ProductionPrintEvidenceState>([
  "PLANNED",
  "PROVEN_NO_EFFECT_FAILURE",
  "SUBMISSION_RETURNED_UNOBSERVED",
  "SPOOLER_OBSERVED",
  "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
  "PHYSICALLY_CONFIRMED",
]);

const EFFECTS = Object.freeze({
  print: false,
  reprint: false,
  spooler_write: false,
  filesystem_write: false,
  network: false,
  service_change: false,
  fiscal_action: false,
});

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: unknown,
  fields: readonly string[],
): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === fields.length &&
    fields.every((field) => Object.prototype.hasOwnProperty.call(value, field))
  );
}

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalIso(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString() === value ? timestamp : null;
}

function canonicalStringList(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > 32) return false;
  if (!value.every((item) => typeof item === "string" && item.length <= 64)) {
    return false;
  }
  const canonical = [...new Set(value)].sort();
  return JSON.stringify(value) === JSON.stringify(canonical);
}

function refusal(
  reason: string,
  progress: Partial<PrintAttemptWitnessVerificationV882> = {},
): PrintAttemptWitnessVerificationV882 {
  return {
    schema: "deliveryos.print-attempt-witness-verification.v882",
    status: "WITNESS_HOLD",
    reason_codes: [reason],
    signed_witness_verified: false,
    identity_binding_verified: false,
    freshness_verified: false,
    source_separation_contract_satisfied: false,
    witnessed_spooler_state: null,
    witnessed_spooler_blocking_reasons: [],
    recommended_evidence_state: "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
    independently_custodied_trust_proven: false,
    independent_failure_domain_proven: false,
    physical_print_proven: false,
    proven_no_effect: false,
    fiscal_dispatch_ready: false,
    automatic_retry_allowed: false,
    authorize_print: false,
    authorize_reprint: false,
    manual_reconciliation_required: true,
    effects: EFFECTS,
    ...progress,
  };
}

function normalizedObservation(
  observation: WindowsSpoolerObservation,
): WindowsSpoolerObservation {
  return {
    job_exists: observation.job_exists,
    submission_rejected_before_job_creation:
      observation.submission_rejected_before_job_creation,
    job_statuses: [...observation.job_statuses],
    printer_statuses: [...observation.printer_statuses],
  };
}

/** Canonical bytes signed by the source-separated observer. */
export function printAttemptWitnessMessageV882(
  record: Omit<PrintAttemptWitnessRecordV882, "signature_base64">,
): Buffer {
  return Buffer.from(
    "DELIVERYOS-V882-PRINT-ATTEMPT-SOURCE-WITNESS\n" +
      JSON.stringify([
        record.schema,
        record.witness_instance_id,
        record.revision,
        record.store_id,
        record.order_binding_sha256,
        record.intent_fingerprint,
        record.attempt_id,
        record.route_contract_sha256,
        record.collector_instance_id,
        record.submitter_instance_id,
        record.source_channel,
        record.source_read_succeeded,
        record.source_snapshot_sha256,
        record.observation_started_at,
        record.observed_at,
        record.nonce,
        normalizedObservation(record.spooler_observation),
        record.claimed_evidence_state,
      ]) +
      "\n",
    "utf8",
  );
}

export function printAttemptWitnessKeyFingerprintV882(key: KeyObject): string {
  return sha256(key.export({ type: "spki", format: "der" }) as Buffer);
}

export function printAttemptWitnessRecordHashV882(
  record: PrintAttemptWitnessRecordV882,
): string {
  const { signature_base64, ...unsigned } = record;
  return sha256(
    Buffer.concat([
      printAttemptWitnessMessageV882(unsigned),
      Buffer.from(signature_base64, "utf8"),
    ]),
  );
}

/**
 * Verify a signed, source-separated observation for one print attempt.
 *
 * This is a pure reconciliation gate. Even a valid signature only proves that
 * the supplied key signed the supplied observation. It cannot prove external
 * custody, a separate failure domain, physical paper, or absence of effect.
 */
export function verifyPrintAttemptWitnessV882(
  recordValue: unknown,
  trustValue: unknown,
  nowUtc: string,
): PrintAttemptWitnessVerificationV882 {
  if (
    !exactKeys(recordValue, RECORD_FIELDS) ||
    !exactKeys(trustValue, TRUST_FIELDS)
  ) {
    return refusal("WITNESS_OR_TRUST_ENVELOPE_INVALID");
  }
  const record = recordValue as unknown as PrintAttemptWitnessRecordV882;
  const trust = trustValue as unknown as PrintAttemptWitnessTrustV882;
  if (
    record.schema !== "deliveryos.print-attempt-source-witness.v882" ||
    trust.schema !== "deliveryos.print-attempt-witness-trust.v882" ||
    trust.authority !== "REVIEW_ONLY_SUPPLIED_TRUST"
  ) {
    return refusal("WITNESS_SCOPE_INVALID");
  }
  if (
    !exactKeys(record.spooler_observation, OBSERVATION_FIELDS) ||
    typeof record.spooler_observation.job_exists !== "boolean" ||
    typeof record.spooler_observation.submission_rejected_before_job_creation !==
      "boolean" ||
    !canonicalStringList(record.spooler_observation.job_statuses) ||
    !canonicalStringList(record.spooler_observation.printer_statuses)
  ) {
    return refusal("SPOOLER_OBSERVATION_INVALID_OR_NON_CANONICAL");
  }
  if (
    !INSTANCE.test(record.witness_instance_id) ||
    !INSTANCE.test(record.collector_instance_id) ||
    !INSTANCE.test(record.submitter_instance_id) ||
    !STORE.test(record.store_id) ||
    !HEX.test(record.order_binding_sha256) ||
    !HEX.test(record.intent_fingerprint) ||
    !ATTEMPT.test(record.attempt_id) ||
    !HEX.test(record.route_contract_sha256) ||
    !HEX.test(record.source_snapshot_sha256) ||
    !NONCE.test(record.nonce) ||
    typeof record.signature_base64 !== "string" ||
    record.signature_base64.length > 200 ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 1 ||
    record.source_channel !== "WINDOWS_SPOOLER_READONLY" ||
    typeof record.source_read_succeeded !== "boolean" ||
    !EVIDENCE_STATES.has(record.claimed_evidence_state)
  ) {
    return refusal("WITNESS_FIELD_INVALID");
  }
  if (
    record.collector_instance_id === record.submitter_instance_id ||
    record.collector_instance_id === trust.expected_submitter_instance_id ||
    record.submitter_instance_id === trust.expected_collector_instance_id
  ) {
    return refusal("COLLECTOR_NOT_SOURCE_SEPARATED");
  }
  if (
    record.witness_instance_id !== trust.expected_witness_instance_id ||
    record.revision !== trust.required_revision ||
    record.store_id !== trust.expected_store_id ||
    record.order_binding_sha256 !== trust.expected_order_binding_sha256 ||
    record.intent_fingerprint !== trust.expected_intent_fingerprint ||
    record.attempt_id !== trust.expected_attempt_id ||
    record.route_contract_sha256 !== trust.expected_route_contract_sha256 ||
    record.collector_instance_id !== trust.expected_collector_instance_id ||
    record.submitter_instance_id !== trust.expected_submitter_instance_id ||
    record.source_snapshot_sha256 !== trust.expected_source_snapshot_sha256
  ) {
    return refusal("WITNESS_IDENTITY_BINDING_MISMATCH");
  }
  if (
    !HEX.test(trust.required_record_sha256) ||
    !HEX.test(trust.public_key_sha256) ||
    typeof trust.public_key_spki_pem !== "string" ||
    trust.public_key_spki_pem.length > 1500 ||
    !Number.isSafeInteger(trust.max_observation_age_seconds) ||
    trust.max_observation_age_seconds < 1 ||
    trust.max_observation_age_seconds > 3600 ||
    !Number.isSafeInteger(trust.max_observation_duration_seconds) ||
    trust.max_observation_duration_seconds < 1 ||
    trust.max_observation_duration_seconds > 300 ||
    !canonicalStringList(trust.revoked_nonces) ||
    !trust.revoked_nonces.every((nonce) => NONCE.test(nonce))
  ) {
    return refusal("TRUST_CONSTRAINT_INVALID");
  }
  if (trust.revoked_nonces.includes(record.nonce)) {
    return refusal("WITNESS_NONCE_REVOKED", {
      identity_binding_verified: true,
      source_separation_contract_satisfied: true,
    });
  }
  if (printAttemptWitnessRecordHashV882(record) !== trust.required_record_sha256) {
    return refusal("WITNESS_RECORD_EXTERNAL_PIN_MISMATCH", {
      identity_binding_verified: true,
      source_separation_contract_satisfied: true,
    });
  }

  const now = canonicalIso(nowUtc);
  const started = canonicalIso(record.observation_started_at);
  const observed = canonicalIso(record.observed_at);
  const validFrom = canonicalIso(trust.valid_from);
  const validUntil = canonicalIso(trust.valid_until);
  if (
    now === null ||
    started === null ||
    observed === null ||
    validFrom === null ||
    validUntil === null
  ) {
    return refusal("WITNESS_TIME_FORMAT_INVALID", {
      identity_binding_verified: true,
      source_separation_contract_satisfied: true,
    });
  }
  if (
    validFrom > validUntil ||
    now < validFrom ||
    now > validUntil ||
    observed < validFrom ||
    observed > validUntil ||
    started > observed ||
    observed - started > trust.max_observation_duration_seconds * 1000 ||
    observed > now + 5_000 ||
    now - observed > trust.max_observation_age_seconds * 1000
  ) {
    return refusal("WITNESS_TIME_WINDOW_INVALID_OR_STALE", {
      identity_binding_verified: true,
      source_separation_contract_satisfied: true,
    });
  }

  let key: KeyObject;
  try {
    key = createPublicKey(trust.public_key_spki_pem);
    if (
      key.asymmetricKeyType !== "ed25519" ||
      printAttemptWitnessKeyFingerprintV882(key) !== trust.public_key_sha256
    ) {
      return refusal("WITNESS_PUBLIC_KEY_UNTRUSTED", {
        identity_binding_verified: true,
        freshness_verified: true,
        source_separation_contract_satisfied: true,
      });
    }
  } catch {
    return refusal("WITNESS_PUBLIC_KEY_INVALID", {
      identity_binding_verified: true,
      freshness_verified: true,
      source_separation_contract_satisfied: true,
    });
  }

  try {
    if (
      typeof record.signature_base64 !== "string" ||
      !/^[A-Za-z0-9+/]{86}==$/.test(record.signature_base64)
    ) {
      return refusal("WITNESS_SIGNATURE_INVALID", {
        identity_binding_verified: true,
        freshness_verified: true,
        source_separation_contract_satisfied: true,
      });
    }
    const signature = Buffer.from(record.signature_base64, "base64");
    const { signature_base64: _signature, ...unsigned } = record;
    if (
      signature.length !== 64 ||
      signature.toString("base64") !== record.signature_base64 ||
      !verifySignature(
        null,
        printAttemptWitnessMessageV882(unsigned),
        key,
        signature,
      )
    ) {
      return refusal("WITNESS_SIGNATURE_INVALID", {
        identity_binding_verified: true,
        freshness_verified: true,
        source_separation_contract_satisfied: true,
      });
    }
  } catch {
    return refusal("WITNESS_SIGNATURE_UNVERIFIABLE", {
      identity_binding_verified: true,
      freshness_verified: true,
      source_separation_contract_satisfied: true,
    });
  }

  if (!record.source_read_succeeded) {
    return refusal("WITNESS_SOURCE_UNAVAILABLE", {
      signed_witness_verified: true,
      identity_binding_verified: true,
      freshness_verified: true,
      source_separation_contract_satisfied: true,
    });
  }

  const classified = classifyWindowsSpoolerObservation(
    record.spooler_observation,
  );
  if (classified.evidence !== record.claimed_evidence_state) {
    return refusal("WITNESSED_CLASSIFICATION_MISMATCH", {
      signed_witness_verified: true,
      identity_binding_verified: true,
      freshness_verified: true,
      source_separation_contract_satisfied: true,
      witnessed_spooler_state: classified.evidence,
      witnessed_spooler_blocking_reasons: classified.blocking_reasons,
    });
  }

  return {
    schema: "deliveryos.print-attempt-witness-verification.v882",
    status: "SIGNED_SOURCE_SEPARATION_MATCH_RECONCILIATION_ONLY",
    reason_codes: [
      "SUPPLIED_TRUST_CUSTODY_NOT_INDEPENDENTLY_PROVEN",
      "SPOOLER_OBSERVATION_IS_NOT_PHYSICAL_PAPER_PROOF",
      "NO_EFFECT_CANNOT_BE_PROVEN_BY_ONE_OBSERVATION",
    ],
    signed_witness_verified: true,
    identity_binding_verified: true,
    freshness_verified: true,
    source_separation_contract_satisfied: true,
    witnessed_spooler_state: classified.evidence,
    witnessed_spooler_blocking_reasons: classified.blocking_reasons,
    recommended_evidence_state: "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
    independently_custodied_trust_proven: false,
    independent_failure_domain_proven: false,
    physical_print_proven: false,
    proven_no_effect: false,
    fiscal_dispatch_ready: false,
    automatic_retry_allowed: false,
    authorize_print: false,
    authorize_reprint: false,
    manual_reconciliation_required: true,
    effects: EFFECTS,
  };
}
