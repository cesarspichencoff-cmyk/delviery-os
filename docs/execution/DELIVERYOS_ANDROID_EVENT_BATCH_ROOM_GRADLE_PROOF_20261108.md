# Delivery OS Itaim — HTTP 4xx com DAO Room real e compilação Android (08/11/2026)

**Escopo:** continuação da PR #137 `feat/gestor-shadow-observer-20261103` em DRAFT/HOLD. VÉRTICE canônico revalidado: `cesarspichencoff-cmyk/vertice-runtime.` (ponto final), branch `vertice-active`, `VERTICE_ENTRY.md` SHA `912a02f932acc42e76cb1fb7d46b3f1f8a0c380d`. O caixa não foi usado como laboratório nesta rodada; `Foxxy` foi encontrado **offline**. O repositório é público e sua própria GitHub Actions foi utilizada sem provisionar servidores novos, instalar aplicativos ou contratar serviços.

## Problema e diferença verificada

O checkpoint anterior, [`DELIVERYOS_ANDROID_EVENT_BATCH_HTTP_REJECTION_POLICY_20261108.md`](./DELIVERYOS_ANDROID_EVENT_BATCH_HTTP_REJECTION_POLICY_20261108.md), introduziu a distinção `PILOT_AUTHORIZATION_BLOCKED` versus `UNATTESTED_BATCH_REJECTION` para eventos de lote HTTP 4xx e a marca de falha do WorkManager, preservando o `eventId` e a `idempotencyKey` no Room. O código havia passado em testes Kotlin **isolados** (13/13) e em inspeção estrutural Node, mas **não** havia sido compilado com o Android Gradle Plugin nem submetido ao DAO real.

**Reuso escolhido:** `android/app/src/main/java/br/com/tata/entregas/data/EntregasDatabase.kt`, `OutboxEventDao`, `RoomSyncRaceRecoveryTest.kt` e o workflow preexistente `.github/workflows/deliveryos-android-room-recovery.yml`. Não foi criado outro banco, formato, camada de fila ou runner persistente. A mudança não altera o protocolo de rede.

## Implementação mínima comprovada

1. **`EventBatchHttpRejectionRoom.kt`**: função interna `retainUnreceiptedEventBatch` que recebe a lista de `eventIds`, `ApiResult.Rejected`, informação de delegação e o banco Room existente. Rejeita IDs locais vazios, repetidos ou lista vazia **antes de qualquer escrita**; em lote válido chama **`db.outbox().markFailed(eventIds, rejection.reason)`** e retorna a classificação segura. Não escreve `sent`, não produz `rejected` terminal nem mexe em token.
2. **`SyncWorker.kt`**: o ramo `ApiResult.Rejected` passa pelo helper efetivo (em vez de reproduzir sua lógica inline), com o mesmo `db`, `ids`, `r` e `dispatch.delegationDenied`; mantém a lógica de erro visível e as prioridades já testadas para credencial e GPS.
3. **`EventBatchHttpRejectionRoomTest.kt`**: **6 métodos JUnit Robolectric com SQLite/Room em arquivo**, incluindo fechar e reabrir banco; 403 do piloto conserva identidade e não vira rejeição definitiva; 422 em lote de dois eventos conserva ordem, IDs, chaves e payloads; 409 reiterado mantém um único registro e incrementa tentativas; resposta atrasada não reabre `sent`/`rejected`; IDs locais inválidos não atualizam dados; 409 com delegação negada vira bloqueio de autorização, não erro de domínio.
4. **Teste estrutural já existente** `run-android-event-batch-4xx-source-contract-tests.cjs`: ampliado para inspecionar o **vínculo real** `SyncWorker → retainUnreceiptedEventBatch → OutboxEventDao`, recusar `markSent`/`markRejected` sem recibo, garantir falha antes de sucesso, manter prioridade GPS e proteger a invocação de credencial. **15/15 contraprovas** no runner Linux.
5. **CI Android reaproveitada:** `.github/workflows/deliveryos-android-room-recovery.yml` passou a rodar em PRs destinadas a `integration/deliveryos-v1-connected-20261102` quando os arquivos dessa política mudam. Usa checkout com credenciais não persistidas, Java 17, Gradle `testDebugUnitTest`; falha se não existirem ou não executarem as três suítes `EventBatchHttpRejectionTest`, `EventBatchHttpRejectionRoomTest` e `RoomSyncRaceRecoveryTest`. Sem gerar APK, sem serviços externos.
6. **Proteção de continuidade:** `.github/workflows/deliveryos-silent-fixture-windows.yml` passou a monitorar também os arquivos novos de helper e teste Room; uma alteração futura nesses arquivos aciona a inspeção estrutural, além da CI Android. Este ajuste do filtro constitui commit posterior ao teste Gradle e será avaliado separadamente pela CI.

