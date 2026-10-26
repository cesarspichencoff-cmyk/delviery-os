"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  PROPOSAL_SCHEMA,
  ASSESSMENT_SCHEMA,
  EVENT_LOG_SOURCE,
  SPOOLER_SOURCE,
  EVENT_LOG_NAME,
  EXPECTED_ACCESS,
  EXPECTED_OPERATIONS,
  EXPECTED_OUTPUT_FIELDS,
  COEXISTENCE_FIELDS,
  evaluatePrintSourceAccessProposalV884,
} = require("./comandas_print_source_access_v884_review_only.cjs");

const clone = (value) => structuredClone(value);
const hash = (letter) => letter.repeat(64);
const base = Object.freeze({
  schema: PROPOSAL_SCHEMA,
  actors: {
    collector_instance_id: "collector:eventlog_review_0001",
    collector_service_sid: "S-1-5-80-111-222-333-444-555",
    submitter_instance_id: "submitter:tata_sidecar_0001",
    submitter_service_sid: "S-1-5-80-666-777-888-999-1000",
    gp_teknisa_actor_set_sha256: hash("a"),
  },
  source: {
    kind: EVENT_LOG_SOURCE,
    windows_channel: EVENT_LOG_NAME,
    requested_access: [...EXPECTED_ACCESS],
    requested_operations: [...EXPECTED_OPERATIONS],
    max_records: 64,
    max_duration_ms: 2_000,
    channel_enablement_change_requested: false,
    raw_event_retention: "MEMORY_ONLY_UNTIL_SANITIZED",
  },
  privacy: {
    allowed_output_fields: [...EXPECTED_OUTPUT_FIELDS],
    document_name_exported: false,
    user_name_exported: false,
    machine_name_exported: false,
    printer_name_exported: false,
    port_name_exported: false,
    raw_event_exported: false,
    raw_event_persisted: false,
    order_id_exported: false,
  },
  coexistence: Object.fromEntries(COEXISTENCE_FIELDS.map((field) => [field, false])),
});

let checks = 0;
function check(name, fn) {
  try {
    fn();
    checks += 1;
    console.log(`PASS ${checks} ${name}`);
  } catch (error) {
    error.message = `V884 ${name}: ${error.message}`;
    throw error;
  }
}
function noAuthority(output) {
  assert.equal(output.schema, ASSESSMENT_SCHEMA);
  for (const field of [
    "direct_spooler_readonly_supported",
    "actual_collector_service_sid_proven",
    "actual_submitter_service_sid_proven",
    "actual_gp_teknisa_actor_set_proven",
    "actual_effective_token_membership_proven",
    "actual_event_log_channel_enabled_proven",
    "actual_event_log_channel_read_acl_proven",
    "attempt_binding_without_sensitive_fields_proven",
    "event_307_is_physical_paper_proof",
    "independent_failure_domain_proven",
    "independent_custody_proven",
    "coexistence_under_operational_load_proven",
    "authorizes_live_read",
    "authorizes_install",
    "authorizes_service_change",
    "authorizes_print",
    "authorizes_reprint",
    "automatic_retry_allowed",
    "fiscal_dispatch_ready",
  ]) {
    assert.equal(output[field], false, field);
  }
  assert.ok(output.raw_event_source_contains_sensitive_fields);
  assert.ok(Object.values(output.effects).every((value) => value === false));
}
function review(value = base) {
  const output = evaluatePrintSourceAccessProposalV884(value);
  noAuthority(output);
  assert.equal(
    output.status,
    "REVIEW_ONLY_EVENT_LOG_CANDIDATE_REQUIRES_EXTERNAL_PROOF",
  );
  assert.deepEqual(output.reasons, []);
  assert.equal(output.candidate_source, EVENT_LOG_SOURCE);
  assert.equal(output.event_log_candidate_structurally_reviewed, true);
  assert.equal(output.requested_source_avoids_printer_handle_and_spooler_rpc, true);
  return output;
}
function hold(value, reason) {
  const output = evaluatePrintSourceAccessProposalV884(value);
  noAuthority(output);
  assert.equal(output.status, "HOLD");
  assert.ok(output.reasons.includes(reason), JSON.stringify(output));
  assert.equal(output.candidate_source, null);
}

check("minimal event-log proposal is review-only, never live authority", () => review());
check("caller proof booleans cannot be smuggled into the envelope", () =>
  hold({ ...clone(base), live_acl_proven: true }, "PROPOSAL_ENVELOPE_INVALID"));
check("null proposal holds", () => hold(null, "PROPOSAL_ENVELOPE_INVALID"));
check("array proposal holds", () => hold([], "PROPOSAL_ENVELOPE_INVALID"));
check("production-authorized schema is rejected", () =>
  hold({ ...clone(base), schema: "PRODUCTION_AUTHORIZED" }, "PROPOSAL_SCHEMA_INVALID"));
