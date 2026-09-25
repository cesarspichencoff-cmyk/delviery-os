# Gerencial Watch Shadow — World Proof Receipt

Date: 2026-09-25

## Scope

This receipt records the first deployed shadow runtime that accepts the
versioned TATÁ Edge handoff and maintains an isolated Gerencial Watch snapshot.

The proof is intentionally limited to shadow/synthetic traffic.

No restaurant operational action was executed.

## Deployed resources

Worker:

`cesar-gerencial-watch-bridge`

workers.dev route:

`https://cesar-gerencial-watch-bridge.tata-academia.workers.dev`

Code upload version:

`f74aee32-cf04-47da-851e-12adefd79dae`

Current version after secret configuration:

`b9104f4c-4763-4267-be99-adff1c159ace`

Configured schedule:

`0 * * * *`

Dedicated D1:

`cesar-gerencial-watch`

Database id:

`75516adf-6196-460a-82d4-9aa6925dbed4`

The runtime uses its own D1 and does not reuse the mail-bridge database.

## Authentication

`WATCH_BRIDGE_TOKEN` exists as a Cloudflare secret.

Its value is not stored in this repository or in this receipt.

Observed live behavior:

- public `GET /health` -> healthy;
- unauthenticated `GET /snapshot` -> HTTP 401;
- authenticated Edge handoff -> accepted.

## Exact producer-to-cloud proof

The live smoke used the repository producer path itself:

```text
synthetic EdgeSourceObservation
  -> projectManagerSnapshot
  -> managerSnapshotToWatchHandoff
  -> buildGerencialWatchHandoffRequest
  -> HTTPS
  -> cesar-gerencial-watch-bridge
  -> strict contract validation
  -> isolated D1
  -> runtime snapshot
```

Foxxy command:

`npm run smoke:edge:watch-shadow-live`

Observed result:

```json
{
  "status": "PASS",
  "producer_code_used": true,
  "network_boundary_reached": true,
  "synthetic_truth_preserved": true,
  "synthetic_requires_cesar": true,
  "final_state_reset_to_empty": true,
  "final_all_clear_authorized": false,
  "external_effects_authorized": false
}
```

The smoke first sent a synthetic iFood auth-human exception and proved:

- source class remained `SIMULATION`;
- snapshot validity remained `DEGRADED`;
- one direct César requirement was projected;
- global all-clear remained false;
- external effects remained false.

It then sent an EMPTY envelope so synthetic test state would not remain current.

## Final world state after smoke

Read-only D1 receipt:

```text
edge_handoff_history             4
watch_runtime_snapshot_history   4
watch_runtime_snapshot           1
```

Current singleton snapshot:

```text
truth_class          EMPTY
validity_status      INSUFFICIENT
source_watermark     null
needs_cesar          0
critical_queue       0
global_all_clear     false
external_effects     false
```

The four history rows are shadow-test history, not restaurant facts.

## Code proof

Executable branch commit before this receipt:

`99392af9960f31de0a418f95f082cf727ec5d059`

GitHub Actions run:

`36112447472`

Conclusion:

`success`

Foxxy also passed:

- TypeScript typecheck;
- shadow worker unit tests;
- Edge -> Watch transport proof;
- producer-to-cloud live synthetic smoke.

## Existing mail bridge preservation

The separate operational mail bridge was checked after Watch deployment.

Worker remains:

`cesar-gerencial-mail-bridge`

Latest version remains:

`172d3937-1198-493a-ae33-d19e944ef3c8`

Read-only D1 counts remain:

```text
daily_closings                 54
ifood_review_mail               0
ifood_review_attachment         0
ifood_evaluation_mails          0
ifood_evaluation_attachments    0
```

The Watch shadow deployment did not mutate that Worker or its database.

## Truth boundary

Proven now:

`CODE_READY + TEST_PASS + DEPLOYED + WORLD_PROVEN_SHADOW`

Specifically proven in the real Cloudflare boundary:

- dedicated Worker exists;
- dedicated D1 exists;
- bearer gate works;
- actual DeliveryOS producer code reaches the Worker;
- strict handoff is admitted;
- synthetic truth remains synthetic;
- snapshot is persisted;
- test state can be reset to EMPTY;
- no global all-clear is produced from insufficient coverage;
- no operational effect is authorized.

Not proven yet:

- live cashier-PC Edge feed;
- live iFood portal observation;
- live Teknisa observation;
- live Windows spooler observation at the restaurant;
- actual hourly cron execution receipt;
- complete critical-source freshness registry;
- global all-clear;
- proactive notification delivery;
- any operational write.

## Next gate

Connect one real read-only Edge source while preserving this same handoff
contract and keep the runtime in shadow until source freshness and physical
cashier-PC binding are separately proven.
