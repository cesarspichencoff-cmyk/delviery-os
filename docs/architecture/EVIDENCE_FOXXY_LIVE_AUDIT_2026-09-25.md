# Foxxy / Gerencial Watch Live Read-Only Audit — 2026-09-25

## Scope

This receipt records read-only facts observed while Foxxy was online.

No deployment, D1 mutation, mailbox mutation, printer mutation, production write,
or cashier-PC action was performed.

## Exact DeliveryOS / Edge proof on Windows

Fresh clone:

`C:\Users\italo\Downloads\deliveryos-edge-proof-20260925-0425`

Branch:

`design/tata-edge-runtime-foundation-v1`

Commit:

`f339b0ab115d67f601696d0fc3fcf45d12fb74b3`

Observed commands:

```text
npm.cmd ci
npm.cmd run typecheck
npm.cmd run test:edge:shadow:all
```

Result:

```text
exit code 0
full Edge + compatibility-harness suite green
```

Classification:

`PROVEN_WINDOWS_HOST_COMPATIBILITY_FOR_THIS_COMMIT`

This does **not** prove cashier-PC binding or physical restaurant printing.

## Windows print discovery

Read-only `Get-Printer` / `Get-PrintJob` observed:

- OneNote (Desktop)
- Microsoft XPS Document Writer
- Microsoft Print to PDF
- Fax
- ELGIN L42 Pro - SIMULACAO
  - driver: ELGIN L42Pro
  - port: FILE:
- AnyDesk Printer

Current print jobs observed: 0.

Classification:

- Windows read-only print acquisition: `PROVEN_ON_FOXXY`
- cashier/Teknisa spooler binding: `NOT_PROVEN`
- physical print effect: `NOT_PROVEN`

## Dependency security

`npm audit --json` observed one HIGH direct dependency finding for
`xlsx@0.18.5` (prototype pollution / ReDoS advisories).

This dependency is used by legacy/offline spreadsheet tooling and is already
kept outside `src/edge/**` by the Edge dependency boundary.

Classification:

`KNOWN_DEPENDENCY_DEBT / NOT_AN_EDGE_RUNTIME_IMPORT`

No blind dependency removal was performed.

## Gerencial mail bridge — current Cloudflare state

Worker:

`cesar-gerencial-mail-bridge`

Latest deployment observed:

`172d3937-1198-493a-ae33-d19e944ef3c8`

Created:

`2026-09-23T08:08:08.225Z`

This matches the newer source-bridge checkpoint rather than the older
production-state receipt.

Local mail-bridge regression on Foxxy:

```text
28 tests
28 pass
0 fail
```

## Mail bridge D1 — live read-only receipt

Database:

`cesar-gerencial-mail-bridge`

Database id:

`fc0ae418-599d-41da-b849-5fada0cc08e2`

Observed table counts:

```text
daily_closings                54
ifood_review_mail              0
ifood_review_attachment        0
ifood_evaluation_mails         0
ifood_evaluation_attachments   0
```

All remote SQL receipts reported:

```text
changes = 0
rows_written = 0
changed_db = false
```

Latest closing source evidence:

```text
business_date       2026-09-24
message_sent_at     2026-09-25T02:57:22.000Z
updated_at          2026-09-25T03:00:39.554Z
readonly_verified   1
```

The earlier checkpoint had 52 closing rows; the live database now has 54.
Therefore the closing ingestion path continued to receive data after that
checkpoint.

This does not prove the iFood review route, whose relevant tables remain empty.

## Gerencial Watch v0.11 — live deployment reality

Portable v0.11 design documents define a standalone worker:

`cesar-gerencial-watch-bridge`

with server-side Snapshot Engine semantics.

A direct Cloudflare deployment lookup for that worker returned:

```text
Worker does not exist on this account
code 10007
```

The account's D1 list currently contains:

- cesar-gerencial-mail-bridge
- tata-academia-preview
- tata-academia

No dedicated Gerencial Watch D1 was observed.

Therefore:

```text
PORTABLE_V0_11_DESIGN_READY
!=
GERENCIAL_WATCH_WORKER_DEPLOYED
!=
SNAPSHOT_ENGINE_LIVE
```

The v0.11 architecture remains `NOT_DEPLOYED / NOT_PROVEN_IN_PRODUCTION`.

## Difference Check consequence

Do not build a second Gerencial Watch brain inside DeliveryOS.

Current ownership remains:

```text
TATÁ Edge / DeliveryOS
  -> operational observation
  -> identity
  -> Edge Manager Snapshot
  -> versioned EdgeWatch handoff

Gerencial Watch canonical lineage
  -> capture / voice
  -> modes
  -> commitments
  -> Evidence Debt
  -> Gerente Investigador
  -> Snapshot Engine
  -> Attention Governor
  -> Apple Watch
```

The next integration must target the real Gerencial Watch event/snapshot
contract. Deployment of the standalone Watch worker is a separate external
effect gate and was not authorized or attempted here.
