import { strict as assert } from "node:assert";
import { projectManagerSnapshot } from "../src/edge/managerSnapshot";
import type { EdgeSourceObservation } from "../src/edge/simulator";
import { buildContextKernelSnapshot } from "../src/contextKernel/kernel";
import { replayCommitments } from "../src/contextKernel/commitments";
import { routeEvidenceDebt } from "../src/contextKernel/investigator";
import { compileContextMode } from "../src/contextKernel/modeCompiler";

const work = {
  signal_id: "work-1",
  source: "edge-manager-snapshot",
  domain: "WORK" as const,
  kind: "work_activity" as const,
  observed_at: "2026-09-25T09:00:00.000Z",
  active: true,
};

const personal = {
  signal_id: "personal-1",
  source: "calendar",
  domain: "PERSONAL" as const,
  kind: "personal_activity" as const,
  observed_at: "2026-09-25T09:01:00.000Z",
  active: true,
};

assert.equal(compileContextMode([work]).mode, "TRABALHO");
assert.equal(compileContextMode([personal]).mode, "PESSOAL");
assert.equal(compileContextMode([work, personal]).mode, "MISTO");

const meeting = {
  signal_id: "meeting-1",
  source: "calendar",
  domain: "WORK" as const,
  kind: "meeting_active" as const,
  observed_at: "2026-09-25T09:02:00.000Z",
  active: true,
};
assert.equal(compileContextMode([work, meeting]).mode, "REUNIAO");

const focus = {
  signal_id: "focus-1",
  source: "watch",
  domain: "SYSTEM" as const,
  kind: "explicit_mode" as const,
  observed_at: "2026-09-25T09:03:00.000Z",
  active: true,
  mode: "FOCO" as const,
};
assert.equal(compileContextMode([work, meeting, focus]).mode, "FOCO");

const off = {
  ...focus,
  signal_id: "off-1",
  observed_at: "2026-09-25T09:04:00.000Z",
  mode: "OFF" as const,
};
assert.equal(compileContextMode([work, meeting, focus, off]).mode, "OFF");

const conflictingExplicit = compileContextMode([
  { ...focus, signal_id: "explicit-a", observed_at: "2026-09-25T09:05:00.000Z", mode: "FOCO" },
  { ...focus, signal_id: "explicit-b", observed_at: "2026-09-25T09:05:00.000Z", mode: "OFF" },
]);
assert.equal(conflictingExplicit.mode, "UNKNOWN");
assert.equal(conflictingExplicit.basis, "CONFLICT");

assert.equal(
  routeEvidenceDebt({
    debt_id: "debt-source",
    evidence_code: "pause_reason",
    trusted_source_available: true,
    operational_owner_available: true,
    cesar_context_needed: true,
    capture_next_time_possible: true,
  }).route,
  "TRUSTED_SOURCE",
);
assert.equal(
  routeEvidenceDebt({
    debt_id: "debt-owner",
    evidence_code: "pause_reason",
    trusted_source_available: false,
    operational_owner_available: true,
    cesar_context_needed: true,
    capture_next_time_possible: true,
  }).route,
  "OPERATIONAL_OWNER",
);
assert.equal(
  routeEvidenceDebt({
    debt_id: "debt-cesar",
    evidence_code: "pause_reason",
    trusted_source_available: false,
    operational_owner_available: false,
    cesar_context_needed: true,
    capture_next_time_possible: true,
  }).route,
  "CESAR",
);
assert.equal(
  routeEvidenceDebt({
    debt_id: "debt-capture",
    evidence_code: "pause_reason",
    trusted_source_available: false,
    operational_owner_available: false,
    cesar_context_needed: false,
    capture_next_time_possible: true,
  }).route,
  "CAPTURE_NEXT_TIME",
);

