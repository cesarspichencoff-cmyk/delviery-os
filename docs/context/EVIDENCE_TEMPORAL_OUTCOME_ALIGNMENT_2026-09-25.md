# Evidence — Temporal Baseline × Observed Operational Outcomes — 2026-09-25

## Purpose

Test whether the daily-closing temporal baseline can be treated as an incident
detector. It cannot.

This alignment uses only observed positive evidence of operational episodes.
Absence of an outcome record is never interpreted as absence of an incident.

## Evidence sources

1. `CAIXA_PULSE_REPLAY_2026-09-23.md`
   - real source replay covering 21/08–23/09;
   - 66 canonical date+shift records;
   - 122 source-declared occurrences;
   - 122 generic occurrence headers reconciled;
   - source grain explicitly warns that one source occurrence is not
     automatically one unique operational event.

2. `GERENCIAL_WATCH_ANOMALY_CALIBRATION_2026-09-23.md`
   - real retrospective Caixa Pulse calibration;
   - morning and night distributions kept separate;
   - observed high raw occurrence counts on 28/08, 29/08, 31/08 and 15/09;
   - 28/08 night also carried an unusual 120-minute iFood pause;
   - count remains a signal, not a rate, because exposure by orders/shift is
     not available there.

3. `GERENCIAL_WATCH_IFOOD_LIVE_RECEIPT_2026-09-24.md`
   - real Gmail review batch;
   - seven visually verified iFood review screenshots;
   - dated review evidence includes 21/08, 22/08, 26/08, 28/08, 29/08 and
     31/08;
   - review text is user report, not root-cause proof.

4. `TATA_GERENCIAL_WATCH_RELATORIO_23-09-2026.md`
   - real shadow managerial analysis over Caixa Pulse records;
   - critical observed signals on 21/08, 22/08, 12/09, 18/09 and 19/09;
   - recurrence of omission/completeness from 18/09 through 21/09;
   - attribution and shared-cause claims remain explicitly open unless evidence
     closes them.

These sources are not exhaustive labels for every business date. Therefore:

`NO_OUTCOME_RECORD != NO_INCIDENT`

and classical false-positive / precision estimates are not authorized from this
alignment.

## Alignment contract

New kernel:
`src/contextKernel/temporalOutcomeAlignment.ts`

It accepts:
- the already fail-closed closing temporal replay;
- only positive observed-outcome evidence with explicit source references.

It emits one of:
- `BASELINE_MISSING`;
- `BASELINE_INSUFFICIENT`;
- `TEMPORAL_CANDIDATE_OVERLAP`;
- `TEMPORAL_SILENT_ON_OBSERVED_OUTCOME`.

Every row preserves:
- `causal_status = UNPROVEN`;
- `incident_detection_claim_authorized = false`;
- `attention_authority = NONE`.

No negative label is manufactured for dates without observed outcome evidence.

## Real alignment result

Observed outcome dates included in the replay:
- 21/08
- 22/08
- 26/08
- 28/08
- 29/08
- 31/08
- 12/09
- 15/09
- 18/09
- 19/09
- 20/09
- 21/09

Result:
- observed outcome dates: 12;
- closing baseline missing: 1 (21/08);
- baseline insufficient: 1 (22/08);
- outcome dates with baseline READY: 10;
- temporal-candidate overlap among those READY dates: 1 (29/08);
- READY outcome dates with no aggregate temporal candidate: 9.

The nine temporal-silent rows are not called "false negatives" because the
temporal baseline was never authorized as an incident detector and the outcome
source is not an exhaustive daily ground-truth registry.

The one overlap does not prove a cause. On 29/08 the closing layer observed
aggregate gross/salão deviation while independent sources observed customer
review / operational occurrence evidence. These are corroborating observations
on the same business date, not a root-cause chain.

## Architectural learning

Daily closing aggregates answer:
- how this business date differs from comparable prior dates;
- whether a metric is unusual within the available history.

Operational-event sources answer:
- what happened;
- where the record says it happened;
- what action was recorded;
- whether a causal investigation remains open.

They are complementary and must not be collapsed.

New invariant:

`TEMPORAL_DEVIATION != OPERATIONAL_INCIDENT != ROOT_CAUSE != CESAR_REQUIRED`

## Proof

- synthetic temporal-outcome alignment regression: PASS;
- outcome absence is not inferred;
- duplicate outcome date fails closed;
- impossible outcome date fails closed;
- missing and insufficient closing coverage remain explicit;
- observed overlap does not authorize causal claims;
- temporal silence does not become false-negative language without exhaustive
  coverage;
- false-positive rate remains blocked;
- Attention authority remains NONE;
- external effects remain unauthorized.

## Next evidence gate

The next layer should use event-level operational facts, not aggregate-closing
deviation, to build durable recurrence memory:

`problem -> investigation -> action -> result/reincidence`

The already-audited historical WhatsApp corpus can teach taxonomy, but its
available exports stop in June 2026 and therefore cannot label this replay
window directly.

For the current window, Caixa Pulse is the strongest dated operational source.
TATÁ Academia should be loaded next as policy/expected-barrier knowledge
(conference, packing, delivery and safety rules), never as proof that a rule was
executed on a specific incident.

No production write or external action is authorized by this evidence.
