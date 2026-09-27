# Cloud CI Evidence — Manager Snapshot — 2026-09-25

## Exact proof target

- Branch: `design/tata-edge-runtime-foundation-v1`
- Commit: `de68f7bf293006a708118415e7a96acd11f4ad5a`
- GitHub Actions run: `36102078627`
- Job: `verify` (`107966567027`)
- Conclusion: `success`

## Observed successful steps

```text
Checkout                     success
Setup Node                   success
Install dependencies         success
Dependency security inventory success
Edge dependency boundary     success
Typecheck                    success
Edge synthetic suite         success
```

## Newly proven in this commit

The cloud suite now includes `test:edge:manager-snapshot`.

The manager snapshot boundary is proven synthetically for this exact commit:

- journal -> stable manager snapshot projection;
- synthetic observations stay `SIMULATION`;
- live-observed fixtures may become `FACT`;
- raw source payload/PII does not cross the snapshot;
- source coverage and identity-confidence summaries are emitted;
- hard-exception candidates are carried upward;
- Edge does not decide `INTERRUPT`;
- empty journal yields an explicit empty snapshot;
- mixed synthetic/live observations are rejected.

## Truth classification

`IMPLEMENTED + EXECUTED + GREEN = PROVEN_SYNTHETIC_FOR_THIS_EXACT_COMMIT`

This does not prove live iFood, live Teknisa, a real spooler, cashier-PC safety, personal/work mode selection or Watch delivery.

## Product boundary

```text
TATÁ Edge
  -> Edge Manager Snapshot
  -> Gerencial Watch / Context Kernel
  -> Mode Compiler / Commitments / Investigator / Attention Governor
  -> César
```

The Edge remains an operational-observation layer. It does not absorb César's personal context.
