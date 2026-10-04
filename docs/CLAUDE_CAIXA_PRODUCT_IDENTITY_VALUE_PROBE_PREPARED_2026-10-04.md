# CLAUDE / CAIXA — Product identity value probe — PREPARED / NOT AUTHORIZED — 2026-10-04

## Status

`PREPARED_NOT_AUTHORIZED`

Do not execute this value probe until César gives an explicit authorization for this exact bounded product-row read.

The metadata-only gate is already PROVEN. This next gate crosses from metadata into reading real rows from `TEKNISA.PRODUTO`.

## Proven input

Metadata probe v3 proved on the real CAIXA:

- `TEKNISA.PRODUTO.CDPRODUTO` exists;
- `CDPRODINTE` exists;
- `CDARVPROD` exists;
- `CDPRODESTO` exists;
- `CDPROINTE` does not exist locally;
- no product/order row was read in that gate.

Already-proven real order evidence contains exactly these two internal product IDs:

- `0000001459`
- `0000001641`

Candidate Retail codes from the prior zero-effect replay are:

- `0000001459` -> candidate compact Retail code `9150003000` / canonical `9.15.00.030.00`;
- `0000001641` -> candidate compact Retail code `9600001000` / canonical `9.60.00.010.00`.

These remain candidates until this gate or later evidence proves the mapping.

## Purpose

Read only the three candidate identity values for the two already-known product IDs and determine whether one field yields a deterministic exact crosswalk to the two candidate Retail codes.

No name matching is used in this gate.

## Scope

Allowed only after explicit human authorization:

- existing Windows Integrated Authentication;
- identity check via `SUSER_SNAME()`, `USER_NAME()`, `DB_NAME()`;
- one bounded query against `TEKNISA.PRODUTO`;
- only two fixed `CDPRODUTO` targets;
- only four returned columns:
  - `CDPRODUTO`
  - `CDPRODINTE`
  - `CDARVPROD`
  - `CDPRODESTO`
- maximum two valid target rows; the query uses `TOP (3)` only to detect a violated uniqueness/bound assumption.

Forbidden:

- any other product ID;
- `NMPRODUTO`;
- order tables;
- joins;
- customer data;
- observations;
- INSERT/UPDATE/DELETE/MERGE;
- permission changes;
- service changes;
- administrative apply;
- Odhen write;
- print/spooler;
- F7;
- NFC-e/SEFAZ/fiscal;
- cutover.

## Files

Probe:
`tools/tata_reader_product_identity_value_probe_REVIEW_ONLY.ps1`

Static guard:
`tools/verificar_tata_reader_product_identity_value_probe_review_static_v1.ps1`

## Required proof before any future execution

1. both files must come from the same current branch HEAD;
2. local SHA-256 values must match the pins added to the authorized execution handoff after César approval;
3. the static guard must return:
   `TATA_READER_PRODUCT_IDENTITY_VALUE_PROBE_REVIEW_STATIC_PASS`
4. static guard exit code must be 0;
5. only then may the value probe run.

## Expected result

Return raw values only. Do not infer or rewrite them on the CAIXA.

Required output:

- HEAD;
- file hashes;
- guard complete output + exit code;
- probe complete JSON + exit code;
- identity;
- exact raw values for each returned field;
- `rows_read`;
- effect flags.

## Stop condition

After returning raw values, STOP.

Do not promote any field to canonical identity on the CAIXA. The comparison and promotion decision happen outside the CAIXA after evidence review.
