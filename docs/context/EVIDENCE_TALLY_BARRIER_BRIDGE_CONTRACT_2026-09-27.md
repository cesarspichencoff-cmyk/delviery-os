# EVIDENCE — Tally barrier evidence bridge contract — 2026-09-27

## Why this work proceeded while Gate E waits

The production Tally form `ZjVv1a` is already deployed, but the first real post-cutover occurrence has not yet arrived. That blocks proof of the live 20-column Google Sheets serialization and therefore blocks live webhook wiring.

It does not block preparation of the downstream semantic boundary.

## Architecture boundary

Two existing code surfaces were revalidated:

- `src/contextKernel/*` is explicitly an experimental compatibility harness and must not become a second managerial brain.
- `deploy/cloudflare/gerencial-watch-shadow/*` is explicitly the ingress/snapshot shell and must not absorb higher-layer reasoning.

The more mature portable Gerencial Watch / César Context Kernel lineage was recovered from prior project continuity, but its executable package is not currently present in an accessible repository path on this branch. Therefore this change does not invent a new canonical runtime destination.

## Prepared bridge contract

Added:

- `deploy/cloudflare/gerencial-watch-shadow/src/tally-barrier-bridge.mjs`
- `deploy/cloudflare/gerencial-watch-shadow/test/tally-barrier-bridge.test.mjs`

The bridge is pure and disconnected. It is not called by the worker and has no route, persistence, notification or operational side effect.

It projects an already-normalized Tally barrier observation into a minimized evidence envelope suitable for a future higher-layer adapter.

Preserved semantics:

- truth class remains `OPERATOR_SELF_REPORT`;
- source mode remains `live_observed`;
- raw operator name, reference text, incident narrative and action narrative do not cross the bridge;
- `REPORTED_DONE` does not become compliance proof;
- `REPORTED_NOT_DONE` does not become barrier-failure proof;
- cause and guilt remain unproven;
- attention authority remains `NONE`;
- external effect authority remains `false`.

The bridge maps the seven expected barriers already used by the project and fails closed on:

- unexpected input fields;
- wrong form identity;
- promoted truth class;
- attention authority;
- external-effect authority;
- invalid/inactive matrix contamination;
- unknown report status.

## Failure circuit breaker

The first CI run, `36320881705`, failed one new test.

The contract itself rejected the fixture correctly with `tally_bridge_item_missing_inactive_present`. The test intended to isolate wrong-item contamination but accidentally left the default item-missing matrix populated too.

The test fixture was corrected to contaminate only the intended inactive matrix. No production or runtime logic was weakened to make the test pass.

## Proof

Final implementation commit:

`c437d40c4a157158ecc8428e5f14069f2e8e0c10`

GitHub Actions:

- run: `36321051612`
- workflow: `Edge Shadow CI`
- result: `SUCCESS`

## Current boundary

PROVEN:

- the minimized bridge contract preserves truth/authority semantics;
- three subtypes are handled;
- content minimization is enforced;
- adversarial authority and contamination cases fail closed;
- existing project regression remains green.

NOT DONE:

- no live webhook is wired;
- no production Tally observation is sent through this bridge;
- no canonical higher-layer runtime consumes this envelope yet;
- the first real post-cutover Sheet serialization is still pending.

The next safe integration step is to connect this contract to the canonical Gerencial Watch / César Context Kernel capture/investigation path only after that runtime is concretely accessible, while Gate E continues waiting for the first real Tally occurrence.
