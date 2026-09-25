export const EDGE_CONTRACT_VERSION = "edge-watch-handoff@0.1.0";

export class ContractError extends Error {
  constructor(code) {
    super(code);
    this.name = "ContractError";
    this.code = code;
  }
}

const TOP_KEYS = [
  "contract_version",
  "source_system",
  "source_mode",
  "fact_class",
  "generated_at",
  "source_watermark_at",
  "observation_count",
  "source_coverage",
  "identity_counts",
  "hard_exceptions",
  "global_coverage_claim",
  "external_effect_authorized",
];

const COVERAGE_KEYS = [
  "source",
  "unit_id",
  "observation_count",
  "first_observed_at",
  "last_observed_at",
];

const IDENTITY_KEYS = [
  "proven",
  "supported_inference",
  "candidate",
  "unknown",
];

const EXCEPTION_KEYS = [
  "attention_id",
  "kind",
  "unit_id",
  "observed_at",
  "reason_code",
];

const EXCEPTION_KINDS = new Set([
  "IFOOD_AUTH_HUMAN_REQUIRED",
  "PRINT_SOFTWARE_ERROR",
  "SOURCE_ADAPTER_FAILED",
]);

function assertObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractError(code);
  }
}

function assertExactKeys(value, allowed, code) {
  assertObject(value, code);
  const allow = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allow.has(key)) throw new ContractError(code);
  }
}

function assertIso(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new ContractError(code);
  }
}

function assertCount(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ContractError(code);
  }
}

