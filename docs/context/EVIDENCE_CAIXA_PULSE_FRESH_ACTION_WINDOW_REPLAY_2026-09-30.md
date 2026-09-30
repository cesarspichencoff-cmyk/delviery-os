# Caixa Pulse — fresh action-window replay — 2026-09-30

## Scope

Read-only refresh of the canonical Caixa Pulse occurrence source while Tally Gate F waits for the first real post-connect event.

No restaurant operational write, notification, form mutation, or synthetic production incident was created.

## Export integrity correction

The first replay attempt was INVALID because Windows PowerShell transcoded Wrangler UTF-8 JSON while piping to `Set-Content`.

Observed corruption included:
- `não` -> `n├úo`
- `Concluído` -> `Conclu├¡do`

That corrupted classification and resolution-marker results.

Failure class:
`OUTPUT_ENCODING_CORRUPTION`

The invalid replay is rejected and must not be used as evidence.

A byte-preserving raw redirection route was then used. The corrected replay is the evidence below.

## Fresh source scope

Current D1 canonical source:
- 87 occurrence rows;
- 24 distinct business dates;
- range 2026-09-04 through 2026-09-29;
- coverage remains non-exhaustive.

Current-window adaptation:
- classified: 67;
- unclassified: 20;
- explicit multi-signal ambiguity: 3;
- mechanism basis: `RULE_INFERRED`;
- causal status: `UNPROVEN`.

## Action-window quality

Classified episodes with recognized actions: 66.

Results:
- later same-family recurrence observed: 57;
- no later recurrence in loaded window: 9;
- no post-action observation window: 1;
- non-exhaustive loaded-window no-recurrence: 8;
- exhaustive loaded-window no-recurrence: 0;
- days to next recurrence: min 1, median 2, max 9.

Therefore none of the nine no-recurrence cases are resolution proof.

Action-effectiveness counters remain:
- effective proven: 0;
- ineffective proven: 0.

## OMISSION signal

Current replay:
- 26 classified OMISSION episodes;
- 16 distinct business dates;
- 25 episodes with recognized actions;
- 24 later same-family recurrences;
- 1 no-later-recurrence case;
- median next recurrence: 1 day.

This supports investigation of what changed after prior omission actions.

It does not prove that a prior action failed, that the root cause is shared, or that a named person is responsible.

## Historical-window population delta

Replaying the same business-date window through 2026-09-25 against CURRENT D1 now yields:
- 73 canonical occurrence rows;
- 21 business dates;
- 61 classified rows.

The older receipt recorded 69 rows for that date window.

Therefore:
`CURRENT_SOURCE_POPULATION_THROUGH_2026_09_25 = 73`
and
`OLDER_PROVEN_SNAPSHOT = 69`.

The +4 row population difference is real at the source-query level, but its cause is UNKNOWN in this receipt. It must not be described as operational incident growth without provenance analysis.

## Boundary

- `SOURCE_MARKED_CONCLUDED != ACTION_EFFECTIVE`
- `LATER_RECURRENCE != ACTION_FAILURE`
- `NO_RECURRENCE_IN_NONEXHAUSTIVE_WINDOW != RESOLUTION`
- `SAME_MECHANISM_FAMILY != SAME_ROOT_CAUSE`
- attention authority: NONE
- external effects authorized: false

## Next gate

Tally Gate F remains `ARMED_WAITING_REAL_EVENT`.

In parallel, the next safe zero-cost track is the already-prepared local iFood OCR execution gate: prove a target Windows/Node host and a narrow read-only attachment-source -> segmented OCR -> parser path without deploying production OCR or admitting unsupported accuracy claims.
