import assert from "node:assert/strict";
import test from "node:test";
import {
  TallyBarrierBridgeError,
  projectTallyBarrierEvidence,
} from "../src/tally-barrier-bridge.mjs";

const LIVE_FORM_ID = "ZjVv1a";

function fixture(overrides = {}) {
  return {
    source: "tally_occurrence_barrier",
    truth_class: "OPERATOR_SELF_REPORT",
    event_id: "evt_live_1",
    submission_id: "sub_live_1",
    respondent_id: "respondent-1",
    form_id: LIVE_FORM_ID,
    source_created_at: "2026-09-27T12:00:00.000Z",
    operator_name: "Operator Name Must Not Cross",
    business_date: "2026-09-27",
    shift: "Manhã",
    category: "Problema no Delivery",
    reference_text: "reference-private",
    happened_text: "raw incident narrative must not cross",
    action_text: "raw action narrative must not cross",
    status: "Concluído",
    subtype: "Item faltando",
    item_missing_barriers: {
      "Item identificado antes de seguir": "REPORTED_DONE",
      "Todos os volumes reunidos": "REPORTED_NOT_DONE",
      "Conferência física após impressão/ajuste": "UNABLE_TO_CONFIRM",
      "Conferência final antes da saída": "REPORTED_NOT_APPLICABLE",
    },
    wrong_item_barriers: null,
    attention_authority: "NONE",
    external_effect_authorized: false,
    ...overrides,
  };
}

test("Item faltando projects exactly four self-report barrier records", () => {
  const result = projectTallyBarrierEvidence(fixture(), LIVE_FORM_ID);

  assert.equal(result.truth_class, "OPERATOR_SELF_REPORT");
  assert.equal(result.source_mode, "live_observed");
  assert.deepEqual(
    result.barrier_reports.map((item) => item.barrier_id),
    [
      "IDENTIFY_BEFORE_ADVANCE",
      "REUNITE_COMPLETE_ORDER",
      "PHYSICAL_POST_PRINT_CHECK",
      "FINAL_DIVERGENCE_CONFERENCE",
    ],
  );
  assert.deepEqual(
    result.barrier_reports.map((item) => item.reported_status),
    [
      "REPORTED_DONE",
      "REPORTED_NOT_DONE",
      "UNABLE_TO_CONFIRM",
      "REPORTED_NOT_APPLICABLE",
    ],
  );

  assert.equal(result.barrier_failure_proven, false);
  assert.equal(result.barrier_compliance_proven, false);
  assert.equal(result.cause_proven, false);
  assert.equal(result.guilt_inferred, false);
  assert.equal(result.attention_authority, "NONE");
  assert.equal(result.external_effect_authorized, false);
});

test("Item errado projects only the wrong-item barrier set", () => {
  const result = projectTallyBarrierEvidence(
    fixture({
      event_id: "evt_live_2",
      submission_id: "sub_live_2",
      subtype: "Item errado",
      item_missing_barriers: null,
      wrong_item_barriers: {
        "Produto e quantidade conferiam": "REPORTED_DONE",
        "Observações do cliente conferidas": "REPORTED_NOT_DONE",
        "Correção manual conferida fisicamente quando aplicável":
          "UNABLE_TO_CONFIRM",
        "Conferência final antes da saída": "REPORTED_NOT_APPLICABLE",
      },
    }),
    LIVE_FORM_ID,
  );

  assert.deepEqual(
    result.barrier_reports.map((item) => item.barrier_id),
    [
      "EXACT_PRODUCT_QUANTITY_MATCH",
      "CUSTOMER_OBSERVATION_CHECK",
      "MANUAL_CORRECTION_PHYSICAL_CHECK",
      "FINAL_DIVERGENCE_CONFERENCE",
    ],
  );
});

test("Outro projects no barrier reports and creates no attention", () => {
  const result = projectTallyBarrierEvidence(
    fixture({
      event_id: "evt_live_3",
      submission_id: "sub_live_3",
      subtype: "Outro",
      item_missing_barriers: null,
      wrong_item_barriers: null,
    }),
    LIVE_FORM_ID,
  );

  assert.deepEqual(result.barrier_reports, []);
  assert.equal(result.attention_authority, "NONE");
  assert.equal(result.external_effect_authorized, false);
});

test("bridge minimizes raw operational content", () => {
  const result = projectTallyBarrierEvidence(fixture(), LIVE_FORM_ID);
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes("Operator Name Must Not Cross"), false);
  assert.equal(serialized.includes("reference-private"), false);
  assert.equal(serialized.includes("raw incident narrative must not cross"), false);
  assert.equal(serialized.includes("raw action narrative must not cross"), false);
  assert.equal(Object.hasOwn(result, "operator_name"), false);
  assert.equal(Object.hasOwn(result, "happened_text"), false);
  assert.equal(Object.hasOwn(result, "action_text"), false);
});

test("truth class cannot be promoted", () => {
  assert.throws(
    () =>
      projectTallyBarrierEvidence(
        fixture({ truth_class: "FACT" }),
        LIVE_FORM_ID,
      ),
    (error) =>
      error instanceof TallyBarrierBridgeError &&
      error.code === "tally_bridge_truth_class_invalid",
  );
});

test("external effect authority cannot cross the bridge", () => {
  assert.throws(
    () =>
      projectTallyBarrierEvidence(
        fixture({ external_effect_authorized: true }),
        LIVE_FORM_ID,
      ),
    (error) =>
      error instanceof TallyBarrierBridgeError &&
      error.code === "tally_bridge_external_effect_forbidden",
  );
});

test("attention authority cannot cross the bridge", () => {
  assert.throws(
    () =>
      projectTallyBarrierEvidence(
        fixture({ attention_authority: "DIRECT" }),
        LIVE_FORM_ID,
      ),
    (error) =>
      error instanceof TallyBarrierBridgeError &&
      error.code === "tally_bridge_attention_authority_forbidden",
  );
});

test("inactive matrix contamination fails closed", () => {
  assert.throws(
    () =>
      projectTallyBarrierEvidence(
        fixture({
          subtype: "Outro",
          item_missing_barriers: null,
          wrong_item_barriers: {
            "Produto e quantidade conferiam": "REPORTED_DONE",
            "Observações do cliente conferidas": "REPORTED_DONE",
            "Correção manual conferida fisicamente quando aplicável":
              "REPORTED_DONE",
            "Conferência final antes da saída": "REPORTED_DONE",
          },
        }),
        LIVE_FORM_ID,
      ),
    (error) =>
      error instanceof TallyBarrierBridgeError &&
      error.code === "tally_bridge_wrong_item_inactive_present",
  );
});

test("unexpected input field fails closed", () => {
  assert.throws(
    () =>
      projectTallyBarrierEvidence(
        { ...fixture(), surprise: "unreviewed" },
        LIVE_FORM_ID,
      ),
    (error) =>
      error instanceof TallyBarrierBridgeError &&
      error.code === "tally_bridge_input_shape_invalid",
  );
});

test("wrong form identity fails closed", () => {
  assert.throws(
    () => projectTallyBarrierEvidence(fixture(), "eq4lae"),
    (error) =>
      error instanceof TallyBarrierBridgeError &&
      error.code === "tally_bridge_form_id_mismatch",
  );
});
