# Evidence — Expected Barrier Evidence-Debt Routing — 2026-09-26

## Objective

Turn expected-barrier execution `UNKNOWN` into explicit, routable evidence
debt without converting missing evidence into failure, guilt, cause or a
notification for César.

Inputs:
- canonical Caixa Pulse production replay;
- TATÁ Academia expected-barrier snapshot;
- existing Gerente Investigador route order.

Invariant:

`MISSING_BARRIER_EVIDENCE != BARRIER_FAILURE != CESAR_REQUIRED`

## Kernel

New module:
`src/contextKernel/barrierEvidenceDebt.ts`

For each mapped episode/barrier pair it creates a safe evidence code and routes
it through the existing Investigator contract:
1. trusted source, when explicitly available;
2. operational owner, when explicitly available;
3. César is blocked for barrier mapping alone;
4. future structured capture;
5. otherwise keep UNKNOWN.

The module never infers availability of a trusted source or operational owner.
It also hard-codes `cesar_context_needed=false` for this adapter: a separate
direct NeedsMe proof would be required before César can become the route.

Future capture is a design requirement, not a deployed capture claim.

## Real replay

Source:
`D1:cesar-gerencial-mail-bridge.caixa_pulse_* canonical rows`

Current source scope:
- 69 canonical occurrence rows;
- 21 business dates;
- 30 episodes mapped to expected barriers;
- 39 episodes deliberately unmapped.

Mapped families:
- OMISSION: 22 episodes;
- WRONG_ITEM: 8 episodes.
Result:
- incident × barrier evidence debts: **120**;
- unique structured capture requirements: **7**;
- TRUSTED_SOURCE routes: **0**;
- OPERATIONAL_OWNER routes: **0**;
- CESAR routes: **0**;
- CAPTURE_NEXT_TIME routes: **120**;
- KEEP_UNKNOWN routes: **0**.

The 120 records are internal incident-level debts. They must not become 120
messages or tasks. They collapse into seven reusable capture requirements:

- IDENTIFY_BEFORE_ADVANCE;
- REUNITE_COMPLETE_ORDER;
- PHYSICAL_POST_PRINT_CHECK;
- FINAL_DIVERGENCE_CONFERENCE;
- EXACT_PRODUCT_QUANTITY_MATCH;
- CUSTOMER_OBSERVATION_CHECK;
- MANUAL_CORRECTION_PHYSICAL_CHECK.

Measured epistemic result:
- barrier failure proven: 0;
- barrier compliance proven: 0;
- direct Attention reasons: 0;
- external effects authorized: false.

## Why this improves the Manager Investigator

Before this layer the system knew only that execution evidence was missing.

Now it knows exactly which evidence is missing per episode and can reuse seven
capture requirements across future incidents. That supports questions such as
"was final divergence conference recorded?" without claiming that conference
failed when no record exists.

## Proof

Synthetic proof:
- default route is future capture, never César;
- trusted source outranks owner/capture;
- operational owner outranks future capture;
- unsupported capture can remain UNKNOWN;
- unmapped episodes cannot receive invented barrier debt;
- duplicate route hints fail closed;
- guilt=false and cause=false.

Real replay: PASS.

## Next evidence gate

Locate the existing Caixa Pulse capture surface and determine whether the seven
requirements can be added as structured, low-friction evidence fields without
creating operational burden.

Until that surface is verified:
`CAPTURE_NEXT_TIME = DESIGN_ROUTE, NOT_DEPLOYED_CAPTURE`.
