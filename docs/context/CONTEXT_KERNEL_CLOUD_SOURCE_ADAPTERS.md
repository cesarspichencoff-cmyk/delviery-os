# Context Kernel — Cloud Source Adapter Boundaries

## Purpose

Bind cloud sources to the already-proven Context Kernel contracts without
copying source payloads into the kernel.

## Google Calendar

The adapter accepts only:

- safe event reference;
- configured calendar code;
- start/end;
- all-day flag;
- explicit cancellation state.

Calendar domain is configured explicitly as WORK or PERSONAL.

It is not inferred from title, description, location or attendees.

Those fields do not cross the adapter boundary.

## Trello

The adapter accepts only:

- safe card/board/list references;
- observed time;
- optional due time;
- explicit due-complete flag;
- optional safe assignee reference.

List meaning is configuration, not language inference.

Each configured list receives one explicit role:

- OPEN;
- WAITING;
- DONE_UNVERIFIED;
- CANCELLED;
- IGNORE.

An unconfigured list produces UNMAPPED and no commitment.

Trello's completion signal can produce DONE_UNVERIFIED only. It cannot produce
PROVEN_CLOSED because source completion is not proof of real-world completion.

## External effects

Both adapters are projection-only.

They expose no Calendar or Trello write capability.

## Live-source discovery note

The current connector surface is usable for read-only source discovery, but the
repository does not store connector-specific personal source contents or
identifiers.

Live binding remains a separate evidence class from this synthetic adapter
proof.
