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
7. `tools/tata_reader_runtime_cleanup_REVIEW_ONLY.ps1`
8. `tools/tata_reader_preflight_service/TataComandaReader.PreflightService.cs`
9. `tools/tata_reader_preflight_service/build.ps1`
10. `tools/verificar_tata_reader_admin_bundle_static_v1.js`

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
- Service uses the passwordless virtual account `NT SERVICE\TataComandaReader` directly.
- No `sidtype` dependency is required by this design.
- Service is created with `start=demand` and is never started by the installation template.
- Runtime is staged under `C:\ProgramData\TataComandaReader` with RX only for `bin` and Modify only for `evidence` to the service account.
- Preflight service host builds with Windows/.NET Framework `csc.exe`; no NuGet dependency.
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

## Preflight v4 requirements

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

## Preflight service host

The one-shot host:
- service name: `TataComandaReader`;
- executes only `tata_reader_least_privilege_preflight.ps1` from its own `bin` directory;
- captures stdout/stderr/exit code under `evidence`;
- stops after one run;
- has no HTTP client, no direct SQL client and no printing path;
- was compiled on Foxxy with the built-in .NET Framework compiler without NuGet as a portability proof;
- CAIXA_MOOCA compiler availability remains to be checked by metadata before any local build.

## Rollback boundary

Rollback must occur in this order:
1. stop and delete Windows service `TataComandaReader`;
2. drop SQL database user `NT SERVICE\TataComandaReader`;
3. drop SQL login `NT SERVICE\TataComandaReader`;
4. run `tools/tata_reader_runtime_cleanup_REVIEW_ONLY.ps1` in an authorized executable form to remove `C:\ProgramData\TataComandaReader` and its ACLs.

Rollback must not alter:
- Teknisa tables or rows;
- Odhen services/configuration;
- existing printer configuration;
- fiscal configuration.

## Before human authorization

Claude on CAIXA_MOOCA should only:
1. audit syntax and inert guards;
2. run `node tools/verificar_tata_reader_admin_bundle_static_v1.js`;
3. compare the manifest with every review artifact;
4. verify by metadata whether `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` exists;
5. report any divergence;
6. confirm that no administrative artifact is executable in its current state;
7. STOP.

## After human authorization (not yet authorized)

A fresh executable bundle must be generated from the reviewed artifacts.
Do not remove REVIEW_ONLY guards in place.
Then the order of operations must be:
1. install the reviewed reader/preflight binary and create service `TataComandaReader` as `NT SERVICE\TataComandaReader` with `start=demand`; do not start;
2. create SQL login/user and exact column grants;
3. start the service once in preflight-only mode so the preflight runs under the final virtual service account;
4. if preflight is not green, rollback immediately;
5. only under a later gate perform one minimized real order read;
6. no printing/fiscal/cutover in that same gate.