# Cobertura Multiperíodo iFood — L2C

> Fuso: **America/Sao_Paulo** · `operational_day_key = local_date` · fluxo normal `hora < 23`  
> UNION por **UUID** apenas · sem interpolação de lacunas · sem PII  
> Privado: `../deliveryos-private-sources/01_WORK_COPIES/DERIVED/MULTIPERIOD_L2C/`

---

## 1. Arquivos integrados (nível pedido)

| Fonte | Papel | Prioridade de dedup |
|---|---|---:|
| L3 `pedidos_maio_jun` | Núcleo mai–jun (schema completo) | **100** |
| Relatorio Out–Mar (6×) | Meses out/25–mar/26 (schema alinhado ao L3) | **50** |
| Logistica.xlsx | Abr–jun/26 + overlap L3; timings | **30** |

**Não integrados como exposição de pedidos:** Cardápio, Qualidade agregada, Vendas resumo, Negociações (ID curto), Relatório de cancelamentos (ID curto).

### Regra de precedência (mesmo UUID)

1. Maior `priority` vence.  
2. Métricas nulas no vencedor podem ser preenchidas pelo perdedor.  
3. Divergências de status/data/hora/cancel/delay são **registradas** (não silenciosas).  
4. **Nunca** somar arquivos crus.

---

## 2. Totais de união

| Métrica | Valor |
|---|---:|
| Linhas OK somadas (bruto multi-fonte) | **78.350** |
| **Pedidos únicos (UUID)** | **70.071** |
| Overlap L3 ∩ Logistica | **8.279** eventos de colisão |
| Divergências de campo registradas | **8.171** (amostra em privado) |
| Pedidos sem UUID utilizável | 0 nos packs full |

---

## 3. Meses com exposição

| Mês | Dias c/ pedidos | Completos | Parciais | Ausentes (calendário) | Pedidos únicos no mês* |
|---|---:|---:|---:|---:|---:|
| 2025-10 | 31 | 31 | 0 | 0 | 7.188 |
| 2025-11 | 30 | 30 | 0 | 0 | 7.974 |
| 2025-12 | 28 | 27 | 1 | 3 | 7.273 |
| 2026-01 | 30 | 30 | 0 | 1 | 7.432 |
| 2026-02 | 28 | 28 | 0 | 0 | 7.412 |
| 2026-03 | 31 | 31 | 0 | 0 | 7.861 |
| 2026-04 | 28 | 28 | 0 | 2 | 7.684 |
| 2026-05 | 31 | 31 | 0 | 0 | 8.957 |
| 2026-06 | 30 | 30 | 0 | 0 | 8.290 |

\*Contagem pós-dedup no mês civil (Logistica preenche abr e amplia mai–jun além do recorte L3 estrito).

**Totais de dias:** 267 com pedidos · **266 completos** · **1 parcial** · 0 suspeitos.

---

## 4. Lacunas e blocos independentes

| Intervalo | Status | Ação |
|---|---|---|
| Out/25 – Mar/26 | Contínuo por relatórios mensais | Bloco mensal independente |
| Início abr/26 (antes ~03/04) | Ausente / Logistica começa 03/04 | **Não interpolar** |
| Mar → Mai | Contíguo via Logistica em abr | Ainda assim **não** tratar como série única sem checar schema |
| Mai 01–26 vs L3 27– | L3 só a partir de 27/05; Logistica cobre mês | Comparar com tag de fonte |
| Após 25/06 no L3 | L3 encerra; Logistica pode ir até 30/06 | Separar recorte L2B (27/05–25/06) |

**Não há série contínua “oficial” única.** Baselines são por **bloco**.

---

## 5. Hora 17 e após 23:00

| Check | Resultado |
|---|---|
| Pedidos na hora 17 | **0 em todos os 9 meses** |
| Interpretação | Exposição zero **esperada e estável** multiperíodo |
| Após 23:00 | Separados do fluxo normal (não reincorporar) |

---

## 6. Classificação de dia

| Status | Critério (resumo) |
|---|---|
| completo | core hours 11–14 e 18–22 presentes; volume não residual |
| parcialmente coberto | core incompleto ou volume muito baixo |
| suspeito | quase sem core hours |
| sem exposição / ausente | sem pedidos no calendário |

Dias parciais **não** entram em médias como se fossem completos.

---

## 7. Campos por família

| Família | Cancel | Atraso-flag | Preparo | Pronto | Espera loja | Canal |
|---|---|---|---|---|---|---|
| pedido_full (L3 + mensais) | sim | sim | sim | sim | sim | sim |
| logistica | sim | sim | sim | sim | sim | não (sempre) |

Quando um mês depende só de Logistica, canal pode ficar **indisponível** — marcar, não inventar.

---

*Cobertura L2C · base para baseline nativo e cruzamento multiperíodo.*
