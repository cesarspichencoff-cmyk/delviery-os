# Qualidade e Deduplicação iFood — L2A

> Resultados do processamento privado do pack de pedidos maio–jun e inventário Claude.  
> Sem PII no Git.

---

## 1. Pack principal (L3 — pedidos 27/05–25/06/2026)

| Métrica | Valor |
|---|---:|
| Linhas brutas | **8.305** |
| Pedidos únicos (`ID COMPLETO`) | **8.305** |
| Duplicatas exatas de ID no arquivo | **0** |
| Sem ID | **0** |
| Data/hora inválida | **0** |
| Cancelados (status/motivo) | **177** |
| Com flag de atraso (min &gt; 0 vs prometido) | **3.147** |
| Pedidos com `local_hour ≥ 23` | **4** |
| Com tempo de preparo (min) preenchido | **8.279** |
| Com botão pronto (min) | **8.279** |
| Composição item-a-item | **0** (coluna inexistente) |
| Itens válidos (linhas de item) | **N/A — não disponível** |

**Chave de deduplicação usada:** `ID COMPLETO DO PEDIDO` (UUID).  
**Não** usado: nome, valor, proximidade temporal.

---

## 2. Sobreposição entre packs

| Comparação | Resultado L2A |
|---|---|
| Duplicatas internas L3 | 0 |
| Logistica.xlsx (Claude) | 24.905 IDs únicos — período **mais largo**; não fundido nesta L2A |
| Relatorios mensais out–mar | ~7,1k–7,9k pedidos/mês cada; **fora** da janela mai–jun do L3 |
| Risco de double-count se unir L3+Claude sem chave | **Alto** — L2B deve unir por UUID e intervalo de datas |

**L2A não publica um “total histórico único”** além do L3 limpo (8.305).

---

## 3. Timestamps e estados

| Elemento | Disponível? |
|---|---|
| `received_at` (pedido) | **Sim** (`DATA E HORA DO PEDIDO`) |
| `ready_at` absoluto | **Não** |
| `dispatched_at` absoluto | **Não** |
| Durações até pronto/espera/atraso | **Sim** (minutos) |
| Status final | **Sim** |
| Cancelamento detalhado | **Sim** (tipo/motivo/origem quando preenchido) |
| Canal | **Sim** |
| Turno iFood | **Sim** (rótulo do export) |
| Após 23:00 | **4** pedidos no L3 — marcados `after_23`; **fora do fluxo normal** |

Fuso: parse `DD/MM/YYYY HH:MM:SS` como **America/Sao_Paulo** (−03).  
`operational_day_key = local_date`.

---

## 4. Qualidade de dados

| Aspecto | Nota |
|---|---|
| Completude de ID/data no L3 | Excelente |
| Completude de durações | Alta (~99,7%) |
| Composição | **Ausente** nos packs usados |
| Consistência de status | OK para contagens de cancelamento |
| Risco de PII no pipeline | Baixo se só colunas operacionais forem copiadas para DERIVED |

---

## 5. Registros problemáticos

| Tipo | Qtd | Ação |
|---|---:|---|
| Dup ID no L3 | 0 | — |
| Sem ID / data | 0 | — |
| Após 23:00 | 4 | `after_hours_class`; excluir de “movimento normal” até classificação |
| Composição faltante | 100% | Não calcular erros/1000 itens ainda |

---

## 6. Bases privadas geradas (fora do Git)

```text
DERIVED/IFOOD_L2A/agg/orders_sanitized.json   # 8305 pedidos sanitizados
DERIVED/IFOOD_L2A/agg/exposure_windows.json   # agregados 30m e 60m
DERIVED/IFOOD_L2A/agg/daily.json
DERIVED/IFOOD_L2A/agg/pedidos_summary.json
```

Nenhuma dessas bases foi commitada.

---

*Dedup e qualidade L3 prontos · composição de itens ainda bloqueada.*
