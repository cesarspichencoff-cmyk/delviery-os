# CLAUDE / CAIXA — Product identity value probe — AUTHORIZED — 2026-10-04

## Status

`HUMAN_AUTHORIZED_BOUNDED_READ`

César explicitly authorized this exact bounded read:

> Autorizo a leitura limitada das duas linhas de produto e somente dos quatro campos preparados no gate.

Authorization artifact:

`data/tata_reader_product_identity_value_probe_authorization_v1.json`

Authorization ID:

`CESAR-2026-10-04-TATA-READER-PRODUCT-IDENTITY-VALUE-PROBE-V1`

Minimum commit containing the authorization:

`05fd88a4c6e9d6786ec6c745cc7a6682b0b3cfff`

## Mission

Read only the three candidate identity values for the two already-known internal product IDs in `TEKNISA.PRODUTO`, preserving the internal id itself.

This gate exists only to determine whether one of the local candidate fields yields a deterministic crosswalk to the already-known Retail candidates.

Do not perform the identity conclusion or promotion on the CAIXA. Return raw values only.

## Canonical project source

Repository:
`cesarspichencoff-cmyk/delviery-os`

Branch:
`fix/odhen-routing-config-proof-20260930`

Before execution:

1. obtain the current remote branch snapshot using the existing read-only mechanism;
2. record current remote HEAD;
3. confirm commit `05fd88a4c6e9d6786ec6c745cc7a6682b0b3cfff` is an ancestor of the current HEAD;
4. obtain the authorization file, probe and guard from that same current HEAD;
5. confirm the authorization file has:
   - `human_authorized=true`;
   - authorization id exactly `CESAR-2026-10-04-TATA-READER-PRODUCT-IDENTITY-VALUE-PROBE-V1`;
   - exactly the two product IDs and four columns below;
6. calculate local SHA-256 for probe and guard;
7. compare to the pins below;
8. if any check differs, STOP without execution.

No Git installation is required.

## Authorized files and pins

Probe:

`tools/tata_reader_product_identity_value_probe_REVIEW_ONLY.ps1`

Expected SHA-256:

`6FC66839348C3839C9E441A89999F033E79F44112E162B326A565B39787F7BA8`

Static guard:

`tools/verificar_tata_reader_product_identity_value_probe_review_static_v1.ps1`

Expected SHA-256:

`2CC17B1EB9E7EF9663A3C3238EF21089C35610A0A8027B0F26B08C32EEEEED7C`

Authorization:

`data/tata_reader_product_identity_value_probe_authorization_v1.json`

## Exact authorized data scope

Product IDs only:

- `0000001459`
- `0000001641`

Returned columns only:

- `CDPRODUTO`
- `CDPRODINTE`
- `CDARVPROD`
- `CDPRODESTO`

Maximum valid target rows:

`2`

The query contains `TOP (3)` only as a defensive bound check. If a third row somehow appears, the probe must fail with `ROW_BOUND_EXCEEDED`.

## Prohibited scope

Do not read:

- any other product ID;
- `NMPRODUTO`;
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

Do not expand or repair ad hoc if the probe fails.

## Execution

First run the local static guard:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\verificar_tata_reader_product_identity_value_probe_review_static_v1.ps1
```

Required result:

`TATA_READER_PRODUCT_IDENTITY_VALUE_PROBE_REVIEW_STATIC_PASS`

Required exit code:

`0`

Only after every authorization/hash check and guard PASS, execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\tata_reader_product_identity_value_probe_REVIEW_ONLY.ps1
```

## Expected effect boundary

If one or both authorized rows are successfully read:

- `product_row_read=true` is EXPECTED and AUTHORIZED;
- `order_row_read=false`;
- `database_write=false`;
- `permission_change=false`;
- `odhen_write=false`;
- `print=false`;
- `spooler_write=false`;
- `fiscal_action=false`;
- `sefaz_call=false`;
- `cutover=false`.

Do not incorrectly report the run as zero-effect merely because it is read-only. The bounded product-row read itself is the authorized observation.

## Required output

Return without summarizing away raw values:

- remote HEAD;
- confirmation minimum authorization commit is ancestor;
- authorization id and `human_authorized` value;
- local SHA-256 of probe and guard;
- guard complete output and exit code;
- probe complete JSON and exit code;
- SQL identity;
- exact raw values for every returned:
  - `CDPRODUTO`;
  - `CDPRODINTE`;
  - `CDARVPROD`;
  - `CDPRODESTO`;
- `rows_read`;
- every effect flag.

## Stop condition

After returning the raw evidence, STOP.

Do not normalize, strip punctuation, infer Retail identity, modify routing, print, run F7, or touch fiscal flow. The crosswalk comparison and any canonical promotion decision happen outside the CAIXA after evidence review.