check("collector instance must be valid", () => {
  const value = clone(base); value.actors.collector_instance_id = "collector:x";
  hold(value, "ACTOR_IDENTITY_FORMAT_INVALID");
});
check("submitter instance must be valid", () => {
  const value = clone(base); value.actors.submitter_instance_id = "submitter:x";
  hold(value, "ACTOR_IDENTITY_FORMAT_INVALID");
});
check("collector service SID must be a service SID", () => {
  const value = clone(base); value.actors.collector_service_sid = "S-1-5-18";
  hold(value, "ACTOR_IDENTITY_FORMAT_INVALID");
});
check("submitter service SID must be a service SID", () => {
  const value = clone(base); value.actors.submitter_service_sid = "S-1-5-19";
  hold(value, "ACTOR_IDENTITY_FORMAT_INVALID");
});
check("GP/Teknisa actor-set pin must be a lowercase hash", () => {
  const value = clone(base); value.actors.gp_teknisa_actor_set_sha256 = "A".repeat(64);
  hold(value, "ACTOR_IDENTITY_FORMAT_INVALID");
});
check("collector and submitter service SIDs must differ", () => {
  const value = clone(base); value.actors.submitter_service_sid = value.actors.collector_service_sid;
  hold(value, "COLLECTOR_NOT_DISTINCT_FROM_SUBMITTER");
});
check("unexpected actor field is rejected", () => {
  const value = clone(base); value.actors.human_approved = true;
  hold(value, "ACTOR_ENVELOPE_INVALID");
});

for (const [name, access] of [
  ["PRINTER_READ", "PRINTER_READ"],
  ["PRINTER_WRITE", "PRINTER_WRITE"],
  ["PRINTER_EXECUTE", "PRINTER_EXECUTE"],
  ["PRINTER_ACCESS_USE", "PRINTER_ACCESS_USE"],
  ["PRINTER_ACCESS_ADMINISTER", "PRINTER_ACCESS_ADMINISTER"],
  ["PRINTER_ACCESS_MANAGE_LIMITED", "PRINTER_ACCESS_MANAGE_LIMITED"],
  ["JOB_ACCESS_ADMINISTER", "JOB_ACCESS_ADMINISTER"],
  ["JOB_ALL_ACCESS", "JOB_ALL_ACCESS"],
  ["PRINTER_ALL_ACCESS", "PRINTER_ALL_ACCESS"],
]) {
  check(`${name} is not accepted as read-only`, () => {
    const value = clone(base);
    value.source.kind = SPOOLER_SOURCE;
    value.source.requested_access = [access];
    const output = evaluatePrintSourceAccessProposalV884(value);
    noAuthority(output);
    assert.equal(output.status, "HOLD");
    assert.equal(output.requested_source_avoids_printer_handle_and_spooler_rpc, false);
    assert.ok(output.reasons.includes("DIRECT_SPOOLER_SOURCE_HAS_NO_STRICT_READ_ONLY_ACCESS_MODEL"));
    assert.ok(output.reasons.includes("SPOOLER_RIGHT_GRANTS_PRINT_OR_ADMIN_CAPABILITY"));
  });
}
check("direct spooler source is rejected even with no named right", () => {
  const value = clone(base); value.source.kind = SPOOLER_SOURCE;
  const output = evaluatePrintSourceAccessProposalV884(value);
  noAuthority(output);
  assert.equal(output.status, "HOLD");
  assert.equal(output.requested_source_avoids_printer_handle_and_spooler_rpc, false);
  assert.ok(output.reasons.includes("DIRECT_SPOOLER_SOURCE_HAS_NO_STRICT_READ_ONLY_ACCESS_MODEL"));
});
check("unknown source kind holds", () => {
  const value = clone(base); value.source.kind = "FUTURE_UNKNOWN_SOURCE";
  hold(value, "SOURCE_KIND_UNRECOGNIZED");
});
check("event-log channel must be exact", () => {
  const value = clone(base); value.source.windows_channel = "Application";
  hold(value, "EVENT_LOG_CHANNEL_NOT_EXACT");
});
check("event-log access cannot request extra rights", () => {
  const value = clone(base); value.source.requested_access.push("EVENTLOG_CLEAR_CHANNEL");
  hold(value, "REQUESTED_ACCESS_NOT_MINIMAL_OR_NON_CANONICAL");
});
check("event-log label cannot hide a spooler right", () => {
  const value = clone(base); value.source.requested_access = ["PRINTER_READ"];
  const output = evaluatePrintSourceAccessProposalV884(value);
  noAuthority(output);
  assert.equal(output.status, "HOLD");
  assert.equal(output.requested_source_avoids_printer_handle_and_spooler_rpc, false);
  assert.ok(output.reasons.includes("SPOOLER_RIGHT_GRANTS_PRINT_OR_ADMIN_CAPABILITY"));
});
check("operations must be sorted", () => {
  const value = clone(base); value.source.requested_operations.reverse();
  hold(value, "REQUESTED_OPERATIONS_NOT_MINIMAL_OR_NON_CANONICAL");
});
check("operations cannot be duplicated", () => {
  const value = clone(base); value.source.requested_operations.push("READ_EXISTING_EVENTS");
  hold(value, "REQUESTED_OPERATIONS_NOT_MINIMAL_OR_NON_CANONICAL");
});
check("event 307 filter cannot be omitted", () => {
  const value = clone(base); value.source.requested_operations = ["READ_EXISTING_EVENTS"];
  hold(value, "REQUESTED_OPERATIONS_NOT_MINIMAL_OR_NON_CANONICAL");
});
check("record count must be positive", () => {
  const value = clone(base); value.source.max_records = 0;
  hold(value, "MAX_RECORDS_INVALID");
});
check("record count must remain bounded", () => {
  const value = clone(base); value.source.max_records = 257;
  hold(value, "MAX_RECORDS_INVALID");
});
check("duration cannot be too short to be meaningful", () => {
  const value = clone(base); value.source.max_duration_ms = 99;
  hold(value, "MAX_DURATION_INVALID");
});
check("duration cannot exceed ten seconds", () => {
  const value = clone(base); value.source.max_duration_ms = 10_001;
  hold(value, "MAX_DURATION_INVALID");
});
check("collector may not enable the event-log channel", () => {
  const value = clone(base); value.source.channel_enablement_change_requested = true;
  hold(value, "EVENT_LOG_ENABLEMENT_CHANGE_FORBIDDEN");
});
check("raw event may not be retained", () => {
  const value = clone(base); value.source.raw_event_retention = "WRITE_ARCHIVE";
  hold(value, "RAW_EVENT_RETENTION_INVALID");
});
check("unexpected source field is rejected", () => {
  const value = clone(base); value.source.computer_name = "MUST_NOT_EXIST";
  hold(value, "SOURCE_ENVELOPE_INVALID");
});

