import { strict as assert } from "node:assert";
import {
  buildBarrierCapturePlan,
  interpretBarrierCapture,
  type BarrierCaptureResponse,
} from "../src/contextKernel/barrierCaptureContract";

const missing = buildBarrierCapturePlan("ITEM_MISSING");
assert.equal(missing.show_matrix, true);
assert.equal(missing.prompts.length, 4);
assert.deepEqual(
  missing.prompts.map((item) => item.barrier_id),
  [
    "IDENTIFY_BEFORE_ADVANCE",
    "REUNITE_COMPLETE_ORDER",
    "PHYSICAL_POST_PRINT_CHECK",
    "FINAL_DIVERGENCE_CONFERENCE",
  ],
);

const wrong = buildBarrierCapturePlan("WRONG_ITEM");
assert.equal(wrong.show_matrix, true);
assert.equal(wrong.prompts.length, 4);
assert.ok(
  wrong.prompts.some(
    (item) => item.barrier_id === "FINAL_DIVERGENCE_CONFERENCE",
  ),
);
const other = buildBarrierCapturePlan("OTHER");
assert.equal(other.show_matrix, false);
assert.deepEqual(other.prompts, []);

const responses: BarrierCaptureResponse[] = missing.prompts.map(
  (item, index) => ({
    barrier_id: item.barrier_id,
    answer:
      index === 0
        ? "REPORTED_DONE"
        : index === 1
          ? "REPORTED_NOT_DONE"
          : index === 2
            ? "UNABLE_TO_CONFIRM"
            : "REPORTED_NOT_APPLICABLE",
  }),
);
const interpreted = interpretBarrierCapture("ITEM_MISSING", responses);
assert.equal(interpreted.length, 4);
assert.equal(interpreted[0].reported_execution, "REPORTED_DONE");
assert.equal(interpreted[1].reported_execution, "REPORTED_NOT_DONE");
assert.equal(interpreted[2].reported_execution, "UNKNOWN");
assert.equal(
  interpreted[3].reported_execution,
  "REPORTED_NOT_APPLICABLE",
);
assert.ok(interpreted.every((item) => item.barrier_failure_proven === false));
assert.ok(
  interpreted.every((item) => item.barrier_compliance_proven === false),
);
assert.ok(interpreted.every((item) => item.guilt_inferred === false));
assert.ok(interpreted.every((item) => item.cause_proven === false));
assert.ok(
  interpreted.every((item) => item.external_effect_authorized === false),
);

assert.throws(
  () =>
    interpretBarrierCapture("ITEM_MISSING", [
      ...responses.slice(0, 3),
    ]),
  /barrier_capture_required_response_missing/,
);

assert.throws(
  () =>
    interpretBarrierCapture("OTHER", [
      {
        barrier_id: "FINAL_DIVERGENCE_CONFERENCE",
        answer: "REPORTED_DONE",
      },
    ]),
  /barrier_capture_response_outside_plan/,
);

assert.throws(
  () =>
    interpretBarrierCapture("ITEM_MISSING", [
      responses[0],
      responses[0],
      ...responses.slice(1),
    ]),
  /barrier_capture_duplicate_response/,
);

console.log(JSON.stringify({
  status: "PASS",
  existing_source_taxonomy_preserved: true,
  subtype_is_one_click_gate: true,
  item_missing_rows: missing.prompts.length,
  wrong_item_rows: wrong.prompts.length,
  other_rows: other.prompts.length,
  operator_report_is_not_independent_proof: true,
  reported_not_done_is_not_failure_proven: true,
  unable_to_confirm_remains_unknown: true,
  missing_response_fails_closed: true,
  attention_authority: "NONE",
  external_effects_authorized: false,
}, null, 2));
