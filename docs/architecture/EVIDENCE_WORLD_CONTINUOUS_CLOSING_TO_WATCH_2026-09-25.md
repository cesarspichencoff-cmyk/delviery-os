# WORLD PROOF — Continuous Closing Source → Gerencial Watch — 2026-09-25

## Scope

This receipt proves the first continuous live operational source flowing from
the existing read-only mail bridge into the Gerencial Watch shadow runtime.

No cashier-PC action, printer action, iFood/Teknisa mutation, email mutation or
restaurant write was performed.

## Route

```text
Atendimento closing email
    -> cesar-gerencial-mail-bridge D1
    -> daily_closings (readonly_verified = 1)
    -> tata-edge-cloud-shadow
    -> Cloudflare Service Binding
    -> cesar-gerencial-watch-bridge
    -> cesar-gerencial-watch D1
    -> current Watch snapshot
```

## Failure found and corrected

Initial Worker-to-Worker delivery used the public `workers.dev` URL.

Observed from the deployed producer:

```text
upstream_status = 404
producer result  = watch_handoff_rejected
```

Direct host-to-Watch delivery of the same generated handoff succeeded, proving
that the handoff contract itself was not the failure.

The producer was changed to prefer a Cloudflare Service Binding:

```text
WATCH_SERVICE -> cesar-gerencial-watch-bridge
```

The public URL remains only as a fallback for local/isolated tests.

This is also the platform-native route for Worker-to-Worker communication on
the same Cloudflare account/zone and does not add a separate paid transport.

## Exact code proof

Branch:

`design/tata-edge-runtime-foundation-v1`

Commit:

`ff3d3f75f10a38ced89ec12291c23e39f4d52905`

GitHub Actions:

`36186522759 = success`

Local Windows proof on Foxxy:

```text
test:edge:cloud-producer
13 tests
13 pass
0 fail
```

The suite includes a regression test proving the Service Binding is preferred
and that the public fetch path is not used when the binding exists.

## Deployed producer

Worker:

`tata-edge-cloud-shadow`

Observed bindings after deployment:

```text
SOURCE_DB      -> cesar-gerencial-mail-bridge
WATCH_SERVICE  -> cesar-gerencial-watch-bridge
WATCH_BASE_URL -> public fallback only
```

Scheduled trigger:

```text
10 * * * *
```

## Live source

Latest verified closing used by the producer:

```text
business_date       2026-09-24
source_watermark    2026-09-25T03:00:39.554Z
readonly_verified   true
totals_match        true
period_label_mismatch true
```

Financial values and raw mailbox identifiers were not copied into the Watch
handoff.

## Live dispatch proof

Before the proof, the current Watch state was explicitly reset to:

```text
EMPTY / INSUFFICIENT
globalAllClearAuthorized = false
externalEffectsAuthorized = false
```

The deployed producer was then executed.

First run:

```json
{
  "status": "sent",
  "source_business_date": "2026-09-24",
  "source_watermark_at": "2026-09-25T03:00:39.554Z",
  "source_totals_match": true,
  "source_period_label_mismatch": true,
  "watch": {
    "accepted": true,
    "duplicate": false,
    "truth_class": "FACT",
    "validity_status": "DEGRADED",
    "global_all_clear_authorized": false,
    "external_effects_authorized": false
  },
  "external_effects_authorized": false
}
```

Immediate second run:

```json
{
  "status": "skipped",
  "reason": "source_already_observed",
  "source_business_date": "2026-09-24",
  "source_watermark_at": "2026-09-25T03:00:39.554Z",
  "external_effects_authorized": false
}
```

This proves replay safety against compute-time freshness manufacturing.

## Final Watch state

Observed after the live producer run:

```text
truth_class                  FACT
validity_status              DEGRADED
source_watermark_at          2026-09-25T03:00:39.554Z
globalAllClearAuthorized     false
externalEffectsAuthorized    false
needsCesar                   0
criticalQueue                0
```

The Watch remains degraded because global critical-source coverage and a
freshness policy are still intentionally absent.

## D1 persistence proof

Read-only remote verification after the run:

```text
edge_handoff_history            15 rows
watch_runtime_snapshot_history  20 rows
current snapshot                FACT / DEGRADED
```

The verification query itself reported zero rows written.

## Classification

`WORLD_PROVEN_LIVE_SOURCE_CHAIN`

Proven:

- real verified closing source;
- read-only source D1 access;
- cloud producer deployment;
- Service Binding transport;
- live FACT handoff;
- Watch persistence;
- truth-class preservation;
- replay skip;
- no global all-clear;
- no external operational authority.

Still not proven:

- automatic cron firing at the next real schedule boundary;
- iFood review-mail source with a real matching message;
- live Teknisa/iFood portal sources;
- cashier-PC Edge binding;
- printer/physical delivery telemetry;
- Apple Watch attention delivery.

Those remain separate gates.
