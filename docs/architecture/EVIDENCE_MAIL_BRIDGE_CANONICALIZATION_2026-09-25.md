# Evidence — Gerencial Mail Bridge canonicalization — 2026-09-25

## Scope

This receipt records the canonicalization of the already-operational mail source bridge into the DeliveryOS repository.
No synthetic mail was inserted and no production deployment was performed by this canonicalization step.

## Production route verified

- Worker: `cesar-gerencial-mail-bridge`
- Active deployment observed: `172d3937-1198-493a-ae33-d19e944ef3c8`
- D1: `cesar-gerencial-mail-bridge`
- D1 id: `fc0ae418-599d-41da-b849-5fada0cc08e2`
- Declared cron: `0 * * * *`
- Production secret names present: `IMAP_PASSWORD`, `NEON_DATABASE_URL`
- Secret values were not read or copied.
- IMAP mailbox: `atendimento@tatasushi.com.br`
- Folder: Sent / `INBOX.Sent`
- iFood route: sender Atendimento -> recipient César + subject contains `ifood`, case-insensitive.
- Mail read contract: `EXAMINE` + `BODY.PEEK`.
- iFood identity: `UIDVALIDITY + UID`.

## Remote D1 proof

Read-only query result:
- `daily_closings = 54`
- `ifood_review_mail = 0`
- `ifood_review_attachment = 0`
- query metadata: `rows_written = 0`, `changed_db = false`.

Latest closing rows observed:
- business date `2026-09-24`: source `2026-09-25T02:57:22Z`, ingested `2026-09-25T03:00:39.554Z`, read-only verified.
- business date `2026-09-23`: source `2026-09-24T02:34:45Z`, ingested `2026-09-24T03:00:38.109Z`, read-only verified.
- business date `2026-09-22`: source `2026-09-23T02:08:28Z`, ingested `2026-09-23T06:00:41.221Z`, read-only verified.

## Canonical repository surface

Added under:
`deploy/cloudflare/gerencial-mail-bridge`

The repository copy contains the runtime source, migrations, schema, package manifest/lock, Wrangler configuration and regression tests.
No secret value is stored in the repository.

Root gate added:
`npm run test:gerencial-mail-bridge`

The mail bridge suite is now part of:
`npm run test:edge:shadow:all`

## Verification

- Operational source package: 28/28 PASS.
- Canonical repository copy: 28/28 PASS without a nested `node_modules`.
- Canonical `src/` is byte-equivalent to the verified operational source (`git diff --no-index` returned no differences).
- Root TypeScript typecheck: PASS.
- Full Edge / Context / Watch / producer / mail gate: exit 0.
- Wrangler 4.141.0 dry-run: PASS.
- Dry-run upload: 372.91 KiB / gzip 96.54 KiB.
- Dry-run binding: D1 `cesar-gerencial-mail-bridge` only.

## Non-canonical bootstrap blocked

A separate worker named `cesar-gerencial-watch-mail-bridge` was inspected and is not the production source route.
Its active version observed was `1142526c-b991-41ca-ac25-fa2851591e5e`, and its secret list was empty.
Its local bootstrap implementation targets the César mailbox directly, which conflicts with the verified production route.

Do not deploy or promote that bootstrap path.
The canonical production route is `cesar-gerencial-mail-bridge` reading Atendimento Sent.

## Remaining UNKNOWN

No real team-sent iFood review batch has yet been captured in `ifood_review_mail`.
Therefore the following are not yet world-proven:
- first real review extraction quality;
- real attachment shape;
- end-to-end propagation of `ifood_review_mail` into the Edge producer and Watch;
- a source-specific freshness cadence for iFood reviews.

Until that evidence exists, iFood freshness remains `UNKNOWN`, global all-clear remains unauthorized, and external effects remain unauthorized.