## Prova real no GitHub, sem produção

**Código exato submetido ao teste:** commit `2fc2cceb23a8babfda73f97ac9f96737e99b0108` da PR #137.

| Verificação | Execução GitHub Actions | Resultado observado |
|---|---|---|
| Android Gradle `testDebugUnitTest` e Android Kotlin | [`42456327269`](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42456327269) | **`completed/success`**; `BUILD SUCCESSFUL in 2m 6s` |
| JUnit Android/Robolectric/Room | mesmo run | **24 suítes, 264 testes, 0 falhas, 0 erros** |
| Presença obrigatória das 3 suítes centrais | mesmo run | `ANDROID_ROOM_4XX_REAL_DAO_TEST_PASS` |
| Integração estática do worker, receptor, DAO e testes de reabertura | [`42456327270`](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42456327270) | **`completed/success`**, 4/4 jobs; `ANDROID_EVENT_BATCH_HTTP_4XX_SOURCE_PASS 15/15` |
| Regressões não relacionadas de Reader→praça, Edge e Windows isolado | mesmo run geral | 4/4 jobs `success` |

**Diferença quantitativa legítima:** a suíte Android anterior de 04/11 havia registrado 254/254 testes noutra revisão; esta versão compilada e testada por Gradle registrou **264/264** após adicionar 4 testes de política e 6 testes reais do Room. Isso **não** equivale a dez aceitações de operação nem substitui teste em aparelho físico.

**Falha corrigida durante a rodada:** a primeira execução da CI estrutural falhou em uma contraprova por supor que a instrução `db = open()` aparecesse apenas uma vez no novo teste, apesar de vários métodos a usarem. A verificação foi corrigida para localizar uma reabertura específica, e o teste executou novamente com **15/15**; a CI geral final ficou verde. Não ocultar a primeira falha nem chamá-la de problema Android.

## Limites remanescentes

- **O que está provado:** o compilador Android e o JUnit executaram com sucesso; a regra de retenção foi exercitada contra o Room/SQLite real em ambiente de laboratório, com fechamento/reabertura e respostas conflitantes. O teste adversarial confirmou que o Worker chama o mesmo helper, não uma cópia simulada do DAO.
- **O que não está provado:** execução completa de `SyncWorker.doWork()` com WorkManager no Android real e sessão de operador, sincronização via HTTPS com plataforma e piloto, efeito visual de falha percebido pelo motoboy, execução no Xiaomi, contagem real de falhas em operação, efeitos de energia/rede/GPS, ou política de quarentena de recusas 4xx repetidas.
- Os dados com `syncState=failed` continuam elegíveis a reenvio periódico. **Contenção definitiva de recusa persistente segue `HOLD`** para evitar que uma alteração sem contrato de recibo provoque descarte silencioso. O teste com respostas 403/409/422 é sintético; o SQLite e o código Android são reais no runner.
- **Efeito externo:** nenhum APK gerado/instalado; nenhum dispositivo remoto, servidor piloto, banco SQL do caixa, impressão, fila real, segredo, merge ou deploy alterado.
- `L6_HTTP_4XX_DAO=CODE_READY + ANDROID_GRADLE_TEST_PASS + ROOM_RESTART_TEST_PASS`; `L6_REAL_WORKMANAGER=NOT_RUN`; `L6_PILOT_HTTPS=NOT_RUN`; `L6_XIAOMI=NOT_RUN`; `N2_ATOMICITY=HOLD`; `L2_STATION=HOLD`; `L3_NATIVE_PRINT=UNKNOWN`; `N4_IFOOD=HOLD`; `HOME=HOLD`; `PRINT=HOLD`; **Delivery OS V1 = 0/8 aceitações integralmente comprovadas em campo**.

**Próximo passo útil:** ensaiar o `SyncWorker` completo e a transição do WorkManager com respostas HTTP locais sintéticas, falhas concorrentes de GPS e retry, usando banco descartável; depois homologar no Xiaomi com autorização operacional, mantendo o iFood/Teknisa e as impressoras bloqueados. Não interpretar `Result.failure()` como aviso visual ao operador sem verificar a tela.
