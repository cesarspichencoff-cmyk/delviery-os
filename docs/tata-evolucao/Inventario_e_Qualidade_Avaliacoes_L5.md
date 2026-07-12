# Inventário e Qualidade — Avaliações L5

> Lote único de export iFood. Hashes original × cópia **iguais**.  
> Privado: `../deliveryos-private-sources/01_WORK_COPIES/DERIVED/AVALIACOES_L5/`  
> **Sem textos brutos, nomes ou IDs de pedido no Git.**

---

## 1. Fontes

| Campo | Valor |
|---|---|
| Arquivo work | `avaliacoes/avaliacoes_ifood.xlsx` |
| Original | `00_ORIGINALS_IMMUTABLE/avaliacoes/` (mesmo hash) |
| Bytes | 90.909 |
| SHA-256 (16) | `72EDF7F482ABD25D` |
| Abas | Resumo · Diário · Nota por Distância · Comentários |

**Não** há segundo arquivo de “moderadas/respondidas” neste lote.

---

## 2. Período e cobertura

| Fonte do período | Valor |
|---|---|
| Cabeçalho Resumo | **03/04/2026 a 02/07/2026** |
| Diário (90 dias) | **2026-04-03 → 2026-07-01** |
| Comentários com nota | **2026-04-03 → 2026-06-30** |
| Status | **confirmado** (conteúdo + cabeçalho alinhados) |

| Cobertura | Valor |
|---|---|
| Dias no diário | 90 |
| Pedidos no diário (export) | 24.937 |
| Avaliações somadas no diário | 1.111 |
| Avaliações observadas / 100 pedidos (export) | **~4,5** |
| `order_at` | **ausente** |
| Data do pedido vs avaliação | **não separável** neste export |

Toda temporalidade de comentário é **`review_at` = tempo da manifestação**, não horário do erro.

---

## 3. Unidades e deduplicação

| Etapa | n |
|---|---:|
| Linhas na aba Comentários | 1.319 |
| Ruído (agregados / sem nota) | 89 |
| Linhas com nota | 1.230 |
| **Únicas** (dedup) | **1.034** |
| Duplicatas removidas | 196 |

**Regra de dedup:** `review_at + rating + texto normalizado + tags estruturadas`.  
**Não** deduplicou só por nota ou similaridade frouxa.

---

## 4. Qualidade do export

| Aspecto | Achado |
|---|---|
| Coluna Tags | Mistura **tags curtas iFood** com **trechos de comentário** (split por vírgula) |
| Tratamento L5 | Tags conhecidas vs texto livre separados; texto livre fundido ao comentário |
| Resposta da loja | **Ausente** |
| Moderação | **Não** discriminada (bruta/publicada/removida) |
| Relação pedido | Sem `order_id` utilizável no export |
| PII em texto | Flag privado; **não** versionado |

---

## 5. Distribuição por estrelas (únicas)

| ★ | n | % |
|---:|---:|---:|
| 5 | 868 | 84,0 |
| 4 | 111 | 10,7 |
| 3 | 29 | 2,8 |
| 2 | 19 | 1,8 |
| 1 | 7 | 0,7 |
| **Média** | | **~4,75** |

| Tipo | n | % |
|---|---:|---:|
| Com texto livre (após limpeza) | 146 | **14,1** |
| Só nota e/ou tags estruturadas | 888 | 85,9 |
| Polaridade positiva* | 975 | 94,3 |
| Mista | 33 | 3,2 |
| Negativa | 26 | 2,5 |

\*Polaridade heurística (nota + temas); **não** é NPS oficial do iFood.

---

## 6. Diário — sinais agregados

- Média rolling 3m no export: ~4,8 (campo do arquivo).  
- `pedidos_atrasados_avaliados` no diário: **soma 0** no período (campo presente mas zerado / sem uso confiável).  
- Nota por distância: export traz faixas km (uso logístico; não é praça de cozinha).

---

## 7. Princípio de interpretação (oficial L5)

Avaliação = **percepção do cliente**.  
Não prova automaticamente causa, praça, horário do erro, culpa ou censo da operação.

Viés de seleção: extremos avaliam mais; ~4,5 avaliações/100 pedidos no export ≠ satisfação total.

---

*Inventário L5 · período 2026-04-03..2026-07-01 confirmado.*
