import { strict as assert } from "node:assert";
import { buildAttentionDeliveryPlan } from "../src/contextKernel/attentionPolicy";
import type { NeedsMeProjection } from "../src/contextKernel/needsMe";

const needs: NeedsMeProjection = {
  state: "YES",
  mode: "REUNIAO",
  reasons: [
    { kind: "EDGE_HARD_EXCEPTION", ref: "attention:print-error" },
    { kind: "CESAR_COMMITMENT_OVERDUE", ref: "commitment:1" },
  ],
  global_clearance_claimed: false,
};

const partial = buildAttentionDeliveryPlan({
  needs_me: needs,
  policy: [{
    mode: "REUNIAO",
    reason_kind: "CESAR_COMMITMENT_OVERDUE",
    disposition: "HOLD",
  }],
});
assert.equal(partial.fully_configured, false);
assert.equal(
  partial.reason_decisions.find(
    (item) => item.reason.kind === "EDGE_HARD_EXCEPTION",
  )?.disposition,
  "UNCONFIGURED",
);
assert.equal(
  partial.reason_decisions.find(
    (item) => item.reason.kind === "CESAR_COMMITMENT_OVERDUE",
  )?.disposition,
  "HOLD",
);
assert.equal(partial.effect_authorized, false);

const configured = buildAttentionDeliveryPlan({
  needs_me: needs,
  policy: [
    {
      mode: "REUNIAO",
      reason_kind: "EDGE_HARD_EXCEPTION",
      disposition: "SHOW_NOW",
    },
    {
      mode: "REUNIAO",
      reason_kind: "CESAR_COMMITMENT_OVERDUE",
      disposition: "HOLD",
    },
  ],
});
assert.equal(configured.fully_configured, true);
assert.equal(configured.effect_authorized, false);

const offNeeds: NeedsMeProjection = {
  ...needs,
  mode: "OFF",
  reasons: [{ kind: "EDGE_HARD_EXCEPTION", ref: "attention:auth-human" }],
};
const offUnconfigured = buildAttentionDeliveryPlan({
  needs_me: offNeeds,
  policy: [],
});
assert.equal(offUnconfigured.fully_configured, false);
assert.equal(offUnconfigured.reason_decisions[0].disposition, "UNCONFIGURED");

const quiet: NeedsMeProjection = {
  state: "NO_KNOWN_NEED",
  mode: "FOCO",
  reasons: [],
  global_clearance_claimed: false,
};
const quietPlan = buildAttentionDeliveryPlan({
  needs_me: quiet,
  policy: [],
});
assert.equal(quietPlan.reason_decisions.length, 0);
assert.equal(quietPlan.fully_configured, true);
assert.equal(quietPlan.effect_authorized, false);

assert.throws(
  () =>
    buildAttentionDeliveryPlan({
      needs_me: needs,
      policy: [
        {
          mode: "REUNIAO",
          reason_kind: "EDGE_HARD_EXCEPTION",
          disposition: "SHOW_NOW",
        },
        {
          mode: "REUNIAO",
          reason_kind: "EDGE_HARD_EXCEPTION",
          disposition: "HOLD",
        },
      ],
    }),
  /attention_policy_conflict/,
);

console.log(JSON.stringify({
  status: "PASS",
  no_hidden_mode_defaults: true,
  missing_policy_is_unconfigured: true,
  off_does_not_auto_suppress_hard_exception: true,
  conflicting_policy_fails_closed: true,
  delivery_plan_does_not_authorize_effect: true,
}, null, 2));
