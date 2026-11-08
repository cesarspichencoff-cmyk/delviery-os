# Delivery OS V1 Itaim — L6 Term Ack: WorkManager não pode concluir sem recibo (08/11/2026)

## Escopo e decisão

Continuidade **exclusiva do Delivery OS** na PR [#137](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/137), branch `feat/gestor-shadow-observer-20261103` **DRAFT/HOLD**. Nenhuma outra frente foi alterada; sem caixa/Reader, SQL de produção, impressão, aparelho, GPS real, deploy, merge ou gasto. O plano vinculante [`DELIVERYOS_V1_LAUNCH_ACCEPTANCE_20261103.md`](./DELIVERYOS_V1_LAUNCH_ACCEPTANCE_20261103.md) permanece em **0/8 aceites completos de campo**. A Home é o produto principal e Entregas é o segundo módulo prioritário.

O usuário perguntou quanto falta: o fato de a CI ser verde prova componentes e regressões de laboratório, **não** prova que o fluxo L1→L8 funciona no Itaim. O caminho de finalização material exige fontes operacionais comprovadas, estados físicos, Home sustentada e, nesta frente L6, aparelho Android, identidade e consentimento, evento→servidor→recibo visível, offline/restart e segurança.

## Falha observável no código

`android/app/src/main/java/br/com/tata/entregas/sync/SyncWorker.kt` já exigia `confirmsTermAckOnPilot(ack, response)` para marcar a linha `term_ack` como `sent`. Entretanto:

- Um `ApiResult.Rejected` **422** de `/api/term/acknowledge` não marcava nenhuma falha durável no resultado do worker. O aceite permanecia `pending` no Room, mas, sem outra falha, `doWork()` devolvia `Result.success()`.
- Um HTTP **200 sem recibo individual completo** gerava `retryable=true`, mas após o limite das três tentativas rápidas também terminava `Result.success()`, com o aceite ainda `pending`.
- Não houve evidência de que uma dessas situações ocorreu em aparelho real. Esta é uma inconsistência comprovável na lógica do código, não uma alegação sobre produção.

**Correção conservadora:** introduzido `unconfirmedTermAck` quando qualquer ack pendente termina sem recibo remoto validado, inclusive 2xx incompleto, 4xx, falha temporária ou autorização recusada. Mantida a prioridade de saldo GPS e de tentativas rápidas preexistentes; quando estas acabam, `Result.failure()` impede afirmar que o trabalho terminou com sucesso. Não se altera protocolo HTTP, modelo Room, `TermAckDao`, consentimento, chave de idempotência, política de retenção ou descarte; o ack local continua `pending` para reconciliação.

**Prova positiva e negativa com Worker real:** foram acrescentados três casos no `SyncWorkerWorkManager4xxTest.kt`, que usam `TestListenableWorkerBuilder`, Room SQLite persistido em arquivo de teste, fechamento/reabertura e respostas HTTP mockadas:
1. `term422WithoutPerAckReceiptFailsAndSurvivesSqliteRestart`: `Result.failure()`, ack `pending` no banco após restart.
2. `malformedHttp200AckAtRetryCapNeverReturnsWorkerSuccess`: primeiro `Result.retry()`, depois `Result.failure()` no teto, ack continua `pending`.
3. `validStoredTermReceiptCompletesWorkerAndPersistsSentAfterRestart`: recibo com identidade, aparelho, termo, hash, unidade e status corretos autoriza `Result.success()` e `sent` persistente.

O gate da CI Android agora exige **7 testes** na suíte do `SyncWorker`, não só os quatro originais. A guarda estrutural antiga dos eventos HTTP 4xx foi atualizada para verificar a condição **mais forte** (`pilotAuthorizationBlocked || unreceiptedBatchBlocked || unconfirmedTermAck`), preservando o teste de mutação de falso sucesso. A primeira CI do novo Worker sinalizou corretamente a **guarda estrutural antiga não atualizada**; após ajuste dessa guarda, todos os cinco jobs passaram.

## Evidência de execução

**Commit de código testado:** `deecaf208f3070711fcd45e30751b8ef99f27995`.

- [GitHub Actions Android Room Recovery #42503703220](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42503703220): **completed/success, Gradle BUILD SUCCESSFUL, 26 suítes e 275/275 testes, zero falhas e zero erros**, incluindo os três cenários de termo.
- [GitHub Actions Delivery OS silent fixture #42503703221](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42503703221): **completed/success, 5/5 jobs**, com verificações estruturais, Chromium sintético e VM Windows isolada. Nenhum sistema de produção foi executado.

## Fronteira e próximos testes

**Provado em laboratório:** um ack sem recibo não vira `sent`, não apaga a evidência local e não encerra o Worker como `Result.success()` após o teto de tentativas; ack validado continua concluindo corretamente. `L6_TERM_WORK_RESULT=PASS_JVM_ROOM`.

**Não provado:** `L6_PILOT_TERM_SERVER_ACK=UNKNOWN`, `L6_XIAOMI=NOT_RUN`, `L6_HTTPS_REAL=NOT_RUN`, `L6_CREDENTIAL_RENEWAL_FIELD=UNKNOWN`, `L6_GPS_CONSENT_FIELD=UNKNOWN`, `L6_RIDER_UI_TERM_PENDING_VISIBILITY=UNKNOWN`, `L7_END_TO_END=HOLD`, `L8_FIELD_SILENCE=HOLD`. `HOME_LIVE=HOLD`, `PRINT=HOLD`.

**Próximo passo independente:** ensaio ponta a ponta em bancada autorizada com **servidor sintético local que emita recibos identificados**, confirmando o fluxo do mesmo ack no worker e a sinalização de pendência ao motoboy. Só depois considerar piloto supervisionado no Xiaomi. Sem encerrar a V1 por contagem bruta de testes e sem prometer data sem prova de campo.
