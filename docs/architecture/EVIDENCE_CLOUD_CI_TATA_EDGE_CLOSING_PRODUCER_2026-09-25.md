# Cloud CI Evidence — TATÁ Edge Cloud Closing Producer — 2026-09-25

## Exact proof target

- Branch: `design/tata-edge-runtime-foundation-v1`
- Commit: `9449be8ecca05f626ef69c4606382596495ffc31`
- GitHub Actions run: `36171040249`
- Job: `verify` (`108190347131`)
- Conclusion: `success`

## Newly proven in this commit

The cloud suite now covers the real Worker boundary for the continuous closing
producer, not only its pure mapping core.

Proven synthetically:

- the mail-bridge source query is SELECT-only;
- verified closing rows become `live_observed / FACT` handoffs;
- financial values and raw mailbox identifiers do not cross the Watch handoff;
- an already-observed closing watermark is skipped without POST replay;
- no verified closing fails quiet and does not write to Watch;
- Watch rejection fails closed;
- manual `POST /run` requires its own admin secret;
- public health output is non-sensitive;
- the producer never authorizes an external operational effect.

## Continuous route prepared

```text
Atendimento mail bridge
    -> daily_closings D1
    -> TATÁ Edge Cloud Shadow
       SELECT latest readonly_verified=1
    -> edge-watch-handoff@0.1.0
    -> Gerencial Watch Shadow
    -> Watch snapshot D1
```

## Truth boundary

`IMPLEMENTED + EXECUTED + GREEN = PROVEN_SYNTHETIC_FOR_THIS_EXACT_COMMIT`

The following remain unproven until cloud deployment/smoke:

- producer Worker deployment;
- live read from the existing mail-bridge D1 binding;
- live FACT handoff into Gerencial Watch;
- scheduled hourly replay safety in the deployed environment.

Foxxy is not required for runtime architecture, but the current Cloudflare
credentials used for deployment are available through its Wrangler session.
