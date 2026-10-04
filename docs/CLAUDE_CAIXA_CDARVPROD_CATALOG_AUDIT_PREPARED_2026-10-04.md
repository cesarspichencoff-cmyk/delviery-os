# CLAUDE / CAIXA — CDARVPROD catalog audit — PREPARED / NOT AUTHORIZED — 2026-10-04

## Status

`PREPARED_NOT_AUTHORIZED`

Do not execute this catalog audit until César explicitly authorizes this broader aggregate product-catalog read.

## Why this gate exists

The exact local read already proved for two observed products:

- `0000001459 -> CDARVPROD 9150003000`;
- `0000001641 -> CDARVPROD 9600001000`.

Those values exactly match the prior compact Retail routing candidates for the same products.

That closes the identity bridge for the two observed products but does not prove that `CDARVPROD` can be used as a global catalog-wide runtime identity field.

## Purpose

Measure the generalization boundary of `TEKNISA.PRODUTO.CDARVPROD` with the least additional data exposure.

This probe does **not** return:

- `CDPRODUTO`;
- product names;
- order data;
- customer data.

It returns only:

1. aggregate counts for `CDARVPROD`;
2. each distinct nonblank `CDARVPROD` value and the number of product rows carrying that value.

The result will be compared outside the CAIXA against the current 463-code Retail routing snapshot.

## Exact planned scope

Read-only aggregate access to `TEKNISA.PRODUTO.CDARVPROD` only.

Returned summary:

- total product row count;
- null/blank `CDARVPROD` row count;
- nonblank `CDARVPROD` row count;
- distinct nonblank `CDARVPROD` count.

Returned value list:

- distinct trimmed `CDARVPROD`;
- count of product rows for each value.

Defensive maximum:

- at most 2000 distinct values;
- query requests TOP (2001) so an exceeded bound fails closed.

## Explicitly forbidden

- `CDPRODUTO`;
- `NMPRODUTO`;
- any order table;
- JOIN;
- row-level product identity mapping;
- customer data;
- observations;
- database writes;
- permission changes;
- service changes;
- administrative apply;
- Odhen write;
- printing/spooler;
- F7;
- NFC-e/SEFAZ/fiscal;
- cutover.

## Prepared files

Probe:

`tools/tata_reader_cdarvprod_catalog_audit_REVIEW_ONLY.ps1`

Guard:

`tools/verificar_tata_reader_cdarvprod_catalog_audit_review_static_v1.ps1`

## Execution state

Not authorized.

Do not run either against the CAIXA as an execution gate until a separate authorization artifact is created after César approval.
