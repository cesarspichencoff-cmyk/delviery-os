# Mapa Canônico de Dados — DeliveryOS

> Como a história operacional da TATÁ (16 arquivos, 9 meses, ~70k pedidos) vira **memória estruturada**.
> Proposta para aprovação — a geração dos `.jsonl` só começa depois do OK.

## Princípios

1. **Uma linha de verdade por pedido**, chaveada por `id_completo` (uuid). Fontes se complementam em colunas, nunca se somam em linhas.
2. **Proveniência em tudo**: cada registro carrega `_meta` com origem, período, confiança, método de junção e flags.
3. **Join silencioso é proibido.** Ambiguidade → `confianca:"baixa"` + flag. Dado incompleto > dado errado.
4. Agregado nunca se mistura com pedido-a-pedido (cardápio/vendas/qualidade ficam em arquivos próprios).

## Envelope de proveniência (todo registro)

```json
"_meta": { "fontes": ["Relatorio Marco.xlsx"], "periodo": "2026-03", "confianca": "alta",
           "juncao": "id_completo", "flags": ["sem_tempo_espera_loja"], "gerado_em": "..." }
```

## Os cinco arquivos canônicos

### 1. `pedidos_canonicos.jsonl` (~70k linhas)
Identidade e contexto do pedido:
`id_completo · id_curto · loja · data_hora · turno · status_final · valor_itens · valor_total · valor_liquido · forma_pagamento · tipo_entrega · produto_logistico · canal · agendado (+data) · aceito_pela_loja`
**Fontes:** relatórios mensais (Out–Mar) + Logística (Abr–Jun) + relatório antigo (dedup 99,7%).

### 2. `eventos_logisticos.jsonl` (1 linha/pedido)
`id_completo · tempo_preparo · tempo_alocacao_entregador · tempo_botao_pronto · tempo_entregador_a_caminho_loja · tempo_esperando_loja · tempo_entregador_a_caminho_cliente · tempo_esperando_cliente · tempo_prometido · tempo_real · atraso · distancia_km · agrupamento_rota · prioridade · servico_logistico`
**Nota:** são DURAÇÕES oficiais (D+1), não timestamps de evento. Viram Transições derivadas (`procedencia:"inferido"`) no núcleo quando necessário.

### 3. `desfechos_pedido.jsonl` (só pedidos com desfecho ≠ concluído limpo)
`id_completo (ou id_curto+dia se só isso houver) · desfecho (concluido|cancelado|cancelamento_parcial) · motivo_cancelamento · origem_cancelamento · valor_cancelado · itens_cancelados[] (nomes reais, quando houver) · contestavel · contestacao_status · negociacao {momento, motivo, quem_iniciou, resposta_loja, resposta_cliente, reembolso, cupom, cancelamento_evitado} · problema_pos_entrega · resposta_loja_pos`
**Fontes:** relatórios mensais (colunas de cancelamento/negociação) + Cancelamentos.xlsx + Negociações.xlsx.
⚠️ Cancelamentos/Negociações só têm `id_curto` → junção nível-dia; ~1,4% ambíguo → `confianca:"baixa"`.

### 4. `cardapio_popularidade.jsonl` (180 itens + 27 complementos)
`item_nome · item_id_seed (casado via matchSeed contra o cardapio_knowledge_seed) · categoria_ifood · praca (do seed) · visitas · pedidos · conversao · vendas_qty · valor_total · periodo`
**Regra de honestidade gravada no arquivo:** `"granularidade":"AGREGADO — NÃO é item por pedido"`. Uso: pesos reais da fonte sintética, tendência, ruptura futura. **Nunca** para afirmar composição de pedido específico.

### 5. `qualidade_operacional.jsonl` (série diária Abr–Jun)
`data · indicador · valor · meta · fonte`
Uso: aprendizado estrutural (tendência/meta/saúde), verificação cruzada com totais dos relatórios.

## Política de junção (oficial, com evidência)

| Prioridade | Chave | Confiança | Quando |
|---|---|---|---|
| 1 | `id_completo` | alta | relatórios ↔ logística |
| 2 | `id_curto + data/hora aproximada + loja` | média | negociações/cancelamentos → pedido |
| 3 | `id_curto + dia + turno` | média-baixa | fallback |
| 4 | ainda ambíguo | **baixa + flag `juncao_ambigua`** | ~1,4% dos casos no mesmo dia |

Evidência medida: ID curto repete 33,9%/mês (máx 6×) e 105 vezes no MESMO dia em Março.

## O que este mapa alimenta (e o que não)

- ✅ Motor A (tempo/estado): validação em 9 meses; réguas de plausibilidade (STALE) re-medidas em ~70k pedidos.
- ✅ Fonte sintética com **pesos reais** (motor B continua sintético por pedido — rotulado).
- ✅ Núcleo: desfechos viram Transições de dimensão `desfecho` (o "fechamento ressuscitado" com dado oficial).
- ✅ Aprendizado estrutural: séries p/ propostas com evidência (aprovação humana obrigatória).
- ❌ Composição real por pedido (geral) — segue dependendo de impressora/ponte/API.
- ❌ Pronto-por-praça — segue dependendo de KDS/produção futura.

## Fluxo de geração (quando aprovado)

```
Dados Claude.zip → tools/build_memoria_canonica.js
  → data/canonico/{pedidos_canonicos, eventos_logisticos, desfechos_pedido,
                    cardapio_popularidade, qualidade_operacional}.jsonl
  → validação cruzada (totais × Vendas.xlsx × Qualidade)
  → relatório de qualidade da geração (linhas, joins por nível, flags, descartes)
```
Determinístico e re-rodável; nenhum arquivo original é alterado; nada entra no motor sem passar por aqui.
