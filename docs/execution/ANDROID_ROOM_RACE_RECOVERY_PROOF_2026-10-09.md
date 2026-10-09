# DeliveryOS — Android Room: recuperação de estado após respostas concorrentes
Data: 2026-10-09
Base: `feat/deliveryos-android-http-recovery-green-20261009` @ `ad368798cdf0d9622b3b0f57d580baee1b315e46`.
Branch de correção: `feat/deliveryos-android-room-recovery-fixed-20261009`.
**Classificação: CODE_READY + TEST_PASS**, não DEPLOYED, não WORLD_PROVEN em aparelho físico.

## Falha de verdade (Red)
O WorkManager utiliza `UNIQUE_NOW` e `UNIQUE_PERIODIC` distintos. Seus jobs podem receber respostas sobre o mesmo item em ordens diferentes. Em `EntregasDatabase.kt`, os métodos `GpsPointDao.markFailed/markRejected/markSent` e `OutboxEventDao.markFailed/markSent` faziam `UPDATE` sem condição para o estado anterior.

Cenário realista: worker A envia ponto; worker B confirma e chama `markSent`; resposta antiga de A é timeout e chama `markFailed`. O item anteriormente confirmado volta à fila — ou vira `rejected` por uma resposta de outra execução. Similarmente, a outbox pode regredir de `sent` para `failed`.

**Prova RED em CI JVM + Room SQLite (Robolectric):**
- Branch controle, **sem correção**: `feat/deliveryos-android-room-recovery-20261009`, commit `38d04364e38d99085ec239e35c9a3265f438dbf3`.
- GitHub Actions run [37928169812](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37928169812) — **FAILURE**: `ANDROID_ROOM_JUNIT: suites=10, tests=64, failures=3, errors=0`.
- Falharam precisamente `confirmedOutboxEventStaysConfirmedAfterLateFailure`, `definitivelyRejectedGpsCannotBeRevivedByLateSuccess` e `confirmedGpsNeverReentersQueueOnLateTimeout`.
- O primeiro ensaio de infraestrutura (run 37927819166) não compilou por import incorreto de `ApplicationProvider`. Foi substituído por `RuntimeEnvironment` do Robolectric nos dois lados. Não tratar esse primeiro ensaio como prova da falha funcional.

## Correção mínima (Green)
Arquivo `android/app/src/main/java/br/com/tata/entregas/data/EntregasDatabase.kt`:
- Transições de `gps_point` para `sent`, `failed` ou `rejected` agora exigem `syncState IN ('pending','failed')`.
- Transições de `outbox_event` para `sent` ou `failed` igualmente exigem estado elegível.
- Condições são parte do mesmo `UPDATE` SQLite, evitando a corrida entre SELECT e UPDATE.
- `sent` e `rejected` passam a ser finais para essas rotas, mesmo após restart; falha transitória em `pending` continua `failed`, elegível ao próximo lote.
- Sem migrar schema Room, alterar payload, recusar retry de falha genuína ou relaxar autorização.

Arquivo de prova `android/app/src/test/java/br/com/tata/entregas/RoomSyncRaceRecoveryTest.kt`:
- 5 testes Robolectric sobre banco SQLite **persistido em arquivo**, com close/reopen;
- estados finais de GPS não regridem após timeout/rejeição tardia;
- estado final de outbox não regride;
- pontos/eventos realmente pendentes voltam ao lote após restart com mesmas chaves de idempotência.
Workflow isolado: `.github/workflows/deliveryos-android-room-recovery.yml`, permissões read-only, JDK 17, Android Gradle, sem dispositivo real, sem deployment.

**Prova GREEN em CI JVM + Room SQLite:**
- GitHub Actions [37928177884](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/37928177884) no commit `cb551b4b10182b6161dbeeb37afee5d0ef26abcc`: **SUCCESS**, `ANDROID_ROOM_JUNIT: suites=10, tests=64, failures=0, errors=0`.
- Código efetivo da correção no commit `c39adfb9c542774ceaa9708df8b09e0cdea83c25`.

## Regressão independente Foxxy
Na mesma worktree da branch corrigida:
- `npm run -s test:platform:queue-depth`: **12/12 PASS** + `B5_FRESHNESS_HTML_RENDER PASS`;
- `npx --no-install tsc --noEmit`: exit 0;
- PostgreSQL local isolado `run-device-queue-depth-pg-tests.ts`: **12/12 PASS**;
- `npm run -s build:platform`: exit 0;
- HTTP + PostgreSQL local `run-device-queue-depth-http-pg-tests.ts`: **8/8 PASS**;
- `git diff --check`: exit 0.

## Fronteiras preservadas
- **Nenhuma operação foi executada na CAIXA_MOOCA**, SQL Teknisa, TATÁ Comanda, impressão, Odhen/fiscal/SEFAZ ou produção DeliveryOS.
- Nenhum aparelho Android físico ou emulador externo foi ensaiado. Robolectric com SQLite não equivale a WORLD_PROVEN na rua.
- Nenhum merge em main nem deploy; as branches da frente TATÁ Comanda permanecem independentes.
- A corrida é reproduzida e corrigida em unit/integration tests JVM, não em duas instâncias reais do WorkManager sobre rede móvel. Esse último cenário permanece para ensaio de campo.
- A classificação HTTP incompleta ou infraestrutura indisponível continua com as regras anteriores; esta frente protege exclusivamente estados da fila local.

## Próximo passo de maior valor
Ensaiar duas execuções reais do WorkManager concorrendo sobre Room em emulador/telefone de teste (sem dados de cliente), validando que um recibo tardio não reabre item confirmado. Separadamente, aprimorar monitoração de `sending` antigo caso existam linhas legadas desse estado; isso não foi comprovado nesta rodada.
