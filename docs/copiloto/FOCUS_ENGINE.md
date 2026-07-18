# Motor do Foco

`src/copiloto/focus-engine.js`

## Dimensões separadas
- gravidade (severity)
- urgência (urgency)
- alcance (reach)
- confiança (confidence) + assertion_strength
- capacidade de intervenção (intervenable)

## Score
Determinístico e auditável. Confiança **não** mascara gravidade alta.

## Saída
Objeto Foco vivo alinhado a `schemas/copiloto/focus.schema.json`.
Compatível com princípio DeliveryOS: um Foco, não fila de alertas.

## Integração futura com Claude
Claude **consome** o contrato; não recalcula score na UI.
Se a UI precisar de campos extras: registrar no handoff, não editar motor visual sem contrato.
