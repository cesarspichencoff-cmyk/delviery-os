# DeliveryOS public CI snapshot — candidate

**Status:** isolated branch, not activated on `main`. No production ingestion or authorization is implied.

## Purpose
Publish only bounded GitHub Actions metadata from the **public**
`cesarspichencoff-cmyk/delviery-os` repository into a fixed JSON file.
The consumer must treat these observations as source claims, not as
human commitments or proof of deployment health.

## Intended operation after separate review
- Workflow: `.github/workflows/cesar-os-public-ci-snapshot.yml`.
- Trigger: hourly at minute 17, or an authorized manual dispatch, on the default branch only.
- Job identity: exact owner ID `292320191`, repository ID `1279837591`, `refs/heads/main`.
- Permissions: `actions: read` and `contents: write`; all other token permissions are omitted.
- Authentication: temporary GitHub Actions `GITHUB_TOKEN`; no PAT, OAuth secret, or third-party credentials.
- Query: one-hour window, one API page up to 100 runs; fail closed if 101+ runs, malformed API, unexpected identity, or duplicate IDs.
- Output: branch `cesar-os-ci-snapshots`, path `ci-snapshots/deliveryos/latest.json`.
- Intended read URL:
  `https://raw.githubusercontent.com/cesarspichencoff-cmyk/delviery-os/cesar-os-ci-snapshots/ci-snapshots/deliveryos/latest.json`.
- Snapshot freshness must be checked by consumers. Late or skipped GitHub schedules do not create complete coverage.
- The branch and JSON output are **not cryptographically authenticated**. The consumer must not infer more authority than `SOURCE_CLAIM`.

## Local test
```bash
node --test test/cesar-os-ci-snapshot.test.mjs
```

## Gates before activation
1. Confirm a reviewed, protected default branch and appropriate repository workflow permissions. At preparation time `main` was **unprotected**.
2. Review fixed-path writer and built-in token permissions. A workflow token can write beyond one path; the code restricts its own destination but GitHub does not supply a path-scoped `contents: write` permission.
3. Approve/default-branch merge separately; no automatic feature-branch scheduling should be expected.
4. Prove a **real** workflow run using the GitHub-hosted token and read back the fixed snapshot, including freshness, uniqueness, and 100-record limit.
5. Validate the consumer's exact repository identity, schema, age, and source-claim limitations; then an authorized, isolated read can be enabled.
6. Only after an authenticated private-runtime ingestion receipt and D1 WORK readback should automated coverage be called active.
7. Preserve other CÉSAR OS sources and existing Cloudflare Cron; make no billing changes.

**Updated proof — 2026-10-10:** GitHub Actions read-only candidate run [#38061371153](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38061371153) completed successfully, with 12/12 producer tests and 11 runs read using an ephemeral `GITHUB_TOKEN` with only `actions:read`/`contents:read`. No repository writes occurred in that job. Local consumer passed 13/13 and a synthetic cross-language WORK envelope contract was validated; no Cockpit writes.

**Data-model limitation:** this snapshot enumerates runs **created in the prior hour**. It does **not** guarantee their eventual conclusion is captured after that hour, nor prove continuous gap-free collection if GitHub Actions scheduling is delayed or skipped. Flags `collection_basis=RUN_CREATED_AT`, `lifecycle_updates_complete=false`, `continuity_complete=false` are mandatory; do not market the feed as live CI health.

**Publish-proof requirement:** the producer checks exact returned snapshot file path, blob SHA, commit SHA, and first-creation branch reference before declaring success. This verifies the API receipt shape, not cryptographic authenticity of public contents.

**No scheduled snapshot feed or private ingestion has been proven.**
