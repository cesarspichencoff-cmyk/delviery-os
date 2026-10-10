# CÉSAR OS / DeliveryOS — Release gates for public CI replay

**REVIEW ONLY.** No production deploy, Cloudflare D1 migration, Cron, human-commitment admission, or paid service is authorized by this document.

## Scope and chain
- Producer PR #58: create-only time-addressed GitHub CI archive, plus legacy latest.json.
- Consumer PR #61: stacked on #58, read-only replay planner, bounded reconciliation and candidate durable cursor adapter.
- Exact source: cesarspichencoff-cmyk/delviery-os, repository ID 1279837591, owner ID 292320191. SOURCE_CLAIM only; no raw payload or commitments.

## Required gates before any production promotion
1. Review producer archive semantics, Git blob SHA, collision behavior and backwards compatibility. The archive is append-only **by code contract**, not immutable against repository administrators.
2. Verify the first real archival GitHub workflow run, including 404/403/429/5xx and complete proof of exactly one historical file and the latest pointer. Current workflow is manual-only.
3. Verify discovery of archives across UTC day boundaries. Missing directory or uncovered interval means UNKNOWN/GAPS_DETECTED; never infer an empty window or continuous source coverage.
4. Measure API cost/rate impact: a seven-day horizon can cause up to eight daily listings + 200 file reads + 20 run reconciliation reads = **228 GitHub API GETs per replay cycle**. This is an upper bound, not a measured rate. Do not schedule hourly without caching/rate-budget tests.
5. Verify candidate D1 cursor table migration on isolated DB with backup, access boundaries and compare-and-swap collisions. It has NOT been deployed.
6. Keep discovery cursor distinct from ingestion acknowledgement: a cursor revision is not proof that observations were written. Require an exact source-ingestion receipt before advancing any ingestion cursor; design atomicity/idempotence across cursor and receipts.
7. Reconcile lifecycle via bounded GitHub Actions run GETs; verify repo/owner IDs, monotonicity, same-timestamp contradictions, pagination/rotation. A completed run is still a source claim, not a human commitment.
8. Preserve rollback and regressions for Gmail, Calendar, Outlook, Zapia, ActivityWatch and existing bridge/private Workers.
9. Refresh any static snapshot older than 90 minutes before a new ingestion. Never retry an OpenAI security-blocked POST through an equivalent route.
10. Only with separate authorized promotion and end-to-end world proof discuss recurring GitHub dispatch, DELIVERYOS_WORK_ENABLED and INGEST_ENABLED; remain OFF otherwise.

## Proof boundary
- Last local evidence: **41/41 Node tests PASS** on Foxxy with GitHub branch commit 6499e1b3503eda1d6c126f64e5e8ed40c739ac7b. Remote GitHub CI checks are NOT proven.
- Producer and consumer changes are DRAFT PRs. Main branch, Cloudflare/D1, and recurring schedules remain unchanged by these PRs.
- Not WORLD_PROVEN: archival process against real GitHub API; replay into private database; D1 CAS transaction; complete continuity; new INGESTED batch.
- The 16 previously imported WORK observations are distinct from this unreleased consumer. Avoid DONE/10/10 without these gates.