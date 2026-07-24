# Simulador oficial v1 — SIMULADO, sem internet

`tools/ifood-simulator/simulator.js`. IMPLEMENTADO, testado
(`tests/integrations/ifood-official/receivers-simulator.test.js`, 11 casos).
Implementa `IfoodOfficialAdapter` (`label:"simulator"`) — funciona como
qualquer implementação real do adapter funcionaria, do ponto de vista dos
consumidores (receivers, outbox), mas 100% local.

## 1. Cenários de produção de eventos

Jornada completa de pedido (`pushOrderJourney`, 10 etapas: PLACED →
CONFIRMED → PREPARATION_STARTED → READY_TO_PICKUP → COURIER_ASSIGNED →
COURIER_ARRIVED_AT_MERCHANT → COURIER_PICKED_UP →
COURIER_ARRIVED_AT_DESTINATION → COURIER_DELIVERED → CONCLUDED) ·
cancelamento (`pushCancellation`) · cancelamento solicitado
(`pushCancellationRequested`) · disputa aberta/resolvida (`pushDispute`,
`pushDisputeResolved`) · alteração (`pushAlteration`) · evento desconhecido
(`pushUnknownEvent`) · merchant indisponível (`pushMerchantUnavailable`).

## 2. Relógio sintético monotônico

Cada evento de uma jornada recebe um `createdAt` avançado 30s (configurável
via `opts.stepMs`) a partir de um `startAt` configurável — nunca
`Date.now()` puro num loop apertado. **Motivo, encontrado durante o
desenvolvimento desta missão**: gerar timestamps no mesmo milissegundo
produzia empate/conflito FALSO no reconciliador (o mesmo lance que expôs o
bloqueador 1 do Sprint 2.4 no conference-brain) — um bug do simulador, não
do reconciliador, corrigido antes do commit.

## 3. Injeção de falhas (`injectFault`, consumida uma vez por `pollEvents()`)

| Falha | Efeito |
|---|---|
| `duplicate_event` (`pushDuplicateOf`) | mesmo evento entregue duas vezes |
| `out_of_order` (`pushOutOfOrder`) | evento avançado entregue antes do anterior |
| `same_timestamp` (`pushSameTimestampConflict`) | dois eventos de progressão, mesmo `occurred_at` |
| `incomplete_batch` | `pollEvents()` entrega só metade da fila, `partial:true` |
| `timeout`, `http_401/403/404/409/429/5xx` | `pollEvents()` falha inteiro, nenhum evento entregue |
| `token_expired` | `authenticate()` falha |
| `crash_before_processing`, `crash_before_ack` | documentados como categorias; a recuperação real é testada via inbox/outbox diretamente (ver `IFOOD_INBOX_OUTBOX_V1.md`), não pelo simulador |
| `invalid_json` (`invalidJsonBody()`) | string JSON malformada, para `webhook-receiver.js#receiveRaw` |
| `unknown_schema_version` (`pushUnknownSchemaVersion`) | evento com `schemaVersion` fora de `KNOWN_SCHEMA_VERSIONS` |

Falhas de NÍVEL DE REQUISIÇÃO (`timeout`, `http_*`, `token_expired`) fazem
o próprio `pollEvents()`/`authenticate()` falhar — nenhum evento chega a
ser entregue, mesma semântica de uma chamada real falhando antes de
qualquer processamento.

## 4. Sem internet, sem credencial

Nenhum `require("http")`/`fetch`/socket em `simulator.js`. Todo estado
vive em arrays/closures do processo — `queueLength()`/`faultQueueLength()`
expõem o estado interno para asserção em teste.

## 5. O que o simulador NÃO prova

Não prova que o vocabulário de `code`s (`PLACED`, `CONFIRMED`, …) ou o
formato do payload batem com a API real — são HIPÓTESE, herdada de
`contracts/event-types.js`/`receivers/payload-mapper.js`. O simulador só
prova que, DADO esse formato hipotético, o resto do sistema (inbox,
reconciliação, outbox) se comporta corretamente sob as falhas exigidas
pela missão.
