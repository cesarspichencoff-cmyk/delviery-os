# TATÁ Reader — Authorized Administrative Runbook — 2026-10-02

## Authorization

Authorization ID:

CESAR-2026-10-02-TATA-READER-ADMIN-V1

Human authorization is recorded in:

data/tata_reader_admin_authorization_v1.json

## Authorized effects only

This runbook authorizes only:

1. stage the pinned reader runtime under C:\ProgramData\TataComandaReader;
2. create Windows service TataComandaReader as NT SERVICE\TataComandaReader with start=demand;
3. create SQL login and database user NT SERVICE\TataComandaReader;
4. grant the exact reviewed column-level SELECT surface;
5. start the service once in preflight-only mode;
6. keep the service stopped after the one-shot preflight;
7. automatically rollback service, SQL principal and runtime if any gate fails.

## Still not authorized

- real order-row reads;
- production printing;
- spooler production effects;
- Odhen/Teknisa writes beyond the dedicated login/user/grants;
- NFC-e;
- SEFAZ;
- fiscal actions;
- cutover;
- automatic service startup;
- delivery manual POS scope;
- DSCOMANDA;
- combo-structure columns;
- IDORIGEMVENDA.

## Required preconditions

- branch fix/odhen-routing-config-proof-20260930;
- current HEAD must be explicitly reported before execution;
- binary must exist at:
  C:\TATA\comanda-v1\saida\fase3\TataComandaReader.PreflightService.exe
- binary SHA-256:
  241073DA0AE678933E2EF88AF2DA2091F1DF4A578E1D78AD2B48839D4465BA6C
- preflight SHA-256:
  FFCFB49577280A596EA951C839C881528D187A33F0B5D19DE08D2A86D1FEFFC6
- TataComandaReader service must not already exist;
- C:\ProgramData\TataComandaReader must not already exist;
- SQL login/user NT SERVICE\TataComandaReader must not already exist;
- current administrative principal must be sysadmin for this one authorized administrative change.

## Mandatory first step

Run:

powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tools\authorized\verificar_tata_reader_admin_authorized_v1.ps1

Required output:

passed=true
administrative_effect=false
ready_for_authorized_admin_execution=true

If the verifier fails, STOP. Do not execute the apply script.

## Authorized execution

Run exactly:

powershell -NoProfile -ExecutionPolicy Bypass -File tools\authorized\tata_reader_admin_apply_authorized_20261002.ps1 -AuthorizationId "CESAR-2026-10-02-TATA-READER-ADMIN-V1"

The apply script:

- verifies authorization;
- verifies binary and preflight hashes;
- reruns the static review verifier;
- checks SQL target metadata before any effect;
- creates the service only in manual mode;
- closes runtime ACL inheritance;
- creates only the reviewed SQL login/user and column SELECT grants;
- starts the service once;
- validates effective Windows identity and SQL permissions;
- reads no operational order rows;
- performs no print/fiscal/cutover action.

## Success proof

Success is only:

status=PROVEN_ADMIN_PHASE_PASS
preflight_exit_code=0
safe_for_minimized_order_read=true
order_row_read=false
print=false
fiscal_action=false
cutover=false

Result file:

C:\TATA\comanda-v1\saida\fase3\TATA_READER_ADMIN_PHASE_RESULT.json

Also preserve:

C:\ProgramData\TataComandaReader\evidence\preflight.json
C:\ProgramData\TataComandaReader\evidence\preflight.identity.txt
C:\ProgramData\TataComandaReader\evidence\preflight.exitcode.txt

## Failure behavior

Any failure after the first effect triggers automatic rollback in this order:

1. stop/delete TataComandaReader service;
2. drop database user;
3. drop SQL login;
4. remove C:\ProgramData\TataComandaReader.

Expected failure result:

status=FAILED_ROLLED_BACK
rollback_complete=true

If status is FAILED_ROLLBACK_INCOMPLETE:

STOP immediately.
Do not retry.
Return all rollback_errors for diagnosis.

## Standalone rollback

If a later explicit rollback is needed within this already authorized phase, run:

powershell -NoProfile -ExecutionPolicy Bypass -File tools\authorized\tata_reader_admin_rollback_authorized_20261002.ps1 -AuthorizationId "CESAR-2026-10-02-TATA-READER-ADMIN-V1"

## Gate after success

Even after PROVEN_ADMIN_PHASE_PASS:

- do not read a real order;
- do not print;
- do not enable automatic startup;
- do not touch fiscal;
- do not cut over.

The next gate is a separate authorization for one minimized real order read in shadow mode.


## Incident 2026-10-03 and retry gate

The first authorized administrative attempt failed before SQL permission application, while closing runtime ACL inheritance. The runtime was later recovered under elevated PowerShell and the clean state was proven with:

- service_present=False
- runtime_present=False
- five runtime objects processed successfully
- zero ACL-recovery failures

Failure class: ACL_STAGING_ORDER_LOCKOUT.

The fixed installer now follows this invariant:

1. grant explicit SYSTEM/Administrators/service access on a directory;
2. only then remove ACL inheritance for that directory;
3. verify the closed ACL;
4. rollback can recover ownership/ACLs with takeown + icacls before runtime deletion if ordinary deletion fails.

The original authorization does not automatically authorize a retry after this incident.

Before any new administrative execution, a fresh file must exist:

data/tata_reader_admin_retry_authorization_v2.json

and must explicitly contain human_retry_authorized=true for the same authorization ID and incident head.

Until that exists, the authorized verifier must report:

- passed=true
- administrative_effect=false
- retry_authorized=false
- ready_for_authorized_admin_execution=false
- ready_for_human_retry_authorization=true

Do not run the apply script while ready_for_authorized_admin_execution=false.
