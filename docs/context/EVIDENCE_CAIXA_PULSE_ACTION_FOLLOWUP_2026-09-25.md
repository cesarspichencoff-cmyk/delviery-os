# Evidence — Caixa Pulse Action Follow-up Memory — 2026-09-25

## Objective

Build the next Manager Investigator evidence layer over the WORLD-PROVEN
canonical Caixa Pulse source:

```text
recorded problem
  -> recorded action
  -> later same-family recurrence when observed
```

This layer does not claim that an action caused, solved or failed to solve a
later episode.

## Source

Production D1 canonical occurrence rows:
- 69 occurrence rows;
- 21 distinct business dates;
- range: 2026-09-04 through 2026-09-25;
- all 69 canonical rows contain source action text.

The loaded window is not exhaustive ground truth for all restaurant events.
Therefore absence of later recurrence is not resolution proof.

## Conservative adaptation

New adapter:
`src/contextKernel/caixaPulseEpisodeAdapter.ts`

It converts source rows into the existing `OperationalEpisodeEvidence`
contract while preserving:
- mechanism basis: `RULE_INFERRED`;
- outcome_observed: false;
- causal status: UNPROVEN;
- no attention authority;
- no external effect.
Only a single high-precision family match is promoted.

If zero rules match:
`UNCLASSIFIED`

If more than one mechanism rule matches:
`UNCLASSIFIED`

This deliberately blocks composite evidence from being flattened into one
cause. Examples preserved as unclassified include:
- platform failure plus missing-item allegation;
- wrong-item plus allergy/safety evidence;
- one source block containing several different orders/problems;
- disputed missing-item claims.

Real replay adaptation result:
- classified: 60/69;
- unclassified: 9/69;
- explicit multi-signal ambiguity: 3/69.

## Rule-inferred current-window families

| Family | Episodes | Distinct dates | Recurs across dates |
| --- | ---: | ---: | --- |
| OMISSION | 22 | 14 | yes |
| CUSTOMER_OR_OTHER_CANCEL | 14 | 9 | yes |
| DELAY_LOGISTICS | 9 | 7 | yes |
| WRONG_ITEM | 8 | 7 | yes |
| FOOD_QUALITY | 4 | 4 | yes |
| BAG_SWAP_CUSTODY | 2 | 1 | no |
| PACKAGING_LEAK | 1 | 1 | no |

`CUSTOMER_OR_OTHER_CANCEL` is explicitly not a TATÁ failure class. It groups
customer/address/other cancellation evidence for separation from internal
operational mechanisms.
No current canonical source row is promoted to PLATFORM_FAILURE or
SAFETY_CONTAMINATION because the observed candidate texts also matched another
mechanism. Those cases remain UNCLASSIFIED instead of choosing a preferred
story.

## Recorded action taxonomy

Action text is independently rule-inferred. One source action may contain more
than one action kind.

Observed mentions:
- CANCEL: 28;
- REFUND: 23;
- RESEND: 18;
- CAMERA_REVIEW: 2;
- APOLOGY: 1.

Action recognition is not outcome recognition.

## Action follow-up contract

New kernel:
`src/contextKernel/actionFollowup.ts`

For each classified episode with a recognized action, it asks only:

> Is the same rule-inferred mechanism observed on a later business date in the
> loaded evidence window?

Possible results:
- `LATER_RECURRENCE_OBSERVED`;
- `NO_LATER_RECURRENCE_IN_LOADED_WINDOW`.

Both preserve:
- action effectiveness = UNKNOWN;
- shared root cause = UNPROVEN;
- attention authority = NONE;
- external effects = false.
## Real follow-up replay

Classified episodes with recognized action: 59.

Results:
- later same-family recurrence observed: 50;
- no later recurrence in loaded window: 9;
- days to next recurrence: min 1, median 2, max 9.

By family:

| Family | Actions | Later recurrence | No later recurrence in loaded window | Median days to next recurrence |
| --- | ---: | ---: | ---: | ---: |
| OMISSION | 21 | 20 | 1 | 1 |
| CUSTOMER_OR_OTHER_CANCEL | 14 | 13 | 1 | 2 |
| DELAY_LOGISTICS | 9 | 7 | 2 | 2 |
| WRONG_ITEM | 8 | 7 | 1 | 2 |
| FOOD_QUALITY | 4 | 3 | 1 | 3 |
| BAG_SWAP_CUSTODY | 2 | 0 | 2 | n/a |
| PACKAGING_LEAK | 1 | 0 | 1 | n/a |

The strongest internal operational recurrence signal in this loaded window is
OMISSION: 22 classified episodes across 14 dates. Of 21 omission episodes with
a recognized action, 20 are followed by another omission-family episode on a
later date, with a median gap of one day.

This supports the question:
`what changed after the previous omission action?`

It does not support:
`the previous action failed`.
## Disconfirmation boundaries

The following claims remain prohibited by the evidence:
- source `Concluído` means the action worked;
- later recurrence means the earlier action failed;
- no later recurrence means the action worked;
- same mechanism family means the same root cause;
- a named operator in free text is proven responsible;
- recurrence alone means César must be interrupted.

Measured proof counters:
- action effective proven: 0;
- action ineffective proven: 0;
- direct Attention reasons created: 0;
- external effects authorized: false.

## Next evidence gate

The next improvement is not another threshold.

For the recurrent internal families, especially OMISSION and WRONG_ITEM, load
expected prevention/control knowledge from TATÁ Academia and other current
operational policy sources, then compare:

```text
observed episode
  -> expected barrier / procedure
  -> recorded action
  -> later recurrence
  -> evidence debt for the Manager Investigator
```

Academia knowledge may establish what should happen. It must never be treated
as proof that the procedure was actually executed on a specific incident.
