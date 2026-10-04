# CLAUDE / CAIXA — CDARVPROD least-privilege permission swap — PREPARED / NOT AUTHORIZED — 2026-10-04

## Status

`PREPARED_NOT_AUTHORIZED`

Do not execute the permission migration or rollback until César explicitly authorizes this exact permission change.

## Why this change exists

The observed real-order chain is now proven without product-name identity:

`ITCOMANDAVEN.CDPRODUTO -> TEKNISA.PRODUTO.CDARVPROD -> current Retail routing code -> current printer targets`

For the already-observed real order, this direct chain passed the verifier with no print or database write.

The current least-privilege service surface still allows:

`TEKNISA.PRODUTO(CDPRODUTO, NMPRODUTO)`

The intended future runtime surface is smaller in meaning and equal in column count:

`TEKNISA.PRODUTO(CDPRODUTO, CDARVPROD)`

This removes the runtime dependency on product names rather than adding a third product column.

## Prepared files and pinned SHA-256

Candidate exact-surface preflight:

`tools/tata_reader_least_privilege_preflight_candidate_v8_REVIEW_ONLY.ps1`

SHA-256:

`6710321BA8BD986C16FF1B2C38284F6EB02EC83CFFF9C6225F3D7FB41ABE0E3E`

Transactional permission migration:

`tools/tata_reader_cdarvprod_permission_migration_REVIEW_ONLY.ps1`

SHA-256:

`D6E3FBBA229B1079493B3F8CDE180547A84E8B67907FC3D957E5AF8E39BB60BD`

Prepared rollback:

`tools/tata_reader_cdarvprod_permission_rollback_REVIEW_ONLY.ps1`

SHA-256:

`3AF1B8AFA64C43633ADE6020F4B55E8E17B99C11B68687054BAC5FDA4DC94D72`

Static guard:

`tools/verificar_tata_reader_cdarvprod_permission_migration_review_static_v1.ps1`

SHA-256:

`F74F26C2000EB3F52C938FEAFCBD9A2FFD471D696D6129A5CE7802808EA66F1E`

Candidate receipt:

`data/tata_reader_preflight_candidate_v8.json`

## Exact proposed effect

On database principal:

`NT SERVICE\TataComandaReader`

and only on:

`TEKNISA.PRODUTO`

proposed migration:

1. inspect the target principal's explicit column-level SELECT grants from `sys.database_permissions`;
2. require the exact current explicit grant surface to be `CDPRODUTO + NMPRODUTO`;
3. reject any unexpected explicit DENY or additional explicit SELECT column grant;
4. inside one SQL transaction:
   - REVOKE `SELECT(NMPRODUTO)`;
   - GRANT `SELECT(CDARVPROD)`;
5. before commit require the exact explicit target-principal grant surface to be `CDPRODUTO + CDARVPROD`;
6. rollback automatically if any check fails.

No service start/stop is part of this migration.

## Effect boundary

Expected if a future authorized migration succeeds:

- `permission_change=true`;
- `database_row_read=false`;
- `database_write=false`;
- `service_change=false`;
- `odhen_write=false`;
- `print=false`;
- `spooler_write=false`;
- `fiscal_action=false`;
- `sefaz_call=false`;
- `cutover=false`.

## Static proof already completed off-CAIXA

- all four PowerShell files: parse errors = 0;
- static guard on published migration: PASS, exit 0;
- altered migration replacing the required `GRANT SELECT(CDARVPROD)`: blocked, exit 7.

## Important routing limitation preserved

This permission change does **not** promote `CDARVPROD` to unrestricted global identity authority.

Current evidence:

- local product table: 554 rows, 554 nonblank unique `CDARVPROD`;
- current Retail routing snapshot: 463 products;
- exact set overlap: 391;
- routing codes absent from local `CDARVPROD`: 72;
- local `CDARVPROD` values absent from current routing: 163.

Therefore future runtime must remain fail-closed:

- valid `CDARVPROD` + current route found -> may produce expected-route observation;
- invalid/missing code or route not found -> `UNRESOLVED`, no print.

## Stop condition

This document is preparation only.

Do not run migration, rollback, administrative apply, service changes, order read, print, F7 or fiscal action without a later explicit authorization/handoff.


## Correction before authorization

The first prepared migration candidate incorrectly used `HAS_PERMS_BY_NAME` under the administrative executor identity for its before/after checks. That could not prove the target principal's exact grant surface. Before human authorization was persisted, the candidate was corrected to inspect explicit column-level grants for `NT SERVICE\TataComandaReader` through `sys.database_permissions` + `sys.database_principals`. The static guard now forbids `HAS_PERMS_BY_NAME` in this migration.
