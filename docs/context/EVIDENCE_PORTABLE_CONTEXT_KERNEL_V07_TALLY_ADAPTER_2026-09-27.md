# EVIDENCE — Portable César Context Kernel v0.7 / Tally operator-report adapter — 2026-09-27

## Recovery

The previously mature portable César Context Kernel runtime was recovered from the personal Library path:

`/VÉRTICE/CesarContextOS/cesar-context-kernel-v0.6.zip`

The v0.6 package was preserved unchanged as rollback.

Baseline before modification:

- version: 0.6.0
- automated tests: 67/67 PASS
- compileall: PASS
- external actions: disabled
- production writes: 0

## v0.7 objective

Prepare the canonical portable higher-layer runtime to consume the already-proven minimized DeliveryOS Tally barrier bridge without waiting for a synthetic production incident and without turning operator self-report into independent proof.

The v0.7 package was built as a separate copy.

## New source adapter

Added:

`src/cesar_context_kernel/tally_barrier.py`

API:

`POST /sources/tally/barrier-observation`

Expected contract:

`watch-tally-barrier-evidence@0.1.0`

Expected live form:

`ZjVv1a`

Event Spine projection:

- source: `TALLY`
- kind: `tally.occurrence.barrier_report`
- domain: `WORK`
- evidence class: `OPERATOR_REPORT`
- source semantics: `POINT_IN_TIME`
- authority: `OBSERVATION_ONLY`

## Truth and authority boundary

The adapter does not infer:

- barrier failure;
- barrier compliance;
- cause;
- guilt;
- resolution;
- need for César.

It creates no commitment, no automatic `NEEDS_CESAR`, no attention expenditure and no external effect.

Raw operator name, order reference, incident narrative and action narrative are not part of the accepted contract.

## Evidence Debt behavior

The existing Investigator resolves matching Evidence Debt only from qualifying `STRUCTURED_SOURCE` evidence.

The Tally adapter ingests `OPERATOR_REPORT` and does not invoke Investigator during ingestion.

A dedicated test creates a matching open Evidence Debt, admits the Tally operator report and proves that the debt remains OPEN with no resolution event.

## Idempotency

- exact replay of the same form/submission/content: idempotent, `created=false`;
- same form/submission with changed semantic payload: fail closed as `tally_barrier_replay_conflict`;
- wrong form identity: fail before persistence;
- wrong barrier set for subtype: fail before persistence;
- blank category: fail before persistence;
- extra raw fields or promoted truth class: API schema rejects with 422.

## Proof

v0.7 final:

- 77/77 automated tests PASS;
- `python -m compileall -q src tests`: PASS;
- zero packaged SQLite/DB files;
- zero packaged Python cache directories;
- external actions: disabled;
- production writes: 0.

Package:

`/VÉRTICE/CesarContextOS/cesar-context-kernel-v0.7.zip`

ZIP SHA-256:

`5318950cb94bc097e8d3701cc86cb11c0a7e1f6195f1dab5ca869105ed48e497`

## Current promotion boundary

CODE_READY / TEST_PASS only.

The v0.7 portable kernel is not connected to the production Tally webhook.

DeliveryOS Gate E remains prerequisite: the first real post-cutover `ZjVv1a` occurrence must prove the exact live 20-column Google Sheets serialization and legacy workbook compatibility.

Only after Gate E passes should the signed live webhook be wired and the minimized barrier envelope fed into v0.7 in shadow for a real idempotent observation proof.
