# Inventário de Fontes Primárias — Proposta B (Claude)

> Investigação independente para o cérebro operacional do DeliveryOS.
> Worktree isolado `deliveryos-proposta-b-claude`, base `101680a`.
> **Nenhuma fonte original foi modificada.** Todas as leituras são read-only.
> Este inventário foi produzido **antes** de qualquer leitura da Proposta A.

## Método

Inspeção de conteúdo, não de nome de arquivo: para cada fonte foram lidos esquema
real, contagens e campos efetivamente presentes (via `node`/`grep` sobre os
arquivos), não a suposição do que o nome sugere. Onde a fonte é binária
(XLSX/PDF/PPTX), foram usadas as extrações já existentes em `01_WORK_COPIES/DERIVED`.

## 1. Mapa geral

| Repositório | Papel | Volume |
|---|---|---|
| `deliveryos-private-sources/00_ORIGINALS_IMMUTABLE` | Originais imutáveis (read-only) | 58 arquivos · 32 MB |
| `deliveryos-private-sources/01_WORK_COPIES` | Cópias de trabalho + camadas derivadas L1–L6 | 341 arquivos · 130 MB |
| `deliveryos-private-sources/_manifests_local` | SHA-256 dos originais + mapa de nomes WA (**PII, local-only**) | 2 CSV |
| Worktree do Copiloto (`101680a`) | Cardápio versionado, docs, motor | `data/cardapio_knowledge_seed.json` (300 KB, 199 itens) |

## 2. Fontes primárias — originais imutáveis

| Grupo | Arquivos | Formato | Conteúdo | Utilidade |
|---|---|---|---|---|
| **iFood pedidos** | `B2-XLSX-01..05`, `relatorio_pedidos_2026-05-27_2026-06-25.xlsx.zip`, `Dados_Claude.zip` (15 MB) | XLSX/ZIP | Relatórios de pedidos | **Alta** — base temporal |
| **iFood negociações** | `negociacoes_ifood.xlsx` | XLSX | Negociações/acordos | Média |
| **Avaliações** | `avaliacoes/avaliacoes_ifood.xlsx` | XLSX | Avaliações de clientes | Alta — resultado percebido |
| **RH / treino** | `OP-01..OP-15`, `roteiro_reuniao.pdf`, **`tabela_cardapio.pdf`** | PNG/PPTX/PDF/XLSX/DOCX | Treinamento, processos, cardápio | **Alta** — conhecimento de preparo |
| **Qualidade** | `B3-PDF-01..08`, `relatorio_qualidade_operacao_loja.zip` | PDF/ZIP | Qualidade da operação | Alta |
| **Mídia operacional** | `MID-01..05` (jpeg), **`MID-06.mp4`**, `B3-IMG-01..04` | JPEG/MP4 | Fotos e vídeo da operação | Alta — preparo/embalagem real |
| **WhatsApp** | `WA-01..WA-13.zip` | ZIP | 13 conversas | **Alta** — memória humana |

Integridade: `_manifests_local/originals_sha256.csv` traz SHA-256 de cada original.

## 3. Camadas derivadas (já processadas) — `01_WORK_COPIES/DERIVED`

| Camada | Conteúdo | Registros |
|---|---|---|
| **WA_L1** | 13 chats extraídos (`WA-01..13/_chat.txt`) | **194.539 linhas** |
| **IFOOD_L2A** | Pedidos maio–jun sanitizados, exposure windows, cardápio/logística XLSX | 8.305 pedidos |
| **IFOOD_L2A1** | Unidades de evidência do WhatsApp **classificadas** por categoria operacional | ver §5 |
| **CROSS_L2B** | Cruzamentos, denominadores de exposição, findings | — |
| **MULTIPERIOD_L2C** | **União multi-período de pedidos** | **70.071 pedidos** |
| **BLOCO3_L4** | Inventário do bloco 3 | — |
| **AVALIACOES_L5** | Avaliações classificadas + diário | 90 dias (03/04–02/07/2026) |
| **OPERACIONAL_L6A** | PPTX/PDF/DOCX **extraídos** (XML) do material de treino | 180 arquivos |

## 4. A fonte central: 70.071 pedidos — e o que ela **não** tem

`MULTIPERIOD_L2C/agg/orders_union_sanitized.json` — 36,4 MB, **70.071 pedidos únicos**, 9 meses **completos** (2025-10 → 2026-06), sem lacunas declaradas (`gapNotes: []`).

**Campos presentes (100% de cobertura, verificado campo a campo):**
`order_uuid · received_at · local_date · weekday · local_hour · operational_period · status · cancellation_state · preparation_duration · ready_wait_duration · wait_shop_duration · delay_flag · delay_min · channel · coverage_quality · after23 · normal_flow`

**Campos AUSENTES — este é o achado estrutural da Proposta B:**

