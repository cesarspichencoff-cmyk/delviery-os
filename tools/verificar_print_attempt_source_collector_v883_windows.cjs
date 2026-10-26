"use strict";

// GitHub-hosted disposable Windows only. Never execute against a store host.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  classifyWindowsSpoolerObservation,
} = require("../dist/src/production/windowsSpoolerEvidence.js");
const {
  printAttemptWitnessKeyFingerprintV882,
  printAttemptWitnessMessageV882,
  printAttemptWitnessRecordHashV882,
  verifyPrintAttemptWitnessV882,
} = require("../dist/src/production/printAttemptWitnessV882.js");

if (
  process.env.GITHUB_ACTIONS !== "true" ||
  !process.env.RUNNER_TEMP ||
  process.platform !== "win32"
) {
  throw new Error("V883_GITHUB_HOSTED_WINDOWS_ONLY");
}

const root = fs.mkdtempSync(
  path.join(process.env.RUNNER_TEMP, "tata-v883-source-collector-"),
);
const fixturePath = path.join(root, "source.json");
const script = "tools/comandas_print_attempt_source_collector_v883_review_only.ps1";
const keys = crypto.generateKeyPairSync("ed25519");
const sha = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");
const clone = (value) => structuredClone(value);

const baseFixture = Object.freeze({
  schema: "deliveryos.print-attempt-collector-fixture.v883",
  context: {
    witness_instance_id: "witness:spooler_review_0001",
    revision: 8,
    store_id: "0001 - TATA ITAIM",
    order_binding_sha256: sha("synthetic-order-binding-v883"),
    intent_fingerprint: sha("synthetic-intent-v883"),
    attempt_id: "attempt:print_attempt_0001",
    route_contract_sha256:
      "f37dae40779c5a205a26ceb289cd748d1c7747c1947c278f534a2dcc2f296f4c",
    collector_instance_id: "collector:fixture_normalizer_0001",
    submitter_instance_id: "submitter:synthetic_sidecar_0001",
    observation_started_at: "2026-10-25T05:00:00.000Z",
    observed_at: "2026-10-25T05:00:02.000Z",
    nonce: "nonce:source_collector_0001",
  },
  source: {
    source_read_succeeded: true,
    expected_job_id: 42,
    jobs: [
      { job_id: 7, status_mask: 16 },
      { job_id: 42, status_mask: 128 },
    ],
    printer: {
      printer_status: 3,
      detected_error_state: 2,
      work_offline: false,
    },
  },
});

function invoke(fixture = baseFixture, inputPath = fixturePath) {
  if (inputPath === fixturePath) {
    fs.writeFileSync(inputPath, JSON.stringify(fixture), "utf8");
  }
  return spawnSync(
    "pwsh.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-CiFixturePath",
      inputPath,
    ],
    {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
      timeout: 45_000,
      windowsHide: true,
    },
  );
}

function run(fixture = baseFixture) {
  const child = invoke(fixture);
  assert.equal(
    child.status,
    0,
    child.stderr || child.stdout || String(child.error || "NO_POWERSHELL_OUTPUT"),
  );
  const raw = child.stdout.trim();
  assert.ok(!raw.includes(root));
  assert.ok(!raw.includes("CI_SYNTHETIC_QUEUE"));
  const output = JSON.parse(raw);
  assert.equal(
    output.schema,
    "deliveryos.print-attempt-source-collector.v883.review-only",
  );
  assert.equal(
    output.status,
    "CANDIDATE_REQUIRES_EXTERNAL_V882_SIGNATURE_AND_TRUST",
  );
  assert.equal(output.live_host_read_performed, false);
  assert.equal(output.fixture_only, true);
  assert.equal(output.signature_created, false);
  assert.equal(output.github_runner_identity_proven, false);
  assert.deepEqual(Object.values(output.effects), Object.values(output.effects).map(() => false));
  assert.deepEqual(Object.values(output.privacy), Object.values(output.privacy).map(() => false));
  return output;
}

function verifyThroughV882(candidate, now = "2026-10-25T05:00:30.000Z") {
  const classified = classifyWindowsSpoolerObservation(
    candidate.spooler_observation,
  );
  const unsigned = {
    ...candidate,
    claimed_evidence_state: classified.evidence,
  };
  const record = {
    ...unsigned,
    signature_base64: crypto
      .sign(null, printAttemptWitnessMessageV882(unsigned), keys.privateKey)
      .toString("base64"),
  };
  const trust = {
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
    public_key_spki_pem: keys.publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
    public_key_sha256: printAttemptWitnessKeyFingerprintV882(keys.publicKey),
    valid_from: "2026-10-25T04:59:00.000Z",
    valid_until: "2026-10-25T05:05:00.000Z",
    max_observation_age_seconds: 60,
    max_observation_duration_seconds: 10,
    revoked_nonces: [],
  };
  return {
    classified,
    verified: verifyPrintAttemptWitnessV882(record, trust, now),
  };
}

