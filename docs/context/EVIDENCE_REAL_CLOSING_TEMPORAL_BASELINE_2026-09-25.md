# Evidence — Real Closing Temporal Baseline — 2026-09-25

## Purpose

Build the first temporal memory layer from the real daily closing source and
replay it without turning descriptive anomalies into causal claims or
interruptions for César.

Source:
`D1:cesar-gerencial-mail-bridge.daily_closings`

The extraction query was read-only. No production row was written or changed.

## Source scope and quality

Observed source facts:
- 54 rows;
- 54 unique mailbox UIDs;
- 54 unique business dates;
- range: 2026-07-14 through 2026-09-24;
- all 54 rows have read-only verification;
- 19 calendar dates inside the range have no source row.

Weekday source coverage:
- Sunday: 7
- Monday: 9
- Tuesday: 10
- Wednesday: 9
- Thursday: 3
- Friday: 8
- Saturday: 8

Availability caveat:
- 51/54 rows were ingested more than 24 hours after source observation;
- 44/54 were ingested more than 7 days later.

Therefore this is a retrospective replay over source facts available now.
It is not evidence that the system possessed those rows in real time on their
historical business dates.

Quality partition:
- 52 observations eligible for descriptive daily baseline;
- 1 zero-gross source row excluded: 2026-07-22;
- 1 repeated operational metric signature excluded: 2026-09-03, matching the
  earlier 2026-08-03 daily signature;
- 16 rows have financial reconciliation still open;
- 37 rows have period-label mapping debt.

Financial reconciliation or period-label debt remains explicit. It does not
become a causal interpretation and does not silently disappear.

## Baseline method

For each eligible daily closing:
1. use only earlier business dates;
2. compare only with the same weekday;
3. require four prior eligible weekday peers before creating a quartile
   envelope;
4. apply Tukey 1.5×IQR only as a robust diagnostic rule;
5. evaluate gross total, iFood order count, iFood value, salão value and
   discounts;
6. preserve every candidate as descriptive-only and causal status UNPROVEN.

The four-peer requirement is a data sufficiency guard for the quartile
diagnostic. It is not an alert threshold.

Additional fail-closed regressions prove that:
- impossible calendar dates are rejected instead of JavaScript date-normalized;
- a non-eligible/unverified row cannot poison later duplicate-signature checks;
- duplicate business dates are rejected.

## Replay result

- ready baseline steps: 26;
- insufficient-peer steps: 26;
- excluded observations: 2;
- temporal anomaly candidates: 26;
- business dates with at least one candidate: 11.

Candidate dates:
- 2026-08-18
- 2026-08-23
- 2026-08-24
- 2026-08-29
- 2026-09-01
- 2026-09-05
- 2026-09-07
- 2026-09-08
- 2026-09-09
- 2026-09-14
- 2026-09-23

The latest closing, 2026-09-24, remains INSUFFICIENT_PEERS because only one
earlier Thursday is eligible after the repeated-signature exclusion. No
normality claim is made.

## Attention Governor replay

Historical personal/work mode is not known, so the replay keeps mode UNKNOWN.
Closing-only temporal candidates do not satisfy any direct NeedsMe reason.

Result:
- closing steps evaluated: 54;
- temporal candidates converted to direct attention reasons: 0;
- SHOW_NOW decisions from temporal data alone: 0;
- governor effect authorized: false;
- external effects authorized: false.

This is intentional. A statistical deviation is not evidence that César must
be interrupted.

## Next evidence gate

Closing data alone cannot label false alerts or false silences because it does
not record whether a real operational incident required intervention.

The next correct step is to align historical SAC/WhatsApp and TATÁ Academia
evidence to this timeline, extracting only supported sequences of:
problem -> investigation -> action -> result/reincidence.

Those labels can then test which temporal candidates corresponded to real
operational episodes, which were benign variation, and which incidents were
invisible to closing metrics.

No production deployment was required for this retrospective baseline.
