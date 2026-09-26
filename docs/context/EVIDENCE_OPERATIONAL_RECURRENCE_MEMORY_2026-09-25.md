# Evidence — Current-Window Operational Recurrence Memory — 2026-09-25

## Objective

Move from day-level closing anomalies to the more useful managerial sequence:

```text
problem
  -> recorded action / review state
  -> recurrence memory
  -> later observed outcome when evidence exists
```

without turning repeated text patterns into a fabricated root cause.

## Overlapping source

The source used here is the same-period Caixa Pulse closing-email stream, not
the older WhatsApp archive.

Loaded range:

- business dates evaluated: 2026-07-14 through 2026-09-24;
- closing emails loaded: **121**;
- structured occurrence blocks parsed: **181**.

One source occurrence block is evidence that an occurrence record exists. It
is not automatically a globally unique incident, and a source status of
`Concluído` is not proof that the customer/business outcome was successful.

## Source status

Across the 181 parsed occurrence blocks:

- source-marked `Concluído`: **164**;
- source-marked `Necessário Revisão`: **17**.

Invariant:

`SOURCE_MARKED_CONCLUDED != OUTCOME_PROVEN`

The current emails usually record an action, not a later independent outcome.

## Rule-inferred mechanism families

A deterministic text classifier was used only for exploratory taxonomy.
Classification status is therefore `RULE_INFERRED`, not source-declared root
cause.

| Rule-inferred family | Occurrence blocks | Distinct business dates | Source marked review needed |
| --- | ---: | ---: | ---: |
| OMISSION | 48 | 29 | 6 |
| UNCLASSIFIED | 37 | 25 | 5 |
| DELAY_LOGISTICS | 33 | 16 | 0 |
| CUSTOMER_OR_OTHER_CANCEL | 24 | 15 | 0 |
| WRONG_ITEM | 20 | 17 | 3 |
| FOOD_QUALITY | 6 | 6 | 1 |
| PACKAGING_LEAK | 4 | 3 | 0 |
| SAFETY_CONTAMINATION | 3 | 3 | 2 |
| ITEM_UNAVAILABLE | 2 | 2 | 0 |
| BAG_SWAP_CUSTODY | 2 | 1 | 0 |
| PLATFORM_FAILURE | 2 | 2 | 0 |

The `CUSTOMER_OR_OTHER_CANCEL` family is intentionally mixed and must not be
treated as a TATÁ failure class without a more specific investigation.

The **37 UNCLASSIFIED** blocks are evidence debt, not permission to force a
category.

## Recorded action terms

Action-text mentions in the same source included:

- cancellation: **78**;
- refund: **56**;
- re-send: **33**;
- apology: **1**.

A single action line can contain more than one term, so these are mention
counts, not mutually exclusive outcomes.

## Cross-period learning without timeline abuse

The older WhatsApp study identified omission/non-retention and custody errors
as recurring operational mechanisms before 2026-06-25.

The current-window Caixa Pulse source independently contains **48**
rule-inferred omission-family records across **29 distinct business dates**.

This supports a narrower learning:

`OMISSION_FAMILY_RECURS_ACROSS_PERIODS`

It does **not** support:

- one shared root cause across all omissions;
- one responsible person;
- a claim that a recorded action solved the recurrence;
- direct interruption of César.

The custody family is also visible in the current window, but the two bag-swap
records occurred on one business date. That is a cluster, not cross-day
recurrence.

## New recurrence-memory contract

`src/contextKernel/episodeRecurrence.ts` accepts already-classified evidence
and deliberately refuses to classify free text itself.

A mechanism is marked recurrent only when the same mechanism key is observed
on at least two distinct business dates.

Every mechanism summary preserves:

- `shared_root_cause_status = UNPROVEN`;
- source-marked conclusion separately from observed outcome;
- `attention_authority = NONE`;
- `external_effect_authorized = false`.

`UNCLASSIFIED` evidence is counted but never promoted into a mechanism
recurrence.

## Why this is stronger than the temporal baseline

The closing baseline showed that aggregate temporal anomalies are not a general
incident detector.

The episode recurrence layer instead starts from an observed problem record and
asks whether the same *classified family* appears again.

That supports the Manager Investigator question:

```text
"we recorded this family before; what changed after the previous action?"
```

It still does not answer why the problem happened.

## Next proof gate

For recurrent families, especially OMISSION, the next gate is to find explicit
post-action evidence:

```text
episode A
  -> action A
  -> later independent outcome or recurrence
```

Only then can the system learn whether an action appears to reduce, fail to
reduce, or leave recurrence unresolved.

Until such evidence exists:

`ACTION_RECORDED != ACTION_EFFECTIVE`
