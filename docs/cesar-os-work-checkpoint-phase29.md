# CÉSAR OS / VÉRTICE — WORK checkpoint — phase 29

## Revalidation / proof
- Canonical VÉRTICE verified live `cesarspichencoff-cmyk/vertice-runtime.` branch `vertice-active`, HEAD `e81b6d810e6a20e4a7e2f55ff9d1902b23dcf664`; `VERTICE_ENTRY.md` read.
- DeliveryOS main HEAD at this phase: `87c5e017a8d240a28114a62ed206db0059076bd2`, PR #78 (bounded read-only replay) merged. Producer PR #58 merged earlier at `be84a0d651c545295a5db2c8c7452694bb9f6f30`.
- PR #61 remains `DRAFT`, not merged, based on `main`. The review branch is `cesar-os/ci-replay-cursor-draft`.
- Last completed exact-code test commit BEFORE THIS DOC: `584f98520f36d25d9b033925dc21d557b8aa0a3e`.
- All 3 checks at that commit passed: `read-only-verify`, `verify-producer`, `verify`. Detailed `verify` log: https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38099937517/job/114353600695
- GitHub Actions `verify` recorded **100/100 JavaScript tests PASS, 0 failures**, plus 3/3 cursor SQLite tests and 3/3 batched-insert SQLite tests.

## New material engineering delta
1. **Cursor history preserved:** `planReplay` now retains previous confirmed archive hashes across disjoint UTC lookback windows. No path/digest can silently disappear in `commitAfterReceipts`. Tested for rollover and forged deletion.
2. **Retention is still a hard gate:** with 200 archive entries the cursor fails `cursor_overflow`. This is correct fail-closed behavior, NOT a sustainable rolling retention design. Create a durable, transactional archive evidence ledger before automatic operation; no silent eviction or fake compaction proof.
3. **Pinned source reader:** `pinned-archive-reader.mjs` performs fixed-repo/fixed-branch GitHub Contents GET, verifies HTTP non-redirect, expected path/encoding/size, base64 integrity, Git blob SHA, JSON snapshot contract and SHA-256 of original bytes. No D1 effect.
4. **Real-world read proof:** GitHub Actions logged `PINNED_ORIGIN_READ_WORLD_PROVEN` for manually seeded, already-public `ci-snapshots/deliveryos/archive/2026/10/10/20261010T204645627Z.json`. Git SHA `1b7963fdab69be502b88c9f0864277d5be96cb47`, SHA-256 `61f6575d1101113015734e01be57182e38ec41f7fa2e683c8c4380403b5fcdd1`, count 2, `private_ingest_performed=false`.
5. **Gated candidate cursor:** `trusted-cursor-gate.mjs` re-reads EVERY new archive from pinned GitHub API and validates exact path/hashes/size before considering a simulated internal receipt and compare-and-swap. Even zero-run archives cannot bypass origin verification. Five new tests included.

## Boundaries that must not be collapsed
- GitHub historical fixture was SEEDED MANUALLY from a previously public snapshot. Do not call that automatic producer-archive proof.
- No PRIVATE D1 migration or new private POST was attempted in this phase. The earlier blocked D1 write remains blocked and should not be bypassed.
- Existing private `/internal/work-ci/receipt` is v1; there is NO production v2 receipt with `git_blob_sha`, `snapshot_sha256`, trusted source provenance or atomic ingest.
- WORK recurring automation remains OFF: no source or bridge cron enabled. Existing 16 manual D1 WORK observations remain last known, not re-counted this phase.
- The new cursor store and trusted-source gate are CODE/TEST-ready candidates, not deployed, not production transactional, not an automatic complete coverage claim.
- The new source reader proves public GitHub byte provenance when executed from a trusted runner, not that a private Cloudflare Worker has performed authorized authenticated ingestion.

## Next mandatory gates (sequence)
1. Prove new archive creation by the producer code itself using a legitimate workflow_dispatch on current main, plus read-after-write; existing GitHub connector does not advertise a dispatch operation. Do not fake this by writing fixture again.
2. Build trusted source-to-private v2 service-binding design (fixed source and branch, tested credential boundary), with exact byte hashes and one transaction for observations, receipt and cursor/ledger.
3. Deploy/test candidate schema ONLY in an isolated approved Cloudflare D1 environment; prove free-tier statement limits, race/dedupe, rollback and read-after-write.
4. Add durable archive ledger with verifiable pruning/retention. Avoid rolling cursor capacity ceiling of 200.
5. Prove independent commitment count stability and bridge/Gmail/Calendar regressions, then explicitly review recurrence and cost. Never treat `SOURCE_CLAIM` as a human commitment.

State: PR #61 DRAFT / REMOTE TEST_PASS. LIVE read-only source is proven; private ingest v2, ledger and recurrence are NOT PROVEN.