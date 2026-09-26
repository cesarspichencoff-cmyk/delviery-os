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

## Proof runner implemented; current execution evidence pending

The branch contains `demo/edge_runtime_proof.ts` and the command:

```text
npm run test:edge:runtime
```

No successful execution receipt is observable in the current session. The available remote workstation is offline, and this tool surface does not execute the private repository directly.

Therefore:

`IMPLEMENTED_ASSERTIONS != EXECUTED_PROOF`

A normal checkout with dependencies installed must run the command before R3 can be promoted beyond implemented synthetic foundation.

## What the implemented proof is designed to prove

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

- R3 foundation: **IMPLEMENTED_SYNTHETIC / EXECUTION_PENDING**
- production use: **NOT_AUTHORIZED**
- cashier-PC binding: **DEFERRED**
