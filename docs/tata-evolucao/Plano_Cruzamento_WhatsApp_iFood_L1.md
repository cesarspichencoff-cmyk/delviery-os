# Plano de Cruzamento WhatsApp × iFood — pós-L1

> O que a L1 **pode** e **não pode** concluir sobre tempo e risco.  
> Campos necessários nos lotes L2/L3.  
> **Não** executa cruzamento nesta missão.

---

## 1. Hipóteses temporais (comunicação — não taxa de erro)

Base: volume de mensagens **não-sistema** por hora local (America/Sao_Paulo), agregado L1.

| Hipótese | Observação L1 (comunicação) | O que **não** afirma |
|---|---|---|
| H-T1 | Faixas **13–18h** e **22–23h** concentram alto volume de mensagens | Que há mais erros nessas horas |
| H-T2 | **22h** lidera volume de msgs no agregado | Que é o “pior horário operacional” |
| H-T3 | Há volume relevante **≥23:00** | Que a loja opera na madrugada — regra: encerra 23:00; classificar à parte |
| H-T4 | Escalonamentos e problemas são **comunicados** ao longo da tarde/noite | Momento do ato físico do erro |

**Classificação:** correlação de **tráfego de chat**, não de falha de pedido.

---

## 2. O que L1 já entrega para o cruzamento

| Artefato privado | Uso |
|---|---|
| `units.json` com `local_date`, `local_hour`, cats | Join frouxo por dia/hora/categoria |
| Contagens por export e período | Peso de amostragem |
| Flags after23 | Separar fora da janela operacional |

---

## 3. Campos necessários do iFood (L2/L3)

| Campo | Para quê |
|---|---|
| `order_id` / curto | Chave (se chat citar número — raro/confiabilidade baixa) |
| `received_at` / `ready_at` / `dispatched_at` | Tempos reais de produção/saída |
| `local_date`, `local_hour` (America/Sao_Paulo) | Exposição e join temporal |
| `operational_day_key` (= local_date) | Consistência com regra oficial |
| Contagem pedidos por hora/dia | Denominador de taxa |
| Contagem itens por pedido/hora | Denominador alternativo |
| status cancel/concluído | Cruzar cancelamento relatado |
| (ideal) composição / praça | Cruzar omissão por tipo de item |

**Join direto mensagem↔pedido** só se houver identificador confiável no texto (geralmente **fraco**).  
Join principal esperado: **agregado** por `local_date` + faixa horária + categoria.

---

## 4. Métricas permitidas só após cruzamento

| Métrica | Fórmula conceitual |
|---|---|
| Taxa de omissão relatada / 100 pedidos | unidades item_faltante / pedidos × 100 |
| Taxa de atraso comunicado vs atraso medido | comparar relatos × (ready−promised) |
| Intensidade de chat por 100 pedidos | msgs / pedidos (ruído de comunicação) |

Sem denominador → **inconclusivo** (já na política temporal T0B-A).

---

## 5. Alertas

Nenhum alerta aprovado.  
Candidatos ALC-* do modelo temporal permanecem `aguardando_dados` até taxas normalizadas + revisão humana.

---

## 6. Ordem sugerida pós-L1

1. Autorizar **L2** (inventário Dados Claude).  
2. Autorizar **L3** (pedidos com timing 27/05–25/06/2026).  
3. Produzir tabela de exposição dia×hora.  
4. Cruzar top categorias L1 (item_faltante, atraso, cancelamento).  
5. Só então revisar WA-PAT e WA-CASE com números de taxa.  

---

## 7. Riscos restantes

| Risco | Mitigação |
|---|---|
| Supercontagem de escalonamento | Revisão humana amostral; não usar como KPI bruto |
| Chat noturno ≠ operação | after_hours_class |
| PII em derivados | Manter só em DERIVED; Git anonimizado |
| Falso “pior horário” | Exigir normalização |

---

*Ponte L1→L2/L3 · sem cruzamento executado · sem taxas inventadas.*
