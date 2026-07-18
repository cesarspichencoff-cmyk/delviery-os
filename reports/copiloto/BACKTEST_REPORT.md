# Relatório de Backtest — Previsão Copiloto

## Método

- Walk-forward: em cada instante t, o modelo só vê `series[0..t]`
- Horizontes: 10, 15, 30 minutos
- Modelo default: ensemble (baseline contextual + EMA + tendência linear)
- Sem vazamento de futuro

## Fonte da série

**synthetic_calibrated** — gerada a partir de padrões documentados (jantar dominante, volumes por faixa horária).  
**Não** é replay dos ~70k pedidos brutos (arquivos ausentes neste worktree).

Arquivo máquina: `reports/copiloto/BACKTEST_REPORT.json`

## Resultados de referência (seed 11, filas Conferência 18h–21h)

| Horizonte | N | MAE (fila) | p90 abs error |
|---|---:|---:|---:|
| 10 min | (ver JSON) | ~1.2 | (ver JSON) |
| 15 min | | ~1.3 | |
| 30 min | | ~1.8 | |

## O que conseguimos prever

- Tendência de acúmulo/alívio de **fila por área** em 10–15 min com erro baixo em série sintética suave
- Direção (sobe/desce/estável) com boa utilidade operacional

## O que prever com cautela

- 30 minutos (MAE maior; sensível a choques)
- Pedidos individuais em risco (heurística, não classificador calibrado)
- Motoboy sem sinal de disponibilidade

## O que ainda não conseguimos prever bem

- Pronto-por-praça real (sem eventos de bancada)
- ETA de entrega porta a porta
- Efeito causal de cada ação humana sem fechamento/memória preenchidos
- Caixa

## Dados que aumentariam qualidade

1. Exports multi-mês montados no worktree (com política de dados)
2. Composição item-por-pedido contínua
3. Eventos de conferência/saída com timestamps próprios
4. Sinal de motoboy disponível
5. Registro de ações humanas no fechamento

## Calibração / FP / FN

Em série sintética não há “alerta operacional” rotulado → FP/FN de Foco devem ser medidos em **modo sombra** sobre turnos reais (nível 1–2), não inventados aqui.
