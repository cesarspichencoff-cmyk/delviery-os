# WORLD PROOF — Gerencial Watch Shadow Smoke — 2026-09-25

## Scope

Authenticated synthetic smoke against the deployed shadow Worker and dedicated
D1. No real restaurant data, no mail mutation, no printer action, no cashier-PC
action and no external operational effect.

## Deployed surfaces

Worker:

`cesar-gerencial-watch-bridge`

D1:

`cesar-gerencial-watch`

D1 id:

`75516adf-6196-460a-82d4-9aa6925dbed4`

## Auth boundary

Observed:

```text
GET /health                -> 200
GET /snapshot unauthenticated -> 401
```

The bearer secret was rotated before the successful smoke.

## Synthetic ingress proof

A single synthetic Edge handoff was accepted at:

`POST /sources/tata-edge/handoff`

Observed response projection:

```json
{
  "accepted": true,
  "truthClass": "SIMULATION",
  "validity": "DEGRADED",
  "allClear": false,
  "needsCesar": 1,
  "criticalQueue": 1,
  "externalEffects": false
}
```

This proves:

- authenticated ingress works;
- SIMULATION remains SIMULATION;
- synthetic data is not promoted to FACT;
- incomplete freshness/global coverage remains DEGRADED;
- no global all-clear is authorized;
- a human-required iFood auth exception can surface as a direct César need;
- runtime does not authorize external effects.

## Safe post-smoke reset

After the synthetic proof, an explicit EMPTY handoff was accepted.

Observed current snapshot:

```json
{
  "accepted": true,
  "truthClass": "EMPTY",
  "validity": "INSUFFICIENT",
  "allClear": false,
  "needsCesar": 0,
  "criticalQueue": 0,
  "externalEffects": false
}
```

This prevents the synthetic human-required case from remaining as the current
runtime state.

## D1 persistence proof

Read-only remote SQL after the smoke:

```text
edge_handoff_history            12 rows
watch_runtime_snapshot_history  17 rows

current watch_runtime_snapshot:
truth_class         EMPTY
validity_status     INSUFFICIENT
source_watermark_at NULL
```

The SQL verification itself reported `changes=0` and `rows_written=0`.

## Truth classification

`WORLD_PROVEN_SHADOW`

for:

- Worker reachability;
- bearer authentication boundary;
- synthetic Edge handoff admission;
- D1 persistence;
- snapshot projection;
- truth-class preservation;
- fail-closed all-clear semantics;
- zero external-effect authorization.

Still NOT proven:

- live TATÁ Edge producer feeding this Worker continuously;
- live iFood/Teknisa/spooler ingestion into Edge;
- live Gerencial Watch attention delivery;
- Apple Watch delivery;
- production personal-context source coverage.

Those remain later gates.
