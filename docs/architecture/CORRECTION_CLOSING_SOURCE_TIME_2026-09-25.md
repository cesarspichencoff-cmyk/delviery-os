# CORRECTION — Closing Source Time vs Ingestion Time — 2026-09-25

## Why this correction exists

The first world proof of the live closing chain was valid as a transport and
persistence proof, but a later read-only audit found that its source watermark
used the mail-bridge row `updated_at`.

That field is the D1 ingestion/update time, not necessarily the time the source
fact was actually observed.

Historical evidence showed backfill behavior. Example:

```text
business_date    2026-09-18
message_sent_at  2026-09-19T03:35:27.000Z
updated_at       2026-09-22T23:00:48.777Z
```

Therefore:

```text
INGESTED_NOW != SOURCE_OBSERVED_NOW
UPDATED_AT != SOURCE_FRESHNESS
```

Using `updated_at` as a freshness watermark could make an old backfilled
closing appear fresh.

## Failure class

`INGESTION_TIME_AS_SOURCE_FRESHNESS`

The route is now blocked by tests.

## Corrected semantics

Canonical closing source chronology now uses:

```text
source_observed_at = message_sent_at
ingested_at        = updated_at
source_watermark   = message_sent_at
```

The producer also selects the current closing using source/domain chronology:

```sql
ORDER BY business_date DESC, message_sent_at DESC, mailbox_uid DESC
```

`updated_at` remains diagnostic ingestion evidence only. It no longer drives
source freshness or replay admission.

## Regression proof

Branch:

`design/tata-edge-runtime-foundation-v1`

Exact commit:

`c2042f32f4cbed6190bc938f906c58065bba83ab`

GitHub Actions:

`36187731055 = success`

Foxxy Windows proof:

```text
test:edge:cloud-producer
14 tests
14 pass
0 fail
```

New regression:

`ingestion time cannot manufacture source freshness`

The synthetic regression explicitly proves that a late D1 ingestion of an old
closing remains older than a newer source observation.

## World proof after correction

Before the live proof, the current Watch state was reset to
`EMPTY / INSUFFICIENT`.

The deployed producer then read the real latest verified closing and returned:

```json
{
  "status": "sent",
  "source_business_date": "2026-09-24",
  "source_watermark_at": "2026-09-25T02:57:22.000Z",
  "source_ingested_at": "2026-09-25T03:00:39.554Z",
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

Immediate replay:

```json
{
  "status": "skipped",
  "reason": "source_already_observed",
  "source_business_date": "2026-09-24",
  "source_watermark_at": "2026-09-25T02:57:22.000Z",
  "source_ingested_at": "2026-09-25T03:00:39.554Z",
  "external_effects_authorized": false
}
```

Final Watch snapshot:

```text
truth_class                 FACT
validity_status             DEGRADED
source_watermark_at         2026-09-25T02:57:22.000Z
globalAllClearAuthorized    false
externalEffectsAuthorized   false
```

Read-only D1 verification:

```text
edge_handoff_history            17 rows
watch_runtime_snapshot_history  22 rows
current snapshot                FACT / DEGRADED
```

## Scheduler boundary

The canonical deployed cron was restored to:

```text
10 * * * *
```

A temporary near-term cron was attempted only to observe the actual Cloudflare
scheduled trigger. No trigger receipt was observed before the canonical
schedule was restored, so:

`CRON_CONFIGURED != CRON_WORLD_PROVEN`

No claim of automatic cron firing is made yet.

## Supersession

This correction supersedes only the **freshness timestamp semantics** in:

`EVIDENCE_WORLD_CONTINUOUS_CLOSING_TO_WATCH_2026-09-25.md`

The original proof that the live chain, Service Binding, FACT preservation,
D1 persistence, replay skip and effect boundaries work remains valid.

## Current classification

`WORLD_PROVEN_LIVE_SOURCE_CHAIN_WITH_CORRECT_SOURCE_TIME`

Still open:

- actual scheduled-trigger receipt;
- explicit source freshness policy;
- global critical-source registry/coverage;
- real iFood review-mail source;
- cashier-PC bindings and physical sensors.