const commitmentEvents = [
  {
    event_id: "commit-create-1",
    commitment_id: "commit-1",
    observed_at: "2026-09-25T08:00:00.000Z",
    type: "CREATED" as const,
    domain: "WORK" as const,
    subject_code: "review_supplier_followup",
    source_ref: "trello:card-1",
    assignee_ref: "cesar",
    due_at: "2026-09-25T10:00:00.000Z",
  },
  {
    event_id: "commit-debt-1",
    commitment_id: "commit-1",
    observed_at: "2026-09-25T08:01:00.000Z",
    type: "EVIDENCE_REQUIRED" as const,
    evidence_code: "proof_of_completion",
  },
];
const commitments = replayCommitments(commitmentEvents);
assert.equal(commitments[0].evidence_debt[0], "proof_of_completion");
assert.throws(
  () =>
    replayCommitments([
      ...commitmentEvents,
      {
        event_id: "commit-close-too-early",
        commitment_id: "commit-1",
        observed_at: "2026-09-25T08:02:00.000Z",
        type: "CLOSED_PROVEN" as const,
      },
    ]),
  /commitment_evidence_debt_open/,
);

const edgeObservation: EdgeSourceObservation = {
  source_mode: "synthetic",
  observation_id: "auth-human-context",
  kind: "auth_state",
  source_ref: {
    source: "ifood",
    kind: "auth_session",
    id: "profile-context",
    unit_id: "0001",
  },
  observed_at: "2026-09-25T09:10:00.000Z",
  payload: {
    health: "HUMAN_REQUIRED",
    customer_name: "must-not-cross",
  },
};
const edge = projectManagerSnapshot(
  [edgeObservation],
  "2026-09-25T09:11:00.000Z",
);

const snapshot = buildContextKernelSnapshot({
  now: "2026-09-25T11:00:00.000Z",
  signals: [work, personal],
  commitment_events: commitmentEvents,
  evidence_debt: [{
    debt_id: "debt-kernel",
    evidence_code: "cause_context",
    trusted_source_available: false,
    operational_owner_available: false,
    cesar_context_needed: true,
    capture_next_time_possible: true,
  }],
  edge,
});

assert.equal(snapshot.mode.mode, "MISTO");
assert.equal(snapshot.edge_fact_class, "SIMULATION");
assert.equal(snapshot.needs_me.state, "YES");
assert.equal(
  snapshot.needs_me.reasons.some((reason) => reason.kind === "EDGE_HARD_EXCEPTION"),
  true,
);
assert.equal(
  snapshot.needs_me.reasons.some(
    (reason) => reason.kind === "CESAR_EVIDENCE_CONTEXT_REQUIRED",
  ),
  true,
);
assert.equal(
  snapshot.needs_me.reasons.some(
    (reason) => reason.kind === "CESAR_COMMITMENT_OVERDUE",
  ),
  true,
);
assert.equal(snapshot.needs_me.global_clearance_claimed, false);

const empty = buildContextKernelSnapshot({
  now: "2026-09-25T11:00:00.000Z",
  signals: [],
  commitment_events: [],
  evidence_debt: [],
});
assert.equal(empty.mode.mode, "UNKNOWN");
assert.equal(empty.needs_me.state, "UNKNOWN");

const serialized = JSON.stringify(snapshot);
assert.equal(serialized.includes("must-not-cross"), false);
assert.equal(serialized.includes("customer_name"), false);

console.log(JSON.stringify({
  status: "PASS",
  modes_proven: [
    "TRABALHO",
    "PESSOAL",
    "MISTO",
    "REUNIAO",
    "FOCO",
    "OFF",
    "UNKNOWN",
  ],
  explicit_mode_precedence: true,
  evidence_debt_routing_order: true,
  evidence_debt_not_guilt: true,
  commitment_close_requires_evidence: true,
  needs_me_uses_direct_reasons_only: true,
  global_clearance_not_claimed: true,
  edge_simulation_preserved: true,
  raw_edge_payload_not_forwarded: true,
}, null, 2));
