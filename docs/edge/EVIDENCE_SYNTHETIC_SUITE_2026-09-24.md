# Edge Synthetic Suite Status — 2026-09-24

## Scope

Branch: `design/tata-edge-runtime-foundation-v1`

No production deployment, cashier-PC installation, live iFood browser session, real OTP, printer query, print submission or Teknisa write occurred.

## Synthetic suite execution status

The Edge proof runners are implemented, but this session does not contain an observed successful execution receipt from a normal checkout. The connected Foxxy workstation is currently offline.

```text
edge_shadow_proof                 IMPLEMENTED / EXECUTION_PENDING
edge_runtime_proof                IMPLEMENTED / EXECUTION_PENDING
edge_ifood_shadow_proof           IMPLEMENTED / EXECUTION_PENDING
edge_print_shadow_proof           IMPLEMENTED / EXECUTION_PENDING
edge_sources_bridge_proof         IMPLEMENTED / EXECUTION_PENDING
edge_projection_rebuild_proof     IMPLEMENTED / EXECUTION_PENDING
edge_admission_pipeline_proof     IMPLEMENTED / EXECUTION_PENDING
```

Assertions implemented:

- replay adds zero duplicate accepted meaning;
- runtime state survives restart;
- failed outbox items remain recoverable;
- auth secrets are blocked from persisted metadata;
- one adapter failure does not stop another adapter;
- iFood Sidecar contract is observation-only;
- print observer has no print-control capability;
- spooler/software state never proves physical output;
- Teknisa payment mapping alone creates no identity link;
- exact external order id can produce a PROVEN identity link;
- TATÁ OS receipts do not transfer print authority to DeliveryOS;
- Order Identity Graph rebuilds deterministically from the durable observation journal after restart;
- no fake `UNKNOWN` order entity is created;
- iFood + Teknisa + print + TATÁ OS observations enter one durable admission path;
- restart preserves the same cross-source identity projection;
- replay of an admitted source observation does not grow the journal.

## Important correction discovered during proof

The first Teknisa adapter draft represented a payment mapping such as `ONLINE_IFOOD` as a candidate link to an `UNKNOWN` iFood order.

That was rejected because it would create a false shared entity and could accidentally correlate unrelated orders.

The corrected rule is:

`PAYMENT_CHANNEL_CONTEXT != ORDER_IDENTITY_EVIDENCE`

Payment mapping remains source context only. Identity proposals require an actual target identifier or other explicit correlation evidence.

## Current classification

- R0 contract convergence: `IMPLEMENTED_DESIGN`
- R1 pure replay simulator: `IMPLEMENTED_SYNTHETIC / EXECUTION_PENDING`
- R2 identity graph: `IMPLEMENTED_SYNTHETIC / EXECUTION_PENDING`
- R3 local store-and-forward foundation: `IMPLEMENTED_SYNTHETIC / EXECUTION_PENDING`
- R4 iFood auth/sidecar contract: `IMPLEMENTED_SYNTHETIC / EXECUTION_PENDING`
- R5 print observer contract: `IMPLEMENTED_SYNTHETIC / EXECUTION_PENDING`
- Teknisa source boundary: `IMPLEMENTED_SYNTHETIC / EXECUTION_PENDING`
- TATÁ OS bridge boundary: `IMPLEMENTED_SYNTHETIC / EXECUTION_PENDING`
- cross-source admission pipeline: `IMPLEMENTED_SYNTHETIC / EXECUTION_PENDING`
- live source bindings: `NOT_PROVEN`
- cashier-PC safety/resource impact: `UNKNOWN / DEFERRED`

## Next gate

The synthetic source contracts are now bound into one admission pipeline and the cashier host-binding manifest is frozen. The next useful work before the physical PC audit is limited to implementation adapters that can be exercised without the cashier machine: non-secret browser/session transport and Windows print-source transport, both still shadow/read-only.