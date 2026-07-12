# Baseline Nativo iFood — L2C

> Métricas **somente iFood** (volume, cancelamento, atraso-flag, preparo, espera).  
> Denominadores explícitos · fluxo normal `hora < 23` · fuso America/Sao_Paulo  
> **Não** misturar com WhatsApp neste documento.

---

## 1. Blocos de baseline (independentes)

| Bloco | Recebidos* | Válidos | Cancel. | Cancel/100 rec. | Atraso-flag/100† | Dias |
|---|---:|---:|---:|---:|---:|---:|
| Out/2025 | 7.185 | 7.039 | 146 | **2,03** | **27,4** | 31 |
| Nov/2025 | 7.965 | 7.804 | 161 | **2,02** | **23,9** | 30 |
| Dez/2025 | 7.268 | 7.096 | 172 | **2,37** | **39,6** | 28 |
| Jan/2026 | 7.429 | 7.345 | 84 | **1,13** | **30,2** | 30 |
| Fev/2026 | 7.407 | 7.219 | 188 | **2,54** | **58,6** | 28 |
| Mar/2026 | 7.858 | 7.713 | 145 | **1,85** | **21,8** | 31 |
| Abr/2026 | 7.681 | 7.616 | 65 | **0,85** | **22,6** | 28 |
| Mai–Jun L2B‡ | 8.301 | 8.124 | 177 | **2,13** | **38,0** | 30 |

\*Fluxo normal.  
†Atraso-flag = minutos de atraso vs tempo **prometido** &gt; 0; não é diagnóstico de causa.  
‡Recorte **2026-05-27 → 2026-06-25** (alinhado L2B).

### Leitura de cancelamento
Faixa multiperíodo ≈ **0,9 – 2,5 / 100** recebidos.  
Abr/26 e Jan/26 no piso; Fev e Dez no teto relativo.

### Leitura de atraso-flag
Faixa ≈ **22 – 59 / 100**.  
**Fev/2026** é outlier alto (~59). Mar e Abr no piso (~22).  
Mai–Jun L2B (~38) fica no meio-alto — **não** extremo vs Fev.

---

## 2. Preparo e espera (minutos)

| Bloco | Preparo P50 | Preparo P90 | Pronto (botão) P50 | Espera loja P50 |
|---|---:|---:|---:|---:|
| Out/25 | 30,4 | 58,0 | 25,6 | 1,6 |
| Nov/25 | 33,5 | 58,8 | 28,9 | 1,9 |
| Dez/25 | 33,6 | 57,2 | 27,0 | 5,1 |
| Jan/26 | 29,7 | 49,5 | 24,3 | 4,3 |
| Fev/26 | 34,6 | 59,9 | 28,8 | 1,9 |
| Mar/26 | 26,9 | 52,0 | 23,8 | 1,6 |
| Abr/26 | 26,9 | 48,1 | 26,1 | 2,7 |
| Mai–Jun L2B | 27,0 | 47,5 | 25,9 | 2,3 |

P50 de preparo multiperíodo tipicamente **27–35 min**; P90 ~**48–60 min**.  
Espera na loja (P50) geralmente baixa (&lt;5 min), com Dez/Jan mais altos.

---

## 3. Volume por hora (união global, descritivo)

| Hora | Pedidos (approx global) | Nota |
|---:|---:|---|
| 11–14 | almoço material | |
| 15–16 | volume baixo | den. frágil p/ taxas finas |
| **17** | **0** | zero esperado |
| **18–20** | **pico** | hora 19 = maior volume |
| 21–22 | pós-pico | |
| ≥23 | separado | |

**Pico de volume e pico de atraso-flag caem na hora 19** (mesma faixa) — pressão nativa de atraso **acompanha** o pico de pedidos, não o pós-pico.

---

## 4. Dia da semana (união global, fluxo normal)

Domingo costuma liderar volume; terça no piso relativo (padrão já visto no L3).  
Cancelamento e atraso por weekday: usar sempre **por 100 pedidos do mesmo weekday**, nunca ranking absoluto de contagem.

---

## 5. Estabilidade entre meses

| Métrica | Estabilidade | Classificação |
|---|---|---|
| Forma do volume (jantar &gt; almoço &gt; tarde) | Alta | recorrente multiperíodo |
| Hora 17 = 0 | Total (9/9 meses) | recorrente |
| Cancel/100 | Moderada (0,9–2,5) | descritivo / variação sazonal |
| Atraso-flag/100 | **Instável** (22–59) | Fev outlier; não “padrão permanente” |
| Preparo P50 | Moderada (27–35) | descritivo |

---

## 6. O que o baseline **não** afirma

- Qualidade da equipe ou ranking de pessoas  
- Causa do atraso-flag (só vs prometido)  
- Que Fev “foi o pior mês da operação” sem contexto de prometido/campanha  
- Continuidade perfeita mar→mai sem gap de fonte  

---

*Baseline nativo L2C · denominadores explícitos · blocos independentes.*