let checks = 0;
function check(name, runCheck) {
  runCheck();
  checks += 1;
  console.log(`PASS ${checks} ${name}`);
}

try {
  check("PRINTED fixture maps into V8.82 reconciliation-only", () => {
    const output = run();
    const candidate = output.unsigned_v882_candidate;
    assert.equal(candidate.spooler_observation.job_exists, true);
    assert.deepEqual(candidate.spooler_observation.job_statuses, ["PRINTED"]);
    const { classified, verified } = verifyThroughV882(candidate);
    assert.equal(classified.evidence, "SPOOLER_OBSERVED");
    assert.equal(
      verified.status,
      "SIGNED_SOURCE_SEPARATION_MATCH_RECONCILIATION_ONLY",
    );
    assert.equal(verified.physical_print_proven, false);
    assert.equal(verified.automatic_retry_allowed, false);
  });

  check("missing expected job is ambiguous, never proven no-effect", () => {
    const fixture = clone(baseFixture);
    fixture.source.expected_job_id = 99;
    const candidate = run(fixture).unsigned_v882_candidate;
    const { classified, verified } = verifyThroughV882(candidate);
    assert.equal(candidate.spooler_observation.job_exists, false);
    assert.equal(classified.evidence, "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION");
    assert.equal(verified.proven_no_effect, false);
  });

  check("job error plus PRINTED remains ambiguous", () => {
    const fixture = clone(baseFixture);
    fixture.source.jobs[1].status_mask = 130;
    const candidate = run(fixture).unsigned_v882_candidate;
    const { classified } = verifyThroughV882(candidate);
    assert.deepEqual(candidate.spooler_observation.job_statuses, ["ERROR", "PRINTED"]);
    assert.equal(classified.evidence, "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION");
  });

  check("printer offline blocks a PRINTED observation", () => {
    const fixture = clone(baseFixture);
    fixture.source.printer.work_offline = true;
    const candidate = run(fixture).unsigned_v882_candidate;
    const { classified } = verifyThroughV882(candidate);
    assert.deepEqual(candidate.spooler_observation.printer_statuses, ["OFFLINE"]);
    assert.equal(classified.evidence, "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION");
  });

  check("unknown status-mask bit fails closed through V8.82", () => {
    const fixture = clone(baseFixture);
    fixture.source.jobs[1].status_mask = 16512;
    const candidate = run(fixture).unsigned_v882_candidate;
    const { classified } = verifyThroughV882(candidate);
    assert.ok(candidate.spooler_observation.job_statuses.includes("UNRECOGNIZED_STATUS_MASK"));
    assert.equal(classified.evidence, "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION");
  });

  check("unknown printer-status code fails closed through V8.82", () => {
    const fixture = clone(baseFixture);
    fixture.source.printer.printer_status = 999;
    const candidate = run(fixture).unsigned_v882_candidate;
    const { classified } = verifyThroughV882(candidate);
    assert.ok(candidate.spooler_observation.printer_statuses.includes("UNRECOGNIZED_PRINTER_STATUS"));
    assert.equal(classified.evidence, "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION");
  });

  check("unknown detected-error code fails closed through V8.82", () => {
    const fixture = clone(baseFixture);
    fixture.source.printer.detected_error_state = 999;
    const candidate = run(fixture).unsigned_v882_candidate;
    const { classified } = verifyThroughV882(candidate);
    assert.ok(candidate.spooler_observation.printer_statuses.includes("UNRECOGNIZED_DETECTED_ERROR_STATE"));
    assert.equal(classified.evidence, "EFFECT_UNKNOWN_REQUIRES_RECONCILIATION");
  });

  check("signed source-read failure remains WITNESS_SOURCE_UNAVAILABLE", () => {
    const fixture = clone(baseFixture);
    fixture.source.source_read_succeeded = false;
    fixture.source.jobs = [];
    const candidate = run(fixture).unsigned_v882_candidate;
    const { verified } = verifyThroughV882(candidate);
    assert.equal(verified.status, "WITNESS_HOLD");
    assert.ok(verified.reason_codes.includes("WITNESS_SOURCE_UNAVAILABLE"));
  });

  check("snapshot hash is deterministic under job-list permutation", () => {
    const first = run().unsigned_v882_candidate.source_snapshot_sha256;
    const fixture = clone(baseFixture);
    fixture.source.jobs.reverse();
    const second = run(fixture).unsigned_v882_candidate.source_snapshot_sha256;
    assert.equal(first, second);
  });

  check("different safe status changes the snapshot hash", () => {
    const first = run().unsigned_v882_candidate.source_snapshot_sha256;
    const fixture = clone(baseFixture);
    fixture.source.jobs[1].status_mask = 16;
    const second = run(fixture).unsigned_v882_candidate.source_snapshot_sha256;
    assert.notEqual(first, second);
  });

  check("duplicate matching job id is rejected", () => {
    const fixture = clone(baseFixture);
    fixture.source.jobs.push({ job_id: 42, status_mask: 128 });
    const child = invoke(fixture);
    assert.notEqual(child.status, 0);
    assert.match(child.stderr + child.stdout, /V883_DUPLICATE_JOB_ID/);
  });

  check("duplicate non-target job id is also rejected", () => {
    const fixture = clone(baseFixture);
    fixture.source.jobs.push({ job_id: 7, status_mask: 128 });
    const child = invoke(fixture);
    assert.notEqual(child.status, 0);
    assert.match(child.stderr + child.stdout, /V883_DUPLICATE_JOB_ID/);
  });

  check("jobs object is rejected instead of coerced into an array", () => {
    const fixture = clone(baseFixture);
    fixture.source.jobs = { job_id: 42, status_mask: 128 };
    const child = invoke(fixture);
    assert.notEqual(child.status, 0);
    assert.match(child.stderr + child.stdout, /V883_JOB_LIST_INVALID/);
  });

  check("unexpected source field is rejected", () => {
    const fixture = clone(baseFixture);
    fixture.source.document_title = "MUST_NOT_BE_ACCEPTED";
    const child = invoke(fixture);
    assert.notEqual(child.status, 0);
    assert.match(child.stderr + child.stdout, /V883_SOURCE_SHAPE_INVALID/);
  });

  check("string boolean is rejected instead of coerced", () => {
    const fixture = clone(baseFixture);
    fixture.source.source_read_succeeded = "true";
    const child = invoke(fixture);
    assert.notEqual(child.status, 0);
    assert.match(child.stderr + child.stdout, /V883_SOURCE_BOOLEAN_INVALID/);
  });

  check("numeric string is rejected instead of coerced", () => {
    const fixture = clone(baseFixture);
    fixture.source.expected_job_id = "42";
    const child = invoke(fixture);
    assert.notEqual(child.status, 0);
    assert.match(child.stderr + child.stdout, /V883_JOB_ID_TYPE_INVALID/);
  });

  check("invalid identity binding is rejected", () => {
    const fixture = clone(baseFixture);
    fixture.context.intent_fingerprint = "not-a-hash";
    const child = invoke(fixture);
    assert.notEqual(child.status, 0);
    assert.match(child.stderr + child.stdout, /V883_CONTEXT_IDENTITY_INVALID/);
  });

  check("numeric context field is rejected instead of coerced", () => {
    const fixture = clone(baseFixture);
    fixture.context.store_id = 123;
    const child = invoke(fixture);
    assert.notEqual(child.status, 0);
    assert.match(child.stderr + child.stdout, /V883_CONTEXT_STRING_TYPE_INVALID/);
  });

  check("non-canonical time is rejected", () => {
    const fixture = clone(baseFixture);
    fixture.context.observed_at = "2026-10-25T05:00:02Z";
    const child = invoke(fixture);
    assert.notEqual(child.status, 0);
    assert.match(child.stderr + child.stdout, /V883_TIME_NOT_CANONICAL/);
  });

  check("fixture outside RUNNER_TEMP is rejected before content read", () => {
    const child = invoke(baseFixture, __filename);
    assert.notEqual(child.status, 0);
    assert.match(child.stderr + child.stdout, /V883_FIXTURE_OUTSIDE_RUNNER_TEMP/);
  });

  console.log(
    `PRINT_ATTEMPT_SOURCE_COLLECTOR_V883_WINDOWS=${checks}/${checks} DISPOSABLE_FIXTURE V882_COMPOSED NO_HOST NO_PRINT NO_SIGNATURE`,
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
