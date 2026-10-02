# TATÁ Reader — Administrative Review Gate — 2026-10-02

## Status

REVIEW_ONLY_NOT_AUTHORIZED

No administrative change is authorized by this document.

## Canonical scope

Manifest:
`data/tata_reader_permission_manifest_v1.json`

Initial scope is intentionally minimal:
- integrated delivery channels only;
- manual POS delivery excluded;
- `DSCOMANDA` excluded;
- combo structure columns excluded;
- `IDORIGEMVENDA` excluded.

## Artifacts that must agree exactly

1. `data/tata_reader_permission_manifest_v1.json`
2. `tools/tata_reader_least_privilege_preflight.ps1`
3. `tools/tata_reader_sql_apply_REVIEW_ONLY.sql`
4. `tools/tata_reader_sql_rollback_REVIEW_ONLY.sql`
5. `tools/tata_reader_windows_service_apply_REVIEW_ONLY.ps1`
6. `tools/tata_reader_windows_service_rollback_REVIEW_ONLY.ps1`

## Review invariants

- Principal is exactly `NT SERVICE\TataComandaReader`.
- SQL instance is local `SQLEXPRESS`.
- Database is `teknisa`.
- Object schema is exactly `TEKNISA`.
- No table-level SELECT grant.
- No database role grant.
- No server role grant.
- No DENY-based security design.
- No EXECUTE/ALTER/CONTROL/IMPERSONATE/VIEW SERVER STATE.
- No INSERT/UPDATE/DELETE.
- No access to views, functions, synonyms or procedures.
- No readable user-table column outside the manifest.
- No service start in the creation template.
- Review artifacts remain intentionally non-executable.

## SQL grant surface

### TEKNISA.COMANDAVEN
`CDFILIAL, CDLOJA, NRVENDAREST, NRCOMANDA, NRCOMANDAEXT, IDORGCMDVENDA, IDSTCOMANDA, DSOBSCOMANDA`

### TEKNISA.ITCOMANDAVEN
`CDFILIAL, NRVENDAREST, NRCOMANDA, NRPRODCOMVEN, CDPRODUTO, QTPRODCOMVEN, IDSTPRCOMVEN, DSOBSDESCIT, DSOBSPEDDIGCMD, TXPRODCOMVEN`

### TEKNISA.PRODUTO
`CDPRODUTO, NMPRODUTO`

### TEKNISA.VENDAREST
`CDFILIAL, NRVENDAREST, DTHRABERMESA`

## Explicitly deferred

- `DSCOMANDA`: required for manual POS delivery detection; deferred to reduce free-text exposure.
- `CDPRODPROMOCAO`, `NRSEQPRODCOM`, `NRSEQPRODPAI`: deferred until shadow evidence proves combo structure is needed.
- `IDORIGEMVENDA`: deferred until shadow evidence proves it is needed.

## Preflight v3 requirements

The final service identity must fail closed unless:
- exact Windows principal matches;
- zero elevated server roles;
- zero dangerous server permissions;
- zero specific login impersonation;
- zero broad database roles/permissions;
- zero specific user impersonation;
- zero executable procedures;
- zero effective permissions on non-table application objects;
- every required column is readable;
- every non-allowlisted column is unreadable;
- zero writable columns;
- zero object-level write/alter/control/take-ownership authority.

## Rollback boundary

Rollback may remove only artifacts created for the TATÁ reader:
- Windows service `TataComandaReader`;
- SQL database user `NT SERVICE\TataComandaReader`;
- SQL login `NT SERVICE\TataComandaReader`;
- future local runtime files/ACLs created exclusively for that service.

Rollback must not alter:
- Teknisa tables or rows;
- Odhen services/configuration;
- existing printer configuration;
- fiscal configuration.

## Before human authorization

Claude on CAIXA_MOOCA should only:
1. audit syntax and inert guards;
2. compare the manifest with every review artifact;
3. report any divergence;
4. confirm that no artifact is executable in its current state;
5. STOP.

## After human authorization (not yet authorized)

A fresh executable bundle must be generated from the reviewed artifacts.
Do not remove REVIEW_ONLY guards in place.
Then the order of operations must be:
1. create service identity/service but do not start;
2. create SQL login/user and exact column grants;
3. run least-privilege preflight as the final service identity;
4. if preflight is not green, rollback immediately;
5. only under a later gate perform one minimized real order read;
6. no printing/fiscal/cutover in that same gate.