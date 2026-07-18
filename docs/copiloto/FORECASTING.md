# Previsão 10 / 15 / 30 minutos

## O que prevê
- Fila por área
- Tempo esperado (dwell)
- Pedidos em risco de prazo
- Acúmulo Conferência / pressão Sushi-Quentes
- Espera de motoboys (quando sinal existe)
- Efeito de área a montante (upstream_pressure)
- Necessidade de apoio (heurística de risco)

## Modelos avaliados (preferência: simples + interpretável)
1. Baseline histórico contextual
2. EMA (suavização exponencial)
3. Tendência linear local
4. Ensemble 40% baseline + 35% EMA + 25% linear (**default**)

Não escolhido por padrão: gradient boosting / redes — custo, dados e manutenção não justificam no estágio atual.

## Contrato de saída
Ver `schemas/copiloto/forecast.schema.json`:
conclusão, horizonte, valor/faixa, confiança, fatores, dados ausentes, condições de mudança, epistemic=inference.

## Backtest
Walk-forward sem vazamento (`forecast.backtest`).
Relatório: `reports/copiloto/BACKTEST_REPORT.json` (série sintética calibrada).

### Resultado sintético de referência (seed 11, jantar Conferência)
| Horizonte | MAE (fila) |
|---|---|
| 10 min | ~1.2 |
| 15 min | ~1.3 |
| 30 min | ~1.8 |

**Interpretação:** útil para tendência de acúmulo; **não** é precisão de pedido individual.
Quando brutos reais entrarem, recalibrar e republicar MAE/calibração/FP/FN.
