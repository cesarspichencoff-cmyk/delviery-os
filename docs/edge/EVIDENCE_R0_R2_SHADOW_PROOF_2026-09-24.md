# R0–R2 Edge Shadow Proof — 2026-09-24

## Scope

Branch: `design/tata-edge-runtime-foundation-v1`

No production deployment, browser automation, Windows installation, Teknisa mutation, iFood mutation or print effect was performed.

## Added

- `docs/edge/TATA_EDGE_RUNTIME_BLUEPRINT.md`
- `docs/edge/CASHIER_PC_READ_ONLY_DISCOVERY.md`
- `docs/edge/CONTRACT_CONVERGENCE.md`
- `src/edge/identityGraph.ts`
- `src/edge/simulator.ts`
- `src/edge/fixtures.ts`
- `demo/edge_shadow_proof.ts`
- package script `test:edge:shadow`

## Proof runner implemented; execution evidence pending

The branch contains `demo/edge_shadow_proof.ts` and the command `npm run test:edge:shadow`.

In the current session there is no observed execution receipt from a normal checkout with dependencies installed. Therefore the correct status is:

```text
PROOF_RUNNER_IMPLEMENTED = true
EXECUTION_OBSERVED       = false
TYPECHECK_OBSERVED        = false
```

The assertions below describe the intended proof and become evidence only after an observed run.

## What the implemented proof is designed to prove

- replaying the same six observations does not create new accepted observation meaning;
- the graph snapshot remains deterministic across replay;
- an exact cross-system identifier can classify a link as `PROVEN`;
- multiple independent synthetic signals classify as `SUPPORTED_INFERENCE`;
- timestamp proximity by itself remains only `CANDIDATE`;
- the proof uses synthetic fixtures and has zero external effects.

## What this does NOT prove

- real iFood Portal endpoints or session lifetime;
- real Teknisa identifiers;
- real mapping between iFood and Teknisa;
- real Windows spooler behavior;
- real TATÁ OS receipt ingestion;
- live DeliveryOS event admission;
- cashier-PC resource safety.

Those remain gates for later phases. The synthetic assertions themselves also remain unproven until execution is observed.

## Next gate

R3 should not invent another persistence/runtime stack.

Before implementation, reuse/port the smallest proven DeliveryOS platform primitives needed for:

- source-agent envelope;
- journal/outbox durability;
- heartbeat;
- restart/recovery.

Only after that should R4/R5 adapters attach to the runtime.
