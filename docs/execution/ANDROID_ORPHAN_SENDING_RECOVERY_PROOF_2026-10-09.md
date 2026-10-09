# DeliveryOS Android — recuperação de registros legados presos em sending
Data: 2026-10-09
Base revalidada: `feat/deliveryos-android-room-recovery-fixed-20261009` @ `4879d89ed8aad12a9c971f73c21d2ebf1fd5e07d`
Branch desta frente: `feat/deliveryos-android-orphan-recovery-fixed-20261009`

## Falha de verdade
`GpsPointEntity.syncState` documenta `pending · sending · sent · failed · rejected`, mas o código do Room só buscava e contava `pending` e `failed`. Nenhum caminho do SyncWorker atual grava `sending`. Porém registros criados por uma versão anterior ou após interrupção com esse estado não eram recuperáveis: permaneciam no SQLite sem aparecer na fila B5 e sem nova tentativa.

O modelo de sincronização está em `android/app/src/main/java/br/com/tata/entregas/data/EntregasDatabase.kt`. A mesma lacuna afetava `outbox_event`.

## Prova RED — teste realmente executado
- Branch controle sem correção: `feat/deliveryos-android-orphan-recovery-20261009`.
- Commit teste/CI: `073c219b36316d43c3c14916b4132d6161313090`.
- GitHub Actions run [37930623940](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37930623940): `FAILURE`.
- Resultado `ANDROID_ROOM_JUNIT: suites=10, tests=66, failures=2, errors=0`.
- Falhas exatas: `sendingGpsStillInOfflineQueueAfterRestart` e `sendingOutboxStillInOfflineQueueAfterRestart`. Os asserts esperavam que o registro ainda aparecesse na fila após fechar/reabrir o banco.

## Implementação
Somente `EntregasDatabase.kt`:
- `nextBatch` e `pendingCount` de GPS e Outbox agora incluem também `sending`, além de `pending` e `failed`.
- `markSent`, `markFailed`, `markRejected` (GPS) e `markSent`/`markFailed` (outbox) aceitam `sending` como estado inicial elegível.
- `sent` e `rejected` continuam finais: a correção não os recoloca em fila.
- O `sending` de uma versão legada entra no reenvio idempotente com mesma chave persistida. A sequência de captura e o payload não são alterados.
- Sem migration Room, sem mudança de API, sem nova permissão e sem leitura de cliente.
- Testes em `RoomSyncRaceRecoveryTest.kt`: dois cenários fecham/reabrem SQLite, verificam contagem, lote, idempotencyKey, transição para `failed` e confirmação `sent`. 
- Workflow já existente da frente Room estendido para controle e correção, sem custos provisionados por este trabalho.

## Prova GREEN
- Branch corrigida: `feat/deliveryos-android-orphan-recovery-fixed-20261009`.
- Commit implementação: `f0fa41297733dec0621715c6b9ce51ce68cc360b`.
- GitHub Actions run [37930681653](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37930681653): **SUCCESS**.
- `ANDROID_ROOM_JUNIT: suites=10, tests=66, failures=0, errors=0`.
- Foxxy: `npm run -s test:platform:queue-depth` = **12/12 PASS** e `B5_FRESHNESS_HTML_RENDER: PASS`.
- Foxxy: `npx --no-install tsc --noEmit` = exit 0; `git diff --check` = exit 0.
- PostgreSQL isolado: `run-device-queue-depth-pg-tests.ts` = **12/12 PASS**.
- `npm run -s build:platform` = exit 0.
- HTTP e PostgreSQL isolados: `run-device-queue-depth-http-pg-tests.ts` = **8/8 PASS**.

## Fronteiras e lacunas
- Somente CODE_READY / TEST_PASS. Não houve implantação de APK, teste físico Android, deploy em produção ou alteração no serviço operacional da CAIXA.
- Esta rotina recupera apenas `sending` legados armazenados no Room. Não reproduz queda elétrica real, timeout de rede móvel nem duas instâncias reais do WorkManager no telefone.
- Reenviar com a mesma idempotencyKey depende do servidor de cada endpoint respeitar idempotência; contrato existente, não verificado de novo no mundo real nesta rodada.
- Continua pendente o ensaio Android físico e E2E autenticado.
- O Product System/Figma evolui em paralelo numa branch exclusiva do Claude: `feat/claude-product-ux-autonomous-20261009`. Não fazer merge cruzado sem Difference Check.
- Não tocar TATÁ Comanda, reader CAIXA, Teknisa, impressoras, Odhen, fiscal ou SEFAZ.

## Continuidade
Próximo passo independente: estudar a integridade de sessão/recibos após reinícios e executar ensaio E2E no emulador Android autorizado, se disponível, mantendo a prova física separada. Preferir uma única falha material reproduzida por vez.
