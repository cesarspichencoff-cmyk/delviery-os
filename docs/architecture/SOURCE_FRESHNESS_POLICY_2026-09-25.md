# Watch Source Freshness Policy — 2026-09-25

## Purpose

This policy makes source freshness explicit without turning ingestion time,
snapshot compute time or an unregistered source into false operational health.

The invariant is:

```text
SOURCE_FRESHNESS = f(source_observed_at, evaluated_at, registered_policy)
INGESTION_TIME != SOURCE_FRESHNESS
SNAPSHOT_COMPUTE_TIME != SOURCE_FRESHNESS
FRESH_SOURCE != GLOBAL_ALL_CLEAR
```

## Registered policy

Current registered source:

`tata_daily_closing@daily-v1`

The closing is a daily operational fact. Its canonical observation time is the
mail source `message_sent_at`, already separated from D1 `updated_at`.
Classification at snapshot evaluation time:

```text
age <= 24h          -> FRESH
24h < age <= 36h    -> AGING
age > 36h           -> STALE
```

The 24-hour interval represents the normal daily source cadence. The additional
12 hours are an explicit degradation window: a missed next closing becomes
visible as AGING before becoming STALE.

This is policy v1, not an inference from data ingestion.

## Fail-closed behavior

A source without a registered policy is:

`UNKNOWN`

The Watch does not borrow another source's policy and does not guess a cadence.
Invalid policy, invalid timestamp or an observation apparently in the future
also produce `UNKNOWN`.
## Global health boundary

Per-source freshness does not authorize a global healthy state.

Even when `tata_daily_closing` is FRESH:

- `validity.status` remains `DEGRADED` while the global critical-source
  registry/coverage is absent;
- `globalAllClearAuthorized=false`;
- `externalEffectsAuthorized=false`.

Aging or stale sources add explicit snapshot unknown/degradation reasons.

## iFood boundary

No freshness policy is registered yet for `ifood_review_mail`.

Its cadence and source contract must be proven from the real intake flow before
the Watch can classify it as FRESH/AGING/STALE. Until then it remains UNKNOWN.

## Verification contract

Regression tests must prove all four states and must prove that a FRESH loaded
source cannot manufacture global all-clear.
