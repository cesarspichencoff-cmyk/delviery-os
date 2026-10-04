# CLAUDE / CAIXA — Product identity metadata probe v3 — 2026-10-04

## Mission

On the real TATÁ CAIXA, inspect SQL Server **metadata only** to determine whether the local Teknisa schema exposes an official crosswalk surface between the internal product id read by TATÁ Reader and the Retail product code used by routing.

This remains a read-only metadata gate. It is not an operational-order read and it is not a fiscal test.

## Why v3 exists

The v2 run correctly stopped with:

`METADATA_PROBE_FAILED`
`Sintaxe incorreta próxima à palavra-chave 'current_user'.`

Root cause: the identity query used `USER_NAME() AS current_user`. In SQL Server, `CURRENT_USER` conflicts as a keyword in this alias position. v3 preserves the output field name and changes only the SQL alias to:

`USER_NAME() AS [current_user]`

The v3 static guard explicitly requires the escaped alias and rejects the unescaped form, preventing recurrence.

The previous field-name correction remains preserved: the metadata search accepts both `CDPROINTE` and `CDPRODINTE`.

## Administrative preflight reconciliation

Do not modify or run the administrative apply during this gate.

The current branch administrative preflight is already distinct from the historical original authorization artifact:

- historical preflight authorization SHA-256: `FFCFB49577280A596EA951C839C881528D187A33F0B5D19DE08D2A86D1FEFFC6`;
- current retry-authorized preflight SHA-256: `3BBE4C37FEDC8EC45A25FE08497B999453B181EBA3033861CFF37F701B4A0035`;
- the current retry-authorized preflight already contains `USER_NAME() AS [current_user]`.

Therefore this probe fix does not require changing the administrative preflight or its retry authorization. This statement does not authorize running the administrative apply in this gate.

## Canonical project source

Repository:
`cesarspichencoff-cmyk/delviery-os`

Branch:
`fix/odhen-routing-config-proof-20260930`

Before execution:

1. obtain the current remote branch snapshot using the existing read-only mechanism;
2. record the current remote HEAD;
3. ensure the guard and probe come from that same HEAD;
4. calculate their SHA-256 values locally;
5. compare them to the expected values below;
6. if either hash differs, STOP;
7. do not merge to main and do not write production state.

## Files and expected hashes

Probe:
`tools/tata_reader_product_identity_metadata_probe_readonly.ps1`

Expected SHA-256:
`603C3D6DA4EB85BFEB2AAB6CCB1A66B0902F46BB304C083F482175C75C1F1ABD`

PowerShell static guard:
`tools/verificar_tata_reader_product_identity_metadata_probe_static_v3.ps1`

Expected SHA-256:
`2292533EF97468BE4D018EC1F8BD9FAEE56F172A456096DB6539A4E4E0DADDAE`

Context receipt:
`docs/TATA_READER_REAL_ORDER_IDENTITY_BRIDGE_2026-10-04.md`

Candidate bridge evidence:
`data/tata_reader_real_order_identity_bridge_candidate_20261004_v1.json`

## Mandatory safety boundary

Allowed:

- local/read-only retrieval of branch files;
- PowerShell execution of the static guard;
- SQL Server connection using existing Windows Integrated Authentication;
- identity functions `SUSER_SNAME()`, `USER_NAME()`, `DB_NAME()`;
- queries against `sys.objects`, `sys.schemas`, `sys.columns`;
- returning metadata field/object names and the probe JSON.

Forbidden:

- SELECT from operational order tables;
- SELECT rows from `TEKNISA.PRODUTO`;
- INSERT/UPDATE/DELETE/MERGE;
- GRANT/REVOKE/DENY or any permission change;
- creating/changing login/user/role;
- changing Teknisa/Odhen config;
- Node installation;
- software/service installation or restart;
- administrative apply;
- print/spooler;
- F7;
- NFC-e/SEFAZ;
- fiscal emission;
- cutover;
- expanding the probe ad hoc if it fails.

If SQL permission is insufficient or any hash/precondition differs, return the failure exactly and STOP. Do not fix permissions.

## Execution

From the snapshot root on the CAIXA:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\verificar_tata_reader_product_identity_metadata_probe_static_v3.ps1
```

Expected output:

`TATA_READER_PRODUCT_IDENTITY_METADATA_PROBE_STATIC_V3_PASS`

Expected exit code:

`0`

Only if that passes, execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\tata_reader_product_identity_metadata_probe_readonly.ps1
```

## Required output

Return all of the following without summarizing away fields:

- remote repository HEAD used for the snapshot;
- SHA-256 of the v3 guard;
- SHA-256 of the v3 probe;
- static verifier exit code and complete output;
- probe exit code;
- complete probe JSON;
- whether `candidate_objects` is empty or not;
- exact names of any visible candidate columns among:
  - `CDPRODUTO`
  - `CDPROINTE`
  - `CDPRODINTE`
  - `CDARVPROD`
  - `CDPRODESTO`
- confirmation that `operational_rows_read = 0`;
- confirmation that every effect flag remained `false`.

## Stop condition

After returning the evidence, STOP.

Do not read product rows, order rows, run administrative apply, print, use F7, or touch fiscal flow even if a candidate crosswalk surface is found.
