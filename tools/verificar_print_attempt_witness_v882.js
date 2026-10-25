"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  printAttemptWitnessKeyFingerprintV882,
  printAttemptWitnessMessageV882,
  printAttemptWitnessRecordHashV882,
  verifyPrintAttemptWitnessV882,
} = require("../dist/src/production/printAttemptWitnessV882.js");
const {
  decideProductionPrintSubmission,
} = require("../dist/src/production/productionPrintIdempotency.js");

const sha = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");
const clone = (value) => structuredClone(value);
const keys = crypto.generateKeyPairSync("ed25519");
const otherKeys = crypto.generateKeyPairSync("ed25519");
const NOW = "2026-10-25T05:00:30.000Z";

const baseUnsigned = Object.freeze({
  schema: "deliveryos.print-attempt-source-witness.v882",
  witness_instance_id: "witness:spooler_review_0001",
  revision: 7,
  store_id: "0001 - TATA ITAIM",
  order_binding_sha256: sha("store-order-reservation-content-origin"),
  intent_fingerprint: sha("semantic-print-intent-v882"),
  attempt_id: "attempt:print_attempt_0001",
  route_contract_sha256:
    "f37dae40779c5a205a26ceb289cd748d1c7747c1947c278f534a2dcc2f296f4c",
  collector_instance_id: "collector:readonly_spooler_0001",
  submitter_instance_id: "submitter:tata_sidecar_0001",
  source_channel: "WINDOWS_SPOOLER_READONLY",
  source_read_succeeded: true,
  source_snapshot_sha256: sha("synthetic-raw-spooler-snapshot-v882"),
  observation_started_at: "2026-10-25T05:00:00.000Z",
  observed_at: "2026-10-25T05:00:02.000Z",
  nonce: "nonce:attempt_witness_0001",
  spooler_observation: {
    job_exists: true,
    submission_rejected_before_job_creation: false,
    job_statuses: ["PRINTED"],
    printer_statuses: [],
  },
  claimed_evidence_state: "SPOOLER_OBSERVED",
});

function signedRecord(overrides = {}, privateKey = keys.privateKey) {
  const unsigned = {
    ...clone(baseUnsigned),
    ...clone(overrides),
  };
  return {
    ...unsigned,
    signature_base64: crypto
      .sign(null, printAttemptWitnessMessageV882(unsigned), privateKey)
      .toString("base64"),
  };
}

function trustFor(record, overrides = {}, publicKey = keys.publicKey) {
  return {
    schema: "deliveryos.print-attempt-witness-trust.v882",
    authority: "REVIEW_ONLY_SUPPLIED_TRUST",
    expected_witness_instance_id: record.witness_instance_id,
    required_revision: record.revision,
    required_record_sha256: printAttemptWitnessRecordHashV882(record),
    expected_store_id: record.store_id,
    expected_order_binding_sha256: record.order_binding_sha256,
    expected_intent_fingerprint: record.intent_fingerprint,
    expected_attempt_id: record.attempt_id,
    expected_route_contract_sha256: record.route_contract_sha256,
    expected_collector_instance_id: record.collector_instance_id,
    expected_submitter_instance_id: record.submitter_instance_id,
    expected_source_snapshot_sha256: record.source_snapshot_sha256,
    public_key_spki_pem: publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
    public_key_sha256: printAttemptWitnessKeyFingerprintV882(publicKey),
    valid_from: "2026-10-25T04:59:00.000Z",
    valid_until: "2026-10-25T05:05:00.000Z",
    max_observation_age_seconds: 60,
    max_observation_duration_seconds: 10,
    revoked_nonces: [],
    ...clone(overrides),
  };
}

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  process.stdout.write(`PASS ${String(checks).padStart(2, "0")} ${name}\n`);
}

function hold(result, reason) {
  assert.equal(result.status, "WITNESS_HOLD");
  assert.ok(result.reason_codes.includes(reason));
  assert.equal(result.physical_print_proven, false);
  assert.equal(result.proven_no_effect, false);
  assert.equal(result.fiscal_dispatch_ready, false);
  assert.equal(result.automatic_retry_allowed, false);
  assert.equal(result.authorize_print, false);
  assert.equal(result.authorize_reprint, false);
  assert.equal(result.effects.print, false);
  assert.equal(result.effects.spooler_write, false);
  assert.equal(result.effects.network, false);
}

