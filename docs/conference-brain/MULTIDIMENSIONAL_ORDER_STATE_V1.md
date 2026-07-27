# Modelo multidimensional do pedido — Sprint 2.1

> Corrige a limitação identificada pela auditoria independente do Sprint 2:
> um único `LIVE_ORDER_STATUS` não pode representar, ao mesmo tempo, onde o
> cartão apareceu, a situação de preparo, a prontidão INFORMADA à plataforma,
> a logística do entregador, o despacho e a conclusão. Fundamentado em
> `IFOOD_FUNCTIONAL_MODEL_V1.md`; implementado em `src/conference-brain/live/multidimensional-observation.js`.

## 1. Por que dimensões separadas

Cada dimensão abaixo é um FATO independente. Podem mudar em momentos
diferentes, por fontes diferentes (a mesma tela, em modos diferentes), sem
que uma implique a outra:

- um pedido pode estar `order_state=ready` com `readiness_state=not_ready`
  (ainda não notificou o entregador);
- pode estar `readiness_state=ready_notification_available` (botão na tela)
  sem que ninguém tenha clicado — **nunca confundir com "notificado"**;
- pode estar `courier_state=at_store` enquanto `order_state=preparing`
  (entregador chegou cedo);
- pode estar `completion_state=completed` sem que `courier_state` prove saída
  real (ver `STATUS_MAPPING_V1.md` §4).

Misturar isso num campo só é exatamente o risco que a auditoria apontou:
"colar coluna visual, botão disponível e evento de entregador no mesmo
`status`".

## 2. As nove dimensões

| Dimensão | Valores | O que representa | O que NÃO representa |
|---|---|---|---|
| `layout_mode` | expedition · boards · order_details · unknown | em qual MODO o cartão foi observado | o estado do pedido |
| `visual_location` | accept · preparing · ready · in_route · finalized · scheduled · cancelled · search_results · order_details · unknown | ONDE apareceu (coluna/seção) | prova de evento — é evidência |
| `order_state` | received · accepted · preparing · ready · finalized · cancelled · unknown | produção, sem logística | logística de entregador |
| `readiness_state` + `available_actions[]` | not_ready · ready_observed · ready_notified · ready_notification_available · unknown | prontidão INFORMADA à plataforma | "estar na coluna Pronto" |
| `courier_state` | not_applicable · searching · assigned · heading_to_store · arriving · at_store · collected · in_route · delivered · unknown | logística do entregador (iFood) | produção |
| `dispatch_state` | not_applicable · awaiting_dispatch · dispatched_by_store · collected_by_ifood · unknown | própria vs iFood vs retirada | "completed" genérico |
| `completion_state` | active · completed · cancelled · unknown | conclusão | apaga histórico anterior |
| `fulfillment_mode` | ifood_delivery · store_delivery · customer_pickup · table_or_local · scheduled · unknown | modalidade, só por evidência | inferido da coluna |
| `store_state` | open · closed_by_schedule · closed_manually · closed_by_connectivity · temporarily_unavailable · unknown | fato operacional da loja | saúde técnica da fonte |

Mais três estruturas de contexto: `schedule` (agendamento),
`grouping` (agrupamento), `indicators[]` (sinais/alertas do cartão) — ver
documentos específicos referenciados abaixo.

## 3. Regra de "valor vazio"

Um valor `unknown`/`not_applicable` significa **"esta leitura não mostrou essa
informação"**, nunca **"essa informação deixou de existir"**. Por isso ele
nunca sobrescreve um valor real anterior na reconciliação — ver
`RECONCILIATION_V1.md` §3 (`EMPTY_DIMENSION_VALUES`).

## 4. Prova concreta dos três cenários da auditoria

Testado em `tests/conference-brain/multidimensional-model.test.js`:

```
coluna Pronto + botão ainda disponível (não clicado)
  -> order_state=ready, readiness_state=ready_notification_available
  -> deriveLegacyLiveStatus() = "ready" (NUNCA "awaiting_pickup" por conta do botão sozinho)

completion=completed + courier=em rota
  -> deriveLegacyLiveStatus() = "departed" (NUNCA "completed" — não funde os dois)

entregador na loja + pedido ainda em preparo
  -> courier_state=at_store, order_state=preparing, simultaneamente
  -> clockLogisticsNeverDrivesConferenceFlow(): entregador na loja NÃO inicia a Conferência
```

## 5. Compatibilidade

`LIVE_ORDER_STATUS` (Sprint 2) não foi removido — está marcado `@deprecated`
em `contracts/live-states.js` e projetado a partir do modelo novo por
`live/legacy-compat.js#deriveLegacyLiveStatus`. Ver `RECONCILIATION_V1.md`
§5 (reconciliação multidimensional) e §6 (correção da semântica de ausência,
Sprint 2.2).

## 6. Documentos relacionados

`IFOOD_FUNCTIONAL_MODEL_V1.md` (o que é oficial) ·
`MAPPING_SCHEMA_V1.md` (o que o Modo de Mapeamento vai procurar) ·
`STATUS_MAPPING_V1.md` (mapeamento texto→dimensão) ·
`RECONCILIATION_V1.md` (como as dimensões se acumulam entre ciclos).
