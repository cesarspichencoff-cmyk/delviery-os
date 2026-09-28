# Tally Gate E — real live serialization proof — 2026-09-28

## Scope

This receipt records the first real post-cutover evidence from production Tally form `ZjVv1a` and the live `Caixa Executivo` Google Sheet.

No synthetic production occurrence was created for this proof.

No live webhook was wired by this receipt.

## First real post-cutover adoption

Read-only inspection of `ocorrencias_respostas` found real post-cutover rows:

- `WJBAekL` — submitted 2026-09-27 20:33:32 by Ana Clara, subtype `Outro`;
- `7XzDNDR` — submitted 2026-09-28 00:40:09 by Cesar, subtype `Item errado`;
- `kb1AWpd` — submitted 2026-09-28 01:36:56 by Cesar, subtype `Outro`;
- `YjvOY6B` — submitted 2026-09-28 01:38:27 by Cesar, subtype `Outro`;
- `la1A7Vk` — submitted 2026-09-28 01:42:02 by César, subtype `Outro`.

The Ana Clara row proves real-team adoption independently of César's own later submissions.

## Exact live 20-column header

The current production header is exactly:

1. `Submission ID`
2. `Respondent ID`
3. `Submitted at`
4. `Operador`
5. `Data`
6. `Turno`
7. `Tipo de Ocorrência`
8. `Subtipo operacional`
9. `Pedido / Mesa / Referência`
10. `O que aconteceu?\n`
11. `Ação Tomada?`
12. `Status`
13. `Verificações - Item faltando [Item identificado antes de seguir]`
14. `Verificações - Item faltando [Todos os volumes reunidos]`
15. `Verificações - Item faltando [Conferência física após impressão/ajuste]`
16. `Verificações - Item faltando [Conferência final antes da saída]`
17. `Verificações - Item errado [Produto e quantidade conferiam]`
18. `Verificações - Item errado [Observações do cliente conferidas]`
19. `Verificações - Item errado [Correção manual conferida fisicamente quando aplicável]`
20. `Verificações - Item errado [Conferência final antes da saída]`

This is the actual live serialization order.

It differs from the isolated shadow-sheet pilot order, where the conditional barrier columns were observed before the legacy reference/happened/action/status fields.

That difference is now a proven environment fact and must not be normalized away.

## Conditional live serialization

Real row `7XzDNDR` is subtype `Item errado`.

Observed serialization:
- item-missing columns M:P: empty;
- wrong-item columns Q:T: `Sim | Sim | Sim | Sim`.

Real `Outro` rows leave all eight conditional barrier columns empty.

Therefore live conditional exclusivity is observed for:
- `Item errado`;
- `Outro`.

A real post-cutover `Item faltando` row has not yet been observed in production and is not claimed by this receipt.

## Legacy workbook health

The live workbook did not break when the new columns appeared.

### Configuracao remap

`Configuracao!D:E` currently maps legacy occurrence fields to:

- Operador -> column 4;
- Data -> 5;
- Turno -> 6;
- Tipo de Ocorrência -> 7;
- Pedido / Mesa / Referência -> 9;
- O que aconteceu? -> 10;
- Ação Tomada? -> 11;
- Status -> 12.

This correctly accounts for `Subtipo operacional` at column 8.

### analise_ocorrencias

`analise_ocorrencias` uses `Configuracao!E4:E11` as dynamic column indexes into `ocorrencias_respostas`.

Its live tail correctly projects the new rows while preserving the legacy eight-field analysis surface.

For example:
- `7XzDNDR` projects operator Cesar, business date 2026-09-27, shift Noite, category Problema no Delivery, reference 7391, happened text, action Reembolsado and status Concluído.
- the later `Outro` rows are also present with their expected legacy fields.

### Formula error scan

Read-only scans across:
- `analise_ocorrencias!A1:Z1000`;
- `painel!A1:Z1000`;
- `Configuracao!A1:Z1000`;
- `auditoria_sync!A1:Z1000`;

found zero matches for:
- `#REF!`;
- `#VALUE!`;
- `#N/A`;
- `#ERROR!`.

## Gate E conclusion

PROVEN:
- first real post-cutover production occurrence exists;
- real-team post-cutover adoption exists;
- exact live 20-column schema is observed;
- real `Item errado` barrier serialization is correct and conditionally exclusive;
- real `Outro` serialization leaves barrier matrices empty;
- legacy workbook mapping remains healthy;
- dependent legacy analysis/panel/configuration/audit surfaces show no scanned formula-error tokens.

NOT PROVEN / NOT CLAIMED:
- real production `Item faltando` conditional row;
- live signed Tally webhook delivery;
- idempotent live webhook persistence;
- portable-kernel ingestion of a real production minimized envelope;
- barrier compliance, barrier failure, cause, guilt or action effectiveness.

## Effect boundary

Gate E's read-only evidence condition is now satisfied.

The next production mutation is wiring the signed observation-only webhook for live form `ZjVv1a`.

That action remains deliberately unperformed here because the cutover plan requires explicit near-action authorization before changing the live webhook configuration.
