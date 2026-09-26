# Edge Contract Convergence

## Decision

The Edge layer is **not** a new canonical event store.

It is an admission/correlation boundary that sits before the existing DeliveryOS memory/event contracts.

## Existing contracts

### Current main — Camada 0

`src/core/dominio.ts` owns the current canonical `Transicao` used by the proven ingestion/replay path.

Relevant properties:

- deterministic `event_id`;
- append-only history;
- replay-safe dedupe;
- explicit source/provenance;
- order-centric flow/outcome dimensions.

This remains authoritative for the current main path.

### Proven platform branch — source/device envelopes

The platform work already defines:

- `DeviceEnvelope` for Android;
- `SourceEventEnvelope` for a future Store Agent;
- local sequence;
- idempotency key;
- `occurred_at` separate from `observed_at`;
- replay flag;
- source-agent heartbeat.

The platform event catalog also separates `occurred_at`, `observed_at` and server receipt time and marks source mode as real/simulated/control.

These semantics are reused by the Edge design. They are not silently treated as merged into main.

### TATÁ OS

TATÁ OS owns print-domain side effects and physical-effect boundaries.

DeliveryOS/Edge may consume receipts, but may not turn a print observation into print authority.

## New Edge contracts

### EdgeSourceObservation

`src/edge/simulator.ts` is a **pre-admission observation** used by the shadow harness.

It is not the canonical event vocabulary.

Its purpose is to test:

- source dedupe;
- late/replayed observation behavior;
- correlation proposals;
- identity evidence.

A future live adapter must translate an observation into the then-current canonical DeliveryOS event contract.

### OrderIdentityGraph

`src/edge/identityGraph.ts` owns only cross-source identity evidence.

It does not own order state, trip state, print state or financial truth.

A link is an evidence object:

`source ref A ↔ source ref B + evidence + confidence class`

## Confidence semantics

No numeric score is used.

- `PROVEN`: explicit source reference, exact external identifier, or explicit human confirmation.
- `SUPPORTED_INFERENCE`: multiple independent operational matches, or a stable match supported by compatible time.
- `CANDIDATE`: some evidence exists but is insufficient.
- `UNKNOWN`: no supporting evidence.

Timestamp proximity alone can never produce `PROVEN`.

## Admission rule

```text
source
  ↓
adapter observation
  ↓
validate + dedupe
  ↓
identity evidence
  ↓
canonical event translation
  ↓
existing DeliveryOS append-only memory/event path
```

The Identity Graph may help choose/carry correlation identifiers. It may not manufacture missing operational events.

## No-duplication rules

- no second order-state projection in Edge;
- no second trip ledger in Edge;
- no second print ledger in Edge;
- no hidden replacement for `Transicao`;
- no generated external identifier presented as a source identifier;
- no source payload promoted from inference to fact.

## Status

- R0 contract convergence: **PROVEN_DESIGN**
- R1 pure simulator: **PROVEN_SYNTHETIC**
- R2 identity graph: **PROVEN_SYNTHETIC**
- live source admission: **NOT_PROVEN**
- cashier-PC binding: **DEFERRED / UNKNOWN**
