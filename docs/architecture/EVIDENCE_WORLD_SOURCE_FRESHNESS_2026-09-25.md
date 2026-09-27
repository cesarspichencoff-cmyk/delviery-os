# WORLD PROOF — Watch Source Freshness — 2026-09-25

## Scope

This receipt proves the deployed Gerencial Watch classifies a real source from
source observation time, not ingestion time or snapshot compute time.

Source policy:

`tata_daily_closing@daily-v1`

Classification:

```text
age <= 24h       FRESH
24h < age <= 36h AGING
age > 36h        STALE
unregistered     UNKNOWN
```

## Code proof

Branch: `design/tata-edge-runtime-foundation-v1`

Commit: `c786e7b0cc92c129d01f20d594532af6716c1e72`

GitHub Actions: `36191443485 = success`

Foxxy:
- full `test:edge:shadow:all` = exit 0;
- Watch tests = 14/14;
- cloud producer tests = 14/14;
- ingestion-time freshness regression remained green.
## Deployment proof

Watch Worker: `cesar-gerencial-watch-bridge`

Freshness code version first deployed:
`79b68f9f-0480-42be-892c-28bd5383b52b`

A temporary one-minute Watch cron was used only to obtain a real scheduled
recompute receipt. The canonical Watch cron was then restored.

Final deployment after restoration:
`a3007834-2ff9-4303-9cd9-d23040d5b18c`

Final schedule:
`0 * * * *`

D1 remained:
`cesar-gerencial-watch`

No new binding, source write, notification or operational effect was added.
## World receipt

Read-only D1 verification after the scheduled recompute:

```text
handoffs                    17
snapshot_history            86
truth_class                 FACT
validity_status             DEGRADED
source_watermark_at         2026-09-25T02:57:22.000Z
freshness_status            FRESH
freshness_policy            tata_daily_closing@daily-v1
globalAllClearAuthorized    false
externalEffectsAuthorized   false
```

Observed current snapshot:
`2026-09-25T22:33:46.478Z`

The source age was computed from `message_sent_at`; D1 `updated_at` remains
ingestion evidence only.

## Boundary

Proven:
`CODE_READY + TEST_PASS + DEPLOYED + WORLD_PROVEN_SOURCE_FRESHNESS`

Still not proven:
- AGING and STALE transitions by elapsed real-world time;
- global critical-source coverage;
- Edge producer cron at `10 * * * *`;
- first real iFood review-mail batch.

A FRESH source still cannot manufacture global all-clear.
