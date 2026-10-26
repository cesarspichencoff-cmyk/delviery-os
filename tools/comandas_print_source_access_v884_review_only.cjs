"use strict";

/**
 * V8.84 — pure review of a proposed print-observation access boundary.
 *
 * Windows printer PRINTER_READ/WRITE/EXECUTE all include
 * PRINTER_ACCESS_USE. A direct queue handle therefore is not accepted as a
 * strictly read-only source. This module has no Windows, host, file, network,
 * service, event-log or spooler capability; it reviews proposal data only.
 */
const PROPOSAL_SCHEMA =
  "deliveryos.print-source-access-proposal.v884.review-only";
const ASSESSMENT_SCHEMA =
  "deliveryos.print-source-access-assessment.v884.review-only";
const EVENT_LOG_SOURCE =
  "PRINTSERVICE_OPERATIONAL_EVENT_LOG_EXISTING_CHANNEL";
const SPOOLER_SOURCE = "WINDOWS_SPOOLER_QUEUE_API";
const EVENT_LOG_NAME = "Microsoft-Windows-PrintService/Operational";

const ROOT_FIELDS = Object.freeze([
  "schema",
  "actors",
  "source",
  "privacy",
  "coexistence",
]);
const ACTOR_FIELDS = Object.freeze([
  "collector_instance_id",
  "collector_service_sid",
  "submitter_instance_id",
  "submitter_service_sid",
  "gp_teknisa_actor_set_sha256",
]);
const SOURCE_FIELDS = Object.freeze([
  "kind",
  "windows_channel",
  "requested_access",
  "requested_operations",
  "max_records",
  "max_duration_ms",
  "channel_enablement_change_requested",
  "raw_event_retention",
]);
const PRIVACY_FIELDS = Object.freeze([
  "allowed_output_fields",
  "document_name_exported",
  "user_name_exported",
  "machine_name_exported",
  "printer_name_exported",
  "port_name_exported",
  "raw_event_exported",
  "raw_event_persisted",
  "order_id_exported",
]);
const COEXISTENCE_FIELDS = Object.freeze([
  "printer_handle_opened",
  "spooler_rpc_used",
  "print_submission_capability_requested",
  "job_admin_capability_requested",
  "printer_admin_capability_requested",
  "gp_process_injection",
  "teknisa_process_injection",
  "gp_file_or_config_read",
  "teknisa_file_or_config_read",
  "service_control_requested",
  "event_log_configuration_change_requested",
  "network_egress_requested",
  "filesystem_write_requested",
  "fiscal_or_sefaz_requested",
  "sequence_write_requested",
]);
const EXPECTED_ACCESS = Object.freeze(["EVENTLOG_READ_CHANNEL"]);
const EXPECTED_OPERATIONS = Object.freeze([
  "FILTER_EVENT_ID_307",
  "READ_EXISTING_EVENTS",
]);
const EXPECTED_OUTPUT_FIELDS = Object.freeze([
  "event_record_id_sha256",
  "job_id",
  "observed_at",
  "source_snapshot_sha256",
  "status_code",
]);
const SPOOLER_RIGHTS = new Set([
  "PRINTER_READ",
  "PRINTER_WRITE",
  "PRINTER_EXECUTE",
  "PRINTER_ACCESS_USE",
  "PRINTER_ACCESS_ADMINISTER",
  "PRINTER_ACCESS_MANAGE_LIMITED",
  "PRINTER_ALL_ACCESS",
  "JOB_ACCESS_ADMINISTER",
  "JOB_ALL_ACCESS",
]);
const HEX64 = /^[0-9a-f]{64}$/;
const COLLECTOR = /^collector:[a-z0-9._-]{8,96}$/;
const SUBMITTER = /^submitter:[a-z0-9._-]{8,96}$/;
const SERVICE_SID = /^S-1-5-80-(?:[0-9]{1,10}-){4}[0-9]{1,10}$/;

