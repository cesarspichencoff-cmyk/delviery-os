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

## Proof executed outside production

The three pure Edge TypeScript modules were compiled with strict TypeScript checking.

Result:

```text
TYPECHECK CORE = PASS
```

The compiled modules were then exercised with the same assertions represented by `demo/edge_shadow_proof.ts`.

Result:

```json
{
  "status": "PASS",
  "observations": 6,
  "links": 5,
  "replay_duplicate_meaning": 0,
  "timestamp_only_proven": false
}
```

## What this proves

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

Those remain gates for later phases.

## Next gate

R3 should not invent another persistence/runtime stack.

Before implementation, reuse/port the smallest proven DeliveryOS platform primitives needed for:

- source-agent envelope;
- journal/outbox durability;
- heartbeat;
- restart/recovery.

Only after that should R4/R5 adapters attach to the runtime.
