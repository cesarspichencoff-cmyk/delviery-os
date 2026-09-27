# Portable César Context Kernel v0.9 — Hypothesis + Disconfirmation Proof

Date: 2026-09-27

## Scope

A separate portable package `cesar-context-kernel-v0.9.zip` was built from the preserved v0.8 line. v0.8 remains an intact rollback artifact.

v0.9 adds a pure read-only hypothesis/disconfirmation projection:

`POST /shadow/investigation/tally-hypotheses`

The layer consumes the already-bounded Tally operator-report/context path and produces deterministic investigation targets without promoting pattern, report, agreement or recurrence to fact.

## Hypothesis classes

- `RECURRENCE_MECHANISM_TEST`
- `BARRIER_EXECUTION_STATE_TEST`
- `CROSS_SOURCE_CONSISTENCY_TEST`

Every candidate remains `TESTABLE_UNPROVEN` and carries:
- competing explanations;
- evidence needed;
- an explicit falsification rule;
- `source_independence_status = UNKNOWN`;
- `causal_status = UNPROVEN`;
- `barrier_failure_status = UNPROVEN`;
- `barrier_compliance_status = UNPROVEN`.

Recurrence keeps alternatives including shared process condition, exposure/volume difference, classification artifact, distinct mechanisms with the same label and coincidence.

Operator barrier status is never promoted to execution/failure/compliance proof.

Cross-source agreement is never treated as independent corroboration unless lineage/independence is separately proven.

## Explicit temporal replay

The existing context projection and the new hypothesis projection now support optional `as_of`.

- no `as_of`: current investigation can use currently available evidence sharing the explicit correlation key, including evidence gathered after the incident;
- explicit `as_of`: correlated evidence after the cutoff is excluded;
- `as_of < anchor.occurred_at`: fail closed with `tally_context_as_of_before_anchor`.

This preserves legitimate post-incident evidence while preventing future-evidence leakage during historical replay.

## State/effect boundary

The v0.9 projection:
- does not create or resolve Evidence Debt;
- may surface matching OPEN Evidence Debt ids read-only;
- creates no commitment;
- creates no automatic NEEDS_CESAR;
- invokes no attention authority;
- sends no notification;
- authorizes no external effect;
- persists no hypothesis event.

## Development findings / learning closure

1. The first v0.9 full test run had two failures because old API tests still asserted literal version `0.8.0`. Only the test expectations were updated; no truth/authority gate was weakened.
2. An adversarial audit then identified a potential temporal-replay concern. A first attempted fix cut all correlated evidence off at the incident timestamp. Existing tests correctly rejected that route because evidence about an incident may legitimately be collected after the incident.
3. The defective route was replaced rather than reworded: the final design adds explicit `as_of`, preserving current investigation semantics while making historical replay bounded and testable.

## Final packaged-byte proof

- version: `0.9.0`;
- tests from final extracted ZIP: `93/93 PASS`;
- `python -m compileall -q src`: `PASS`;
- ZIP integrity: `PASS`;
- forbidden package entries (SQLite/DB, Python cache, pytest cache): `NONE`;
- Library path: `/VÉRTICE/CesarContextOS/cesar-context-kernel-v0.9.zip`;
- SHA-256: `5041c0a485bceac52f63cc5053382234e8918efa1cbac4d43f000928506bb508`;
- ZIP bytes: `67071`.

## Reality boundary

This remains `CODE_READY / TEST_PASS`.

It does not prove:
- first real post-cutover `ZjVv1a` occurrence;
- live 20-column Google Sheets serialization;
- live webhook delivery into the portable kernel;
- source independence;
- cause, guilt, barrier execution, barrier effectiveness or resolution.

DeliveryOS Gate E remains pending and no synthetic production incident was created.
