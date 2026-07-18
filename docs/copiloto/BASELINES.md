# Baselines — Copiloto Delivery

## Método
- Mediana, p25/p75 (intervalo normal), p90/p95, IQR, dispersão (CV)
- Cortes: área × dia da semana × faixa horária (11-13, 14-16, 17-19, 20-23)
- **Não** usar média simples como única referência
- **Não** um número único para o restaurante inteiro

## Implementação
`src/copiloto/baselines.js`
- `generateSyntheticHistory` — série calibrada a padrões documentados (jantar ~72%)
- `buildBaselines` / `lookupBaseline` / `stageDeviation`

## Status da fonte
| Tipo | Status |
|---|---|
| synthetic_calibrated | **Usado neste pacote** (brutos ausentes no worktree) |
| historical_from_exports | Documentado; reprocessar quando brutos forem montados no worktree |

## Referências por área (ordem de grandeza — provisórias)

| Área | Fila normal (mediana jantar) | Tempo típico (min) |
|---|---|---|
| Sushi | ~6–10 | ~14–18 |
| Quentes | ~3–6 | ~12–16 |
| Cozinha | ~2–4 | ~12–15 |
| Conferência | ~2–5 | ~8–12 |
| Motoboy | ~1–4 | ~15–22 |
| Caixa | n/d | n/d |

Valores exatos: rodar `buildBaselines(generateSyntheticHistory())` ou recalcular com exports reais.

## Capacidade observada
- Volume jantar fim de semana > dia útil (padrão docs + sintético)
- Capacidade = percentis de volume processado sem pressão crítica sustentada — **não** “capacidade teórica de cardápio”
