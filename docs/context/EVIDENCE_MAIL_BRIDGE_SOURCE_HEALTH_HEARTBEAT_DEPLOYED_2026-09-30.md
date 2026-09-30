# Mail bridge source-health heartbeat — DEPLOYED, awaiting first cron — 2026-09-30

## Authorization

César explicitly authorized proceeding with the production heartbeat deployment.

Scope remained limited to the already-tested read-only observability delta.

## Canonical basis

Deployment source:
`29356391c37a6a552cfa1831d3693951087cd74d`

Pre-deploy regression on Foxxy:
- 69 tests;
- 69 pass;
- 0 fail;
- Wrangler production bundle dry-run PASS.

## Deployment

Worker:
`cesar-gerencial-mail-bridge`

Production version:
`2275edb2-2357-46d7-a0b0-168b87f008e7`

Cloudflare deployment timestamp:
`2026-09-30T10:07:44.691Z`
(07:07 America/Sao_Paulo).

Cron remains:
`0 * * * *`

The previous observed deployment immediately before this cutover was:
`e7490e26-4904-4265-a750-05fba9adf797`.

## Immediate verification

After deployment, the production D1 query of `bridge_state` returned zero rows.

This is expected because the deployment occurred after the 07:00 local cron slot. The first scheduled execution capable of writing the new heartbeat is the 08:00 local cycle.

Therefore current status is:

`DEPLOYED_WAITING_FIRST_REAL_CRON`

not WORLD_PROVEN.

## Intended production proof

After the next real cron, `bridge_state` should contain one minimized upsert row for each source:
- `source_health:daily_closing`
- `source_health:caixa_pulse`
- `source_health:ifood_review`

Each row must contain only:
- schema/version;
- source id;
- status;
- timestamp;
- scanned count;
- candidate count;
- processed count;
- error count.

No source email payload, subject, body, attachment content or customer data should appear.

## Effect boundary

The deployment does not authorize:
- sending or modifying email;
- OCR persistence;
- notification;
- restaurant operational writes;
- autonomous action.

The bridge continues to use read-only IMAP semantics and existing ingestion filters.

## Next proof gate

Observe the first real scheduled cycle after deployment and verify:
1. all three source-health keys are persisted;
2. timestamps correspond to the real cron;
3. status/counters are internally consistent;
4. existing iFood, Caixa Pulse and closing ingestion semantics remain unchanged;
5. no external effect is enabled.

Only then may the heartbeat be promoted from DEPLOYED to WORLD_PROVEN.
