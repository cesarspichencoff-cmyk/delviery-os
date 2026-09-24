# Dependency Security Boundary — Edge Runtime — 2026-09-24

## Observed cloud evidence

GitHub Actions run `36047235239` executed a repository-wide dependency inventory.

The full npm audit reports one direct HIGH dependency finding:

- package: `xlsx@0.18.5`
- prototype pollution: `GHSA-4r6h-8v6p-xvw6`
- ReDoS: `GHSA-5pgg-2g8v-p4x9`
- npm audit: `fixAvailable = false`

The same source inventory showed `xlsx` is actively referenced by historical/analysis tools under `tools/`, where it reads exported spreadsheet files. Therefore the dependency is **not unused** and is not removed blindly.

## Edge boundary

The new TATÁ Edge code does not require spreadsheet parsing.

The CI now enforces two distinct facts:

1. `src/edge/**` and `demo/edge_*.ts` may not reference `xlsx`/SheetJS.
2. `npm audit --omit=dev --audit-level=high` must pass for the runtime dependency surface.

This means:

`LEGACY_TOOL_RISK != EDGE_RUNTIME_DEPENDENCY`

The vulnerable legacy parser remains a tracked repository risk and must not be used to parse untrusted files in the Edge runtime.

## Status

- vulnerability existence: **PROVEN_CLOUD**
- legacy tool usage: **PROVEN_CLOUD**
- Edge import of xlsx: **FORBIDDEN_BY_CI**
- legacy replacement/migration: **OPEN / OUTSIDE CURRENT EDGE FOUNDATION**
