# CLAUDE / CAIXA — Product identity metadata probe v2 — 2026-10-04

## Mission

On the real TATÁ CAIXA, inspect SQL Server **metadata only** to determine whether the local Teknisa schema exposes an official crosswalk surface between the internal product id read by TATÁ Reader and the Retail product code used by routing.

This is a read-only metadata gate. It is not an operational-order read and it is not a fiscal test.

## Why v2 exists

The first attempt correctly STOPPED because the CAIXA has no Node, so the v1 JavaScript static guard could not run.

The first attempt also surfaced a material field-name risk: prior CAIXA metadata evidence reported `CDPRODINTE`, while v1 searched only `CDPROINTE`. v2 deliberately accepts and reports **both** names so that a naming/version difference cannot create a false negative.

Do **not** install Node on the CAIXA for this gate.

## Canonical project source

Repository:
`cesarspichencoff-cmyk/delviery-os`

Branch:
`fix/odhen-routing-config-proof-20260930`

Before execution:

1. obtain the current remote branch snapshot using the read-only mechanism already available on the CAIXA;
2. record the current remote HEAD;
3. ensure the files below come from that same HEAD;
4. do not merge to main and do not write production state.

## Files

PowerShell static guard:
`tools/verificar_tata_reader_product_identity_metadata_probe_static_v2.ps1`

Probe:
`tools/tata_reader_product_identity_metadata_probe_readonly.ps1`

Context receipt:
`docs/TATA_READER_REAL_ORDER_IDENTITY_BRIDGE_2026-10-04.md`

Candidate bridge evidence:
`data/tata_reader_real_order_identity_bridge_candidate_20261004_v1.json`

## Preflight evidence already obtained outside CAIXA

The exact v1 files reported by the CAIXA were independently downloaded on Foxxy and matched the CAIXA SHA-256 values byte-for-byte:

- v1 probe: `790AA6F0039E819811D918001C3D0BE4C7FFA650A24F7930CEB1B81D1BA363A3`
- v1 JS guard: `BFF05A86E863DDC039BB571DF8A49A8AD6EF94F09CB968C1495B1D959C37C16D`

The v1 JS guard then passed on Foxxy with exit code 0.

The v2 PowerShell guard was also tested on Foxxy:
- safe v2 probe: `TATA_READER_PRODUCT_IDENTITY_METADATA_PROBE_STATIC_PASS`, exit 0;
- deliberately adulterated copy containing `FROM TEKNISA.PRODUTO`: blocked, exit 7.

This preflight does **not** replace the mandatory local v2 guard on the CAIXA.

## Mandatory safety boundary

Allowed:

- local/read-only retrieval of the pinned branch files;
- PowerShell execution of the static guard;
- SQL Server connection using existing Windows Integrated Authentication;
- queries against `sys.objects`, `sys.schemas`, `sys.columns`;
- identity functions `SUSER_SNAME()`, `USER_NAME()`, `DB_NAME()`;
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
- print/spooler;
- F7;
- NFC-e/SEFAZ;
- fiscal emission;
- cutover;
- expanding the probe ad hoc if it fails.

If SQL permission is insufficient, return the failure exactly and STOP. Do not fix permissions.

## Execution

From the repository/snapshot root on the CAIXA, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\verificar_tata_reader_product_identity_metadata_probe_static_v2.ps1
```

Expected output:

`TATA_READER_PRODUCT_IDENTITY_METADATA_PROBE_STATIC_PASS`

Expected exit code:

`0`

Only if the local guard passes, execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\tata_reader_product_identity_metadata_probe_readonly.ps1
```

## Required output

Return all of the following without summarizing away fields:

- remote repository HEAD used for the snapshot;
- SHA-256 of the v2 PowerShell guard;
- SHA-256 of the probe;
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

Do not read product rows, order rows, print, use F7, or touch fiscal flow even if a candidate crosswalk surface is found. The next step must be designed from the metadata result first.
