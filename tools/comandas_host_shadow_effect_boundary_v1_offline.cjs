"use strict";
// Static REVIEW_ONLY gate. It NEVER launches the candidate consumer or opens
// Reader/SQL/printer resources; it inspects Git-tracked UTF-8 source bytes.
// This receipt is not host isolation, source attestation or permission to pilot.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const CONSUMER = "runtime/shadow/live_shadow_consumer_v2_candidate_v714.cjs";
const MANIFEST = "docs/comandas/CANDIDATA_HOMOLOGACAO_CADEIA_NATIVA_V1.manifest.json";
const EXPECTED_KNOWN_HAZARDS = Object.freeze([
  "FILE_WRITE_DECLARED_IN_MANIFEST",
  "OPERATIONAL_READER_STATE_REFERENCE",
  "UNCONFINED_OUTPUT_FILE_WRITE",
  "UNREDACTED_RESULT_STDOUT",
]);

function inspect(manifest, source) {
  const reasons = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    reasons.push("INVALID_MANIFEST");
  } else {
    if (manifest.schema !== "tata.comandas.homologation-candidate.v1" ||
        manifest.scope !== "SHADOW_NATIVE_CHAIN_NO_PRINT" ||
        !Array.isArray(manifest.code) ||
        !manifest.code.some(e => e && e.path === CONSUMER) ||
        !Array.isArray(manifest.entries) || !manifest.entries.includes(CONSUMER)) {
      reasons.push("MANIFEST_CONTRACT_UNVERIFIED");
    }
    if (manifest.capability_flags?.file_write?.includes(CONSUMER)) {
      reasons.push("FILE_WRITE_DECLARED_IN_MANIFEST");
    }
    if (manifest.effects?.print !== false ||
        manifest.effects?.service !== false ||
        manifest.effects?.install !== false ||
        manifest.effects?.sequence_write !== false) {
      reasons.push("EFFECT_CONTRACT_MISSING_OR_UNSAFE");
    }
  }
  if (typeof source !== "string" || source.length === 0) {
    reasons.push("CONSUMER_SOURCE_MISSING");
  } else {
    if (/ProgramData.{0,90}TataComandaReader/s.test(source)) {
      reasons.push("OPERATIONAL_READER_STATE_REFERENCE");
    }
    if (/writeAtomicJson\s*\(\s*outPath\s*,\s*result\s*\)/.test(source) ||
        (/fs\.writeFileSync\s*\(/.test(source) && /process\.argv\s*\[\s*3\s*\]/.test(source))) {
      reasons.push("UNCONFINED_OUTPUT_FILE_WRITE");
    }
    if (/process\.stdout\.write\s*\(\s*JSON\.stringify\s*\(\s*result\s*\)/.test(source)) {
      reasons.push("UNREDACTED_RESULT_STDOUT");
    }
  }
  // Static inspection cannot prove OS ACLs, privacy of logs or runtime behavior;
  // even removing the known hazards does not grant host execution authority.
  reasons.push("HOST_ISOLATION_NOT_PROVEN");
  reasons.push("OPERATIONAL_AUTHORIZATION_NOT_GRANTED");
  return {
    schema: "tata.comandas.host-shadow-effect-boundary.review-only.v1",
    status: "HOLD",
    candidate: CONSUMER,
    reasons: [...new Set(reasons)].sort(),
    observed_paper_census: false,
    source_attested: false,
    host_isolation_proven: false,
    permitted_actions: {
      run_on_cash_register: false,
      read_reader_state: false,
      read_live_orders: false,
      write_files_on_host: false,
      print: false,
      change_service: false,
      change_sql: false,
      reserve_sequence: false,
      merge_or_deploy: false,
    },
  };
}

function runTests() {
  const manifest = {
    schema: "tata.comandas.homologation-candidate.v1",
    scope: "SHADOW_NATIVE_CHAIN_NO_PRINT",
    entries: [CONSUMER],
    code: [{path: CONSUMER}],
    capability_flags: {file_write: [CONSUMER]},
    effects: {install:false, service:false, print:false, sequence_write:false},
  };
  const source = [
    'const seqPath = "C:\\\\ProgramData\\\\TataComandaReader\\\\state\\\\tata-sequence-state.json";',
    'if (outPath) writeAtomicJson(outPath, result);',
    'process.stdout.write(JSON.stringify(result) + "\\n");',
  ].join("\n");
  const r = inspect(manifest, source);
  for (const hazard of EXPECTED_KNOWN_HAZARDS) assert(r.reasons.includes(hazard), hazard);
  assert.equal(r.status,"HOLD");
  assert(Object.values(r.permitted_actions).every(v=>v === false));
  assert(!r.reasons.includes("EFFECT_CONTRACT_MISSING_OR_UNSAFE"));
  assert(inspect({},source).reasons.includes("MANIFEST_CONTRACT_UNVERIFIED"));
  assert(inspect(null,source).reasons.includes("INVALID_MANIFEST"));
  assert(inspect(manifest,"").reasons.includes("CONSUMER_SOURCE_MISSING"));
  assert(inspect({...manifest,effects:{...manifest.effects,print:true}},source)
    .reasons.includes("EFFECT_CONTRACT_MISSING_OR_UNSAFE"));
  const noHazards = inspect({...manifest,capability_flags:{file_write:[]}},"// Safe placeholder");
  assert.equal(noHazards.status,"HOLD");
  assert(noHazards.reasons.includes("HOST_ISOLATION_NOT_PROVEN"));
  assert(noHazards.reasons.includes("OPERATIONAL_AUTHORIZATION_NOT_GRANTED"));
  assert(!noHazards.reasons.includes("UNREDACTED_RESULT_STDOUT"));
  assert(!noHazards.reasons.includes("UNCONFINED_OUTPUT_FILE_WRITE"));
  assert(!noHazards.reasons.includes("OPERATIONAL_READER_STATE_REFERENCE"));
  console.log("COMANDAS_HOST_SHADOW_BOUNDARY_V1_OFFLINE_SELF_TEST=PASS HOLD NO_HOST_IO");
}

function runRepositoryAudit() {
  const repoRoot = path.resolve(__dirname,"..");
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot,MANIFEST),"utf8"));
  const source = fs.readFileSync(path.join(repoRoot,CONSUMER),"utf8");
  const report = inspect(manifest,source);
  for (const expected of EXPECTED_KNOWN_HAZARDS) {
    assert(report.reasons.includes(expected),
      "CHANGED_CANDIDATE_REQUIRES_EXPLICIT_REVIEW: " + expected);
  }
  assert(report.reasons.includes("HOST_ISOLATION_NOT_PROVEN"));
  assert(Object.values(report.permitted_actions).every(v=>v === false));
  console.log(JSON.stringify(report));
  console.log("COMANDAS_HOST_SHADOW_BOUNDARY_V1=HOLD KNOWN_HAZARDS=4/4 NO_HOST_IO");
}

if (require.main === module) {
  if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== "--self-test")) {
    throw new Error("REVIEW_ONLY_NO_INPUTS_OR_HOST_TARGETS_ALLOWED");
  }
  if (process.argv[2] === "--self-test") runTests();
  else runRepositoryAudit();
}
module.exports = {inspect};
