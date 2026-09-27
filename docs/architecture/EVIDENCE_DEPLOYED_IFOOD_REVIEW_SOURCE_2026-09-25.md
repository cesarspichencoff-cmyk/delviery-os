# DEPLOYED EVIDENCE — iFood Review Source Ready — 2026-09-25

## Code and CI

Branch:
`design/tata-edge-runtime-foundation-v1`

Code commit:
`793b08e6fcf9899bcc0c13424d5ae3b9dc99fb6a`

GitHub Actions:
`36197832344 = success`

Foxxy full suite:
`test:edge:shadow:all = exit 0`

Targeted producer suite:
`19/19 pass`

## Deployed Edge

Worker:
`tata-edge-cloud-shadow`

Current version:
`3dfed98a-46d9-435b-a1ed-3e5a206144dc`

Previous rollback-capable version before this change:
`93bf0b28-9267-4d29-aea4-3e51dec78795`
Bindings preserved:

- `SOURCE_DB -> cesar-gerencial-mail-bridge`;
- `WATCH_SERVICE -> cesar-gerencial-watch-bridge`;
- existing Watch public fallback URL.

Cron preserved:
`10 * * * *`

No mail-bridge deployment and no Watch deployment were required by this Edge
change.

## World surface proof

Public health after deployment:

```json
{
  "status": "ok",
  "runtime": "tata-edge-cloud-shadow@0.1.0",
  "source_mode": "read_only_operational_sources",
  "sources": ["tata_daily_closing", "ifood_review_mail"],
  "external_effects_authorized": false
}
```
## Live-source boundary

Read-only production D1 check after deployment:

```text
ifood_review_mail rows = 0
latest_review_sent_at  = null
rows_written           = 0
```

Therefore:

`DEPLOYED + TEST_PASS + READY_FOR_REAL_IFOOD_REVIEW_SOURCE`

is proven.

`WORLD_PROVEN_LIVE_IFOOD_REVIEW_SOURCE`

is not yet proven.

The first real matching review email remains the next evidence gate. Until a
real row exists, the Watch must not show iFood coverage and no iFood freshness
policy is inferred.

## Safety

The Edge exports only minimized source coverage metadata. It does not forward
review subject, body, attachment content/manifest, mailbox UID or UIDVALIDITY.

Global all-clear remains outside Edge authority and external effects remain
unauthorized.
