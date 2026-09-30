# Mail bridge source-health heartbeat — WORLD_PROVEN — 2026-09-30

## Scope

This closes the post-deploy proof gate for the minimized read-only source-health heartbeat added to `cesar-gerencial-mail-bridge`.

Production Worker version under test:

`2275edb2-2357-46d7-a0b0-168b87f008e7`

Canonical source at deployment:

`29356391c37a6a552cfa1831d3693951087cd74d`

## Real scheduled-cycle proof

A read-only production D1 query after the real 09:00 America/Sao_Paulo cron observed all three expected keys in `bridge_state`.

Observed values:

- `source_health:daily_closing`
  - status: `OK`
  - at: `2026-09-30T12:00:37.700Z`
  - scanned: 3
  - candidates: 1
  - processed_count: 1
  - error_count: 0

- `source_health:caixa_pulse`
  - status: `OK`
  - at: `2026-09-30T12:00:44.099Z`
  - scanned: 43
  - candidates: 42
  - processed_count: 0
  - error_count: 0

- `source_health:ifood_review`
  - status: `OK`
  - at: `2026-09-30T12:00:45.192Z`
  - scanned: 0
  - candidates: 0
  - processed_count: 0
  - error_count: 0

Independent read-only verification of the canonical iFood tables still showed:

- `ifood_review_mail = 0`
- `ifood_review_attachment = 0`

Tally Gate F independently remained at:

- total shadow rows: 1
- live `ZjVv1a` rows: 0

No synthetic event was created.

## Truth boundary

This proves:

`SCHEDULED_CRON_RAN -> HEARTBEAT_ROWS_PERSISTED -> ALL_THREE_SOURCE_KEYS_OBSERVED`

It does not prove a real iFood evaluation mail exists.

For iFood, `scanned=0 / candidates=0 / status=OK` means the scheduled ingestion completed successfully and found no matching messages in that cycle. It is no longer ambiguous with “the cron may not have run.”

## Privacy / minimization proof

The persisted heartbeat contains only:

- schema/version;
- source id;
- status;
- timestamp;
- scanned count;
- candidate count;
- processed count;
- error count.

No subject, email body, attachment content, customer data or restaurant payload is stored in `bridge_state`.

## Effect boundary

No email mutation.
No notification.
No OCR deployment.
No restaurant operational write.
No external effect authorization.

## Status

`WORLD_PROVEN_SCHEDULED_SOURCE_HEALTH_HEARTBEAT`
