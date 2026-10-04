# CLAUDE / CAIXA — CDARVPROD catalog audit — AUTHORIZED — 2026-10-04

## Status

`HUMAN_AUTHORIZED_BOUNDED_AGGREGATE_READ`

César explicitly authorized this exact read:

> Autorizo a auditoria somente leitura dos valores agregados e distintos de CDARVPROD, sem CDPRODUTO, nomes, pedidos ou qualquer escrita.

Authorization artifact:

`data/tata_reader_cdarvprod_catalog_audit_authorization_v1.json`

Authorization ID:

`CESAR-2026-10-04-TATA-READER-CDARVPROD-CATALOG-AUDIT-V1`

Minimum commit containing the authorization:

`cfdd03f905ccca5bf7730128bf9bc6230e6aa80e`

## Mission

Measure the catalog-wide generalization boundary of `TEKNISA.PRODUTO.CDARVPROD` with the least additional data exposure.

This gate does not map individual internal product IDs. It reads only aggregate statistics and distinct nonblank `CDARVPROD` values with occurrence counts.

The comparison against the current 463-code Retail routing snapshot happens outside the CAIXA after the raw evidence is returned.

## Canonical project source

Repository:
`cesarspichencoff-cmyk/delviery-os`

Branch:
`fix/odhen-routing-config-proof-20260930`

Before execution:

1. obtain the current remote branch snapshot using the existing read-only mechanism;
2. record current remote HEAD;
3. confirm commit `cfdd03f905ccca5bf7730128bf9bc6230e6aa80e` is an ancestor of the current HEAD;
4. obtain authorization file, probe and guard from that same current HEAD;
5. confirm the authorization file has:
   - `human_authorized=true`;
   - authorization id exactly `CESAR-2026-10-04-TATA-READER-CDARVPROD-CATALOG-AUDIT-V1`;
   - `CDPRODUTO=false`;
   - `NMPRODUTO=false`;
   - `order_tables=false`;
   - `joins=false`;
6. calculate local SHA-256 of probe and guard;
7. compare to the pins below;
8. if any condition differs, STOP without execution.

No Git installation is required.

## Authorized files and pins

Probe:

`tools/tata_reader_cdarvprod_catalog_audit_REVIEW_ONLY.ps1`

Expected SHA-256:

`2B7E7ED42DBEF3A02FCE0E45088246FA60656B7F43A6CC5743406FE10D2F2543`

Static guard:

`tools/verificar_tata_reader_cdarvprod_catalog_audit_review_static_v1.ps1`

Expected SHA-256:

`80A2476FBB2417AA5EC748B96E3F9EEF3E93B1B52F21D53EC7994F4D0835FB73`

Authorization:

`data/tata_reader_cdarvprod_catalog_audit_authorization_v1.json`

## Exact authorized read scope

Source table:

`TEKNISA.PRODUTO`

Source data column:

`CDARVPROD`

Allowed summary outputs:

- `total_product_rows`;
- `null_or_blank_cdarvprod_rows`;
- `nonblank_cdarvprod_rows`;
- `distinct_nonblank_cdarvprod`.

Allowed distinct-value outputs:

- trimmed `CDARVPROD`;
- count of product rows carrying that exact value.

Defensive distinct-value bound:

`2000`

The query requests `TOP (2001)` only to fail closed if the planned bound is exceeded.

## Explicitly prohibited

Do not read or return:

- `CDPRODUTO`;
- `NMPRODUTO`;
- any other product-identifying column;
- any order table;
- customer data;
- observations.

Do not perform:

- JOIN;
- INSERT/UPDATE/DELETE/MERGE;
- GRANT/REVOKE/DENY;
- login/user/role changes;
- service changes;
- administrative apply;
- Odhen writes;
- print/spooler;
- F7;
- NFC-e;
- SEFAZ;
- fiscal action;
- cutover.

Do not expand, repair or modify the probe ad hoc if it fails.

## Execution

First run the static guard:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\verificar_tata_reader_cdarvprod_catalog_audit_review_static_v1.ps1
```

Required output:

`TATA_READER_CDARVPROD_CATALOG_AUDIT_REVIEW_STATIC_PASS`

Required exit code:

`0`

Only after authorization, lineage, hashes and guard all pass, execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\tata_reader_cdarvprod_catalog_audit_REVIEW_ONLY.ps1
```

## Expected effect boundary

If the aggregate audit succeeds:

- `product_catalog_aggregate_read=true` is EXPECTED and AUTHORIZED;
- `product_identity_row_read=false`;
- `order_row_read=false`;
- `database_write=false`;
- `permission_change=false`;
- `odhen_write=false`;
- `print=false`;
- `spooler_write=false`;
- `fiscal_action=false`;
- `sefaz_call=false`;
- `cutover=false`.

## Required output

Return all raw evidence without omitting values:

- remote HEAD;
- confirmation that minimum authorization commit is ancestor;
- authorization id and `human_authorized`;
- local SHA-256 of probe and guard;
- complete guard output + exit code;
- complete probe JSON + exit code;
- SQL identity;
- full summary object;
- full distinct `CDARVPROD` value list with `product_rows`;
- `distinct_values_returned`;
- every effect flag.

## Stop condition

After returning the raw aggregate evidence, STOP.

Do not compare to routing codes on the CAIXA, do not infer global identity authority, do not modify routing, and do not print or touch fiscal flow.
