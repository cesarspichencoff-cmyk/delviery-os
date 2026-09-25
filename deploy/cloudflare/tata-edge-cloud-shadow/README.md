# TATÁ Edge Cloud Shadow — Daily Closing Producer

## Goal

Prove one continuous **live** operational source from end to end without using
the cashier PC:

```text
Atendimento read-only mail bridge
        ↓
mail-bridge D1 / daily_closings
        ↓  SELECT only
TATÁ Edge Cloud Shadow
        ↓
edge-watch-handoff@0.1.0
        ↓
Gerencial Watch Shadow
        ↓
watch snapshot D1
```

## Source authority

Only rows with `readonly_verified=1` are eligible.

The producer sends source coverage/freshness only. Financial values are not
copied into the Watch handoff.

`SOURCE_REPORTED_FACTS != CAUSAL_EXPLANATION`

## Replay safety

Before posting a handoff, the producer reads the current Watch snapshot and
checks the existing `tata_daily_closing` source watermark.

If the latest verified closing is not newer, the cycle is skipped.

Therefore an hourly cron does not manufacture freshness from compute time.

## External effects

This worker can:

- SELECT the latest verified closing from the existing mail-bridge D1;
- read the Watch snapshot;
- POST a minimized handoff to the Watch shadow runtime.

It cannot:

- mutate the mail-bridge D1;
- mutate email;
- change restaurant systems;
- print;
- notify César;
- authorize global all-clear.

## Secrets

- `WATCH_BRIDGE_TOKEN`: outgoing service credential to Gerencial Watch.
- `EDGE_PRODUCER_ADMIN_TOKEN`: protects manual `POST /run`.

Both are Cloudflare secrets, never repository variables.
