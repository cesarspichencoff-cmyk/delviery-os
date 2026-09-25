# Edge → Gerencial Watch / Context Kernel Bridge

## Decision

The Edge Runtime should not become the personal operating system and should not
own César's work/personal modes.

Its responsibility ends at a minimal operational snapshot.

The higher system owns:

- TRABALHO / PESSOAL / MISTO / FOCO / REUNIÃO / OFF;
- Commitment Engine;
- Evidence Debt;
- Gerente Investigador;
- Human Context Coverage;
- Attention Governor;
- Watch/ChatGPT delivery.

This preserves the boundary:

```text
TATÁ operational sources
        ↓
Edge observations / journal
        ↓
identity + hard-exception projection
        ↓
EDGE MANAGER SNAPSHOT
        ↓
Gerencial Watch / Context Kernel
        ↓
mode + commitments + investigation + attention
        ↓
César only when needed
```

## Snapshot contract

`src/edge/managerSnapshot.ts` exports a rebuildable projection containing only:

- source/fact mode;
- observation count;
- per-source coverage;
- identity-confidence counts;
- explicit hard-exception candidates;
- latest observation time.

It deliberately does not include:

- raw source payloads;
- customer PII;
- OTP/tokens/cookies;
- causal conclusions;
- arbitrary alert thresholds;
- a final interrupt decision;
- personal-life context.

## Why this matters

This is the bridge required for the next Gerencial Watch delta:

`Precisa de mim?`, `Resumo do turno` and the Gerente Investigador can consume
one stable operational snapshot instead of querying every source independently.

The Edge says what it observed.

The Context Kernel decides what it means for César.

## Truth boundary

- `synthetic` observations produce `SIMULATION` snapshots.
- `live_observed` observations may produce `FACT` snapshots.
- mixed synthetic/live journals are rejected.
- hard-exception candidates remain candidates; Edge does not issue
  `INTERRUPT`.

## Status

- snapshot contract: IMPLEMENTED
- cloud execution proof: PENDING current commit CI
- live source population: NOT_PROVEN
- personal/work mode integration: NOT_STARTED in this repository
