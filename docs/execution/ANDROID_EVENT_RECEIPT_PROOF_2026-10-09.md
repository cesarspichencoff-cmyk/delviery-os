# DeliveryOS Android — recibo individual de eventos da outbox
Data: 2026-10-09
Branch: `feat/deliveryos-android-event-receipt-fixed-20261009`
Base preservada: `feat/deliveryos-android-orphan-recovery-fixed-20261009` @ `50a5279fec2b75dd5659ba9132d2eae3343d8099`.
**Status: CODE_READY + TEST_PASS. NÃO DEPLOYED, NÃO WORLD_PROVEN em telefone.**

## Causa encontrada
O servidor piloto em `tools/entregas_pilot_server.ts`, rota `POST /api/events/batch`, responde HTTP 200 com `{ok:true,results:[{event_id,ok,error?}]}`, inclusive quando o domínio rejeita comandos individualmente. Antes da correção, `android/app/src/main/java/br/com/tata/entregas/sync/SyncWorker.kt` executava `db.outbox().markSent(ids)` para **todo** o lote em qualquer `ApiResult.Ok`, sem consultar `results`. Isso promovia evento recusado pelo domínio a enviado — perda semântica de fato de campo.

## Correção
- `android/app/src/main/java/br/com/tata/entregas/sync/EventReceipt.kt`: contrato `decideEventReceipt`, com verificação de `ok` externo booleano, presença/quantidade de `results`, event_id esperado não duplicado e `ok` individual booleano. Recibos desconhecidos/incompletos/malformados produzem `Invalid`.
- `SyncWorker.kt`: em `ApiResult.Ok`, consulta **todos os recibos**. Apenas `sentIds` aceitos são `markSent`; negativas explícitas do domínio são `markRejected` com motivo saneado/limitado; recibo inválido faz `markFailed` do lote e solicita nova tentativa (nunca falso aceite).
- `android/app/src/main/java/br/com/tata/entregas/data/EntregasDatabase.kt`: `OutboxEventDao.markRejected`, `rejectedCount`, atualização condicional a `pending/failed/sending`. `sent/rejected` continuam terminais e a outbox não é apagada.
- `android/app/src/main/java/br/com/tata/entregas/ui/MainActivity.kt`: expõe `rejected_events` em `statusJson` nativo para evidenciar comando recusado. O contador não é prova de que uma superfície Web específica já renderiza o número.
- `android/app/src/test/java/br/com/tata/entregas/EventReceiptTest.kt`: 10 cenários (aceite parcial, ordem reversa, ausências, resultados duplicados/desconhecidos, tipos, outer ok false, lote vazio e saneamento de token).
- `android/app/src/test/java/br/com/tata/entregas/RoomSyncRaceRecoveryTest.kt`: mais um caso de rejeição explícita persistida em Room após fechamento/reabertura e imune a `markSent/markFailed` tardios.
- `.github/workflows/deliveryos-android-event-receipt.yml`: CI JVM isolado, Java 17, permissões de leitura.

## Prova RED (fronteira exata)
- Branch de teste sem implementação: `feat/deliveryos-android-event-receipt-20261009`, commit `fde59d54ceb94ff8a0fe25d46c258ec80e706b80`.
- Run [37934470802](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37934470802): **FAILURE** ao compilar testes que exigiam `EventReceiptDecision`/`decideEventReceipt` inexistentes. Isto demonstra ausência da implementação/teste na versão anterior; a evidência do comportamento de falso aceite é o caminho `HTTP 200 -> markSent(ids)` do código anterior e o formato `results` da rota real. Não declarar teste Android comportamental executado em RED.

## Prova GREEN em GitHub Actions
- Run [37934725186](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37934725186), commit de código `4b94426a989b542b9bb7c6176a6fb71859edd603`, `SUCCESS`.
- `BUILD SUCCESSFUL`, `ANDROID_EVENT_RECEIPT_JUNIT: suites=11, tests=77, failures=0, errors=0`.
- Teste Room usa SQLite real sob Robolectric com close/reopen. Sem emulador externo/aparelho físico.

## Regressão Foxxy em branch isolada
- `npm run -s test:platform:queue-depth`: **12/12 PASS** e `B5_FRESHNESS_HTML_RENDER PASS`;
- `npx --no-install tsc --noEmit`: exit 0;
- `run-device-queue-depth-pg-tests.ts` contra PostgreSQL local: **12/12 PASS**;
- `npm run -s build:platform`: exit 0;
- `run-device-queue-depth-http-pg-tests.ts`: **8/8 PASS**.
- Nada rodado na CAIXA_MOOCA; nenhum acesso ao SQL Teknisa ou TATÁ Comanda.

## Riscos residuais / próximos passos
- Não houve deploy nem validação de sincronização em telefone Android físico ou WorkManager real com rede móvel.
- `ApiResult.Rejected` (HTTP 4xx de `/api/events/batch`) ainda usa `markFailed` legado, podendo gerar tentativas posteriores; o novo tratamento melhora apenas o recibo individual em resposta 200.
- Eventos já marcados `sent` por versões antigas não foram reclassificados retroativamente; exigiriam reconciliação com evidência de servidor. Nunca inferir rejeição histórica.
- A rota /api/events/batch do piloto já exige sessão do piloto; este trabalho NÃO altera ou resolve o modelo de autenticação do piloto.
- `rejected_events` está exposto na ponte nativa, mas não foi provado exibido na interface web.
- Claude segue em branch separada de Product System `feat/claude-product-ux-autonomous-20261009`; não misturar arquivos Android com a frente dele, não merge em main.
- Sem novas permissões, gastos, deploy, cutover, impressão, fiscal, Odhen/SEFAZ ou efeitos operacionais.
