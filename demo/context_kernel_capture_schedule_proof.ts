import { strict as assert } from "node:assert";
import { routeCapture } from "../src/contextKernel/captureRouter";
import { buildBriefingSnapshot } from "../src/contextKernel/briefing";
import { buildContextKernelSnapshot } from "../src/contextKernel/kernel";
import {
  buildScheduleSnapshot,
  scheduleToContextSignals,
} from "../src/contextKernel/schedule";

const now = "2026-09-25T14:30:00.000Z";

const schedule = buildScheduleSnapshot(
  [
    {
      event_id: "meeting-delivery",
      source_ref: "calendar:event-1",
      domain: "WORK",
      starts_at: "2026-09-25T14:00:00.000Z",
      ends_at: "2026-09-25T15:00:00.000Z",
      status: "CONFIRMED",
      all_day: false,
    },
    {
      event_id: "personal-next",
      source_ref: "calendar:event-2",
      domain: "PERSONAL",
      starts_at: "2026-09-25T18:00:00.000Z",
      ends_at: "2026-09-25T19:00:00.000Z",
      status: "CONFIRMED",
      all_day: false,
    },
    {
      event_id: "cancelled",
      source_ref: "calendar:event-3",
      domain: "WORK",
      starts_at: "2026-09-25T16:00:00.000Z",
      ends_at: "2026-09-25T17:00:00.000Z",
      status: "CANCELLED",
      all_day: false,
    },
  ],
  now,
);

assert.equal(schedule.active_event?.event_id, "meeting-delivery");
assert.equal(schedule.next_event?.event_id, "personal-next");
assert.equal(schedule.active_count, 1);
assert.equal(schedule.upcoming_count, 1);

const signals = scheduleToContextSignals(schedule);
assert.equal(signals.length, 1);
assert.equal(signals[0].kind, "meeting_active");

const kernel = buildContextKernelSnapshot({
  now,
  signals,
  commitment_events: [{
    event_id: "commit-create-briefing",
    commitment_id: "commit-briefing",
    observed_at: "2026-09-25T12:00:00.000Z",
    type: "CREATED",
    domain: "WORK",
    subject_code: "supplier_followup",
    source_ref: "trello:card-briefing",
    assignee_ref: "cesar",
    due_at: "2026-09-25T16:00:00.000Z",
  }],
  evidence_debt: [],
});

assert.equal(kernel.mode.mode, "REUNIAO");
assert.equal(kernel.needs_me.state, "NO_KNOWN_NEED");

const briefing = buildBriefingSnapshot({ kernel, schedule });
assert.equal(briefing.mode, "REUNIAO");
assert.equal(briefing.active_schedule_event_ref, "meeting-delivery");
assert.equal(briefing.next_schedule_event_ref, "personal-next");
assert.equal(briefing.open_commitments, 1);

const routes = [
  ["COMMITMENT", "COMMITMENT_LEDGER"],
  ["CALENDAR", "CALENDAR_DRAFT"],
  ["WORK_FOLLOWUP", "TRELLO_DRAFT"],
  ["PERSONAL_FOLLOWUP", "COMMITMENT_LEDGER"],
  ["IDEA", "IDEA_INBOX"],
  ["QUESTION", "CHATGPT_QUERY"],
  ["OCCURRENCE", "INCIDENT_INBOX"],
] as const;

for (const [intent, expected] of routes) {
  const routed = routeCapture({
    capture_id: `capture-${intent.toLowerCase()}`,
    source_ref: "watch:universal-capture",
    captured_at: now,
    intent,
    domain: intent === "PERSONAL_FOLLOWUP" ? "PERSONAL" : "WORK",
    basis: "EXPLICIT_HUMAN",
  });
  assert.equal(routed.target, expected);
  assert.equal(routed.external_write_authorized, false);
  assert.equal(routed.requires_review, false);
}

const unknown = routeCapture({
  capture_id: "capture-unknown",
  source_ref: "watch:universal-capture",
  captured_at: now,
  intent: "UNKNOWN",
  domain: "UNKNOWN",
  basis: "UNKNOWN",
});
assert.equal(unknown.target, "REVIEW_REQUIRED");
assert.equal(unknown.requires_review, true);
assert.equal(unknown.external_write_authorized, false);

console.log(JSON.stringify({
  status: "PASS",
  active_meeting_drives_reuniao_mode: true,
  cancelled_event_ignored: true,
  next_schedule_event_projected: true,
  briefing_is_structured_not_scored: true,
  universal_capture_routes_known_intents: true,
  unknown_capture_fails_to_review: true,
  capture_never_authorizes_external_write: true,
}, null, 2));
