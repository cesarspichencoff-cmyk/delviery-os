---
lifecycle:
  artefato: docs/etapa-4-8/C0-BASELINE.md
  status: ACTIVE
  authority_scope: etapa_4_8_c0_baseline
  superseded_by: null
  atualizado_em: "2026-09-02"
  state_basis: 9e738b1
---

# C0 — Baseline da branch candidata

Base: `9e738b11060c4c9863d36162b45d9188adaf8091`, branch
`feature/deliveryos-test-rc-convergence-v1`, antes de qualquer alteração desta etapa.

## Resultado por área

| Área | Resultado |
|---|---|
| `build` | PASS |
| `typecheck` | PASS |
| `test:platform` (44) | PASS |
| envelopes (23) | PASS |
| deploy-audit (30) | PASS |
| R5 (242) | PASS |
| visual-produto (145) | PASS |
| Entregas — persistência | **FAIL (pré-existente)** |
| Entregas — GPS | **FAIL (pré-existente)** |
| governance — lifecycle/Q-014 | **FAIL (pré-existente)** |
| PostgreSQL | BLOCKED / NOT_RUN |
| Docker | BLOCKED / NOT_RUN |

## Notas

- As duas falhas de Entregas (persistência e GPS) e a falha de governance (lifecycle/Q-014) são
  **pré-existentes** — não foram introduzidas nesta etapa e não são causadas pelo C1. Ficam como
  piso de comparação: qualquer regressão do C1 deve aparecer como uma falha *nova*, distinta
  dessas três.
- PostgreSQL e Docker ficam BLOCKED/NOT_RUN por ausência de infraestrutura local — conforme
  CLAUDE.md §10, essas suítes se declaram **puladas em voz alta**, nunca verde silencioso.
- Este baseline é a régua de comparação do checkpoint pós-C1 (`C1-PORT.md` + relatório de
  execução). Qualquer teste novo introduzido pelo C1 (a suíte inteira de
  `tests/conversation-crm/`) não tem baseline aqui porque não existia nesta branch antes do C1 —
  seu primeiro resultado é, por definição, o baseline dela mesma.
