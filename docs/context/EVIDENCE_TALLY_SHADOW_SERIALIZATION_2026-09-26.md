# EVIDENCE — Tally shadow serialization — 2026-09-26

## Scope

This receipt records the isolated shadow proof for the Caixa Pulse occurrence capture flow. It does not authorize or claim a production cutover.

- live occurrence form: `ZjVv1a`
- shadow occurrence form: `eq4lae`
- workspace: `3xP0bd`
- isolated Google Sheet: `1Je2SRuugKx2FK1N39ShGwuUYWgNDO6YKEqHA1xicI-Q`
- sheet tab: `Página1`

## Shadow surface proof

Read-only public probing observed the shadow form at 57 blocks with canonical SHA-256:

`de5bd059926fb9d5b066ad760adcc7b7e7d0f545534f3186c018fb726d0d2db3`

The shadow preserves the existing occurrence taxonomy and inserts `Subtipo operacional` immediately before `Pedido / Mesa / Referência` with:

- Item faltando
- Item errado
- Outro

Dynamic public-form inspection proved:
- Item faltando exposes exactly four checks: item identified before advancing; all volumes reunited; physical check after print/adjustment; final conference before dispatch.
- Item errado exposes exactly four checks: product/quantity match; customer observations checked; manual correction physically checked when applicable; final conference before dispatch.
- Outro exposes no barrier matrix.

Each matrix exposes exactly: `Sim`, `Não`, `Não consegui confirmar`, `Não se aplica`.

These answers remain OPERATOR_SELF_REPORT evidence. They do not independently prove compliance, failure, cause, guilt, action effectiveness, or resolution.

## Google Sheets serialization proof

The isolated sheet metadata reports one visible tab, `Página1`, sheetId 0. The observed header sequence is 20 columns and preserves the legacy exact header `O que aconteceu?\n`.

Three controlled submissions are present:

1. `4ayaqYo` / operator `VERTICE_SHADOW_TEST_ITEM_FALTANDO`: only the four Item faltando columns contain the vector `Sim | Não | Não consegui confirmar | Não se aplica`; all Item errado columns are empty.
2. `yXRXRqW` / operator `VERTICE_SHADOW_TEST_ITEM_ERRADO`: only the four Item errado columns contain the same vector; all Item faltando columns are empty.
3. `QoWoajl` / operator `VERTICE_SHADOW_TEST_OUTRO`: all eight conditional matrix columns are empty.

The spreadsheet timezone is `Etc/GMT`; raw submission timestamps are preserved as source values and are not reinterpreted here.

## Live compatibility proof

Immediately after the shadow proof, the live read-only Tally probe returned PASS:
- `eqAKzJ`: 76 blocks; SHA-256 `d452aefd1687d8071e8f1776efc6147c07f846ba468a015e49720379e52dee5c`
- `ZjVv1a`: 31 blocks; SHA-256 `51f07f02436057199af4d8a9782c37945b9bc38a3f9d54db8104abff9b73d251`

Therefore the production occurrence form has no observed drift from the pinned identity while the shadow proof was executed.

## Boundary

PROVEN:
- shadow conditional routing;
- exact isolated-sheet column serialization;
- conditional exclusivity for all three subtype routes;
- preservation of the legacy trailing-newline header;
- current live form identity remains unchanged.

NOT AUTHORIZED / NOT CLAIMED:
- live Tally form modification;
- live Caixa Executivo workbook modification;
- production cutover;
- barrier compliance/failure;
- causal attribution;
- action effectiveness.

The next gate is an explicit near-action authorization before modifying the live Tally occurrence form or its live workbook integration.
