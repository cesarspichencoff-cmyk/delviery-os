# Delivery OS Itaim — L6: recibo por identidade na tela Android (08/11/2026)

**Escopo:** PR #137, branch `feat/gestor-shadow-observer-20261103`, aberta e DRAFT/HOLD. Base de código verificada: `0ae7be8b674abacf395c3e18f7dbffdf3cc7ea46`. Nenhuma instalação no Xiaomi ou no caixa, deploy, merge, operação de pedido, GPS, serviço produtivo, gasto novo ou impressão.

## Diferença comprovada nesta continuidade

A última evidência de Android WebView provava o botão nativo, a gravação no Room e o aviso de pendência, mas **não** que a interface realmente reconhecia a transição de um evento específico para `sent` depois de avaliar um recibo individual.

A classe de instrumentação `RiderRealScreenInstrumentedTest.kt` foi ampliada usando `decideEventReceipt`, **o mesmo validador de identidade do código `SyncWorker`**:

1. A tela `rider-mobile` REAL é servida dos assets do APK de instrumentação, com a `MainActivity`, ponte Kotlin, SQLite/Room e WorkManager de laboratório.
2. Uma ação fictícia com `event_id` e `idempotency_key` estáveis passa por `pending` e `failed`. A interface informa incerteza, sem ecoar `last_error` arbitrário.
3. Recibo com lista vazia ou `event_id` estranho é classificado `Invalid`; a linha permanece `failed` e a UI **não** cria aviso de confirmação.
4. Recibo sintético, completo e correspondente à **mesma identidade**, é classificado `Apply`. O teste invoca então a **mesma operação DAO usada pelo Worker**, `db.outbox().markSent(sentIds)`; a tela real mostra aviso da confirmação de **1 ação**, preservando `sequenceLocal` e `idempotencyKey`.
5. A prova não supõe que a fila inteira ficou vazia. O primeiro ensaio da alteração falhou porque outra classe de instrumentação podia ter deixado evento independente pendente no mesmo Room. Retirou-se essa expectativa indevida, preservando o contrato por evento.

**Importante:** `markSent` é invocado explicitamente pelo teste após uma decisão sintética de recibo, **não** pelo `SyncWorker.doWork()` em um fluxo HTTP real de Android. A prova comprova a reconciliação `validator → Room → UI` no emulador, não o percurso remoto completo.

## Histórico de falha e contraprova

- O primeiro código de teste `a1deb6123ebbab177addae1ef9037c04410391e4` falhou na CI instrumental moderna em uma asserção `expected false, actual true`. A hipótese de interferência de outra linha pendente é coerente com o Room compartilhado dos testes; o log não indicou a linha precisa da asserção, então essa causa **não** foi provada diretamente.
- A correção `0ae7be8b674abacf395c3e18f7dbffdf3cc7ea46` retirou a exigência de fila globalmente vazia, mantendo checagem de `event_id` exato, `sequenceLocal`, idempotência, decisão `Invalid/Apply` e aviso positivo na tela verdadeira.
- [CI Android WebView #42527629695](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42527629695): **completed/success**. Android API 29 legado **2/2**, API 34 moderno **2/2**, ambos com 0 erros e 0 falhas. A CI confere cada `testcase.classname`, não apenas a existência do relatório.
- [CI Android Room Recovery #42527629766](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42527629766): **completed/success**, manutenção da regressão existente de **294/294** testes.
- [CI geral #42527629648](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42527629648): **completed/success**.

## Fronteira da prova e próximo gate

**Proven em laboratório:** `L6_ANDROID_REAL_UI_RECEIPT_IDENTITY=TEST_PASS_SYNTHETIC_RECEIPT`, `L6_LEGACY_WEBVIEW_HOLD=PASS`, `L6_ANDROID_ROOM_REGRESSION=PASS`.

**Não comprovado:** `L6_UI_TO_SYNCWORKER_TO_REAL_HTTP_TO_UI=UNKNOWN`; `L6_REMOTE_HTTPS_PILOT_ACK=UNKNOWN`; `L6_XIAOMI_REAL=NOT_RUN`; `L6_GPS_FIELD=NOT_RUN`; `L4_HOME_REAL=HOLD`; `L1_SOURCE_COMPLETENESS=HOLD`; `L7_L8_FIELD=HOLD`; `V1_FIELD_ACCEPTANCE=0/8`.

A camada `SyncWorker` **já tem** prova independente com HTTP real contra dois servidores loopback na suíte `SyncWorkerDualLoopbackHttpRoomTest` e com Room/SQLite em JVM. Não confundir essa prova independente com a execução conjunta no mesmo WebView Android.

**Próximo passo de maior valor:** configurar uma bancada de servidor HTTPS efêmero com identidade de laboratório e certificado de teste validado, executar **`SyncWorker.doWork()` real** após o clique na interface de emulador, observar recibo de `event_id` e persistência no Room, e verificar o aviso sem retocar manualmente a linha DAO; incluir HTTP 4xx incerto e queda/reconexão. Não instalar CA ou APK em dispositivos de campo, não relaxar hostname verification nem política TLS e não colocar segredos/chaves de campo no repositório. As proteções da ponte JavaScript em subframes ainda exigem auditoria própria antes do aceite final.

Todas as alterações desta rodada foram na branch de revisão; nenhum efeito operacional foi executado.
