# Gerencial Watch Shadow — Live Smoke Evidence — 2026-09-25

## Scope

This receipt records a real Cloudflare shadow-runtime smoke test executed from Foxxy.

No restaurant production source was ingested.
No iFood, Teknisa, printer, mailbox, cashier-PC or operational write was performed.

## Worker

Worker:

`cesar-gerencial-watch-bridge`

Runtime health response:

```json
{
  "status": "ok",
  "runtime": "cesar-gerencial-watch-shadow@0.1.0",
  "externalEffectsAuthorized": false
}
```

Unauthenticated `GET /snapshot` returned HTTP `401`.

The configured authentication secret was rotated after an intermediate weak-secret attempt and then stored through Cloudflare Secret bulk upload. The temporary local secret file was deleted immediately after upload.

Latest observed deployment lineage after the final secret change:

`00bbf4f5-212d-49d4-a925-e78e1aae27b1`

## Synthetic admission proof

A synthetic `edge-watch-handoff@0.1.0` envelope was posted to:

`POST /sources/tata-edge/handoff`

Result:

```text
accepted = true
truthClass = SIMULATION
validity = DEGRADED
globalAllClearAuthorized = false
needsCesar = 1
criticalQueue = 1
externalEffectsAuthorized = false
```

This proves that synthetic Edge input did not become FACT and did not authorize a global all-clear or external effect.

## Reset proof

A valid empty handoff was then posted to clear the current synthetic operational state.

Current `GET /snapshot` result after reset:

```text
accepted = true
truthClass = EMPTY
validity = INSUFFICIENT
globalAllClearAuthorized = false
needsCesar = 0
criticalQueue = 0
externalEffectsAuthorized = false
sourceWatermarkAt = null
```

Therefore the live shadow runtime currently ends in a neutral, non-operational state.

## D1 persistence proof

Read-only remote D1 query observed:

```text
edge_handoff_history rows = 6
watch_runtime_snapshot_history rows = 11
current truth = EMPTY
current validity = INSUFFICIENT
```

The verification query reported:

```text
changes = 0
rows_written = 0
changed_db = false
```

## Classification

For the deployed shadow runtime:

```text
WORKER_DEPLOYED = PROVEN
AUTH_GATE = PROVEN
SYNTHETIC_EDGE_INGEST = PROVEN
D1_PERSISTENCE = PROVEN
SNAPSHOT_ENGINE_SHADOW = PROVEN
SIMULATION_TRUTH_PRESERVATION = PROVEN
GLOBAL_ALL_CLEAR_BLOCK = PROVEN
EXTERNAL_EFFECT_BLOCK = PROVEN
CURRENT_STATE_EMPTY_INSUFFICIENT = PROVEN
```

Still not proven:

- live TATÁ Edge source delivery;
- live iFood/Teknisa/spooler ingestion;
- cashier-PC binding;
- real notification delivery;
- production Attention Governor;
- real-world operational effects.

## Next gate

Connect the already-proven Edge handoff producer to this shadow worker using synthetic/replay input first, then live-observed read-only input only after source provenance is available.

No production action should be enabled from shadow evidence alone.


## Producer-to-cloud proof

The repository's real Edge producer path was then executed against the deployed
shadow worker, not a hand-written HTTP envelope.

Command:

```text
npm run smoke:edge:watch-shadow-live
```

The smoke path used:

```text
EdgeSourceObservation
  -> projectManagerSnapshot()
  -> managerSnapshotToWatchHandoff()
  -> buildGerencialWatchHandoffRequest()
  -> HTTPS POST /sources/tata-edge/handoff
  -> deployed Worker
  -> D1
  -> Snapshot Engine
```

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

After this producer-level proof, a read-only D1 query observed:

```text
edge_handoff_history rows = 8
watch_runtime_snapshot_history rows = 13
current truth = EMPTY
current validity = INSUFFICIENT
current source watermark = null
changes = 0
rows_written = 0
changed_db = false
```

This upgrades the earlier hand-written admission smoke to:

`EDGE_PRODUCER -> NETWORK -> WORKER -> D1 -> SNAPSHOT = PROVEN_SYNTHETIC_WORLD_PATH`

It still does not prove live operational source capture.

## Exact commit execution proof

Commit:

`3be0526ab71de2e9b2592482d4f41fb43033db9d`

Foxxy clean-clone execution:

```text
npm ci
npm run typecheck
npm run test:edge:shadow:all
```

Result:

```text
exit code 0
all Edge suites PASS
all compatibility-harness suites PASS
Gerencial Watch handoff/transport PASS
shadow-worker tests: 10/10 PASS
```

GitHub Actions run:

`36141981626`

Conclusion:

`success`

Successful gates included dependency inventory, Edge dependency boundary,
TypeScript typecheck and the complete synthetic suite.

Therefore this exact commit has independent proof on both:

- GitHub Actions Linux runner;
- Foxxy Windows host.

The known `xlsx` HIGH advisory remains dependency debt in legacy spreadsheet
tooling; it is not imported by the Edge runtime boundary and was not silently
removed during this proof.
