# Mapeamento de status — Sprint 2

`src/conference-brain/live/status-map.js` · `src/conference-brain/contracts/live-states.js`

## 1. Vocabulário canônico (separado do Sprint 1 — ver §3)

```
received · accepted · preparing · ready · awaiting_pickup ·
picked_up · departed · completed · cancelled · unknown
```

Texto bruto → canônico é feito por expressão regular ANCORADA
(`RAW_TEXT_MAP` em `status-map.js`): um rótulo novo que a plataforma nunca
mostrou antes vira `unknown` — nunca é forçado para o vizinho mais parecido.
Isso é deliberado: um `unknown` visível é um sinal de que o Modo de Mapeamento
(Fase 14) precisa rodar de novo; um "quase acerto" silencioso esconderia a
mudança de layout.

## 2. Três regras de horário do evento — nunca inventado

| Caso | `event_time` | Confiança |
|---|---|---|
| a tela mostra o horário do evento ("Pronto às 20:14") | 20:14, direto da tela | alta |
| status mudou entre dois ciclos, sem horário na tela | `null` + `observed_interval:[t_anterior,t_atual]` | media/baixa |
| primeira observação do pedido já nesse status | `null`, sem intervalo | baixa |

Testado em `buildStatusEvent()`: o horário do EVENTO nunca é igualado ao
horário da OBSERVAÇÃO. Um evento sem horário próprio fica com `event_time:
null` e o intervalo observado fica registrado — isso é honestidade estrutural,
o mesmo princípio que rege `ready_at`/`convergence` no Sprint 1.

## 3. Por que existe uma ponte com perda para o vocabulário do Sprint 1

`LIVE_TO_SPRINT1_STATUS` projeta os 10 estados ao vivo nos 7 do Sprint 1
(`recebido/confirmado/pronto/saiu/concluido/cancelado/desconhecido`) só para
reaproveitar `snapshots/engine.js` e `shadow/conference-state.js` sem
duplicá-los. É uma projeção COM PERDA por definição — `accepted` e `preparing`
colapsam em `recebido`; `awaiting_pickup` colapsa em `pronto`. Por isso o
status ao vivo original nunca é descartado depois da projeção: ele é o que
fica gravado em `live_observations.status`, a ponte é só uma leitura auxiliar.

## 4. PRONTO e SAÍDA — a distinção que a auditoria pediu

`live/ready-departure.js` isola exatamente dois conjuntos:

```
READY_MILESTONE_STATUSES      = [ready, awaiting_pickup]
DEPARTURE_MILESTONE_STATUSES  = [departed]        <- NÃO inclui completed
HANDOFF_ONLY_STATUSES         = [picked_up]        <- não é saída da loja
```

`departureEvidence(statusHistory)` nunca promove `completed` a "saiu": se o
histórico só tem `completed`, a resposta é `{observed:false, reason:
"tela_marcou_concluido_mas_nao_expoe_saida_real;aguardando_evento_manual"}`.
Isso é a regra mais estritamente testada de todo o Sprint 2 (3 testes
dedicados) — é exatamente o tipo de suposição confortável que a missão proíbe
explicitamente.
