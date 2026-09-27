# EVIDENCE — Production cutover partial: Caixa Executivo — 2026-09-26

## Authorization

César explicitly authorized the production cutover on 2026-09-26.

## Pre-cutover backup

A fresh native backup of the live workbook was created immediately before production edits:

- source: `Caixa Executivo`
- live spreadsheet: `1N77sVp2wgIUaIlGBN7uVvlOoImPpKB_hAXXU9IxC-gk`
- backup title: `BACKUP PRE-CUTOVER - Caixa Executivo - 2026-09-26`
- backup spreadsheet: `1A1j5AofuDKo66UAOhbhC15ciyhlsuqGBwMPZI36oFNw`

The live raw occurrence schema was still the expected 11 legacy columns before the write.

## Production changes applied

Only two independently shadow-proven workbook repairs were applied.

### 1. Exact occurrence narrative mapping

`Configuracao!E9` now matches the actual source header including its trailing newline:

`=IFERROR(MATCH("O que aconteceu?"&CHAR(10);ocorrencias_respostas!1:1;0);"")`

Post-write live verification:
- Operador → 4 / OK
- Data → 5 / OK
- Turno → 6 / OK
- Tipo de Ocorrência → 7 / OK
- Pedido / Mesa / Referência → 8 / OK
- O que aconteceu? → 9 / OK
- Ação Tomada? → 10 / OK
- Status → 11 / OK

`auditoria_sync!D33:F40` also reports 8/8 OK.

The real `analise_ocorrencias` surface now contains the historical occurrence narrative text that was previously blank.

### 2. Latest-five row alignment

`painel!F39:H43` now uses one shared raw occurrence row anchor based on `COUNTA(ocorrencias_respostas!A:A)` for Date, Operador and Turno.

Post-write live verification shows:
- rows remain aligned to the same occurrence;
- a genuinely missing Turno remains blank rather than borrowing another row's Turno;
- no other panel block was intentionally changed.

## Boundary / remaining gate

The production Tally occurrence form `ZjVv1a` has NOT been edited or published yet.

Reason: the authorized Foxxy remote computer is offline and the Opera Browser Connector currently has no connected browser session. The public Tally fetch available outside that session is insufficient for authenticated editor writes.

Therefore:
- production workbook repair: DEPLOYED + verified on live workbook;
- Tally barrier-form production delta: NOT STARTED;
- live `ZjVv1a` webhook: NOT WIRED;
- 20-column live Tally/Sheets serialization: NOT YET PROVEN;
- full production cutover: PARTIAL, not DONE.

No synthetic submission was sent to the live operational form.
