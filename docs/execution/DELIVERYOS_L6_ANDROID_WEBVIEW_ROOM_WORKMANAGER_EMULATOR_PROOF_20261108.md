# Delivery OS Itaim — L6: WebView Android real → Room → WorkManager em emulador (08/11/2026)

## Missão e isolamento

Continuação somente da PR #137, branch `feat/gestor-shadow-observer-20261103`, **aberta e DRAFT/HOLD**. Provar uma fronteira antes não exercida: execução de JavaScript em um WebView **Android real**, usando a `EntregasJsBridge` efetivamente instalada na `MainActivity`, gravando no Room/SQLite e solicitando trabalho ao WorkManager no mesmo processo de teste. Tudo em emulador efêmero GitHub, sem `CAIXA_MOOCA`, Foxxy, Xiaomi, iFood, Teknisa, credencial, cliente, GPS real, produção, deploy ou merge.

## Código entregue

- `android/app/src/androidTest/java/br/com/tata/entregas/RiderWebViewBridgeInstrumentedTest.kt` — novo teste instrumental Android `AndroidJUnit4` usando `ActivityScenario<MainActivity>`; a página é **HTML fictício inline** inserido via `loadDataWithBaseURL`, na origem debug `https://10.0.2.2:5193/rider-mobile/`, sem consulta real ao host.
- Um clique DOM disparado no WebView chama `window.EntregasNative.recordOperationalEvent()` e `syncNow()`; ambos atravessam a implementação de produção de `EntregasJsBridge`, `MainActivity`, `OperationalEventRecorder` e `SyncScheduler`. A identidade `LAB_WEBVIEW_BRIDGE_*` e a ação `ConfirmTripDeparture` são totalmente fictícias.
- O teste lê `EntregasDatabase`/Room real e exige identidade, idempotência, sequência local positiva, estado `pending` e ausência de `sent` sem recibo. Exige também **um único job imediato `ENQUEUED`** no WorkManager.
- `WorkManagerTestInitHelper` impede que os Workers de rede executem por conta própria: **nenhum HTTP, backend, ACK remoto, GPS ou processamento do evento** é testado aqui. A página não é o código `rider.js` de produção; é apenas um botão de prova que exercita a ponte de produção.
- `.github/workflows/deliveryos-android-webview-emulator-lab.yml`: runner Linux descartável, emulador Android API 29 `google_apis`, sem janela de desktop na máquina de César; exige XML instrumental contendo ao menos um teste da classe alvo e zero falhas/erros. `workflow_dispatch` e gatilho PR; nenhuma configuração de produção.

**Commits:** `c511be1435d5d69a46f129456ff6f6c6913bb67b` (teste instrumental) e `c83355c7e0a94fe68a8aa80522c1880182ffcc88` (CI do emulador).

## Evidência exata — rodada da nova implementação

1. [Android WebView emulator lab #42521068118](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42521068118) — `completed/success`. O log registra `Starting 1 tests`, `Finished 1 tests`, `BUILD SUCCESSFUL in 2m 26s`, `ANDROID_WEBVIEW_INSTRUMENTED: tests=1 failures=0 errors=0` e `ANDROID_WEBVIEW_LAB_TEST_PASS_NO_FIELD_CLAIM`. Trata-se de prova instrumental em Android emulado, não simulação JavaScript em Chromium desktop.
2. [Android Room Recovery #42521068056](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42521068056) — `completed/success`, **29 suítes, 294/294 testes, 0 falhas/erros**.
3. [Delivery OS silent fixture #42521068042](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42521068042) — `completed/success`, CI geral em bancada, não prova da tela do caixa.

**Classificação:** `L6_REAL_ANDROID_WEBVIEW_JS_TO_NATIVE_BRIDGE=EMULATOR_TEST_PASS`; `L6_ROOM_OUTBOX_RECORD=EMULATOR_TEST_PASS`; `L6_IMMEDIATE_WORK_UNIQUENESS=EMULATOR_TEST_PASS`; `L6_WORKER_HTTP_FROM_ANDROID_WEBVIEW_TEST=NOT_RUN`; `L6_REMOTE_EVENT_RECEIPT=UNKNOWN`; `L6_XIAOMI_FIELD=NOT_RUN`.

## Segurança: limite independente

O teste de origem exata anterior (`OriginLockedClientTest`, 7 casos Robolectric) não demonstra isolamento de subframes, redirecionamentos, recursos de terceiros ou conteúdo comprometido. `WebView.addJavascriptInterface` é disponibilizado a frames/iframes; essa característica documentada do Android não é eliminada por `shouldOverrideUrlLoading` na navegação principal. **L8 permanece HOLD** até prova de isolamento/controle de conteúdo não confiável, em conjunto com o ensaio de aparelho. Não tratar a aprovação atual como segurança 10/10.

## Próximo teste de maior valor

Executar no emulador o **HTML/JS real do `rider-mobile`**, com respostas HTTP(S) sintéticas em servidor descartável, sem produção, demonstrando UI pendente → clique `syncNow` → Worker executado sob controle → recibo individual via HTTP local → `sent` persistido e observado na tela; incluir caso 4xx sem ACK (continua pendente) e reconexão. Não desativar TLS da variante de campo nem fabricar status do servidor. Depois, somente com autorização operacional delimitada, validar aparelho Xiaomi e endpoints HTTPS reais.

**Plano V1:** etapas L1–L8 ainda **0/8 integralmente aceitas em campo**. L1 pedidos/observações reais e L4 Home seguem HOLD; impressão, produção, deploy e efeitos externos não foram autorizados.
