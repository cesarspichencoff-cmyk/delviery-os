# César Gerencial Watch — Cloud Shadow Runtime

This package is the cloud ingress/snapshot shell for Gerencial Watch.

It is intentionally **not** a second Context Kernel.

## Current scope

- receive the minimized TATÁ Edge handoff;
- validate truth, counts, timestamps and field boundaries;
- persist append-only handoff history in an isolated D1;
- maintain current + historical runtime snapshots;
- recompute hourly without turning compute time into source freshness;
- expose the current snapshot behind a bearer secret.

## Explicitly disabled

- no email mutation;
- no operational write;
- no iFood/Teknisa action;
- no printer action;
- no notification/push;
- no global all-clear;
- no secrets in source.

## Routes

- `GET /health` — public, non-sensitive health only;
- `POST /sources/tata-edge/handoff` — authenticated;
- `GET /snapshot` — authenticated;
- `POST /snapshot/recompute` — authenticated.

## D1

Dedicated database:

`cesar-gerencial-watch`

This package must not reuse or mutate the mail-bridge D1.

## Deploy gate

Create the dedicated D1, substitute its id into a local `wrangler.toml`,
apply `schema.sql`, deploy the standalone worker, configure
`WATCH_BRIDGE_TOKEN`, then run a synthetic smoke test.

Synthetic smoke data must remain classified as SIMULATION.
