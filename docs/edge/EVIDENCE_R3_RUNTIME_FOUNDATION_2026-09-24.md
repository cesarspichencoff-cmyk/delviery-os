# R3 Edge Runtime Foundation Proof — 2026-09-24

## Scope

Branch: `design/tata-edge-runtime-foundation-v1`

No production deploy, cashier-PC installation, browser automation, Teknisa write, iFood write, print submission or external operational effect occurred.

## Implemented

- `src/edge/runtime/sourceEnvelope.ts`
  - source-agent identity;
  - local sequence;
  - cursor;
  - idempotency key;
  - `observed_at` separate from `occurred_at`;
  - replay/evidence-hash fields.

- `src/edge/runtime/store.ts`
  - single-PC local store-and-forward;
  - atomic temp-write + rename;
  - backup fallback;
  - observation + outbox persistence;
  - duplicate recognition after restart;
  - failed item retained for retry;
  - sensitive auth fields refused from persisted payload.

- `src/edge/runtime/supervisor.ts`
  - adapter failures isolated per module;
  - one failing collector does not stop another collector.

- `demo/edge_runtime_proof.ts`
  - restart/recovery proof runner.

## Isolated proof

The runtime logic was compiled/exercised in an isolated local harness.

Runtime result:

```json
{
  "status": "PASS",
  "restart_survival": true,
  "duplicate_after_restart": true,
  "failed_outbox_survives_restart": true,
  "secret_persistence_blocked": true,
  "adapter_failure_isolated": true
}
```

The isolated container did not have the repository's `@types/node` package installed, so its direct TypeScript invocation reported missing declarations for `node:fs`, `node:path` and `node:crypto`. The repository itself declares `@types/node` as a dev dependency. Therefore:

`RUNTIME_BEHAVIOR_PROOF_PASS != FULL_REPOSITORY_TYPECHECK_PROVEN`

The full repository command remains:

```text
npm run test:edge:runtime
```

and must be run in a normal checkout with dependencies installed before R3 can be promoted beyond experimental foundation.

## What this proves

- Edge observations can survive a process restart in the single-PC local model;
- replay after restart does not create duplicate accepted meaning;
- upload/network failure can remain durably pending;
- auth secrets such as OTP/token/cookie fields are rejected from persisted payloads;
- adapter crash isolation works in the synthetic harness.

## What remains unproven

- full repository build/typecheck on this branch;
- Windows-specific filesystem behavior on the cashier PC;
- actual resource impact beside the PDV;
- live iFood/Teknisa/TATÁ OS adapters;
- real browser/session/auth behavior;
- real printer/spooler observation.

## Classification

- R3 foundation: **PROVEN_SYNTHETIC_BEHAVIOR / FULL_REPO_TYPECHECK_PENDING**
- production use: **NOT_AUTHORIZED**
- cashier-PC binding: **DEFERRED**
