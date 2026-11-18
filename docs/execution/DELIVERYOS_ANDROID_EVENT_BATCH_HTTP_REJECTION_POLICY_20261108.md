# Delivery OS Itaim — lote HTTP 4xx no Android sem falso sucesso (08/11/2026)

**Missão:** corrigir uma lacuna real na sinalização de sincronização do aplicativo Entregas sem perder eventos operacionais, abrir permissões, instalar APK ou alterar o servidor do piloto. Esta mudança é uma **candidata de código na PR #137 DRAFT**, não homologação de campo.

## Diferença verificada antes da alteração

O `SyncWorker.kt` já possuía:
- `decideEventReceipt(...)` com validação da identidade de cada `event_id` em respostas HTTP 2xx, permitindo `markSent` ou `markRejected` apenas por recibo individual.
- `OutboxEventDao.markFailed(ids,...)` que preserva `eventId`, `idempotencyKey` e payload na fila Room e permite nova leitura de estados `pending/failed/sending`.
- Tratamento distinto para HTTP 401 da **plataforma**, renovação da credencial e credencial temporária de escrita no **piloto**, além do `term_ack` já corrigido e testado.
- `retryOrYield()` com limite de tentativas rápidas e prioridade para saldo GPS.

**Lacuna efetiva:** `is ApiResult.Rejected -> db.outbox().markFailed(ids,r.reason)` preservava o evento, mas, sem outro erro na mesma execução, o worker podia terminar em `Result.success()` apesar de não existir recibo do servidor comprovando aceitação ou recusa individual. O incidente de resultado incerto pode coexistir com falha de GPS/credencial; corrigir apenas a linha de rejeição sem analisar a prioridade final também permitiria um falso sucesso após o esgotamento das tentativas rápidas.

## Correção restrita na branch DRAFT

1. `android/app/src/main/java/br/com/tata/entregas/sync/EventBatchHttpRejection.kt` — regra pura e sem I/O: `403` ou `delegationDenied` gera `PILOT_AUTHORIZATION_BLOCKED`; outros códigos do caminho `ApiResult.Rejected` geram `UNATTESTED_BATCH_REJECTION`. **Nenhuma** dessas classes autoriza `sent`, `rejected` terminal, limpeza da credencial da plataforma ou afirmação de persistência remota. A regra é de retenção e sinalização; não é nova autenticação.
2. `android/app/src/main/java/br/com/tata/entregas/sync/SyncWorker.kt` — preserva a operação `db.outbox().markFailed(ids,r.reason)` no caso de 4xx, passa pela classificação, registra `unreceiptedBatchBlocked` ou `pilotAuthorizationBlocked`. Nenhum ramo de 4xx integral passa a usar `markSent` ou `markRejected`. O evento mantém o ID e a chave original porque o `markFailed` apenas altera estado e erro do mesmo registro Room.
3. O desfecho do worker agora primeiro limpa credencial **somente quando** `credencialRecusada` é resultado da rota de plataforma; preserva a continuação GPS (`gpsDrain.remaining`) e o limite de tentativas rápidas `shouldRetryFast(runAttemptCount)`; quando não há mais tentativa rápida e a recusa do lote ainda não foi reconciliada, retorna `Result.failure()`, **não `Result.success()`**. Se houver saldo GPS, `Result.retry()` continua sendo o resultado daquela execução. `Result.failure()` é um sinal interno ao WorkManager, **não prova de aviso visual visto pelo motoboy**.
4. `android/app/src/test/java/br/com/tata/entregas/EventBatchHttpRejectionTest.kt`: quatro métodos JUnit, cobrindo **13 casos** de códigos HTTP, delegação negada e comportamento de recusa sem recibo.
5. `tests/reporting/run-android-event-batch-4xx-source-contract-tests.cjs`: valida **o código real** do `SyncWorker` e a sua ligação com o classificador; faz doze verificações com contraprovas, incluindo troca por `Result.success()`, `markRejected`, token apagado, classificação ignorada e falta da prioridade de GPS. O workflow já existente `.github/workflows/deliveryos-silent-fixture-windows.yml` executa o teste de fonte e monitora alterações nos dois arquivos Kotlin e teste JUnit.

## Prova executada e seus limites

- **Kotlin JVM isolado:** `kotlinc-jvm 1.9.0`, JRE 21, compilou o **arquivo puro exato** `EventBatchHttpRejection.kt` e executou **13/13 casos**. A versão de quatro métodos JUnit também foi compilada e exercitada com um **stub mínimo da API JUnit**, `4/4 métodos`, totalizando os mesmos 13 casos. **Não** é compilação do aplicativo completo nem execução do JUnit/Gradle Android real.
- **Identidade de bytes comprovada:** Git blob da política compilada `8e4d385bbae8c43e66f61c76693ba7201ff4f3bf` coincide com a versão efetivamente publicada na PR; Git blob da classe de testes compilada `58489287f836c8d1388a73df4b7c3d4523fe3dda` também coincide.
- **CI da PR #137:** commit `1a0988bd6b314f2696a0a428c4624be9d6f80f44`, run [#42455424958](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42455424958): **completed/success, 4/4 jobs**. O job `Static fixture contracts` registrou `ANDROID_EVENT_BATCH_HTTP_4XX_SOURCE_PASS 12/12 NO_ANDROID_NO_ROOM_NO_NETWORK`; o job de integração Reader→R5D3 e Windows sem console também passaram. **Esses jobs não compilam Android e não executam Room real.**
- **Efeito externo da rodada:** nenhum. Não foi feito merge, build/publish de APK, instalação no Xiaomi, escrita em SQL produtivo, envio de eventos, edição de filas Room, impressão, spooler, mudança em serviços ou gasto com infraestrutura.

## Riscos ainda abertos — não promover sem estes testes

- `HTTP_4XX_BATCH_NO_FALSE_SUCCESS=CODE_READY + SOURCE_CI_PASS`, mas **`ANDROID_FULL_GRADLE_BUILD=NOT_RUN`**, **`ANDROID_ROOM_INTEGRATION=NOT_RUN`** e **`XIAOMI_REAL_SYNC=NOT_RUN`**. A última suíte Gradle completa documentada antes desta mudança era de 254/254 em outra revisão e **não serve como prova da compilação atual**.
- O evento com `syncState='failed'` permanece elegível para o próximo envio (inclusive periódico de 15 minutos). Portanto a correção **não resolve** a política definitiva de retenção/quarentena de recusas repetidas, eventual suporte a intervenção humana nem o risco de requisições repetitivas a um endpoint rejeitando persistentemente um lote. Não confundir `Result.failure()` com trava permanente contra retransmissão.
- Não há recibo idôneo para transformar um HTTP 4xx inteiro em `rejected` definitivo por evento. Para essa promoção, o servidor deve expor um contrato verificável por `event_id`, ainda não homologado nesta etapa. Commit incerto exige reenvio com a mesma identidade.
- `PILOT_TERM_ACK_AUTH=HOLD`, `L6_EVENT_BATCH_4XX_FIELD=HOLD`, `L6_GPS_FIELD=HOLD`; os gates de leitura nativa atômica, praça, impressão, identidade iFood independente e Home também continuam próprios.

**Sequência segura:** compilar `:app:testDebugUnitTest` em um ambiente Android SDK já autorizado e depois ensaiar com uma fila Room descartável, 4xx reais/simulados e restarts de WorkManager, confirmando que nenhum `eventId` nem `idempotencyKey` foi perdido. Só após isso avaliar um teste em aparelho de campo com autorização. Não instalar APK automaticamente nem elevar o status de aceitação da V1, ainda **0/8**.
