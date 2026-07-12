# Plano de Cruzamento Normalizado — L2B (futuro)

> Como **executar** o cruzamento agregado WhatsApp (filtrado) × exposição iFood.  
> **L2B não inicia nesta missão.**

---

## 1. Pré-requisitos (estado L2A)

| Pré-requisito | Status |
|---|---|
| Exposição pedidos/hora (L3) | **Pronta** (privada) |
| Dedup UUID L3 | **OK** (0 dups) |
| QA amostral WA | **Feita** — várias cats **não** usáveis cruas |
| Composição itens | **Ausente** |
| Join mensagem↔pedido por ID | **Não forçar** |

---

## 2. Entradas privadas da L2B

| Entrada | Path conceitual |
|---|---|
| Unidades WA | `DERIVED/WA_L1/indexes/units.json` |
| Regras de filtro pós-QA | reclassificação ou subset por categoria elegível |
| Exposição | `DERIVED/IFOOD_L2A/agg/exposure_windows.json` + `daily.json` |
| Pedidos | `orders_sanitized.json` |

---

## 3. Chaves de junção agregada

```text
join_key_primary   = local_date + time_window_60m   (America/Sao_Paulo)
join_key_secondary = local_date + time_window_30m
join_key_day       = local_date
dimensions         = weekday, operational_period, category (WA filtrada)
```

**Não** usar nome de cliente, valor do pedido ou proximidade solta de mensagem a pedido.

---

## 4. Confiança temporal da unidade WA

| Campo | Valores |
|---|---|
| `time_confidence` | `event_likely` \| `communication_only` \| `unknown` |
| Regra | `event_likely` só se texto da unidade tiver âncora temporal (“agora”, “há X min”, “atrasado”) **e** categoria elegível |
| Janela de tolerância | HIP: ±30 a ±60 min ao redor de `local_hour` da mensagem ao agregar |
| Após 23:00 | não entrar no denominador/numerador do dia normal sem `after_hours_class` resolvido |

---

## 5. Categorias permitidas no numerador (pós-QA L2A)

| Categoria | No 1º cruzamento? |
|---|---|
| item_faltante | **Sim**, com caveat (prec. amostral ~0,64) |
| embalagem | **Sim**, caveat (~0,68) |
| falha_sistema | **Sim**, caveat (~0,56) |
| indisponibilidade | Só se refiltrada operacionalmente |
| escalonamento, lideranca, compensacao, atraso, reclamacao, ideia_melhoria | **Não** até reclassificação |

---

## 6. Métricas L2B (quando rodar)

Para cada `local_date` × faixa × categoria elegível:

```text
rate_per_100_orders = 100 * wa_units_filtered / orders_received
rate_per_1000_items = BLOQUEADO até haver items_total
cancel_per_100      = 100 * orders_cancelled / orders_received   # só iFood
delay_flag_per_100  = 100 * orders_delayed / orders_received     # só iFood
```

**Proibido na L2B sem revisão humana:** rotular “pior dia/hora da operação” só com rate de chat.

Comparar sempre com **baseline da mesma faixa de volume** (ex.: mesmo tercil de orders_received).

---

## 7. Saídas esperadas da L2B (privadas + docs Git)

| Privado | Git (anonimizado) |
|---|---|
| Tabela dia×hora×cat com rates | Relatório de hipóteses normalizadas |
| Lista de fatias inconclusivas (n baixo) | Atualização de WA-PAT com status |
| — | O que pode virar candidato a alerta (ainda `em_validacao`) |

---

## 8. Gate para chamar L2B “aprovada”

- [ ] Reclassificação ou filtro das cats de baixa precisão  
- [ ] Rates só com n mínimo (HIP: ≥30 pedidos na fatia)  
- [ ] Separação after_23  
- [ ] Nenhuma causalidade afirmada  
- [ ] Zero PII no Git  

---

## 9. Fora de escopo L2B

- Avaliações, Bloco 3, OP, mídia (lotes posteriores)  
- Alertas ativos DeliveryOS  
- Cursos completos  

---

*Plano L2B · cruzamento ainda não executado · numerador WA restrito pela QA.*