check("valid signed PRINTED observation remains reconciliation-only", () => {
  const record = signedRecord();
  const result = verifyPrintAttemptWitnessV882(record, trustFor(record), NOW);
  assert.equal(
    result.status,
    "SIGNED_SOURCE_SEPARATION_MATCH_RECONCILIATION_ONLY",
  );
  assert.equal(result.signed_witness_verified, true);
  assert.equal(result.witnessed_spooler_state, "SPOOLER_OBSERVED");
  assert.equal(result.recommended_evidence_state, "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION");
  assert.equal(result.independently_custodied_trust_proven, false);
  assert.equal(result.independent_failure_domain_proven, false);
  assert.equal(result.physical_print_proven, false);
  assert.equal(result.automatic_retry_allowed, false);
});

check("signed pre-effect rejection still cannot self-prove no effect", () => {
  const record = signedRecord({
    spooler_observation: {
      job_exists: false,
      submission_rejected_before_job_creation: true,
      job_statuses: [],
      printer_statuses: ["OFFLINE"],
    },
    claimed_evidence_state: "PROVEN_NO_EFFECT_FAILURE",
  });
  const result = verifyPrintAttemptWitnessV882(record, trustFor(record), NOW);
  assert.equal(result.witnessed_spooler_state, "PROVEN_NO_EFFECT_FAILURE");
  assert.equal(result.proven_no_effect, false);
  assert.equal(result.automatic_retry_allowed, false);
});

check("verified witness composes to idempotency HOLD, never retry", () => {
  const record = signedRecord();
  const result = verifyPrintAttemptWitnessV882(record, trustFor(record), NOW);
  const decision = decideProductionPrintSubmission(record.intent_fingerprint, [
    {
      intent_fingerprint: record.intent_fingerprint,
      attempt_id: record.attempt_id,
      state: result.recommended_evidence_state,
    },
  ]);
  assert.equal(decision.decision, "BLOCK_RECONCILIATION_REQUIRED");
  assert.equal(decision.automatic_retry_allowed, false);
});

check("signed contradictory observation preserves ambiguity", () => {
  const record = signedRecord({
    spooler_observation: {
      job_exists: false,
      submission_rejected_before_job_creation: true,
      job_statuses: ["PRINTED"],
      printer_statuses: [],
    },
    claimed_evidence_state: "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
  });
  const result = verifyPrintAttemptWitnessV882(record, trustFor(record), NOW);
  assert.equal(result.signed_witness_verified, true);
  assert.ok(
    result.witnessed_spooler_blocking_reasons.includes(
      "OBSERVATION_CONTRADICTION:STATUS_WITHOUT_JOB",
    ),
  );
  assert.equal(result.automatic_retry_allowed, false);
});

check("signed future status remains unknown rather than accepted", () => {
  const record = signedRecord({
    spooler_observation: {
      job_exists: true,
      submission_rejected_before_job_creation: false,
      job_statuses: ["FUTURE_JOB_STATUS", "PRINTED"],
      printer_statuses: [],
    },
    claimed_evidence_state: "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
  });
  const result = verifyPrintAttemptWitnessV882(record, trustFor(record), NOW);
  assert.equal(result.signed_witness_verified, true);
  assert.ok(
    result.witnessed_spooler_blocking_reasons.includes(
      "JOB_STATUS_UNRECOGNIZED:FUTURE_JOB_STATUS",
    ),
  );
});

check("signed claim cannot override recomputed classification", () => {
  const record = signedRecord({ claimed_evidence_state: "PHYSICALLY_CONFIRMED" });
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(record), NOW),
    "WITNESSED_CLASSIFICATION_MISMATCH",
  );
});

check("collector and submitter must be different actors", () => {
  const record = signedRecord({
    collector_instance_id: "collector:same_actor_0001",
    submitter_instance_id: "collector:same_actor_0001",
  });
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(record), NOW),
    "COLLECTOR_NOT_SOURCE_SEPARATED",
  );
});

check("swapped collector and submitter trust is rejected", () => {
  const record = signedRecord();
  hold(
    verifyPrintAttemptWitnessV882(
      record,
      trustFor(record, {
        expected_collector_instance_id: record.submitter_instance_id,
        expected_submitter_instance_id: record.collector_instance_id,
      }),
      NOW,
    ),
    "COLLECTOR_NOT_SOURCE_SEPARATED",
  );
});

