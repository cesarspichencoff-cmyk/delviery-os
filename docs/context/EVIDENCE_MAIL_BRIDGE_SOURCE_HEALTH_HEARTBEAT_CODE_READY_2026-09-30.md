# Mail bridge source-health heartbeat — CODE_READY — 2026-09-30

## Objective

Close the observability gap exposed by the first real iFood-mail expectation:

`0 persisted rows` must not be the only available signal.

Without source-health state, zero rows cannot distinguish:
- no matching source mail;
- scheduled ingestion did not run;
- ingestion ran but found zero candidates;
- ingestion degraded or failed.

## Implementation

The existing D1 table `bridge_state` is reused. No new database is required.

Added:
- `deploy/cloudflare/gerencial-mail-bridge/src/bridge-state.js`
- `deploy/cloudflare/gerencial-mail-bridge/src/bridge-state.test.mjs`

Scheduled ingestion now prepares minimized per-source health state for:
- `daily_closing`
- `caixa_pulse`
- `ifood_review`

Each state contains only:
- schema/version;
- source id;
- `OK | DEGRADED | ERROR`;
- timestamp;
- scanned count;
- candidate count;
- processed count;
- error count.

No subject, body, attachment content, sender identity, customer data or operational payload is stored in this heartbeat.

## Proof

Tested canonical candidate head:
`d26ab37983998cb032f6dc768f797f3da43627e1`

Executed on Foxxy:
- package install from lockfile;
- `npm test` in `deploy/cloudflare/gerencial-mail-bridge`;
- Wrangler production-bundle `--dry-run`.

Results:
- 69 tests;
- 69 pass;
- 0 fail;
- Worker bundle dry-run PASS.

The new heartbeat-specific tests prove:
- minimized state writes;
- same-source upsert;
- invalid source/status/counters fail closed;
- no source payload fields such as subject/body are serialized.

## Status

`CODE_READY`

Not deployed.

## Effect boundary

- no production Worker deployment;
- no production D1 state written;
- no new external action;
- no notification;
- no email mutation;
- no operational effect.

## Next gate

When production deployment is separately authorized, deploy only this read-only observability delta and prove one cron cycle writes source-health state for all three sources without changing ingestion semantics.
