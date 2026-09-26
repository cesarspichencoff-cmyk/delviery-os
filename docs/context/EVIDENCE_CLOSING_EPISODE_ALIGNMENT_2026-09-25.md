# Evidence — Closing Temporal Candidates × Recorded Episodes — 2026-09-25

## Purpose

Test whether the retrospective closing outlier candidates co-locate with
independently recorded operational episodes, without converting correlation
into cause or turning the temporal model into an alert engine.

## Sources

Temporal source:

- `D1:cesar-gerencial-mail-bridge.daily_closings`;
- 54 business dates;
- baseline range: 2026-07-14 through 2026-09-24;
- temporal replay truth class: `RETROSPECTIVE_SIMULATION`.

Episode source:

- Caixa Pulse closing emails in César's Gmail;
- shift-level Manhã/Noite occurrence records;
- same business-date matching only.

The historical WhatsApp corpus is explicitly excluded from same-period
validation because its raw export ends on 2026-06-25, before this baseline
starts.

## Coverage boundary

Across the 54 D1 business dates:

- full Manhã + Noite email coverage: **39** dates;
- partial one-shift coverage: **10** dates;
- no loaded Caixa Pulse email evidence: **5** dates.

All **11** temporal candidate dates have full-day Manhã + Noite coverage.

Rule:

```text
RECORDED EPISODE in partial evidence -> presence supported
NO EPISODE in partial/no evidence    -> absence UNKNOWN
NO EPISODE with full-day evidence    -> no recorded episode in loaded source
```

## Candidate-day alignment

| Business date | Temporal diagnostic candidates | Recorded incidents | Open | iFood pause | Descriptive alignment |
| --- | --- | ---: | ---: | ---: | --- |
| 2026-08-18 | gross LOW; iFood orders HIGH; salão LOW; discounts HIGH | 3 | 1 | 0 min | candidate + recorded episode |
| 2026-08-23 | iFood value HIGH | 6 | 0 | 0 min | candidate + recorded episode |
| 2026-08-24 | discounts HIGH | 0 | 0 | 15 min | candidate without recorded episode |
| 2026-08-29 | gross HIGH; salão HIGH | 9 | 0 | 65 min | candidate + recorded episode |
| 2026-09-01 | gross LOW; iFood orders LOW; iFood value LOW | 1 | 0 | 4 min | candidate + recorded episode |
| 2026-09-05 | gross LOW; salão LOW | 2 | 0 | 15 min | candidate + recorded episode |
| 2026-09-07 | gross HIGH; iFood orders HIGH; iFood value HIGH; salão HIGH | 2 | 1 | 75 min | candidate + recorded episode |
| 2026-09-08 | gross LOW; iFood orders LOW | 5 | 0 | 0 min | candidate + recorded episode |
| 2026-09-09 | iFood orders LOW; iFood value LOW | 4 | 0 | 0 min | candidate + recorded episode |
| 2026-09-14 | gross LOW; iFood value LOW; discounts HIGH | 2 | 0 | 0 min | candidate + recorded episode |
| 2026-09-23 | iFood orders LOW; iFood value LOW | 0 | 0 | 0 min | candidate without recorded episode |

Observed:

- candidate dates with a recorded episode: **9/11**;
- candidate dates without a recorded episode: **2/11**;
- both absence cases have full-day email coverage, so the narrower statement
  "no recorded Caixa Pulse occurrence that day" is supported;
- 2026-08-24 still had 15 minutes of iFood pause. Pause is preserved as a
  separate operational signal and is not silently relabeled as an incident.

## Disconfirmation result

The stronger finding is on the other side:

- **33** D1 dates had a recorded operational episode without being a temporal
  closing candidate;
- among full-day email evidence, **26** non-candidate dates still had recorded
  episodes;
- among the 39 full-day evidence dates, 35 had at least one recorded episode.

Therefore the temporal closing candidate is **not** a general incident detector.

This directly disconfirms the route:

```text
CLOSING OUTLIER -> "bad operational day" -> interrupt César
```

The correct role is narrower:

```text
closing temporal candidate
    -> descriptive context / investigation clue
    -> combine with independent event evidence
    -> causal status remains UNPROVEN
```

## Examples from source evidence

- 2026-08-18: three recorded incidents, including an open review item; the
  temporal model also produced four descriptive candidates.
- 2026-09-08: five recorded incidents, including swapped bags and refund /
  re-send actions; the temporal model flagged low gross and low iFood orders.
- 2026-09-09: four recorded incidents, including delay cancellation and a
  food-quality complaint; the temporal model flagged low iFood orders/value.
- 2026-09-14: two recorded customer complaints (cold hot roll and leaked
  yakisoba); the temporal model flagged low gross/value and high discounts.
- 2026-09-23: zero recorded incidents in both shifts and zero iFood pause,
  despite low iFood order/value candidates.

These are co-locations only. No example proves that an incident caused a
metric deviation or vice versa.

## Attention boundary

This evidence strengthens the existing decision:

- temporal candidates create **0** direct NeedsMe reasons;
- they create **0** SHOW_NOW decisions by themselves;
- causal status remains `UNPROVEN`;
- external effects remain unauthorized.

The new `episodeAlignment` compatibility harness also fails closed on partial
absence evidence: incomplete shift coverage cannot be treated as proof that
nothing happened.

## Next highest-value gate

Move from day-level co-location to event-level supported sequences:

```text
recorded problem
    -> investigation / action
    -> observed result or recurrence
```

Use only overlapping, dated evidence. The historical WhatsApp corpus may
supply taxonomy and recurring mechanisms, but not same-period labels for this
July–September baseline.

The resulting event-level labels can train the Manager Investigator without
making the temporal statistics responsible for causality or interruption.
