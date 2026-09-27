# Portable César Context Kernel v0.10 — Investigation Plan Proof

Date: 2026-09-27

## Scope

A separate portable package `cesar-context-kernel-v0.10.zip` was built from the preserved v0.9 line. v0.9 remains an intact rollback artifact.

v0.10 adds a pure read-only planning projection:

`POST /shadow/investigation/tally-plan`

It consumes the v0.9 `TESTABLE_UNPROVEN` hypotheses and compiles their evidence requirements into deterministic, deduplicated probe candidates.

## Planner contract

The planner can identify bounded probe classes such as:
- denominator/exposure check;
- incident structured trace;
- barrier execution proof;
- source lineage;
- cross-source field comparison;
- source independence.

The planner does not execute any probe.

Every probe remains:
- `objective = DISCONFIRM_OR_REDUCE_UNCERTAINTY`;
- `execution_status = NOT_EXECUTED`;
- `execution_authorized = false`;
- `requires_cesar = false`;
- `source_independence_status = UNKNOWN`.

The result preserves:
- `hypothesis_status = TESTABLE_UNPROVEN`;
- `causal_status = UNPROVEN`;
- `evidence_debt_mutated = false`;
- `connectors_called = false`;
- `creates_commitment = false`;
- `creates_needs_cesar = false`;
- `attention_authority = NONE`;
- `external_effect_authorized = false`.

The existing explicit `as_of` boundary is inherited through the context/hypothesis chain.

## Learning closure

The first v0.10 regression exposed three stale tests that still asserted literal runtime version `0.9.0`. This was the same version-bump failure class already observed during v0.9.

The route was changed rather than patched again:
- runtime/API version now comes from `cesar_context_kernel.__version__`;
- API tests read that single runtime source instead of hard-coded literals;
- a new regression test requires `pyproject.toml` package metadata to match runtime `__version__`.

This closes the repeated version-drift failure class at the routing/test level.

## Final packaged-byte proof

- version: `0.10.0`;
- tests from final extracted ZIP: `98/98 PASS`;
- `python -m compileall -q src`: `PASS`;
- ZIP integrity: `PASS`;
- forbidden package entries (SQLite/DB, Python cache, pytest cache): `NONE`;
- Library path: `/VÉRTICE/CesarContextOS/cesar-context-kernel-v0.10.zip`;
- SHA-256: `1b9ee6b04db73ffddb201fef5fe735bc64ac02256edfb9e44d72d1ca1de2cc80`;
- ZIP bytes: `70389`;
- canonical VÉRTICE HEAD at build: `e81b6d810e6a20e4a7e2f55ff9d1902b23dcf664`;
- DeliveryOS HEAD used at build: `6f76d24e04b2f80447d6626528f9cf792adbd88e`.

## Reality boundary

This remains `CODE_READY / TEST_PASS`.

It does not prove:
- first real post-cutover `ZjVv1a` occurrence;
- live 20-column Google Sheets serialization;
- live webhook delivery into the portable kernel;
- source independence;
- cause, guilt, barrier execution or resolution;
- execution of any investigation probe.

DeliveryOS Gate E remains pending and no synthetic production incident was created.
