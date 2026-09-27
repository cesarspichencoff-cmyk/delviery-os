export const TALLY_BARRIER_BRIDGE_VERSION =
  "watch-tally-barrier-evidence@0.1.0";

export class TallyBarrierBridgeError extends Error {
  constructor(code) {
    super(code);
    this.name = "TallyBarrierBridgeError";
    this.code = code;
  }
}

const INPUT_KEYS = Object.freeze([
  "source",
  "truth_class",
  "event_id",
  "submission_id",
  "respondent_id",
  "form_id",
  "source_created_at",
  "operator_name",
  "business_date",
  "shift",
  "category",
  "reference_text",
  "happened_text",
  "action_text",
  "status",
  "subtype",
  "item_missing_barriers",
  "wrong_item_barriers",
  "attention_authority",
  "external_effect_authorized",
]);

const REPORT_STATUSES = new Set([
  "REPORTED_DONE",
  "REPORTED_NOT_DONE",
  "UNABLE_TO_CONFIRM",
  "REPORTED_NOT_APPLICABLE",
]);

const ITEM_MISSING_BARRIERS = Object.freeze({
  "Item identificado antes de seguir": "IDENTIFY_BEFORE_ADVANCE",
  "Todos os volumes reunidos": "REUNITE_COMPLETE_ORDER",
  "Conferência física após impressão/ajuste": "PHYSICAL_POST_PRINT_CHECK",
  "Conferência final antes da saída": "FINAL_DIVERGENCE_CONFERENCE",
});

const WRONG_ITEM_BARRIERS = Object.freeze({
  "Produto e quantidade conferiam": "EXACT_PRODUCT_QUANTITY_MATCH",
  "Observações do cliente conferidas": "CUSTOMER_OBSERVATION_CHECK",
  "Correção manual conferida fisicamente quando aplicável":
    "MANUAL_CORRECTION_PHYSICAL_CHECK",
  "Conferência final antes da saída": "FINAL_DIVERGENCE_CONFERENCE",
});

const SAFE_ID = /^[A-Za-z0-9._:-]{1,220}$/;

function assertObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TallyBarrierBridgeError(code);
  }
}

function assertExactKeys(value, expected, code) {
  assertObject(value, code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new TallyBarrierBridgeError(code);
  }
}

function assertSafeId(value, code) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new TallyBarrierBridgeError(code);
  }
}

function assertIso(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new TallyBarrierBridgeError(code);
  }
}

function assertBusinessDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TallyBarrierBridgeError("tally_bridge_business_date_invalid");
  }
  const parsed = new Date(value + "T00:00:00.000Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new TallyBarrierBridgeError("tally_bridge_business_date_invalid");
  }
}

function assertNonEmptyText(value, code) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TallyBarrierBridgeError(code);
  }
}

function projectMatrix(value, expectedMap, active, code) {
  if (!active) {
    if (value !== null) {
      throw new TallyBarrierBridgeError(code + "_inactive_present");
    }
    return [];
  }

  assertExactKeys(value, Object.keys(expectedMap), code + "_shape_invalid");
  return Object.entries(expectedMap).map(([label, barrierId]) => {
    const reportedStatus = value[label];
    if (!REPORT_STATUSES.has(reportedStatus)) {
      throw new TallyBarrierBridgeError(code + "_status_invalid");
    }
    return {
      barrier_id: barrierId,
      reported_status: reportedStatus,
    };
  });
}

export function projectTallyBarrierEvidence(input, expectedFormId) {
  assertExactKeys(input, INPUT_KEYS, "tally_bridge_input_shape_invalid");
  assertSafeId(expectedFormId, "tally_bridge_expected_form_id_invalid");

  if (input.source !== "tally_occurrence_barrier") {
    throw new TallyBarrierBridgeError("tally_bridge_source_invalid");
  }
  if (input.truth_class !== "OPERATOR_SELF_REPORT") {
    throw new TallyBarrierBridgeError("tally_bridge_truth_class_invalid");
  }
  if (input.attention_authority !== "NONE") {
    throw new TallyBarrierBridgeError("tally_bridge_attention_authority_forbidden");
  }
  if (input.external_effect_authorized !== false) {
    throw new TallyBarrierBridgeError("tally_bridge_external_effect_forbidden");
  }

  assertSafeId(input.event_id, "tally_bridge_event_id_invalid");
  assertSafeId(input.submission_id, "tally_bridge_submission_id_invalid");
  assertSafeId(input.form_id, "tally_bridge_form_id_invalid");
  if (input.form_id !== expectedFormId) {
    throw new TallyBarrierBridgeError("tally_bridge_form_id_mismatch");
  }

  assertIso(input.source_created_at, "tally_bridge_source_time_invalid");
  assertBusinessDate(input.business_date);
  assertNonEmptyText(input.category, "tally_bridge_category_invalid");

  if (!["Item faltando", "Item errado", "Outro"].includes(input.subtype)) {
    throw new TallyBarrierBridgeError("tally_bridge_subtype_invalid");
  }

  const missing = projectMatrix(
    input.item_missing_barriers,
    ITEM_MISSING_BARRIERS,
    input.subtype === "Item faltando",
    "tally_bridge_item_missing",
  );
  const wrong = projectMatrix(
    input.wrong_item_barriers,
    WRONG_ITEM_BARRIERS,
    input.subtype === "Item errado",
    "tally_bridge_wrong_item",
  );

  return {
    contract_version: TALLY_BARRIER_BRIDGE_VERSION,
    source: "tally_occurrence_barrier",
    source_mode: "live_observed",
    truth_class: "OPERATOR_SELF_REPORT",
    source_ref: `tally:${input.form_id}:${input.submission_id}`,
    event_id: input.event_id,
    submission_id: input.submission_id,
    form_id: input.form_id,
    observed_at: input.source_created_at,
    business_date: input.business_date,
    category: input.category.trim(),
    subtype: input.subtype,
    barrier_reports: [...missing, ...wrong],
    barrier_failure_proven: false,
    barrier_compliance_proven: false,
    cause_proven: false,
    guilt_inferred: false,
    attention_authority: "NONE",
    external_effect_authorized: false,
  };
}
