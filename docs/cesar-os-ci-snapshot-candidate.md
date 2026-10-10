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

**Current proof:** local producer logic 10/10 tests; consumer logic 11/11 tests; cross-language sample normalized as WORK, zero commitments. **No live feed or ingestion has been proven.**