export function validateEdgeHandoff(input) {
  assertExactKeys(input, TOP_KEYS, "edge_handoff_unreviewed_field");
  if (input.contract_version !== EDGE_CONTRACT_VERSION) {
    throw new ContractError("edge_handoff_contract_version_unsupported");
  }
  if (input.source_system !== "TATA_EDGE") {
    throw new ContractError("edge_handoff_source_system_invalid");
  }
  if (!["synthetic", "live_observed", "empty"].includes(input.source_mode)) {
    throw new ContractError("edge_handoff_source_mode_invalid");
  }
  const expected = {
    synthetic: "SIMULATION",
    live_observed: "FACT",
    empty: "EMPTY",
  }[input.source_mode];
  if (input.fact_class !== expected) {
    throw new ContractError("edge_handoff_truth_class_mismatch");
  }
  if (input.global_coverage_claim !== "NOT_PROVIDED") {
    throw new ContractError("edge_handoff_global_coverage_claim_forbidden");
  }
  if (input.external_effect_authorized !== false) {
    throw new ContractError("edge_handoff_external_effect_authority_forbidden");
  }

  assertIso(input.generated_at, "edge_handoff_generated_at_invalid");
  assertCount(input.observation_count, "edge_handoff_observation_count_invalid");
  if (!Array.isArray(input.source_coverage)) {
    throw new ContractError("edge_handoff_source_coverage_invalid");
  }
  if (!Array.isArray(input.hard_exceptions)) {
    throw new ContractError("edge_handoff_hard_exceptions_invalid");
  }
  assertExactKeys(input.identity_counts, IDENTITY_KEYS, "edge_handoff_identity_counts_invalid");
  for (const key of IDENTITY_KEYS) {
    assertCount(input.identity_counts[key], "edge_handoff_identity_counts_invalid");
  }

  if (input.source_mode === "empty") {
    if (
      input.source_watermark_at !== undefined &&
      input.source_watermark_at !== null
    ) {
      throw new ContractError("edge_handoff_empty_has_source_watermark");
    }
    if (
      input.observation_count !== 0 ||
      input.source_coverage.length !== 0 ||
      input.hard_exceptions.length !== 0
    ) {
      throw new ContractError("edge_handoff_empty_contains_observations");
    }
    return input;
  }

  assertIso(input.source_watermark_at, "edge_handoff_nonempty_without_source_watermark");
  if (Date.parse(input.source_watermark_at) > Date.parse(input.generated_at)) {
    throw new ContractError("edge_handoff_source_watermark_after_generation");
  }

  let total = 0;
  for (const coverage of input.source_coverage) {
    assertExactKeys(coverage, COVERAGE_KEYS, "edge_handoff_source_coverage_unreviewed_field");
    if (typeof coverage.source !== "string" || !coverage.source) {
      throw new ContractError("edge_handoff_source_coverage_invalid");
    }
    assertCount(coverage.observation_count, "edge_handoff_source_coverage_invalid");
    assertIso(coverage.first_observed_at, "edge_handoff_source_coverage_time_invalid");
    assertIso(coverage.last_observed_at, "edge_handoff_source_coverage_time_invalid");
    if (Date.parse(coverage.first_observed_at) > Date.parse(coverage.last_observed_at)) {
      throw new ContractError("edge_handoff_source_coverage_time_order_invalid");
    }
    if (Date.parse(coverage.last_observed_at) > Date.parse(input.source_watermark_at)) {
      throw new ContractError("edge_handoff_coverage_after_source_watermark");
    }
    total += coverage.observation_count;
  }
  if (total !== input.observation_count) {
    throw new ContractError("edge_handoff_source_coverage_count_mismatch");
  }

  for (const item of input.hard_exceptions) {
    assertExactKeys(item, EXCEPTION_KEYS, "edge_handoff_exception_unreviewed_field");
    if (typeof item.attention_id !== "string" || !item.attention_id) {
      throw new ContractError("edge_handoff_exception_invalid");
    }
    if (!EXCEPTION_KINDS.has(item.kind)) {
      throw new ContractError("edge_handoff_exception_kind_invalid");
    }
    assertIso(item.observed_at, "edge_handoff_exception_time_invalid");
    if (Date.parse(item.observed_at) > Date.parse(input.source_watermark_at)) {
      throw new ContractError("edge_handoff_exception_after_source_watermark");
    }
    if (typeof item.reason_code !== "string" || !item.reason_code) {
      throw new ContractError("edge_handoff_exception_invalid");
    }
  }
  return input;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function inputFingerprint(input) {
  return sha256Hex(stableJson(input));
}

export async function buildRuntimeSnapshot(input, generatedAt = new Date().toISOString()) {
  validateEdgeHandoff(input);
  assertIso(generatedAt, "watch_snapshot_generated_at_invalid");
  const fingerprint = await inputFingerprint(input);
  const needsCesar = input.hard_exceptions.filter(
    (item) => item.kind === "IFOOD_AUTH_HUMAN_REQUIRED",
  );
  const unknowns = [];
  let validity = "DEGRADED";
  if (input.source_mode === "empty") {
    validity = "INSUFFICIENT";
    unknowns.push("no TATA Edge observations loaded");
  } else {
    unknowns.push("TATA Edge freshness policy not provided");
    unknowns.push("global source coverage not provided by Edge");
    if (input.source_mode === "synthetic") {
      unknowns.push("current Edge input is simulation, not fact");
    }
  }

  const snapshotSeed = `${fingerprint}|${generatedAt}`;
  const snapshotId = `watch_snapshot_${(await sha256Hex(snapshotSeed)).slice(0, 24)}`;

  return {
    snapshotId,
    inputFingerprint: fingerprint,
    generatedAt,
    sourceWatermarkAt: input.source_watermark_at ?? null,
    truthClass: input.fact_class,
    validity: {
      status: validity,
      validUntil: null,
      globalAllClearAuthorized: false,
    },
    coverage: input.source_coverage,
    blindSources: ["GLOBAL_CRITICAL_SOURCE_REGISTRY"],
    needsCesar,
    criticalQueue: input.hard_exceptions,
    unknowns,
    externalEffectsAuthorized: false,
  };
}


/**
 * The hourly shadow recompute is useful only while a non-empty source state
 * exists. EMPTY is already an explicit insufficient snapshot; recomputing it
 * would only create history churn without adding source evidence.
 */
export function shouldRecomputeScheduled(input) {
  validateEdgeHandoff(input);
  return input.source_mode !== "empty";
}
