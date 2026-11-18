# Delivery OS Itaim — WorkManager real em laboratório, recusa HTTP 4xx sem perda de fila (08/11/2026)

**Escopo e autoridade:** PR #137 `feat/gestor-shadow-observer-20261103`, aberta e em rascunho. Repositório `cesarspichencoff-cmyk/delviery-os`; método canônico `cesarspichencoff-cmyk/vertice-runtime.` (ponto final literal), branch `vertice-active`, `VERTICE_ENTRY.md`, SHA do blob `912a02f932acc42e76cb1fb7d46b3f1f8a0c380d`. Sem instalador, acesso ao SQL do caixa, impressora, iFood, produção, app do motoboy nem alteração de serviços nesta rodada.

## Problema que ficou pendente no checkpoint anterior

O relatório [`DELIVERYOS_ANDROID_EVENT_BATCH_ROOM_GRADLE_PROOF_20261108.md`](./DELIVERYOS_ANDROID_EVENT_BATCH_ROOM_GRADLE_PROOF_20261108.md) havia provado **264/264 testes em Gradle/Room**, mas o fluxo de ponta a ponta de `SyncWorker.doWork()` ainda não era exercitado: verificadores estáticos conferiam o encadeamento Worker → helper → DAO, e testes unitários chamavam o helper Room diretamente. Isso **não bastava para provar** a decisão real de `ListenableWorker.Result.Failure`/`Retry` ao ocorrer 403/409/422 com GPS simultâneo e tentativas esgotadas.

## Execução na branch isolada

Arquivo novo `android/app/src/test/java/br/com/tata/entregas/SyncWorkerWorkManager4xxTest.kt` com **quatro** testes Robolectric via `androidx.work.testing.TestListenableWorkerBuilder<SyncWorker>`, chamando o método real `doWork()`. O teste constrói um banco **Room/SQLite temporário em arquivo**, com eventos e pontos GPS fictícios, e fecha/reabre o arquivo para verificar a recuperação após restart. MockK intercepta o limite de chamadas de `EntregasApi`, com credencial e corpo HTTP sintéticos: **nenhum serviço remoto é acessado**; a lógica real do Worker, a decisão do WorkManager e o DAO existente são executados.

| Teste real `doWork()` | Expectativa comprovada no runner |
|---|---|
| `pilot403WorkManagerFailurePreservesRoomAfterRestart` | Retorna `ListenableWorker.Result.Failure`; mantém `eventId`, `idempotencyKey`, payload e `syncState=failed` após reabrir Room; não produz `rejected` terminal |
| `domain422WithoutPerEventReceiptFailsEvenAfterRetryCap` | Com `runAttemptCount=2`, lote 422 sem recibo não vira sucesso; dois eventos preservam ordem e identidades, continuam elegíveis na fila |
| `concurrentGpsRetryAndUnreceipted409NeverReportSuccess` | 409 + falha transitória 503 de GPS: tentativa inicial `Result.Retry`; após limite `Result.Failure`; evento e ponto continuam retidos e recuperáveis após restart |
| `gpsBacklogContinuationOutranksPilot403WithoutEventLoss` | Com 301 pontos GPS e 403 no lote de eventos, os primeiros 300 pontos podem ser confirmados na simulação, e o saldo de 1 ponto causa `Result.Retry` mesmo após limite rápido; evento 403 continua `failed` e não vira `rejected` |

**Gatilho de regressão real:** `.github/workflows/deliveryos-android-room-recovery.yml` foi atualizada para monitorar o novo arquivo de teste e exigir o registro JUnit da classe `SyncWorkerWorkManager4xxTest` com pelo menos quatro testes. O workflow anterior e o teste `EventBatchHttpRejectionRoomTest` foram preservados.

## Falhas da bancada corrigidas sem alterar código produtivo

- Primeira CI do novo teste: o Kotlin do teste não compilava por um import de MockK que não existe no escopo de topo: `io.mockk.anyConstructed`. Removido o import: o método é resolvido no contexto da DSL `every { ... }`. **Não foi uma falha do Worker de produção.**
- Segunda CI: `SyncWorkerWorkManager4xxTest > initializationError`, classe recusada pelo JUnit antes de executar os quatro casos: o método de setup `@Before fun setup() = runBlocking { ... }` inferia um retorno não-`void`. Alterado para `@Before fun setup() { runBlocking { ... } }`. **Não foi prova do comportamento WorkManager** e não foi contado como aprovação.
- O workflow foi reforçado para imprimir somente a classe/tipo da falha JUnit em caso de erro, sem mensagens de payload completo. Não foram alterados aplicativos, endpoints, token real, GPS ou dados da operação.

## Provas verificáveis

**Último commit de código e CI nesta etapa:** `0e5a9f29a75c748e40fc2ceb59c4d76f1dbfc06b`. 

- [GitHub Actions Android Room Recovery #42457647491](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42457647491): `completed/success`, `BUILD SUCCESSFUL in 2m 11s`, **25 suítes, 268 testes, 0 falhas, 0 erros**, marcador `ANDROID_ROOM_4XX_REAL_DAO_TEST_PASS`. Isto inclui **264 testes anteriores + os 4 novos casos WorkManager**.
- [GitHub Actions Delivery OS silent fixture #42457647486](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42457647486): `completed/success`, **4/4 jobs** Linux, Windows, Edge e Reader→praça. Testa proteção de consoles **em laboratório**, não invisibilidade observada no caixa.
- Um teste com `Result.Failure` valida o resultado interno do `doWork()`, **não** comprova que o usuário viu erro no aplicativo ou que um scheduler real executou retries nos tempos de campo.
- Não houve `assemblePilot`, instalação de APK, emissão ou impressão de pedido, alteração do leitor SQL, base produtiva, token remoto, endpoint ou cliente real.

## Gate e próximo movimento seguro

**Comprovado:** `L6_WORKMANAGER_DO_WORK=PASS_IN_ROBOLECTRIC`; `L6_ROOM_SQLITE_RESTART=PASS_IN_LAB`; `L6_NO_4XX_FALSE_SUCCESS=PASS_IN_LAB`; `L6_ANDROID_GRADLE=268/268_PASS`; `L6_REGRESSION_CI=4/4_PASS`. 

**Ainda não comprovado:** comportamento real de WorkManager scheduler e gestão de energia, rede/HTTP HTTPS com credenciais reais, estado visual do motoboy, execução no Xiaomi, circuito de contenção de 4xx persistentes sem perda de fatos, sessão de operador e política de intervenção. `L6_PERSISTENT_REJECTION_POLICY=HOLD`; `N2_ATOMICITY=HOLD`; `L2_STATION_AUTHORITY=HOLD`; `L3_FIRST_NATIVE_DISPATCH=UNKNOWN`; `N4_IFOOD_IDENTITY=HOLD`; `HOME=HOLD`; `PRINT=HOLD`; **Delivery OS V1=0/8 etapas integralmente aceitas em campo**.

**Próximo passo técnico recomendado:** testar o scheduler periódico e o sinal visível de falha em bancada com app debug e backend local sintético, sem APK de campo; depois, quando houver autorização, validar o Xiaomi em ambiente restrito com evidência de tela, offline/reconnect, consentimento e recebimento. Não implementar descarte/quarentena terminal por código HTTP sem prova de recibo por evento.
