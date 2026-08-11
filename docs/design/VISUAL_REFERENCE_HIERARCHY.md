---
lifecycle:
  artefato: docs/design/VISUAL_REFERENCE_HIERARCHY.md
  status: ACTIVE
  authority_scope: visual_order
  superseded_by: null
  atualizado_em: "2026-08-07"
  state_basis: 953a3fb
---

# Hierarquia oficial de referências visuais

```text
SPRINT VISUAL DELIVERYOS V2          ← Nível 1 · AUTORIDADE PRINCIPAL
        ↓
DELIVERYOS V3.3 Organismo            ← Nível 2 · implementação validada (não substitui o Sprint)
        ↓
ENTREGAS, SELECAO, SHELL, FUTUROS    ← Nível 4 · adaptação modular da mesma linguagem
        ↓
app-v1 e demos iniciais              ← Nível 5 · historical_reference_only
```

| Nível | Fonte | Pode definir direção visual? |
|---|---|---|
| **1** | Sprint Visual DeliveryOS V2 | **SIM — prevalece sempre** |
| **2** | Organismo Operacional V3.3 | Prova de aplicação; baseline do Copiloto (não alterar nesta tarefa) |
| **3** | PRODUCT_CONSTITUTION + skill tata-product-system | Princípios de produto |
| **4** | Adaptação do módulo (ENTREGAS, SELECAO…) | Expressão operacional, com parentesco inequívoco |
| **5** | app-v1, protótipos antigos | **NÃO** — só história, regressões, funcionalidades |

## Regra de conflito

Se app-v1 **ou** qualquer demo divergir do Sprint Visual V2 → **prevalece o Sprint**.

app-v1 = `historical_reference_only`.

## Sucessão M1 — aditivo, 2026-08-11

> Nada acima foi alterado. O Sprint Visual V2 continua Nível 1 e o V3.3 continua
> Nível 2. Esta seção registra que os dois passaram a ter **descendência aprovada**,
> e nomeia qual artefato governa o quê hoje.

| Governa | Artefato | Papel |
|---|---|---|
| expressão **estática** | **De-Mechanization** (*Static North Star Closure*) | `ACTIVE` |
| expressão **temporal** | **Motion North Star** (H3 + pausa da H2) | `ACTIVE`, transcrita em `M1_MOTION_GRAMMAR.md` |
| DNA de família | **Family System Foundation V1** | `GUARDRAIL` — não define forma do Copiloto |
| geração anterior | Copiloto Signature North Star · Sculpted Operation · Form Language Convergence | `SUPERSEDED`, preservadas como evidência |

Sucessão, procedência de aprovação, comparação do V3.3 e veredito de unidade:
`docs/design/M1_CANONICAL_SUCCESSION.md`. Autorização de mudança visual:
`docs/design/M1_VISUAL_CHANGE_ENVELOPE.md`.
Guarda executável: `npm run test:platform:m1-bridge`.

## Metáforas de módulo (Nível 4)

| Módulo | Metáfora |
|---|---|
| DELIVERYOS COPILOTO | “A operação ganha consciência.” |
| ENTREGAS | “Os pedidos ganham movimento.” |

A diferença é função e expressão — **não** qualidade nem marca.