for (const [name, field, value] of [
  ["store", "expected_store_id", "9999 - OTHER STORE"],
  ["order binding", "expected_order_binding_sha256", sha("other-order")],
  ["intent", "expected_intent_fingerprint", sha("other-intent")],
  ["attempt", "expected_attempt_id", "attempt:other_attempt_0002"],
  ["route contract", "expected_route_contract_sha256", sha("other-route")],
  ["source snapshot", "expected_source_snapshot_sha256", sha("other-snapshot")],
  ["witness instance", "expected_witness_instance_id", "witness:other_witness_0002"],
  ["revision", "required_revision", 8],
]) {
  check(`${name} mismatch is rejected`, () => {
    const record = signedRecord();
    hold(
      verifyPrintAttemptWitnessV882(
        record,
        trustFor(record, { [field]: value }),
        NOW,
      ),
      "WITNESS_IDENTITY_BINDING_MISMATCH",
    );
  });
}

check("stale observation is rejected", () => {
  const record = signedRecord({ observed_at: "2026-10-25T04:59:00.000Z" });
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(record), NOW),
    "WITNESS_TIME_WINDOW_INVALID_OR_STALE",
  );
});

check("future observation is rejected", () => {
  const record = signedRecord({
    observation_started_at: "2026-10-25T05:00:34.000Z",
    observed_at: "2026-10-25T05:00:36.000Z",
  });
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(record), NOW),
    "WITNESS_TIME_WINDOW_INVALID_OR_STALE",
  );
});

check("observation end before start is rejected", () => {
  const record = signedRecord({
    observation_started_at: "2026-10-25T05:00:04.000Z",
    observed_at: "2026-10-25T05:00:02.000Z",
  });
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(record), NOW),
    "WITNESS_TIME_WINDOW_INVALID_OR_STALE",
  );
});

check("overlong collection window is rejected", () => {
  const record = signedRecord({
    observation_started_at: "2026-10-25T04:59:40.000Z",
  });
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(record), NOW),
    "WITNESS_TIME_WINDOW_INVALID_OR_STALE",
  );
});

check("expired trust window is rejected", () => {
  const record = signedRecord();
  hold(
    verifyPrintAttemptWitnessV882(
      record,
      trustFor(record, { valid_until: "2026-10-25T05:00:20.000Z" }),
      NOW,
    ),
    "WITNESS_TIME_WINDOW_INVALID_OR_STALE",
  );
});

check("non-canonical timestamp is rejected", () => {
  const record = signedRecord({ observed_at: "2026-10-25T05:00:02Z" });
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(record), NOW),
    "WITNESS_TIME_FORMAT_INVALID",
  );
});

check("revoked nonce is rejected", () => {
  const record = signedRecord();
  hold(
    verifyPrintAttemptWitnessV882(
      record,
      trustFor(record, { revoked_nonces: [record.nonce] }),
      NOW,
    ),
    "WITNESS_NONCE_REVOKED",
  );
});

check("malformed nonce is rejected", () => {
  const record = signedRecord({ nonce: "not-a-valid-nonce" });
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(record), NOW),
    "WITNESS_FIELD_INVALID",
  );
});

check("non-string signature fails closed without throwing", () => {
  const record = { ...signedRecord(), signature_base64: null };
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(signedRecord()), NOW),
    "WITNESS_FIELD_INVALID",
  );
});

check("changed signature is rejected even under a refreshed record pin", () => {
  const record = signedRecord();
  record.signature_base64 =
    (record.signature_base64[0] === "A" ? "B" : "A") +
    record.signature_base64.slice(1);
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(record), NOW),
    "WITNESS_SIGNATURE_INVALID",
  );
});

check("different signer is rejected by the trusted key", () => {
  const record = signedRecord({}, otherKeys.privateKey);
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(record), NOW),
    "WITNESS_SIGNATURE_INVALID",
  );
});

check("attacker-controlled signer and supplied trust remain non-independent", () => {
  const record = signedRecord({}, otherKeys.privateKey);
  const result = verifyPrintAttemptWitnessV882(
    record,
    trustFor(record, {}, otherKeys.publicKey),
    NOW,
  );
  assert.equal(
    result.status,
    "SIGNED_SOURCE_SEPARATION_MATCH_RECONCILIATION_ONLY",
  );
  assert.equal(result.signed_witness_verified, true);
  assert.equal(result.independently_custodied_trust_proven, false);
  assert.equal(result.independent_failure_domain_proven, false);
  assert.equal(result.automatic_retry_allowed, false);
});

