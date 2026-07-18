# Limiares — Atraso, desvio, pressão, risco, oscilação, falha

## Distinções obrigatórias
| Conceito | Definição |
|---|---|
| Atraso do pedido | vs horário **prometido** (fato) |
| Desvio da etapa | vs baseline de contexto semelhante |
| Pressão | aumento **persistente** de fila/tempo/dependência |
| Risco futuro | projeção ainda não confirmada |
| Oscilação | mudança curta < persistência mínima |
| Falha técnica | dado ausente/inconsistente/stale |

## Configurável
`src/copiloto/config.js` → `DEFAULT_THRESHOLDS`
`src/copiloto/thresholds.js` → `classifyPressure`

## Por área (iniciais)

Cada área define: normal / atenção / pressão / crítico (fila e minutos), persistência mínima, recuperação, confiança mínima.

**Regra de ouro:** confiança baixa **não reduz** gravidade; só marca `confidence_sufficient=false` e pode mudar o nível de interrupção (silêncio).

## Alinhamento com motor legado
- FLOORS: DEBOUNCE 3, COOLDOWN 45, MAXFOCUS 8, EXPED 30, PROD 45, STALE 120
- TEMPO_PRACA / BASELINE em `motor.js` são **provisórios** — o Copiloto versiona limiares próprios configuráveis sem editar `motor.js`.