for (const field of [
  "document_name_exported",
  "user_name_exported",
  "machine_name_exported",
  "printer_name_exported",
  "port_name_exported",
  "raw_event_exported",
  "raw_event_persisted",
  "order_id_exported",
]) {
  check(`${field} is forbidden`, () => {
    const value = clone(base); value.privacy[field] = true;
    hold(value, `PRIVACY_EXPORT_FORBIDDEN:${field}`);
  });
}
check("output allowlist cannot include document name", () => {
  const value = clone(base); value.privacy.allowed_output_fields.push("document_name");
  hold(value, "OUTPUT_ALLOWLIST_INVALID_OR_NON_CANONICAL");
});
check("output allowlist must remain canonical", () => {
  const value = clone(base); value.privacy.allowed_output_fields.reverse();
  hold(value, "OUTPUT_ALLOWLIST_INVALID_OR_NON_CANONICAL");
});
check("unexpected privacy field is rejected", () => {
  const value = clone(base); value.privacy.customer_name_exported = false;
  hold(value, "PRIVACY_ENVELOPE_INVALID");
});

for (const field of COEXISTENCE_FIELDS) {
  check(`${field} prevents a coexistence candidate`, () => {
    const value = clone(base); value.coexistence[field] = true;
    hold(value, `COEXISTENCE_EFFECT_FORBIDDEN:${field}`);
  });
}
check("unexpected coexistence field is rejected", () => {
  const value = clone(base); value.coexistence.gp_approved = true;
  hold(value, "COEXISTENCE_ENVELOPE_INVALID");
});
check("review output always preserves seven external gates", () => {
  const output = review();
  assert.equal(output.next_gate.length, 7);
  assert.ok(output.next_gate.includes("OBTAIN_SEPARATE_AUTHORIZATION_BEFORE_ANY_LIVE_HOST_READ"));
});
check("module has no host, event-log, spooler, file, process or network capability", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "comandas_print_source_access_v884_review_only.cjs"),
    "utf8",
  );
  assert.doesNotMatch(source, /require\(["']node:(?:fs|net|http|https|child_process|worker_threads)["']\)/);
  assert.doesNotMatch(source, /\b(?:Get-WinEvent|OpenPrinter|EnumJobs|Get-PrintJob|SetJob|StartDocPrinter|WritePrinter|spawn|exec|fetch)\s*\(/i);
});

assert.equal(checks, 65, "V884_NUMBER_OF_CASES_DRIFT");
console.log(
  `PRINT_SOURCE_ACCESS_V884=${checks}/${checks} OFFLINE DIRECT_SPOOLER_REJECTED EVENT_LOG_CANDIDATE_ONLY NO_HOST NO_PRINT NO_GP_TEKNISA_EFFECT`,
);
