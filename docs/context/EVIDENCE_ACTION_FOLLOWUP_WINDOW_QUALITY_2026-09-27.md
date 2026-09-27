# Action follow-up window quality — 2026-09-27

## Problem

The existing action-follow-up layer correctly refused to infer action effectiveness, but its negative branch was too coarse:

`NO_LATER_RECURRENCE_IN_LOADED_WINDOW`

That label could cover materially different evidence situations:
- the action happened on the loaded-window end date, leaving zero post-action days;
- some later time exists but source coverage is explicitly non-exhaustive;
- the loaded source window is declared exhaustive and no same-family recurrence appears.

Those situations must not carry the same evidentiary weight.

## Change

Updated:

- `src/contextKernel/actionFollowup.ts`
- `demo/context_kernel_action_followup_proof.ts`
- `demo/context_kernel_caixa_pulse_action_followup_replay.ts`

Each classified action follow-up now records:

- `calendar_days_to_loaded_window_end`;
- `post_action_observation_status`.

Possible observation statuses:

- `RECURRENCE_OBSERVED`;
- `NO_POST_ACTION_WINDOW`;
- `NONEXHAUSTIVE_WINDOW_NO_RECURRENCE`;
- `EXHAUSTIVE_LOADED_WINDOW_NO_RECURRENCE`.

The existing compatibility status remains:
- `LATER_RECURRENCE_OBSERVED`;
- `NO_LATER_RECURRENCE_IN_LOADED_WINDOW`.

## Truth boundary

All observation-window states preserve:

- `action_effectiveness_status = UNKNOWN`;
- `shared_root_cause_status = UNPROVEN`;
- `attention_authority = NONE`;
- `external_effect_authorized = false`.

Even `EXHAUSTIVE_LOADED_WINDOW_NO_RECURRENCE` is not action-effectiveness proof.

Calendar span to the loaded-window end is not described as continuous observation time. It is only the bounded time span available to interpret the source window.

## Regression coverage

New proof cases explicitly cover:

1. later same-family recurrence;
2. non-exhaustive window with no recurrence;
3. zero-day post-action window;
4. exhaustive loaded window with no recurrence;
5. no recurrence never becomes resolution;
6. source-marked concluded never becomes action-effective;
7. later recurrence never becomes action-failure;
8. no attention or external effects.

The real Caixa Pulse replay output has also been extended so future fresh replays expose the three no-recurrence window-quality counters instead of one undifferentiated total.

## CI proof

Final implementation head:

`4d3a89bd03700eb7d67431db458adbe0dfb915e9`

GitHub Actions:
- workflow: Edge Shadow CI;
- run: `36347231343`;
- result: `SUCCESS`.

## Reality boundary

PROVEN:
- code/test semantics above;
- full current CI remains green.

NOT REPLAYED IN THIS SESSION:
- the historical 69-row Caixa Pulse dataset has not been freshly rerun with the new counters because its raw D1 export was not recovered in the current tool surface.

Therefore no new real-world count is claimed for the three window-quality buckets.
