# CLAUDE / CAIXA — Product identity metadata probe — 2026-10-04

## Mission

On the real TATÁ CAIXA, inspect SQL Server **metadata only** to find whether the local Teknisa schema exposes an official crosswalk surface between the internal product id read by TATÁ Reader and the Retail product code used by routing.

This is a read-only metadata gate. It is not an operational-order read and it is not a fiscal test.

## Canonical project source

Repository:
`cesarspichencoff-cmyk/delviery-os`

Branch:
`fix/odhen-routing-config-proof-20260930`

Minimum known commit containing the prepared gate:
`7063c2aed0d4b5d625e8d63e2b7f9fd06f76e680`

Before execution:

1. fetch the branch;
2. checkout/reset only the local working copy to the remote branch if the working copy is clean and this does not destroy unrelated local work;
3. record current HEAD;
4. verify the minimum commit is an ancestor of current HEAD;
5. do not merge to main and do not write production state.

## Files

Static guard:
`tools/verificar_tata_reader_product_identity_metadata_probe_static_v1.js`

Probe:
`tools/tata_reader_product_identity_metadata_probe_readonly.ps1`

Context receipt:
`docs/TATA_READER_REAL_ORDER_IDENTITY_BRIDGE_2026-10-04.md`

Candidate bridge evidence:
`data/tata_reader_real_order_identity_bridge_candidate_20261004_v1.json`

## Mandatory safety boundary

Allowed:

- local Git read/fetch;
- Node execution of the static guard;
- SQL Server connection using existing Windows Integrated Authentication;
- queries against `sys.objects`, `sys.schemas`, `sys.columns`;
- returning metadata field/object names and the probe JSON.

Forbidden:

- SELECT from operational order tables;
- SELECT rows from `TEKNISA.PRODUTO`;
- INSERT/UPDATE/DELETE/MERGE;
- GRANT/REVOKE/DENY or any permission change;
- creating/changing login/user/role;
- changing Teknisa/Odhen config;
- print/spooler;
- F7;
- NFC-e/SEFAZ;
- fiscal emission;
- service installation/change/restart;
- cutover;
- expanding the probe ad hoc if it fails.

If SQL permission is insufficient, return the failure exactly and STOP. Do not fix permissions.

## Execution

From the repository root on the CAIXA:

```powershell
node tools/verificar_tata_reader_product_identity_metadata_probe_static_v1.js
```

The expected result is:

`TATA_READER_PRODUCT_IDENTITY_METADATA_PROBE_STATIC_PASS`

Only if that passes, execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\tata_reader_product_identity_metadata_probe_readonly.ps1
```

## Required output

Return all of the following, without summarizing away fields:

- repository HEAD;
- SHA-256 of the probe script;
- static verifier exit code and complete output;
- probe exit code;
- complete probe JSON;
- whether `candidate_objects` is empty or not;
- exact names of any visible candidate columns among:
  - `CDPRODUTO`
  - `CDPROINTE`
  - `CDARVPROD`
  - `CDPRODESTO`
- confirmation that `operational_rows_read = 0`;
- confirmation that every effect flag remained `false`.

## Stop condition

After returning the evidence, STOP.

Do not read product rows yet, even if a candidate crosswalk surface is found. The next step must be designed from the metadata result first.
