# Context Kernel v0.2 — Capture, Schedule and Briefing

## Goal

Make the Context Kernel useful for the three things César explicitly wants in
addition to restaurant intelligence:

- pendências;
- horários e reuniões;
- vida pessoal/work mix.

## Capture Universal

The capture router accepts an already-classified capture from Watch/Chat/Shortcut.

It routes to one of:

- commitment ledger;
- calendar draft;
- Trello draft;
- idea inbox;
- ChatGPT query;
- incident inbox;
- human review.

Important boundary:

`ROUTED != EXTERNAL_WRITE_AUTHORIZED`

v0.2 produces routing decisions only.

## Schedule

The schedule projection is read-only.

It identifies:

- one active non-all-day confirmed event;
- the next confirmed event;
- counts for active/upcoming events.

An active calendar event can become a `meeting_active` Context Signal and
therefore drive `REUNIAO` mode.

Cancelled events are ignored.

No "today" arithmetic or timezone assumptions were added yet.

## Briefing

The briefing projection contains structured fields only:

- current mode;
- current `Precisa de mim?` state;
- current/next schedule references;
- commitment counts by status.

There is no opaque importance score and no invented ranking.

## Next source bindings

After this synthetic foundation is green, the next cloud-only integration
targets are:

1. Google Calendar -> ScheduleEvent contract;
2. Watch/Shortcut -> CaptureClassification contract;
3. Trello/Gmail -> Commitment/Evidence input contracts;
4. Attention delivery policy configured per mode.

No physical PC is required for these steps.