check("public-key fingerprint substitution is rejected", () => {
  const record = signedRecord();
  hold(
    verifyPrintAttemptWitnessV882(
      record,
      trustFor(record, { public_key_sha256: sha("substituted-key") }),
      NOW,
    ),
    "WITNESS_PUBLIC_KEY_UNTRUSTED",
  );
});

check("external record pin mismatch is rejected", () => {
  const record = signedRecord();
  hold(
    verifyPrintAttemptWitnessV882(
      record,
      trustFor(record, { required_record_sha256: sha("stale-pin") }),
      NOW,
    ),
    "WITNESS_RECORD_EXTERNAL_PIN_MISMATCH",
  );
});

check("unexpected witness field is rejected", () => {
  const record = { ...signedRecord(), operational_approved: true };
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(signedRecord()), NOW),
    "WITNESS_OR_TRUST_ENVELOPE_INVALID",
  );
});

check("unexpected spooler field is rejected", () => {
  const record = signedRecord();
  record.spooler_observation = {
    ...record.spooler_observation,
    physical_paper_seen: true,
  };
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(record), NOW),
    "SPOOLER_OBSERVATION_INVALID_OR_NON_CANONICAL",
  );
});

check("duplicate status list is rejected as non-canonical", () => {
  const record = signedRecord({
    spooler_observation: {
      job_exists: true,
      submission_rejected_before_job_creation: false,
      job_statuses: ["PRINTED", "PRINTED"],
      printer_statuses: [],
    },
  });
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(record), NOW),
    "SPOOLER_OBSERVATION_INVALID_OR_NON_CANONICAL",
  );
});

check("unsorted status list is rejected as non-canonical", () => {
  const record = signedRecord({
    spooler_observation: {
      job_exists: true,
      submission_rejected_before_job_creation: false,
      job_statuses: ["PRINTING", "PAUSED"],
      printer_statuses: [],
    },
    claimed_evidence_state: "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION",
  });
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(record), NOW),
    "SPOOLER_OBSERVATION_INVALID_OR_NON_CANONICAL",
  );
});

check("unknown source channel is rejected", () => {
  const record = signedRecord({ source_channel: "SUBMITTER_SELF_REPORT" });
  hold(
    verifyPrintAttemptWitnessV882(record, trustFor(record), NOW),
    "WITNESS_FIELD_INVALID",
  );
});

check("signed source-read failure remains HOLD", () => {
  const record = signedRecord({ source_read_succeeded: false });
  const result = verifyPrintAttemptWitnessV882(record, trustFor(record), NOW);
  hold(result, "WITNESS_SOURCE_UNAVAILABLE");
  assert.equal(result.signed_witness_verified, true);
  assert.equal(result.source_separation_contract_satisfied, true);
});

check("record cannot be replayed for another attempt", () => {
  const record = signedRecord();
  hold(
    verifyPrintAttemptWitnessV882(
      record,
      trustFor(record, { expected_attempt_id: "attempt:other_attempt_0002" }),
      NOW,
    ),
    "WITNESS_IDENTITY_BINDING_MISMATCH",
  );
});

check("authority relabel cannot promote review trust", () => {
  const record = signedRecord();
  hold(
    verifyPrintAttemptWitnessV882(
      record,
      trustFor(record, { authority: "REAL_RESTAURANT_APPROVED" }),
      NOW,
    ),
    "WITNESS_SCOPE_INVALID",
  );
});

check("verifier has no signing, I/O, service or printer capability", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/production/printAttemptWitnessV882.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /\b(?:generateKeyPairSync|createPrivateKey|writeFileSync|appendFileSync|readFileSync|fetch|connect|OpenPrinter|StartDocPrinter|WritePrinter|Set-Printer|spawnSync|execSync)\s*\(/,
  );
});

console.log(
  `PRINT_ATTEMPT_WITNESS_V882=${checks}/${checks} OFFLINE SIGNED_SOURCE_SEPARATION RECONCILIATION_ONLY NO_PRINT NO_RETRY`,
);
