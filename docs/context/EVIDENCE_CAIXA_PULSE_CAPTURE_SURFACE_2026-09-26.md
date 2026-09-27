# Evidence — Caixa Pulse Capture Surface + Shadow Barrier Contract — 2026-09-26

## Objective

Locate the real capture surface behind the production Caixa Pulse source and
design the smallest evidence capture that can reduce expected-barrier UNKNOWN
without changing the live operational form.

No live Tally form or Google Sheet was modified in this work.

## Real capture surface

Read-only Google Drive / Sheets inspection identified the operational workbook:

- title: `Caixa Executivo`;
- native Google Sheet;
- source tabs include `pulse_respostas` and `ocorrencias_respostas`;
- guide text explicitly says those tabs are connected to Tally forms named
  `Caixa Pulse | Registro de Turno` and
  `Caixa Pulse | Ocorrência de Turno`.

The occurrence response surface currently contains these source fields:
- Submission ID;
- Respondent ID;
- Submitted at;
- Operador;
- Data;
- Turno;
- Tipo de Ocorrência;
- Pedido / Mesa / Referência;
- O que aconteceu?;
- Ação Tomada?;
- Status.

The existing taxonomy must be preserved in the first pilot because it already
feeds the executive panel and the canonical mail/source parser.

## Existing sync debt

The configuration/audit surface currently marks `O que aconteceu?` as
`FALTANDO`.

The observed Tally response header actually contains a trailing newline:

`O que aconteceu?\n`

Therefore the current mapping failure is a title-normalization issue, not proof
that response data is absent. This is a separate live-sheet repair gate and was
not modified here.

## Tally capability grounding

Current official Tally documentation states that:
- conditional logic can show/hide blocks and make answers required;
- conditional logic is available on the free plan;
- matrix questions support common response options across multiple rows;
- matrix rows or columns can be shown/hidden conditionally;
- Google Sheets integration is available for free and adds one row per
  submission.

The exact Google Sheets encoding of the proposed matrix has not been proven on
the live Caixa Pulse form. Therefore the kernel contract is independent of the
physical Tally storage shape.

Public search and connected Gmail/Drive did not reveal the private Tally form
IDs. No paid browser automation was used.

## Shadow capture contract

New module:
`src/contextKernel/barrierCaptureContract.ts`

The existing `Tipo de Ocorrência` is preserved.

A new one-click operational subtype is proposed:
- `ITEM_MISSING`;
- `WRONG_ITEM`;
- `OTHER`.

Only the first two show barrier questions.
### ITEM_MISSING

Four expected checks:
1. item identified before advancing;
2. complete order volumes reunited;
3. physical post-print/adjustment check;
4. final divergence conference before dispatch.

### WRONG_ITEM

Four expected checks:
1. exact product and quantity match;
2. customer observation check;
3. physical check after manual correction when applicable;
4. final divergence conference before dispatch.

### OTHER

No barrier matrix is shown.

Answer semantics:
- `REPORTED_DONE`;
- `REPORTED_NOT_DONE`;
- `UNABLE_TO_CONFIRM`;
- `REPORTED_NOT_APPLICABLE`.

All four are operator self-report evidence. None is independent proof.
Invariants:
- operator-reported done != compliance proven;
- operator-reported not done != barrier failure proven;
- unable to confirm remains UNKNOWN;
- missing required answers fail closed;
- guilt and cause remain unproven;
- attention authority remains NONE;
- external effects remain unauthorized.

## Historical shadow estimate

Using the current 69 canonical Caixa Pulse occurrences:
- rule-inferred OMISSION: 22;
- rule-inferred WRONG_ITEM: 8;
- historically mapped episodes: 30/69;
- matrix-triggered episodes in the shadow estimate: 30;
- matrix row selections: 120;
- one subtype selection per occurrence: 69;
- total incremental selections: 189;
- average: 2.739 selections per occurrence.

This is a retrospective burden estimate only.
Future operator-selected subtype can differ from the current rule-inferred
historical mechanism.

## Effect boundary

The live Tally form is an operational production surface.

Before changing it, the remaining proof gate is:
1. obtain the exact Tally form/editor identity;
2. verify how a matrix is serialized into the connected Sheet;
3. test the conditional path in a shadow/copy or controlled test submission;
4. verify the existing panel, mail bridge and canonical source remain
   compatible;
5. only then consider a live form edit.

Until that gate passes:

`CAPTURE_CONTRACT = CODE_READY_SHADOW, NOT_DEPLOYED`
