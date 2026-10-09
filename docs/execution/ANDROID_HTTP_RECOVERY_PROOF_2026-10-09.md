# DeliveryOS — recuperação HTTP do Android e preservação da fila
Data: 2026-10-09
Branch de entrega: `feat/deliveryos-android-http-recovery-green-20261009`
Base canônica da rodada: `feat/deliveryos-b5-queue-freshness-20261009` @ `b37bf89633feb1c2e04c6ee544fa2b955571f2f3`.
Status: **CODE_READY + TEST_PASS** (JVM Android e regressão Product/B5). `DEPLOYED=false`, `PHYSICAL_ANDROID_PROVEN=false`.

## Problema
No `EntregasApi.kt` anterior, `org.json.JSONException` ao interpretar um HTTP **2xx** caía no `catch` final e voltava como `ApiResult.Rejected("resposta inesperada do servidor", 0)`.
O `SyncWorker.kt`, ao receber `Rejected` no envio de pontos GPS, executa `gpsPoints().markRejected(ids,...)`. Portanto um lote possivelmente persistido no servidor podia ser incorretamente considerado rejeitado localmente. O servidor *não comprovou* rejeição: a falha era apenas de decodificação de resposta. Mesmo problema conceitual com HTTP 408 e 429, classificados como 4xx definitivos.

## Controle RED real
- Branch de teste anterior, sem implementação: `feat/deliveryos-android-malformed-receipt-20261009` @ `4fbb89aa8eb03d0aae559ab8cd3c2d2b9bb48522`.
- GitHub Actions run **37926725871**, `failure`.
- Falha de compilação `Unresolved reference 'interpretarRespostaHttp'` em `HttpResponseRecoveryTest.kt` — o teste antecedeu a função.
- Não confundir: esse RED prova ausência de implementação, não prova de teste de rede de dispositivo real. O fluxo anterior `JSONException -> Rejected` está evidenciado no código base.

## Mudança GREEN
- `android/app/src/main/java/br/com/tata/entregas/sync/EntregasApi.kt`: cria classificador de resposta HTTP testável e usado de fato por `request`.
- HTTP 2xx + JSON válido = `Ok`; 2xx + JSON inválido = `Retryable`, preservando o lote e sua chave idempotente para nova tentativa.
- HTTP 401 continua `Unauthorized`, HTTP 400 legítimo continua `Rejected`.
- HTTP 408/429 se tornam `Retryable`; 5xx continua `Retryable`.
- `HttpURLConnection.disconnect()` movido para `finally`, inclusive no caminho de IOException.
- `android/app/src/test/java/br/com/tata/entregas/HttpResponseRecoveryTest.kt`: sete testes JVM (2xx inválido/válido, 204 vazio, 401, 400, 408+429, 503); `RobolectricTestRunner`, sem aparelho.
- `.github/workflows/deliveryos-android-http-recovery.yml`: CI isolado com Java 17, Android Gradle, permissões de leitura; sem deploy, segredos ou emulador.

## Provas realizadas
- GitHub Actions run **37927062116** no commit `9b9af0e1970969b5304bd4dc50d5f99a27f61ad8`: **SUCCESS**.
- `BUILD SUCCESSFUL`; **9 suites / 59 testes JUnit / 0 failures / 0 errors**.
- Foxxy: `npm run -s test:platform:queue-depth` = **12/12 PASS** + renderização HTML do B5 PASS.
- Foxxy: `npx --no-install tsc --noEmit` = **exit 0**.
- Foxxy: `git diff --check` entre base e branch = **PASS**; apenas 3 arquivos nesta frente antes deste documento (cliente Android, teste Android, CI).
- Nenhum teste ou operação usou serviço da CAIXA, banco Teknisa, leitor TATÁ, impressão ou produção.

## Limites e risco residual
- Alteração validada no JVM/Robolectric, não instalada em telefone Android físico e não validada em rede de operadora real.
- O fluxo existente do `SyncWorker` conserva os registros locais diante de `Retryable` e mantém chaves de idempotência; o teste acima cobre a *classificação* HTTP, não uma prova física end-to-end completa.
- HTTP 2xx com JSON *válido mas semanticamente incompleto* continua a depender dos contratos específicos por endpoint (GPS já passa pelo `decideGpsReceipt`). Não declarar validação universal de recibos.
- Proteção de recurso `disconnect` foi compilada em CI; não houve teste separado de vazamento de socket.
- Sem merge em `main`, sem deploy, sem custos operacionais criados.

## Próximo passo independente e seguro
Ampliar ensaios de falha HTTP controlada + persistência de Room (e.g. execução interrompida após resposta) em emulador/JVM, sem depender do TATÁ Comanda. A prova física B5 permanece separada e pendente.
