# Delivery OS Itaim — WorkManager scheduler v2: unicidade e isolamento em laboratório (08/11/2026)

**Objetivo:** continuar a Etapa **L6 (Entregas)** do plano de lançamento, sem converter prova de laboratório em homologação de campo. O caminho crítico da V1 continua em **L1 (pedidos nativos completos)**, que condiciona L2/L3, Home e a jornada. O contrato de referência é [`DELIVERYOS_V1_LAUNCH_ACCEPTANCE_20261103.md`](./DELIVERYOS_V1_LAUNCH_ACCEPTANCE_20261103.md), matriz obrigatória L1–L8. **Status: 0/8 etapas aceitas integralmente em campo.**

## Diferença concreta abordada

A rodada anterior comprovou `SyncWorker.doWork()` com WorkManager de teste e banco Room real (268/268 testes), mas não comprovava que o **agendador** preservava a unicidade sob chamadas repetidas, que as rotinas `NOW` e `PERIODIC` eram independentes, nem que o agendamento legado fosse cancelado sem cancelar o v2.

Foi criado **somente um novo arquivo de teste**, `android/app/src/test/java/br/com/tata/entregas/SyncSchedulerWorkManagerTest.kt`, sem modificar `SyncScheduler`, `SyncWorker`, protocolo, Room ou qualquer tela. O teste usa `WorkManagerTestInitHelper.initializeTestWorkManager` e `getWorkInfosForUniqueWork`. Não dispara `doWork` no caso periódico: comprova o registro de agendamento, não passagem real de 15 minutos, execução com o app fechado ou limites de bateria/Doze.

| Cenário do teste JUnit | Prova em laboratório |
|---|---|
| `periodicUniqueKeepDoesNotStackNewJobs` | `SyncScheduler.ensurePeriodic` duas vezes mantém **uma** entrada `ENQUEUED` com o mesmo Work UUID |
| `repeatedNowRequestsUseKeepAndSingleWorkId` | `SyncScheduler.requestNow` duas vezes mantém **uma** entrada `ENQUEUED` com o mesmo Work UUID |
| `periodicAndNowHaveIndependentIdentities` | `UNIQUE_NOW` e `UNIQUE_PERIODIC` são distintos e coexistem, sem cancelamento cruzado |
| `legacyImmediateJobIsCancelledWithoutCancellingV2` | A entrada legada é cancelada e a entrada v2 permanece `ENQUEUED` no ensaio |

O workflow `.github/workflows/deliveryos-android-room-recovery.yml` passou a observar esse arquivo e exigir os **4 métodos** no relatório JUnit; não pode passar se eles forem omitidos do runner.

## Falha de teste investigada e corrigida

A primeira versão do teste legado criou `OneTimeWorkRequestBuilder<SyncWorker>()` **sem** a restrição de rede usada pela aplicação. O WorkManager da bancada iniciou o job imediatamente e o teste incorretamente esperava `ENQUEUED`: o run [#42458276313](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42458276313) terminou **FAIL, 271/272**, com `expected ENQUEUED but was RUNNING`. Esse resultado **não** aprova o teste e não prova regressão do produto; prova que o cenário inicial não reproduzia a política de conexão.

Corrigiu-se a fixture para criar o job legado com `Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED)`. Nenhuma implementação de produção foi alterada e nenhum outro mecanismo de agendamento foi introduzido. A nova execução demonstrou cancelamento do legado e preservação do v2.

## Evidência executada na versão exata

Commit de **código e testes** `86f0a6b0dda519f9dd36d5b500fcafa7f570e39d`, PR #137 **DRAFT/OPEN**:

- [GitHub Actions Android Room Recovery #42458524636](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42458524636): **completed/success**, `BUILD SUCCESSFUL in 2m 13s`, **26 suítes, 272 testes, 0 falhas, 0 erros**, recibo `ANDROID_ROOM_4XX_REAL_DAO_TEST_PASS`. Os 4 testes de scheduler foram acrescidos aos 268 anteriores.
- [GitHub Actions Delivery OS silent fixture #42458524651](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42458524651): **completed/success**, quatro jobs (Edge, fixture estática, Reader→praça e Windows sem console em VM de laboratório).
- **Efeitos operacionais = 0:** nenhum APK instalado/gerado para campo, nenhuma execução do worker com rede real, nenhum pedido, cliente, GPS real, SQL, Reader ou impressora acionados, nenhum merge/deploy, nenhum novo serviço ou gasto.

## Fronteiras e próximo passo

**Comprovado em laboratório:** `L6_ANDROID_GRADLE=272/272_PASS`; `L6_WORKMANAGER_DOWORK=PASS_ROBOLECTRIC`; `L6_WORKMANAGER_SCHEDULER_UNIQUE_NOW_AND_PERIODIC=PASS_ROBOLECTRIC`; `L6_LEGACY_SCHEDULE_CANCEL=PASS_ROBOLECTRIC`; `L6_ROOM_RESTART=PASS_ROBOLECTRIC`.

**Não comprovado:** `L6_REAL_15_MIN_TIMER=UNKNOWN`; `L6_BACKGROUND_BATTERY_DOZE=UNKNOWN`; `L6_RIDER_VISUAL_ERROR=UNKNOWN`; `L6_REAL_HTTPS_AND_RECEIPT=UNKNOWN`; `L6_PERSISTENT_4XX_QUARANTINE=HOLD`; `L6_XIAOMI=NOT_RUN`; `L6_ACTOR_AND_TERM_ACK=HOLD`.

**Caminho crítico do produto:** `L1_NATIVE_SNAPSHOT_ATOMICITY=HOLD`; `L2_STATION_ROUTING=HOLD`; `L3_FIRST_NATIVE_DISPATCH_AND_PHYSICAL_READY=HOLD`; `L4_HOME_LIVE=HOLD`; `L5_CHECKOUT_PHYSICAL=HOLD`; `L7_INTEGRATED_JOURNEY=HOLD`; `L8_FIELD_ACCEPTANCE=HOLD`. `PRINT=HOLD`, `HOME=HOLD`. **V1 0/8 aceites operacionais**.

**Próximo avanço material:** retornar ao caminho crítico L1 e à prova de captura íntegra no cenário real **apenas após validação de risco e autorização estreita** para qualquer SQL transacional de produção. A frente L6 poderá testar agendamento real e aviso visual em um dispositivo de bancada autorizado sem liberar o Xiaomi operacional. Não multiplicar validações offline de scheduler quando a falta decisiva for prova de campo.

**Estado de prova:** CODE_READY + CI_TEST_PASS; não DEPLOYED, WORLD_PROVEN nem HUMAN_ACCEPTED.
