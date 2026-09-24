# Edge Synthetic Suite Proof — 2026-09-24

## Scope

Branch: `design/tata-edge-runtime-foundation-v1`

No production deployment, cashier-PC installation, live iFood browser session, real OTP, printer query, print submission or Teknisa write occurred.

## Synthetic suite result

The Edge modules were compiled together in an isolated TypeScript harness and all proof runners passed.

```text
edge_shadow_proof                 PASS
edge_runtime_proof                PASS
edge_ifood_shadow_proof           PASS
edge_print_shadow_proof           PASS
edge_sources_bridge_proof         PASS
edge_projection_rebuild_proof     PASS
```

Verified properties:

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
- no fake `UNKNOWN` order entity is created.

## Important correction discovered during proof

The first Teknisa adapter draft represented a payment mapping such as `ONLINE_IFOOD` as a candidate link to an `UNKNOWN` iFood order.

That was rejected because it would create a false shared entity and could accidentally correlate unrelated orders.

The corrected rule is:

`PAYMENT_CHANNEL_CONTEXT != ORDER_IDENTITY_EVIDENCE`

Payment mapping remains source context only. Identity proposals require an actual target identifier or other explicit correlation evidence.

## Current classification

- R0 contract convergence: `PROVEN_DESIGN`
- R1 pure replay simulator: `PROVEN_SYNTHETIC`
- R2 identity graph: `PROVEN_SYNTHETIC`
- R3 local store-and-forward foundation: `PROVEN_SYNTHETIC`
- R4 iFood auth/sidecar contract: `PROVEN_SYNTHETIC`
- R5 print observer contract: `PROVEN_SYNTHETIC`
- Teknisa source boundary: `PROVEN_SYNTHETIC`
- TATÁ OS bridge boundary: `PROVEN_SYNTHETIC`
- live source bindings: `NOT_PROVEN`
- cashier-PC safety/resource impact: `UNKNOWN / DEFERRED`

## Next gate

The next useful work before the cashier-PC audit is to bind the synthetic source contracts into one admission pipeline and freeze the exact host-binding manifest required later for the real PC.