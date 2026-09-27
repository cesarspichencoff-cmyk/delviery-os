# Portable César Context Kernel v0.8 — Temporal Investigation Proof

Date: 2026-09-27

## Scope

A separate portable package `cesar-context-kernel-v0.8.zip` was built from the preserved v0.7 line. v0.7 remains an intact rollback artifact.

The v0.8 material delta is a read-only shadow projection at:

`POST /shadow/investigation/tally-context`

It lets an already-admitted Tally `OPERATOR_REPORT` participate in bounded temporal/investigation context without changing its truth class or authority.

## Proven local behavior

- package version: `0.8.0`;
- final packaged regression: `85/85 PASS`;
- `python -m compileall -q src`: `PASS`;
- ZIP integrity test: `PASS`;
- package contains no SQLite/DB, Python cache or pytest cache;
- Library path: `/VÉRTICE/CesarContextOS/cesar-context-kernel-v0.8.zip`;
- SHA-256: `f5f2483248e01aee2d3c460c5ecff046d3ad9a5a079afdfd30168f0ddf2c7a99`.

## Investigation semantics

The projection may describe recurrence inside an explicit 1–365 day lookback window.

It separates:
- same subtype recurrence;
- same category + subtype recurrence;
- linked `STRUCTURED_SOURCE` events;
- linked `USER_REPORT` events;
- nonqualifying related evidence.

Cross-source evidence is surfaced only when the event shares the explicit `correlation_key`. Temporal proximity alone is never used as a join.

A different source is not automatically treated as independent. `source_independence_status` remains `UNKNOWN` in this package.

The projection always preserves:
- `causal_status = UNPROVEN`;
- `barrier_failure_status = UNPROVEN`;
- `barrier_compliance_status = UNPROVEN`;
- `resolves_evidence_debt = false`;
- `creates_commitment = false`;
- `creates_needs_cesar = false`;
- `attention_authority = NONE`;
- `external_effect_authorized = false`.

## Adversarial proof

Tests cover:
- no future leakage into recurrence;
- exclusion outside the lookback window;
- same subtype in another category not promoted to same-category recurrence;
- structured evidence close in time but on another correlation key not linked;
- `USER_REPORT` separated from `STRUCTURED_SOURCE`;
- `DERIVED` and other `OPERATOR_REPORT` evidence kept nonqualifying;
- noncanonical Tally anchor fails closed;
- context query leaves matching Evidence Debt open and does not create commitments.

## Reality boundary

This is `CODE_READY / TEST_PASS` only.

It does not prove:
- the first real post-cutover `ZjVv1a` occurrence;
- the live 20-column Google Sheets serialization;
- live webhook delivery into the portable kernel;
- source independence;
- cause, guilt, barrier execution, resolution or action effectiveness.

DeliveryOS Gate E therefore remains pending and no synthetic production incident was created.
