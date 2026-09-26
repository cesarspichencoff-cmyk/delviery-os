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

## Tally occurrence barrier shadow intake

The worker also contains an observation-only Tally webhook route:

`POST /sources/tally/occurrence-barrier`

The route is fail-closed and default-off. It is reachable only when:

- `TALLY_CAPTURE_ENABLED=true`;
- `TALLY_EXPECTED_FORM_ID` matches the configured form;
- `TALLY_SIGNING_SECRET` exists as a Worker secret;
- `TALLY_CAPTURE_DB` is bound to the isolated D1 database.

The shadow configuration uses form `eq4lae` and D1 `tata-edge-tally-shadow`.
The production occurrence form `ZjVv1a` is not accepted by the shadow configuration.

The intake verifies `Tally-Signature` before parsing, accepts only `FORM_RESPONSE`,
stores `OPERATOR_SELF_REPORT` evidence, rejects unexpected taxonomy drift, and is
idempotent by both event ID and submission ID.

It does not notify César, write to restaurant systems, mutate Caixa Executivo,
or authorize any operational action.

Secret:

- `TALLY_SIGNING_SECRET`: Tally webhook signing secret; never commit it.

The live production form and workbook remain outside this shadow route until a
separate near-action authorization and cutover gate.
