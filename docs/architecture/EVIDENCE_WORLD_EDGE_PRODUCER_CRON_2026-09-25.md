# WORLD PROOF — TATÁ Edge Producer Scheduled Trigger — 2026-09-25

## Scope

This receipt proves the deployed `tata-edge-cloud-shadow` scheduled handler
actually fires in Cloudflare and remains replay-safe against an already observed
live closing source.

No cashier-PC action, printer action, email mutation, restaurant write,
notification delivery or global all-clear was performed.

## Baseline before scheduled proof

Watch D1:

`cesar-gerencial-watch`

Read-only counts before the temporary cron proof:

```text
edge_handoff_history            17
watch_runtime_snapshot_history  91
```

Current Watch state before the proof:

```text
truth_class           FACT
validity_status       DEGRADED
source_watermark_at   2026-09-25T02:57:22.000Z
```

The deployed Edge producer already classified the same source as observed and
manual replay returned `skipped/source_already_observed`.

## Temporary trigger window

The producer cron was temporarily changed from:

`10 * * * *`

to:

`* * * * *`

Temporary deployment version:

`fe21d62d-3a36-4d65-bdfc-0e68906119f9`

This was a reversible shadow-only scheduling change. Source semantics, D1
bindings, Service Binding and effect authority were unchanged.

## Real scheduled execution receipt

A live Cloudflare tail observed the scheduled handler emit:

```json
{
  "event": "tata_edge_cloud_shadow_cycle",
  "status": "skipped",
  "reason": "source_already_observed",
  "source_business_date": "2026-09-24",
  "source_watermark_at": "2026-09-25T02:57:22.000Z",
  "external_effects_authorized": false
}
```

This proves the cron path executed in the deployed Worker and used the live
read-only source state rather than a synthetic fixture.

## Canonical schedule restored

Immediately after the receipt, the canonical schedule was restored:

`10 * * * *`

Restored deployment version:

`f0d99712-16b8-4726-b37b-0014dbee8088`

The temporary local cron-proof config was deleted.

## No-op persistence proof

Read-only D1 verification after the scheduled execution:

```text
edge_handoff_history            17
watch_runtime_snapshot_history  91

current:
truth_class           FACT
validity_status       DEGRADED
source_watermark_at   2026-09-25T02:57:22.000Z
```

The verification query itself reported:

```text
changes     0
rows_written 0
changed_db  false
```

Therefore the scheduled replay did not create a new Watch handoff, did not
manufacture source freshness from compute time and did not mutate the current
source watermark.

## Classification

`WORLD_PROVEN_SCHEDULED_TRIGGER_REPLAY_SAFE`

Proven:

- deployed Cloudflare scheduled handler fired;
- real read-only closing source was evaluated;
- already-observed source was skipped;
- no Watch history churn occurred from the replay;
- source watermark remained source-time based;
- external operational effects remained unauthorized;
- temporary schedule was rolled back to the canonical hourly-at-minute-10
  trigger.

Still open:

- first real matching iFood review-mail row;
- iFood-review extraction/attachment world proof;
- iFood-review freshness cadence;
- global critical-source coverage;
- live iFood portal / Teknisa / restaurant spooler sources;
- cashier-PC binding;
- Apple Watch attention delivery.
