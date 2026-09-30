# Production Parallel Core — V1

Status: **CODE_READY / TEST NOT EXECUTED / NO LIVE EFFECTS**

This track prepares the logic above the live Odhen/Periféricos capture while the
one-order physical proof is pending.

## 1. Source truth

The 2026-09-30 CAIXA_MOOCA code audit concluded
`LOCAL_PRINT_SOURCES_COMPLEMENTARY` at source-code level:

- delivery print provides `NRCOMANDA`, conditional `NRCOMANDAEXT`, delivery
  items/quantities, merged item observations and order-level observation;
- production print provides item quantity/name, item-scoped `TXPRODCOMVEN`
  and the target printer in the print payload;
- production may emit the same item to production, production 2 and puxa;
- the intended common key is `NRCOMANDA`, when production actually renders
  `COMANDA.: DLV_<N>` in the live delivery path.

These are code-level facts, not yet a live-order proof.

## 2. TATÁ sequence contract

Module: `src/production/tataSequence.ts`.

Invariant:

`1 TEKNISA order inside an explicit sequence scope -> exactly 1 TATÁ sequence`.

All station tickets for that order must reuse the same TATÁ sequence.
Reprint/replay reuses the existing binding and does not allocate another number.

The planner is pure and has no persistence.

Deliberately UNKNOWN and therefore not hard-coded:

- what the sequence scope means (day, service, store, another boundary);
- reset timing;
- operational width;
- start/end values;
- persistence mechanism.

The caller must provide an explicit policy and loaded state. Activation is
blocked until these operational rules are human-confirmed.

## 3. HOT / EBITEN / SHISO

Module: `src/production/kitchenDependencies.ts`.

No dependency is inferred from a product name.

A contribution exists only when there is an explicit exact-normalized
`canonical_item_name -> HOT/EBITEN/SHISO` rule and that rule is marked
`HUMAN_CONFIRMED`.

A complete total is allowed only when BOTH are true:

- `coverage = COMPLETE`;
- `coverage_proof = HUMAN_CONFIRMED`.

Until then the engine may calculate known contributions for debugging, but must
not present them operationally as a complete requested/remaining total.

The current rules file intentionally starts empty/unproven.

`VENDIDO != SOLICITADO != PRODUZIDO != PENDENTE`.

This module only models requested dependency quantities. "PENDENTE" remains
blocked until a trustworthy production/low-off signal exists.

## 4. Delivery + production join

Module: `src/production/deliveryProductionJoin.ts`.

The join is conservative:

1. production order key must have proof
   `DLV_NRCOMANDA_PROVEN`;
2. delivery and production `NRCOMANDA` must match;
3. item match is exact after accent/case/punctuation normalization + quantity;
4. ambiguous delivery signatures block;
5. missing items on either side block;
6. production duplicates can contribute multiple printer targets without
   duplicating identical `TXPRODCOMVEN` text.

This is intentionally stricter than fuzzy matching. If real combo/fracturing
behavior requires a richer join, the real bounded sample must prove that need
before the rule is relaxed.

## 5. Production ticket

Existing module: `src/production/productionTicket.ts`.

The renderer receives, but does not invent:

- TATÁ;
- TEKNISA;
- IFOOD when present;
- station/route;
- physical box label from the packaging motor;
- item quantity/name;
- item observations;
- order observations.

No customer/address/payment field exists in the ticket input model.

## 6. Verification

Behavioral verifiers prepared:

- `npm run verificar:production-ticket`
- `npm run verificar:production-parallel`

The parallel verifier covers:

- TATÁ initial allocation + replay reuse;
- all station copies sharing the same TATÁ;
- station mismatch blocking;
- partial kitchen rules blocking complete totals;
- unproven coverage blocking complete totals;
- known HOT/EBITEN/SHISO arithmetic;
- duplicate order aggregation blocking double-count;
- delivery/production join with accent normalization;
- production-2/puxa duplicate observation dedupe;
- unproven live DLV join key blocking;
- ambiguous item signature blocking.

These commands require the repository TypeScript runtime. Until actually run,
the status is **TEST NOT EXECUTED**, not TEST_PASS.

## 7. Effect boundary

None of these modules:

- reads live logs;
- queries SQL;
- calls `/print`;
- prints;
- writes Odhen/Teknisa;
- changes order/status/fiscal state;
- installs a service/watcher;
- performs cutover.

## 8. Next world proof

When César has a quiet moment:

1. run the metadata-only per-printer monitor;
2. allow one natural delivery production event;
3. identify which physical printers printed;
4. capture only the `MUDOU *_IMP_<modelo>_<porta>.txt` lines;
5. visually confirm whether the production paper contains
   `COMANDA.: DLV_<N>`.

No log content is required for this gate.

If the event proves the live DLV key + printer path, the next safe phase is one
bounded sanitized production-log sample to create a REAL_SAMPLE_PROVEN
production profile.
