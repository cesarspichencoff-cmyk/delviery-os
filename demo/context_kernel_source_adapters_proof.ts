import { strict as assert } from "node:assert";
import { googleCalendarToScheduleEvent } from "../src/contextKernel/adapters/googleCalendar";
import { trelloCardToCommitmentEvents } from "../src/contextKernel/adapters/trello";
import { replayCommitments } from "../src/contextKernel/commitments";
import { buildScheduleSnapshot } from "../src/contextKernel/schedule";

const calendarPolicies = [
  {
    calendar_code: "work-calendar",
    source_ref: "gcal:work",
    domain: "WORK" as const,
  },
  {
    calendar_code: "personal-calendar",
    source_ref: "gcal:personal",
    domain: "PERSONAL" as const,
  },
];

const workMeeting = googleCalendarToScheduleEvent(
  {
    event_ref: "evt-1",
    calendar_code: "work-calendar",
    starts_at: "2026-09-25T14:00:00.000Z",
    ends_at: "2026-09-25T15:00:00.000Z",
    all_day: false,
    cancelled: false,
  },
  calendarPolicies,
);
assert.equal(workMeeting.domain, "WORK");
assert.equal(workMeeting.source_ref, "gcal:work");

assert.throws(
  () =>
    googleCalendarToScheduleEvent(
      {
        event_ref: "evt-unknown",
        calendar_code: "unconfigured-calendar",
        starts_at: "2026-09-25T16:00:00.000Z",
        ends_at: "2026-09-25T17:00:00.000Z",
        all_day: false,
        cancelled: false,
      },
      calendarPolicies,
    ),
  /calendar_domain_unconfigured/,
);

const schedule = buildScheduleSnapshot(
  [
    workMeeting,
    googleCalendarToScheduleEvent(
      {
        event_ref: "evt-cancelled",
        calendar_code: "personal-calendar",
        starts_at: "2026-09-25T18:00:00.000Z",
        ends_at: "2026-09-25T19:00:00.000Z",
        all_day: false,
        cancelled: true,
      },
      calendarPolicies,
    ),
  ],
  "2026-09-25T14:30:00.000Z",
);
assert.equal(schedule.active_event?.event_id, "evt-1");
assert.equal(schedule.upcoming_count, 0);

const trelloPolicy = {
  board_ref: "ops-board",
  domain: "WORK" as const,
  subject_code: "trello_operational_card",
  list_roles: {
    "todo-list": "OPEN" as const,
    "waiting-list": "WAITING" as const,
    "done-list": "DONE_UNVERIFIED" as const,
  },
};

const admitted = trelloCardToCommitmentEvents(
  {
    card_ref: "card-1",
    board_ref: "ops-board",
    list_ref: "waiting-list",
    observed_at: "2026-09-25T12:00:00.000Z",
    due_at: "2026-09-25T16:00:00.000Z",
    due_complete: false,
    assignee_ref: "cesar",
  },
  trelloPolicy,
);
assert.equal(admitted.disposition, "ADMIT");
const records = replayCommitments(admitted.events);
assert.equal(records.length, 1);
assert.equal(records[0].status, "WAITING");
assert.equal(records[0].due_at, "2026-09-25T16:00:00.000Z");

const done = trelloCardToCommitmentEvents(
  {
    card_ref: "card-2",
    board_ref: "ops-board",
    list_ref: "todo-list",
    observed_at: "2026-09-25T12:01:00.000Z",
    due_complete: true,
  },
  trelloPolicy,
);
const doneRecord = replayCommitments(done.events)[0];
assert.equal(doneRecord.status, "DONE_UNVERIFIED");
assert.notEqual(doneRecord.status, "PROVEN_CLOSED");

const unmapped = trelloCardToCommitmentEvents(
  {
    card_ref: "card-3",
    board_ref: "ops-board",
    list_ref: "unknown-list",
    observed_at: "2026-09-25T12:02:00.000Z",
    due_complete: false,
  },
  trelloPolicy,
);
assert.equal(unmapped.disposition, "UNMAPPED");
assert.equal(unmapped.events.length, 0);

const wrongBoard = trelloCardToCommitmentEvents(
  {
    card_ref: "card-4",
    board_ref: "other-board",
    list_ref: "todo-list",
    observed_at: "2026-09-25T12:03:00.000Z",
    due_complete: false,
  },
  trelloPolicy,
);
assert.equal(wrongBoard.disposition, "UNMAPPED");
assert.equal(wrongBoard.events.length, 0);

const serialized = JSON.stringify({ workMeeting, records, doneRecord });
assert.equal(serialized.includes("title"), false);
assert.equal(serialized.includes("description"), false);
assert.equal(serialized.includes("attendee"), false);
assert.equal(serialized.includes("comment"), false);

console.log(JSON.stringify({
  status: "PASS",
  calendar_domain_requires_explicit_policy: true,
  calendar_content_not_persisted: true,
  trello_list_role_requires_explicit_mapping: true,
  trello_unmapped_list_fails_closed: true,
  trello_done_is_not_proven_closed: true,
  trello_content_not_persisted: true,
}, null, 2));