| Variável desejada pelo César | Existe hoje? | Evidência |
|---|---|---|
| pedidos, ritmo, atraso, simultaneidade | **SIM** (derivável do timing) | campos acima |
| **itens** | **NÃO** | `item_count: null` |
| **unidades** | **NÃO** | `has_composition: false` |
| **variedade** | **NÃO** | sem linhas de item |
| **complexidade** | **NÃO** (só via cardápio, não por pedido) | — |
| **volumes** (sacolas) | **NÃO** | não observado |
| **praça** | **NÃO** | `context_missing: ["praca"]` |
| **equipe** | **NÃO** | nenhuma fonte estruturada |
| **materiais / equipamentos** | **NÃO** | nenhuma fonte estruturada |
| **preparação (prontidão)** | **NÃO** | nenhuma fonte estruturada |
| **tendência de chegada** | **SIM** (derivável) | `received_at` |

Confirmação independente em `IFOOD_L2A/agg/pedidos_summary.json`:
`"composition_available": false`, `"items_total": null`, `"context_missing": ["item_lines","absolute_ready_at","praca"]`.

**Colunas reais do relatório iFood** (o que a plataforma entrega hoje):
`ID COMPLETO · ID CURTO · DATA E HORA · TURNO · STATUS FINAL · VALOR DOS ITENS (R$) · TIPO DE CANCELAMENTO · TEMPO DE PREPARO (MIN) · TEMPO DE ACIONAMENTO DO BOTÃO PRONTO (MIN) · TEMPO DE ATRASO (MIN) · CANAL DE VENDA`

### Achado aproveitável: `VALOR DOS ITENS (R$)`

O relatório bruto **tem valor monetário por pedido**, mas as camadas derivadas o
**descartaram na sanitização** (verificado: 0 registros com campo de valor em
`orders_sanitized.json` e na união de 70k). Valor não é item, mas é o **único proxy
de magnitude do pedido disponível sem nova coleta** — recuperá-lo do XLSX bruto é a
melhoria mais barata do inventário atual. Registrado como recomendação, não como fato de capacidade.

## 5. Evidência humana já estruturada

`IFOOD_L2A1/agg/high_confidence_units_v3.json` — unidades de evidência do WhatsApp
classificadas nas categorias: `item_faltante · embalagem · falha_sistema ·
indisponibilidade · atraso · compensacao · reclamacao · escalonamento · lideranca ·
ideia_melhoria`, cada uma com `unit_id`, chat de origem, data, hora, `time_anchor`,
`has_decision`. É um índice rastreável pronto para aprofundamento (Stage 3).

**Privacidade:** `_manifests_local/whatsapp_name_map_LOCAL_ONLY.csv` mapeia os IDs
genéricos para nomes reais de pessoas. **Esse arquivo não é lido nem citado em
nenhum artefato da Proposta B.** Todos os documentos usam apenas IDs genéricos.

## 6. Qualidade, limitações e privacidade por fonte

| Fonte | Qualidade | Limitação principal | Privacidade |
|---|---|---|---|
| Pedidos 70k (L2C) | **Alta** (9 meses completos, dedup feito) | **Sem composição, sem praça, sem equipe** | Sanitizado; sem PII de cliente |
| Pedidos maio–jun (L2A) | Alta | 30 dias; valor descartado na derivação | Sanitizado |
| Avaliações (L5) | Alta | 90 dias; só o que o cliente escolheu avaliar | Comentários podem conter PII |
| WhatsApp (WA_L1) | Rica, mas **enviesada** | **Não é censo** — só o que virou conversa | **PII real**; usar só IDs |
| Treino/RH (L6A) | Alta autoridade | Formato heterogêneo; pode estar desatualizado | Pode conter nomes |
| Mídia operacional | Alta (evidência visual direta) | Amostra pequena (10 arquivos) | Pode conter pessoas |
| Cardápio seed | Estruturado, 199 itens | **Classificação anterior ≠ verdade confirmada** | Sem PII |

## 7. Relação entre fontes

```
WhatsApp (por quê / decisões)   ──┐
Avaliações (resultado externo)  ──┼──> mesma data/hora ──> Pedidos 70k (quando/quanto/atraso)
Treino & mídia (como se faz)    ──┘                              │
                                                                 └──> Cardápio seed (o que é o item)
```
O elo é **data + hora**: os pedidos dão o esqueleto temporal; WhatsApp e avaliações
explicam episódios; treino e mídia explicam o trabalho; o cardápio descreve o objeto.
**Nenhuma fonte liga pedido ↔ item ↔ praça** — essa é a lacuna central.

## 8. Conclusão do inventário

1. **Há muito mais dado temporal do que se supunha**: 9 meses completos, 70.071 pedidos, não apenas amostras.
2. **Há muito menos dado de composição do que o modelo ideal exige**: zero itens, zero praças, zero equipe, zero volumes.
3. Portanto, qualquer proposta de Conferência que prometa medir "itens, unidades, variedade, complexidade, volumes" **hoje** estaria inventando. A Proposta B trata isso como restrição de projeto, não como detalhe.
4. O caminho honesto tem três degraus: (a) usar bem o que existe (tempo e simultaneidade), (b) recuperar o barato (valor do pedido), (c) coletar o que falta (itens/praça/equipe) — nessa ordem.

*Detalhamento por estágio nos demais documentos desta proposta.*
