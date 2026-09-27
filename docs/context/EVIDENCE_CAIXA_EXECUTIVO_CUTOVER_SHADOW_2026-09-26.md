# EVIDENCE — Caixa Executivo cutover shadow — 2026-09-26

## Boundary

A full native copy of the live workbook was created for destructive-free cutover simulation.

- live workbook: `Caixa Executivo`
- live spreadsheet ID: `1N77sVp2wgIUaIlGBN7uVvlOoImPpKB_hAXXU9IxC-gk`
- isolated copy: `SHADOW - Caixa Executivo - Tally Cutover 2026-09-26`
- isolated spreadsheet ID: `1pqWIQ5mgMcqV7qukhvUWVp1Hs3gnbCkK9vvfJQdsJZ0`
- live workbook modified: false

The copy preserved the eight live tabs and their native sheet structure.

## Post-cutover schema simulation

In the isolated `ocorrencias_respostas` tab only, nine columns were inserted after `Tipo de Ocorrência`, producing the exact 20-header order already observed in the proven Tally shadow serialization:

1. Submission ID
2. Respondent ID
3. Submitted at
4. Operador
5. Data
6. Turno
7. Tipo de Ocorrência
8. Subtipo operacional
9–12. four Item faltando barrier columns
13–16. four Item errado barrier columns
17. Pedido / Mesa / Referência
18. O que aconteceu?\n
19. Ação Tomada?
20. Status

Existing historical rows retained their legacy values after the positional shift.

## Mapping repair

The pre-existing mapping debt was repaired only in the isolated copy:

`Configuracao!E9`

uses the exact source header with its trailing newline:

`=IFERROR(MATCH("O que aconteceu?"&CHAR(10);ocorrencias_respostas!1:1;0);"")`

After the simulated schema change, the eight legacy occurrence mappings resolved to:

- Operador → 4 / OK
- Data → 5 / OK
- Turno → 6 / OK
- Tipo de Ocorrência → 7 / OK
- Pedido / Mesa / Referência → 17 / OK
- O que aconteceu? → 18 / OK
- Ação Tomada? → 19 / OK
- Status → 20 / OK

`auditoria_sync!D33:F40` also resolved 8/8 fields to OK.

## Historical compatibility

The first 742 existing occurrence rows were compared between live `analise_ocorrencias!A:H` and the isolated post-cutover copy.

Result:
- total differences: 742
- all 742 differences are exclusively column F (`O que aconteceu?`)
- zero differences in the other seven legacy analysis columns

Therefore the simulated schema shift does not change legacy meaning. It restores the previously missing occurrence narrative text.

The panel synchronization card moved from:
- occurrence fields OK: 7 → 8
- occurrence fields missing: 1 → 0

This is the expected effect of repairing the known E9 mapping debt.

## Future-row proof

A controlled synthetic row was added only to the isolated copy at raw row 744 using the 20-column post-cutover shape.

It projected correctly to `analise_ocorrencias!A744:H744` as:
- operator: VERTICE_CUTOVER_SIM
- date: 2026-09-26
- shift: Manhã
- category: Problema no Delivery
- reference: SIM-REF
- occurrence narrative: SIMULAÇÃO SHADOW - compatibilidade pós-cutover
- action: NENHUMA AÇÃO OPERACIONAL - TESTE SHADOW
- status: Em Andamento

The panel occurrence count moved from 742 historical records to 743 including the isolated synthetic proof.

## Additional pre-existing panel defect

The existing `Últimas 5 ocorrências` formulas independently used `COUNTA` on Data, Operador and Turno.

Because `Turno` is intentionally optional in the Tally occurrence form, any historical blank shift causes that column to select a different row than Data/Operador. This can display the turno of another occurrence.

This defect predates the Tally barrier cutover.

In the isolated copy, rows `painel!F39:H43` were changed to use one common row anchor based on the raw Tally Submission ID column:

`COUNTA(ocorrencias_respostas!A:A)`

After the shadow repair:
- the controlled latest occurrence renders Date / Operador / Turno on the same row, including `Manhã`;
- a historical occurrence that genuinely lacks Turno remains blank rather than borrowing another row's Turno.

This panel repair is independently proven in the copy and should be treated as a separate minimal production patch, even if applied in the same controlled maintenance window.

## Conclusion

PROVEN in isolated copy:
- exact post-cutover 20-column raw schema;
- legacy header remapping after +9 inserted columns;
- restoration of `O que aconteceu?`;
- 8/8 occurrence synchronization audit;
- zero unintended changes across the seven unaffected legacy analysis columns for 742 historical occurrences;
- successful propagation of one new 20-column synthetic occurrence;
- pre-existing last-five Turno misalignment identified and a minimal common-anchor fix proven.

NOT AUTHORIZED / NOT CLAIMED:
- live workbook change;
- live Tally form edit/publish;
- live webhook wiring;
- real-team operational adoption.