function object(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, fields) {
  if (!object(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  return JSON.stringify(keys) === JSON.stringify(expected);
}

function canonicalList(value, max = 32) {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    !value.every(
      (item) =>
        typeof item === "string" && item.length >= 1 && item.length <= 96,
    )
  ) {
    return false;
  }
  return (
    JSON.stringify(value) === JSON.stringify([...new Set(value)].sort())
  );
}

function exactList(value, expected) {
  return canonicalList(value) && JSON.stringify(value) === JSON.stringify(expected);
}

function result(reasons, structural) {
  return Object.freeze({
    schema: ASSESSMENT_SCHEMA,
    status:
      reasons.length === 0
        ? "REVIEW_ONLY_EVENT_LOG_CANDIDATE_REQUIRES_EXTERNAL_PROOF"
        : "HOLD",
    reasons: Object.freeze([...new Set(reasons)].sort()),
    candidate_source: reasons.length === 0 ? EVENT_LOG_SOURCE : null,
    direct_spooler_readonly_supported: false,
    event_log_candidate_structurally_reviewed: reasons.length === 0,
    proposed_actor_separation_structurally_satisfied:
      structural.actorSeparation,
    proposed_privacy_minimization_structurally_satisfied:
      structural.privacy,
    proposed_gp_teknisa_non_interference_structurally_satisfied:
      structural.coexistence,
    requested_source_avoids_printer_handle_and_spooler_rpc:
      structural.noSpooler,
    raw_event_source_contains_sensitive_fields: true,
    actual_collector_service_sid_proven: false,
    actual_submitter_service_sid_proven: false,
    actual_gp_teknisa_actor_set_proven: false,
    actual_effective_token_membership_proven: false,
    actual_event_log_channel_enabled_proven: false,
    actual_event_log_channel_read_acl_proven: false,
    attempt_binding_without_sensitive_fields_proven: false,
    event_307_is_physical_paper_proof: false,
    independent_failure_domain_proven: false,
    independent_custody_proven: false,
    coexistence_under_operational_load_proven: false,
    authorizes_live_read: false,
    authorizes_install: false,
    authorizes_service_change: false,
    authorizes_print: false,
    authorizes_reprint: false,
    automatic_retry_allowed: false,
    fiscal_dispatch_ready: false,
    effects: Object.freeze({
      print: false,
      reprint: false,
      spooler_read: false,
      spooler_write: false,
      event_log_read: false,
      event_log_change: false,
      gp_teknisa_access: false,
      filesystem_write: false,
      network: false,
      service_change: false,
      fiscal: false,
      sequence_write: false,
      install: false,
      deploy: false,
    }),
    next_gate: Object.freeze([
      "EXTERNALLY_PROVE_ACTUAL_COLLECTOR_AND_SUBMITTER_SERVICE_SIDS",
      "EXTERNALLY_PROVE_COLLECTOR_TOKEN_EXCLUDES_GP_TEKNISA_ACTORS",
      "EXTERNALLY_PROVE_CHANNEL_SPECIFIC_READ_WITHOUT_WRITE_OR_CLEAR",
      "PROVE_EXISTING_CHANNEL_WITHOUT_ENABLEMENT_CHANGE",
      "PROVE_ATTEMPT_BINDING_WITHOUT_EXPORTING_SENSITIVE_EVENT_FIELDS",
      "PROVE_BOUNDED_FAILURE_AND_OPERATIONAL_LOAD_BEHAVIOR",
      "OBTAIN_SEPARATE_AUTHORIZATION_BEFORE_ANY_LIVE_HOST_READ",
    ]),
  });
}

function evaluatePrintSourceAccessProposalV884(value) {
  const reasons = [];
  const structural = {
    actorSeparation: false,
    privacy: false,
    coexistence: false,
    eventLogRoute: false,
    noSpooler: false,
  };
  if (!exactKeys(value, ROOT_FIELDS)) {
    return result(["PROPOSAL_ENVELOPE_INVALID"], structural);
  }
  if (value.schema !== PROPOSAL_SCHEMA) {
    reasons.push("PROPOSAL_SCHEMA_INVALID");
  }

  const actors = value.actors;
  if (!exactKeys(actors, ACTOR_FIELDS)) {
    reasons.push("ACTOR_ENVELOPE_INVALID");
  } else {
    if (
      !COLLECTOR.test(actors.collector_instance_id) ||
      !SUBMITTER.test(actors.submitter_instance_id) ||
      !SERVICE_SID.test(actors.collector_service_sid) ||
      !SERVICE_SID.test(actors.submitter_service_sid) ||
      !HEX64.test(actors.gp_teknisa_actor_set_sha256)
    ) {
      reasons.push("ACTOR_IDENTITY_FORMAT_INVALID");
    } else if (
      actors.collector_instance_id === actors.submitter_instance_id ||
      actors.collector_service_sid === actors.submitter_service_sid
    ) {
      reasons.push("COLLECTOR_NOT_DISTINCT_FROM_SUBMITTER");
    } else {
      structural.actorSeparation = true;
    }
  }

  const source = value.source;
  if (!exactKeys(source, SOURCE_FIELDS)) {
    reasons.push("SOURCE_ENVELOPE_INVALID");
  } else {
    if (source.kind === SPOOLER_SOURCE) {
      reasons.push("DIRECT_SPOOLER_SOURCE_HAS_NO_STRICT_READ_ONLY_ACCESS_MODEL");
    } else if (source.kind !== EVENT_LOG_SOURCE) {
      reasons.push("SOURCE_KIND_UNRECOGNIZED");
    }
    if (source.windows_channel !== EVENT_LOG_NAME) {
      reasons.push("EVENT_LOG_CHANNEL_NOT_EXACT");
    }
    if (!exactList(source.requested_access, EXPECTED_ACCESS)) {
      reasons.push("REQUESTED_ACCESS_NOT_MINIMAL_OR_NON_CANONICAL");
    }
    if (!exactList(source.requested_operations, EXPECTED_OPERATIONS)) {
      reasons.push("REQUESTED_OPERATIONS_NOT_MINIMAL_OR_NON_CANONICAL");
    }
    if (
      Array.isArray(source.requested_access) &&
      source.requested_access.some((right) => SPOOLER_RIGHTS.has(right))
    ) {
      reasons.push("SPOOLER_RIGHT_GRANTS_PRINT_OR_ADMIN_CAPABILITY");
    }
    if (
      !Number.isSafeInteger(source.max_records) ||
      source.max_records < 1 ||
      source.max_records > 256
    ) {
      reasons.push("MAX_RECORDS_INVALID");
    }
    if (
      !Number.isSafeInteger(source.max_duration_ms) ||
      source.max_duration_ms < 100 ||
      source.max_duration_ms > 10_000
    ) {
      reasons.push("MAX_DURATION_INVALID");
    }
    if (source.channel_enablement_change_requested !== false) {
      reasons.push("EVENT_LOG_ENABLEMENT_CHANGE_FORBIDDEN");
    }
    if (source.raw_event_retention !== "MEMORY_ONLY_UNTIL_SANITIZED") {
      reasons.push("RAW_EVENT_RETENTION_INVALID");
    }
    structural.eventLogRoute =
      source.kind === EVENT_LOG_SOURCE &&
      source.windows_channel === EVENT_LOG_NAME &&
      exactList(source.requested_access, EXPECTED_ACCESS) &&
      exactList(source.requested_operations, EXPECTED_OPERATIONS);
  }

  const privacy = value.privacy;
  if (!exactKeys(privacy, PRIVACY_FIELDS)) {
    reasons.push("PRIVACY_ENVELOPE_INVALID");
  } else {
    if (!exactList(privacy.allowed_output_fields, EXPECTED_OUTPUT_FIELDS)) {
      reasons.push("OUTPUT_ALLOWLIST_INVALID_OR_NON_CANONICAL");
    }
    const privacyClaims = PRIVACY_FIELDS.filter(
      (field) => field !== "allowed_output_fields",
    );
    const enabled = privacyClaims.filter((field) => privacy[field] !== false);
    if (enabled.length > 0) {
      reasons.push(...enabled.map((field) => `PRIVACY_EXPORT_FORBIDDEN:${field}`));
    } else if (exactList(privacy.allowed_output_fields, EXPECTED_OUTPUT_FIELDS)) {
      structural.privacy = true;
    }
  }

  const coexistence = value.coexistence;
  if (!exactKeys(coexistence, COEXISTENCE_FIELDS)) {
    reasons.push("COEXISTENCE_ENVELOPE_INVALID");
  } else {
    const requested = COEXISTENCE_FIELDS.filter(
      (field) => coexistence[field] !== false,
    );
    if (requested.length > 0) {
      reasons.push(
        ...requested.map((field) => `COEXISTENCE_EFFECT_FORBIDDEN:${field}`),
      );
    } else {
      structural.coexistence = true;
      structural.noSpooler =
        structural.eventLogRoute &&
        coexistence.printer_handle_opened === false &&
        coexistence.spooler_rpc_used === false;
    }
  }

  return result(reasons, structural);
}

module.exports = Object.freeze({
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
});
