# CLAUDE / CAIXA — CDARVPROD least-privilege permission swap — AUTHORIZED — 2026-10-04

## Status

`HUMAN_AUTHORIZED_EXACT_PERMISSION_SWAP`

César explicitly authorized:

> Autorizo substituir, para o usuário NT SERVICE\TataComandaReader, somente a permissão de leitura de PRODUTO.NMPRODUTO por PRODUTO.CDARVPROD, mantendo CDPRODUTO e sem qualquer outra alteração.

Authorization artifact:

`data/tata_reader_cdarvprod_permission_swap_authorization_v1.json`

Authorization ID:

`CESAR-2026-10-04-TATA-READER-CDARVPROD-PERMISSION-SWAP-V1`

Minimum authorization commit:

`fac512c7106cb1b1e6b863433c55b66f545ddc61`

## Exact authorized end state

Principal:

`NT SERVICE\TataComandaReader`

Object:

`TEKNISA.PRODUTO`

Required explicit column-level SELECT surface before execution:

- `CDPRODUTO`
- `NMPRODUTO`

Required exact explicit column-level SELECT surface after execution:

- `CDPRODUTO`
- `CDARVPROD`

No third product column may remain readable through the explicit grant surface this migration manages.

## Important corrected implementation

Do not use the earlier prepared migration hash.

The authorized v2 migration verifies the **target principal's explicit column grants** by querying:

- `sys.database_permissions`;
- `sys.database_principals`;
- `sys.objects`;
- `sys.schemas`;
- `sys.columns`.

It does not use `HAS_PERMS_BY_NAME` for the target-principal before/after checks.

This correction was completed and statically tested before the authorization artifact was created.

## Canonical project source

Repository:

`cesarspichencoff-cmyk/delviery-os`

Branch:

`fix/odhen-routing-config-proof-20260930`

Before execution:

1. obtain the current remote branch snapshot using the existing read-only mechanism;
2. record current remote HEAD;
3. confirm commit `fac512c7106cb1b1e6b863433c55b66f545ddc61` is an ancestor of current HEAD;
4. obtain authorization file, migration and guard from that same current HEAD;
5. verify:
   - `human_authorized=true`;
   - authorization id exactly matches;
   - target principal exactly `NT SERVICE\TataComandaReader`;
   - target object exactly `TEKNISA.PRODUTO`;
   - before surface exactly `CDPRODUTO + NMPRODUTO`;
   - after surface exactly `CDPRODUTO + CDARVPROD`;
6. calculate local SHA-256 of migration and guard;
7. compare with the pins below;
8. read both scripts before execution;
9. if any check differs, STOP without changing permissions.

## Authorized files and pins

Migration:

`tools/tata_reader_cdarvprod_permission_migration_REVIEW_ONLY.ps1`

Expected SHA-256:

`D6E3FBBA229B1079493B3F8CDE180547A84E8B67907FC3D957E5AF8E39BB60BD`

Static guard:

`tools/verificar_tata_reader_cdarvprod_permission_migration_review_static_v1.ps1`

Expected SHA-256:

`F74F26C2000EB3F52C938FEAFCBD9A2FFD471D696D6129A5CE7802808EA66F1E`

## Static gate

Execute first:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\verificar_tata_reader_cdarvprod_permission_migration_review_static_v1.ps1
```

Required output:

`TATA_READER_CDARVPROD_PERMISSION_MIGRATION_REVIEW_V2_STATIC_PASS`

Required exit code:

`0`

If the guard does not return exactly that with exit 0, STOP.

## Authorized migration

Only after every lineage, authorization, hash and guard check passes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\tata_reader_cdarvprod_permission_migration_REVIEW_ONLY.ps1
```

The migration itself must:

1. connect with existing Windows Integrated Authentication;
2. confirm database `teknisa`;
3. confirm target database principal exists;
4. read only permission/catalog metadata;
5. require exact explicit target-principal SELECT grants before:
   - `CDPRODUTO`
   - `NMPRODUTO`
6. begin a SQL transaction;
7. revoke only `SELECT(NMPRODUTO)` on `TEKNISA.PRODUTO`;
8. grant only `SELECT(CDARVPROD)` on `TEKNISA.PRODUTO`;
9. re-read the target principal's explicit grants inside the transaction;
10. require exact after surface:
    - `CDPRODUTO`
    - `CDARVPROD`
11. commit only if the exact after surface is proven;
12. rollback inside the same transaction if any pre-commit check fails.

Expected success status:

`PERMISSION_SWAP_COMMITTED`

Expected exit code:

`0`

## Authorized effect boundary

On successful execution:

- `permission_change=true` is EXPECTED and AUTHORIZED;
- `database_row_read=false`;
- `database_write=false`;
- `service_change=false`;
- `odhen_write=false`;
- `print=false`;
- `spooler_write=false`;
- `fiscal_action=false`;
- `sefaz_call=false`;
- `cutover=false`.

No service start/stop or restart is authorized.

No order read is authorized.

No print/F7/fiscal action is authorized.

## Rollback boundary

The migration's internal transaction rollback **before commit** is authorized if a migration check fails.

The separate file:

`tools/tata_reader_cdarvprod_permission_rollback_REVIEW_ONLY.ps1`

is **NOT authorized for execution in this gate**.

If the migration reports `PERMISSION_SWAP_COMMITTED`, do not run the separate rollback script.

If anything is uncertain after a committed result, STOP and return evidence.

## Not authorized in this gate

Do not execute:

- the separate rollback script;
- the v8 preflight candidate;
- the administrative apply;
- service changes;
- order/product row reads;
- Odhen changes;
- printing/spooler;
- F7;
- NFC-e/SEFAZ/fiscal;
- cutover.

## Required evidence

Return all of the following without summarizing away details:

- current remote HEAD;
- authorization ancestry result;
- authorization id and `human_authorized`;
- migration SHA-256;
- guard SHA-256;
- complete guard output and exit code;
- migration exit code;
- complete migration JSON;
- `current_login`;
- `database`;
- complete `before_explicit_grants`;
- complete `after_explicit_grants`;
- `transaction_committed`;
- `rollback_completed`;
- every effect flag.

## Stop condition

After returning the migration evidence, STOP.

Do not start the service, do not execute the separate rollback, do not run the v8 preflight candidate, do not read orders, and do not print or touch fiscal flow.
