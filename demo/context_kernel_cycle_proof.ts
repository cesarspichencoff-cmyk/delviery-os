import { strict as assert } from "node:assert";
import { projectManagerSnapshot } from "../src/edge/managerSnapshot";
import type { EdgeSourceObservation } from "../src/edge/simulator";
import { buildContextCycle } from "../src/contextKernel/cycle";

const edgeObservation: EdgeSourceObservation = {
  source_mode: "synthetic",
  observation_id: "cycle-print-error",
  kind: "print_job",
  source_ref: {
    source: "windows_print",
    kind: "spool_job",
    id: "cycle-job-1",
    unit_id: "0001",
  },
  observed_at: "2026-09-25T13:55:00.000Z",
  payload: { state: "ERROR", raw_message: "must-not-cross" },
};

const edge = projectManagerSnapshot(
  [edgeObservation],
  "2026-09-25T13:56:00.000Z",
);

const cycle = buildContextCycle({
  now: "2026-09-25T14:30:00.000Z",
  context_signals: [],
  schedule_events: [{
    event_id: "meeting-1",
    source_ref: "gcal:work",
    domain: "WORK",
    starts_at: "2026-09-25T14:00:00.000Z",
    ends_at: "2026-09-25T15:00:00.000Z",
    status: "CONFIRMED",
    all_day: false,
  }],
  commitment_events: [{
    event_id: "commit-create-cycle",
    commitment_id: "commit-cycle",
    observed_at: "2026-09-25T12:00:00.000Z",
    type: "CREATED",
    domain: "WORK",
    subject_code: "supplier_followup",
    source_ref: "trello:ops:card-1",
    assignee_ref: "cesar",
    due_at: "2026-09-25T14:00:00.000Z",
  }],
  evidence_debt: [],
  attention_policy: [
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
  edge,
});

assert.equal(cycle.kernel.mode.mode, "REUNIAO");
assert.equal(cycle.kernel.needs_me.state, "YES");
assert.equal(cycle.briefing.active_schedule_event_ref, "meeting-1");
assert.equal(cycle.briefing.open_commitments, 1);
assert.equal(cycle.attention_delivery.fully_configured, true);
assert.equal(
  cycle.attention_delivery.reason_decisions.find(
    (item) => item.reason.kind === "EDGE_HARD_EXCEPTION",
  )?.disposition,
  "SHOW_NOW",
);
assert.equal(
  cycle.attention_delivery.reason_decisions.find(
    (item) => item.reason.kind === "CESAR_COMMITMENT_OVERDUE",
  )?.disposition,
  "HOLD",
);
assert.equal(cycle.external_effects_authorized, false);
assert.equal(cycle.attention_delivery.effect_authorized, false);
assert.equal(cycle.kernel.edge_fact_class, "SIMULATION");

const explicitOff = buildContextCycle({
  now: "2026-09-25T14:30:00.000Z",
  context_signals: [{
    signal_id: "manual-off",
    source: "watch",
    domain: "SYSTEM",
    kind: "explicit_mode",
    observed_at: "2026-09-25T14:29:00.000Z",
    active: true,
    mode: "OFF",
  }],
  schedule_events: [{
    event_id: "meeting-2",
    source_ref: "gcal:work",
    domain: "WORK",
    starts_at: "2026-09-25T14:00:00.000Z",
    ends_at: "2026-09-25T15:00:00.000Z",
    status: "CONFIRMED",
    all_day: false,
  }],
  commitment_events: [],
  evidence_debt: [],
  attention_policy: [],
});
assert.equal(explicitOff.kernel.mode.mode, "OFF");

const unknown = buildContextCycle({
  now: "2026-09-25T14:30:00.000Z",
  context_signals: [],
  schedule_events: [],
  commitment_events: [],
  evidence_debt: [],
  attention_policy: [],
});
assert.equal(unknown.kernel.mode.mode, "UNKNOWN");
assert.equal(unknown.kernel.needs_me.state, "UNKNOWN");

const serialized = JSON.stringify(cycle);
assert.equal(serialized.includes("must-not-cross"), false);
assert.equal(serialized.includes("raw_message"), false);

console.log(JSON.stringify({
  status: "PASS",
  single_cycle_composes_product_snapshot: true,
  meeting_mode_composed: true,
  commitment_and_edge_reasons_combined: true,
  explicit_off_overrides_meeting: true,
  attention_delivery_is_policy_driven: true,
  no_external_effect_authorized: true,
  raw_edge_payload_not_forwarded: true,
}, null, 2));
