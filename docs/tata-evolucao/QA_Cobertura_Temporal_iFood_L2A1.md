# QA de Cobertura Temporal iFood — L2A.1

> Investigação da hora 17, registros após 23:00 e cobertura diária do pack L3.  
> Fuso: **America/Sao_Paulo**. `operational_day_key = local_date`.

**Privado:** `DERIVED/IFOOD_L2A1/qa/exposure_coverage.json`, `agg/coverage_daily.json`.

---

## 1. Base de exposição

| Campo | Valor |
|---|---|
| Fonte | L3 `pedidos_maio_jun` |
| Pedidos únicos | **8.305** |
| Período | **2026-05-27 → 2026-06-25** (30 dias) |
| Soma diária = total | **Sim** (coerente) |
| Datas nulas | 0 |
| Formato timestamp | `DD/MM/YYYY HH:MM:SS` (string wall-clock) |

---

## 2. Anomalia da hora 17 — **explicada**

| Pergunta | Resposta |
|---|---|
| Quantos pedidos na hora 17? | **0** em todos os 30 dias |
| Parsing / timezone? | **Não.** Horas 11–16 e 18–23 populadas de forma estável no mesmo parse |
| Coluna errada? | **Não.** `DATA E HORA DO PEDIDO` consistente |
| Perda aleatória de linhas? | **Não.** Total 8.305 íntegro; buraco **só** em 17h |
| Filtro de turno no export? | **Parcialmente correlato:** turnos rotulados são ALMOÇO (11–14), CAFÉ DA TARDE (15–16, 140 pedidos), JANTAR (18–23). **Nenhum turno mapeia 17h** |
| Interpretação | **Ausência real no export de pedidos entre o fim do café da tarde e o início do jantar** — gap operacional/comercial refletido nos timestamps, não artefato de UTC |

**Ação:** tratar hora 17 como **janela de exposição zero esperada** neste pack (não imputar pedidos; não marcar como falha de qualidade de arquivo).

Histograma (pedidos): 11:619 · 12:795 · 13:478 · 14:343 · 15:91 · 16:49 · **17:0** · 18:1570 · 19:1745 · 20:1214 · 21:795 · 22:602 · 23:4.

---

## 3. Quatro registros após 23:00

| # | local_date | hora | turno | status | agendado | prep | Classificação |
|---|---|---|---|---|---|---|---|
| 1–4 | 4 datas distintas no período | **23:00** exato | JANTAR | CONCLUIDO | NÃO | preenchido | **Pedido real na fronteira / fora da janela operacional normal** |

**Não são:**

- cancelamentos fantasma;  
- evidência de shift UTC (seriam ~20h locais se −3 aplicado em cima de UTC já local);  
- perda de schema.

**São:**

- pedidos concluídos com preparo válido;  
- minuto **00** (possível arredondamento de export **ou** pedidos exatamente na virada);  
- volume residual (4/8305 ≈ 0,05%).

**Política:** manter `after_hours_class` / `after_23`; **não** reincorporar ao fluxo normal sem evidência adicional. Excluir do denominador de “movimento normal” em taxas L2B.

---

## 4. Cobertura diária (resumo)

| Métrica | Valor |
|---|---|
| Dias cobertos | 30 |
| Pedidos/dia min – mediana – max | **116 – 262 – 431** |
| Dias com hora 17 &gt; 0 | **0** |
| Dias com core 11–14 e 18–22 | maioria completa; 15–16 parciais (café fraco) |
| Após 23h | 4 pedidos em 4 dias |

Indicadores por dia (privado `coverage_daily.json`):

- `orders`, `cancelled`, `after23`  
- `coverage_indicator`: `core_hours_present` | `core_hours_incomplete`  
- `lacuna`: inclui `hour_17_zero_expected`  
- `quality`: ok / low_volume_review / partial_hours  

---

## 5. Estabilidade de timestamps

| Check | Resultado |
|---|---|
| Formato único | string `DD/MM/YYYY HH:MM:SS` |
| Parse nulo | 0 |
| Coerência turno × hora | ALMOÇO⊂11–14; CAFÉ⊂15–16; JANTAR⊂18–23 |
| Durações (preparo/pronto/atraso) | ~99,7% preenchidas (L2A) |

---

## 6. Implicações para o denominador L2B

1. Usar agregados por `local_date` × janela 30/60 min já gerados na L2A.  
2. Hora 17: denominador **zero** (não “missing”).  
3. Após 23:00: série separada.  
4. Não afirmar “pior hora” só com volume.  
5. Composição de itens continua **ausente** → taxa /1.000 itens bloqueada.

---

*Cobertura temporal L3 fechada para uso exploratório com ressalvas documentadas.*
