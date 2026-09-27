# R3 — Reuse Plan for the Edge Runtime

## Decision

Do not build a second runtime stack for the cashier Edge node.

The repository already contains stronger primitives on the proven platform/Entregas lineage. R3 will selectively port/reuse those mechanisms into the Edge branch, then bind them to the new source adapters.

## Proven mechanisms to reuse

### Source-agent envelope

Source:
`feature/deliveryos-hybrid-platform-foundation-v1:src/platform/contracts/device-envelope.ts`

Reusable semantics:

- `SourceEventEnvelope`;
- `SourceAgentIdentity`;
- local sequence;
- cursor/resume point;
- idempotency key;
- separate `observed_at` / `occurred_at`;
- replay flag;
- evidence hash;
- `AgentHeartbeat`.

This is a direct fit for the cashier Edge node.

### Local durable persistence

Source:
`feature/deliveryos-hybrid-platform-foundation-v1:src/entregas/persistence/file-store.ts`

Already proven in its own lineage:

- local file-backed Unit of Work;
- temp-write + atomic rename;
- restart/reopen path;
- persisted outbox;
- duplicate prevention;
- rollback path.

It is not multi-instance production storage, which is acceptable for a single-PC Edge node when used only as local store-and-forward.

### Outbox

Source:
`feature/deliveryos-hybrid-platform-foundation-v1:src/entregas/integration/outbox.ts`

Reusable semantics:

- pending / published / failed / dead_letter;
- event + idempotency dedupe;
- retry without reverting domain state;
- publication receipt.

### Runtime separation

Sources:

- `src/platform/runtime/critical.ts`
- `src/platform/runtime/async-worker.ts`

Reusable rule:

- critical ingestion depends only on durable storage;
- asynchronous consumers can fail without stopping operational capture;
- backlog is signal, not permission to block the operation.

For Edge this becomes:

```text
capture/journal = critical
portal refresh/correlation/upload = async
```

## What will NOT be copied blindly

- PostgreSQL/cloud assumptions;
- CRM/Copilot modules;
- unrelated UI/platform code;
- trip-domain repositories that do not serve Edge;
- numeric health thresholds without Edge-specific baseline;
- any code whose proof exists only on an old branch but cannot be replayed on the new branch.

## R3 target slice

The smallest useful runtime slice is:

```text
SourceAgentEnvelope
        ↓
validator/dedupe
        ↓
local durable journal
        ↓
durable outbox
        ↓
async sender
        ↓
heartbeat/health
```

Adapters remain separate processes/modules.

## Required proofs before R3 is called complete

1. same observation replayed after process restart creates no duplicate accepted meaning;
2. local journal survives restart;
3. outbox survives restart;
4. network/upload failure does not lose the observation;
5. one adapter crash does not invalidate the journal;
6. Edge runtime unavailable does not affect Teknisa, iFood browser use, TATÁ OS or printing;
7. no production write capability is present.

## Current status

- mechanism discovery: **PROVEN_REPOSITORY**
- selective port: **NOT_STARTED**
- R3 implementation: **NOT_PROVEN**
- cashier-PC installation: **NOT_AUTHORIZED / DEFERRED**

## Next action

Create a minimal, dependency-light Edge persistence slice by porting only the source-envelope + durable journal/outbox semantics, then replay synthetic R1/R2 fixtures through restart/failure tests.
