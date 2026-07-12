# Métricas e Achados — Bloco 3 (L4)

> Classificação de conteúdo · inventário de métricas · achados agregados.  
> Recomendação no PDF **≠** prova de ocorrência atual.

---

## 1. Tipos de conteúdo encontrados

| Tipo | Presente? | Nota |
|---|---|---|
| Dado calculado (totais, contagens) | Sim | Pedidos, cancelamentos, estrelas |
| Tabela / gráfico | Sim | Muitos gráficos com pouco texto |
| Diagnóstico declarado | Parcial | “Conclusão” de estrelas pós-moderação |
| Hipótese / opinião | Raro no texto extraído | |
| Recomendação operacional | **Não** estruturada como plano de ação | |
| Regra | Não | |
| Ocorrência / caso | Sim | Listas “faltou X”, cancelamentos |
| Decisão | Não | |
| Conclusão sem evidência | Sim | Slides de desempenho sem numerador legível |
| Ranking individual | Sim | **Excluído** do Git (PII / pessoas) |

---

## 2. Inventário de métricas

| Métrica | Definição aparente | Denominador | Unidade | Comparável L2C? | Risco |
|---|---|---|---|---|---|
| Pedidos totais do mês | Contagem mensal | mês civil | pedidos | **Parcial** (anos 2023–24 ≠ L2C 25–26) | Dupla contagem se somar com iFood bruto |
| Cancelamentos | Contagem + motivos | / pedidos do mês | n, % implícita | **Sim conceitualmente** | Definição iFood cancel vs loja |
| iFood vs App | Canal | pedidos | n | Parcial | |
| Volume por weekday | Almoço / jantar / total | dias daquele weekday no mês | pedidos | **Sim (forma)** | |
| Faixas 2h | 10–12 … 22–00 | mês | ranking visual | **Parcial** (L2C usa 1h) | Sem 17h explícita; 22–00 mistura pós-23 |
| Avaliações estrelas | Contagem 1–5★ | avaliações do mês | n | Não (L2C não baselineou) | Moderação altera base |
| Moderação | Avaliações moderadas | mês | n | Não | |
| Ocorrências delivery | Contagem por dia / pessoa | mês | n | Exploratório | **Pessoas** |
| Reclamações item | Lista “faltou / errado” | lista (sem den. de pedidos) | casos | Exploratório vs WA B | Sem taxa por 100 |
| Ranking itens vendidos | Top itens | mês | n vendidos | Futuro item | **Não** é omissão |
| Preparo / atraso min | — | — | — | **Ausente** | |
| Praça / composição pedido | — | — | — | **Ausente** | |
| Compensação R$ | — | — | — | **Ausente** | |

---

## 3. Totais mensais extraídos (agregado)

| DOC | Período | Pedidos | Cancel. | Cancel/100* |
|---|---|---:|---:|---:|
| B3-DOC-004 | Jan/2023 | 5.772 | ~70 | ~1,2 |
| B3-DOC-003 | Fev/2024 | 5.966 | 85 | **1,42** |
| B3-DOC-006 | Mai/2024 | 6.858 | 40 | 0,58 |
| B3-DOC-005 | Jun/2024 | 6.855 | 51 | 0,74 |
| B3-DOC-001 | Ago/2024 | 6.497 | 41 | 0,63 |
| B3-DOC-008 | Out/2024 | 6.611 | 59 | 0,89 |
| B3-DOC-007 | Nov/2024 | 6.296 | 58 | 0,92 |
| B3-DOC-002 | Dez/2024 | 5.350 | 47 | 0,88 |

\*Calculado na L4 a partir de totais do slide; denominador = pedidos do relatório (definição do PDF, não necessariamente = L2C “fluxo normal”).

**Faixa de cancelamento Bloco 3 (~0,6–1,4/100)** é **compatível em ordem de grandeza** com L2C (~0,9–2,5), mas **períodos e definições diferem** — não fundir séries.

---

## 4. Achados operacionais agregados (sem nomes)

### B3-FIND-001 — Omissão de item domina reclamações listadas  
Múltiplos meses: “Faltou kit / hot / temaki / combinado / refrigerante”.  
Tipo: **ocorrência** listada · sem denominador de pedidos · **hipótese de processo/formação**.

### B3-FIND-002 — Troca / pedido errado recorrente  
“Combinado errado”, “foi atum no lugar de salmão”, “prato quente trocado”.  
Tipo: ocorrência · candidato a conferência/embalagem.

### B3-FIND-003 — Cancelamento por atraso e por logística  
Motivos incluem “pedido atrasado”, “não localizado”, “área de risco”, “problemas no veículo”, “item indisponível”, “problemas de sistema”.  
Tipo: dado de cancelamento · **não** atraso-flag de preparo L2C.

### B3-FIND-004 — Volume jantar >> almoço  
Em todos os meses legíveis, totais de jantar por weekday superam almoço.  
Tipo: dado calculado · alinha com L2C.

### B3-FIND-005 — Faixas 18–20 e 20–22 como horários de pico visual  
Slides de horário destacam blocos noturnos; **sem série numérica estável no texto** em todos os PDFs.  
Tipo: gráfico · confiança média-baixa no detalhe.

### B3-FIND-006 — Itens de cardápio no topo de vendas  
Hot Roll, Temaki, Carpaccio, Sashimi, Combinados aparecem em rankings de venda (quando presentes).  
Tipo: dado de cardápio · **não** liga item→atraso na mesma tabela.

---

## 5. O que **não** foi tratado como prova

- Ranking de clientes ou funcionários  
- Gráficos de “desempenho vs concorrência” sem números extraíveis  
- Slide de “erros funcionário” como julgamento de desempenho individual  
- Qualquer taxa de erro item-a-item (estudo antigo já contestado em C-06)

---

*Métricas L4 · agregadas · sem PII.*
