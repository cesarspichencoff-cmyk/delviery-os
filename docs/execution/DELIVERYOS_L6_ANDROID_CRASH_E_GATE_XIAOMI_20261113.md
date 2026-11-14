# L6 — Android: `Process crashed`, morte do renderizador do WebView e gate do Xiaomi

Frente B (Entregas/Android), Foxxy, 13–14/11/2026. Branch `work/fable-entregas-android-20261113`,
base `8c6ee549`. Nada foi enviado ao remoto, nada rodou em aparelho físico, a CI não foi reexecutada.

## 0. Síntese

1. **O que sabemos.** Sem tratamento de `onRenderProcessGone`, a morte do renderizador do WebView
   derrubava o processo inteiro do aplicativo do motoboy — e com ele o serviço de captura da
   viagem. Reproduzido de três formas no emulador Android 14, com a `MainActivity` real e o cliente
   de produção. Corrigido: o aplicativo agora sobrevive, troca só a tela e volta para a página do
   motoboy. Vermelho antes, verde depois, 4 mutações vermelhas.
2. **O que é hipótese.** Que foi isso que derrubou o run **43221183916** da CI. A assinatura
   sanitizada daquele run é idêntica à do renderizador **morto** (não à do renderizador quebrado),
   mas a mesma assinatura sairia se o sistema matasse o próprio aplicativo.
3. **O que falta validar.** O log daquele run (a API devolve 403 sem credencial de administrador);
   a correção na CI; tudo em aparelho físico.
4. **Risco.** A CI passou no HEAD `458b3510` com o **mesmo** código Android que reprovou em
   `ac4491ae`: a falha é intermitente e pode voltar por outra causa. O script agora rotula a causa.
5. **Próxima ação mais segura.** Rodar a CI nesta branch e ler os rótulos novos se reprovar; depois
   o gate do Xiaomi (§10).
6. **O que não fazer agora.** Não mexer em `ram-size`/`heap-size` da CI — memória não é causa
   provada. Não declarar a causa da CI fechada.

## 1. Bancada

| item | valor |
|---|---|
| máquina | Foxxy, Windows 11, Git Bash, Java 17.0.19, Gradle 8.9, `adb` 1.0.41 |
| emulador | Android 14 (`UE1A.230829.050`), `google_apis` x86_64, WebView **113.0.5672.136** |
| opções | `-no-window -no-snapshot -noaudio -no-boot-anim -gpu swiftshader_indirect` (as da CI) |
| aparelho físico | `adb devices -l` vazio no início; nenhum comando foi enviado a aparelho físico |

**Adaptações para rodar `tests/android/run_https_lab.sh` no Foxxy** (o script roda sem edição):

1. `run_https_lab.sh`, `run_webview_lab.sh` e `android/gradlew` saem do Git com CRLF
   (`core.autocrlf=true`) e o Bash não os executa. Refeitos na worktree com
   `git -c core.autocrlf=false checkout`; conteúdo versionado igual, `git status` limpo.
2. Ambiente: `ANDROID_HOME`, `platform-tools` no `PATH`, `ANDROID_SERIAL=emulator-5554` (equivale
   a `-s` em todo `adb`, inclusive os do script e do Gradle) e `MSYS2_ARG_CONV_EXCL='/CN='`, senão
   o MSYS transforma o `-subj "/CN=..."` do `openssl` em caminho do Windows.
3. O script sobrescreve e **apaga** `android/app/src/debug/res/raw/deliveryos_lab_ca.crt` e
   `android/app/src/debug/res/xml/network_security_config_debug.xml`. Neste HEAD os dois são
   **rastreados**; depois de cada rodada: `git checkout -- android/app/src/debug`.

## 2. Linha de base (antes de qualquer mudança)

`bash ../tests/android/run_https_lab.sh` em `android/`, AVD `deliveryos_api34` (4 núcleos; o
emulador elevou a RAM sozinho — `Increasing RAM size to 2560MB`, `MemTotal` 2.534.120 kB):

- saída 0 em 87 s; **JUnit: 1 caso, 0 falha, 0 erro, 0 ignorado**;
- fixture: tentativas **1 e 2** do lote, nenhuma 3ª (`LAB_HTTPS_TWO_IDENTICAL_EVENT_ATTEMPTS_RECEIVED`).

## 3. Reprodução do crash

| # | tentativa | resultado |
|---|---|---|
| 2a-1 | app real (`am start`), `kill -9` no `:sandboxed_process` como root | processo do app **morto em 35 ms** (`exited due to signal 9`); buffer de crash **0 linha**; `chromium: [ERROR:aw_browser_terminator.cc(112)] Render process (…) kill (OOM or update) wasn't handed by all associated webviews, killing application.` |
| 2a-2 | teste instrumentado novo, cliente de produção, `chrome://crash` | `INSTRUMENTATION_RESULT: shortMsg=Process crashed.`; buffer de crash 189 linhas; `Fatal signal 5 (SIGTRAP)`; abort `Render process (…)'s crash wasn't handled by all associated webviews, triggering application crash.` |
| 2a-3 | o mesmo teste, `webViewRenderProcess.terminate()` (renderizador morto, não quebrado) | `Process crashed.`; buffer de crash **0 linha**; mesma mensagem de 2a-1 |
| 2b | o E2E existente (cliente `LabSite`), `kill -9` no renderizador 2 s depois de ele subir | saída 1; JUnit 1 caso, **1 falha**; `Instrumentation run failed due to Process crashed`; `ANDROID_HTTPS_FAILURE_CATEGORY UNCLASSIFIED`; `DIAGNOSTIC_CLASSES_AND_SOURCE_LINES_ONLY 0`; `LAB_HTTPS_CRASH_CLASSES_ONLY 0` |
| 2c | AVD novo e descartável da mesma imagem, `-memory 1024 -cores 2`; E2E 3 vezes | **3/3 verde** (68 s, 61 s, 54 s). O emulador recusou 1024 MB e subiu com 2560 MB (`MemTotal` 2.534.552 kB), 2 núcleos |
| 2d | o mesmo AVD com 1.150 MB incompressíveis presos em `tmpfs` (`MemAvailable` 277.648 kB, troca livre de 888 para 170 MB) | 1/1 verde; **0** morte pelo `lmkd` |
| grep | `System.exit`, `exitProcess`, `killProcess`, `StrictMode`, orquestrador, `largeHeap` em `android/` | 0 ocorrência |

Ressalvas de 2c: o AVD era novo, mas ficou 4 h ligado antes das rodadas (interrupção da sessão) —
a carga do primeiro boot **não** foi reproduzida. RAM menor que 2560 MB não é alcançável por opção
neste emulador (37.1.11).

O filtro de crash do próprio script da CI, aplicado aos buffers colhidos: 2a-2 → 
`LAB_HTTPS_NATIVE_SIGSEGV`, `LAB_HTTPS_NATIVE_FATAL_SIGNAL_5`, `LAB_HTTPS_CRASH_CLASSES_ONLY 2`;
2a-1 e 2a-3 → `LAB_HTTPS_CRASH_CLASSES_ONLY 0`.

## 4. Comparação com a CI

Lido pela API pública do GitHub, sem credencial:

| run | workflow | HEAD | conclusão |
|---|---|---|---|
| 43221183916 | strict HTTPS end-to-end lab | `ac4491ae` (12/11) | **failure** — passos 5 e 6 do job 131192802656 |
| 43538649025 | strict HTTPS end-to-end lab | `458b3510` (14/11) | success |
| 43538649019 | WebView emulator lab (3 jobs) | `458b3510` | success |
| 43538649015 | Room Recovery | `458b3510` | success |

- **Os logs não puderam ser lidos**: `/actions/jobs/<id>/logs` devolve 403
  (`Must have admin rights to Repository`). As anotações públicas só dizem
  `Process completed with exit code 1`.
- `git diff --stat ac4491ae 458b3510` em `android/`, `tests/android/`, no workflow e em
  `src/entregas/ui/rider-mobile/`: **3 arquivos**, todos do diagnóstico de falha
  (`https_failure_category_v1.py`, o teste dele, 3 linhas no caminho de falha do script). O código do
  app, o teste, a fixture e o workflow são **idênticos** no run vermelho e no verde. Entre
  `458b3510` e a base desta branch, nesses caminhos: nenhuma diferença.

**Veredito.**

- *Morte do renderizador sem tratamento derruba o aplicativo sem frame Java* — **CONFIRMADA** (§3).
- *Foi isso que derrubou o run 43221183916* — **INDETERMINADA, não provada.** A favor: a assinatura
  sanitizada do run (1 falha, `Process crashed`, zero frame Java, zero classe nativa) é byte a byte
  a de 2b. Refutada uma variante: renderizador **quebrado** teria impresso
  `LAB_HTTPS_NATIVE_FATAL_SIGNAL_5`. Contra: o aplicativo morto diretamente por SIGKILL daria a
  mesma saída; nenhuma tentativa local (2 núcleos, memória pressionada) produziu morte espontânea; e
  a CI passou depois com o mesmo código. É falha intermitente, de causa não observada.

## 5. Correção

`android/app/src/main/java/br/com/tata/entregas/ui/MainActivity.kt`:

- `OriginLockedClient.onRenderProcessGone` (`:437`) — `final`, devolve `true` sempre e avisa quem
  hospeda o WebView. A classe virou `open` para os clientes de laboratório herdarem; por isso
  `onReceivedSslError` (`:417`) também virou `final`.
- `MainActivity.onRendererGone` (`:171`) — tira o WebView morto da tela e o destrói; cria outro pela
  **mesma** função que monta a tela (`newRiderWebView`, `:110`: mesmas travas, chave de ponte nova);
  reaproveita o cliente travado que estava instalado; recarrega `/rider-mobile/` da origem travada,
  nunca a URL onde o morto estava.
- `RendererReloadBackoff` (`:469`) — mortes em sequência esperam 0 s, 2 s, 5 s, 15 s; um minuto sem
  morrer zera. Uma página que mata o renderizador a cada carga não vira laço.
- Serviço de localização, fila Room e WorkManager não passam por esse caminho.

Os três clientes de laboratório (`RiderHttpsWorkerEndToEnd…`, `RiderRealScreen…`, `RiderGpsReview…`)
passaram a herdar de `OriginLockedClient`.

**Vermelho → verde** — `RendererGoneRecoveryInstrumentedTest` (2 casos: quebrado e morto):
antes, `Process crashed` nos dois (§3, 2a-2 e 2a-3); depois, `OK (2 tests)` em 10,9 s.

**Mutações** (cada uma compilada, instalada e executada no emulador):

| mutação | resultado |
|---|---|
| M1 — sem tratamento (`return false`) | `Process crashed`, buffer de crash 0 linha |
| M2 — trata, mas não troca o WebView | 2/2 falham: `DEAD_WEBVIEW_WAS_NOT_REPLACED_BY_A_LIVE_ONE_ON_THE_RIDER_PAGE` |
| M3 — troca, mas com `WebViewClient()` frouxo | `RECOVERED_WEBVIEW_LOST_THE_ORIGIN_LOCK`; o caso seguinte cai em `Process crashed` (o WebView frouxo divide o renderizador) |
| M4 — troca, mas recarrega `about:blank` | 2/2 falham: `DEAD_WEBVIEW_WAS_NOT_REPLACED_BY_A_LIVE_ONE_ON_THE_RIDER_PAGE` |

4 de 4 vermelhas, zero cega.

## 6. Depois da correção

| comando | resultado |
|---|---|
| `am instrument … RendererGoneRecoveryInstrumentedTest` | `OK (2 tests)` |
| `:app:testDebugUnitTest` (JVM) | 31 classes, **309 casos, 0 falha, 0 erro, 0 ignorado** — 4 novos em `RendererGoneClientTest` |
| `run_https_lab.sh` (renderizador + E2E, um processo) | saída 0; **5 casos, 0 falha, 0 erro, 2 ignorados** (os dois cenários abaixo, que só rodam quando pedidos); fixture: tentativas 1 e 2, nenhuma 3ª. Repetido com o script final: igual |
| `LAB_HTTPS_SCENARIO=renderer-death run_https_lab.sh` | saída 0; 1 executado, 0 falha, 2 ignorados; fixture: 1 e 2, nenhuma 3ª |
| `run_webview_lab.sh modern` | **3 casos, 0 falha** (`BUILD SUCCESSFUL`). O script saiu 1 no passo seguinte, só no Foxxy: o MSYS converteu o `/sdcard/…` do `adb pull` em caminho do Windows. Com a conversão desligada a captura vem (215.563 bytes) |

**Morte do renderizador com ação na fila** (`renderer-death`, cenário novo do mesmo E2E): o motoboy
toca "Cheguei", a ação fica `pending` no Room, e então o renderizador é morto. O WebView é trocado,
a tela recarregada mostra de novo a ação "guardada", a linha do Room é a mesma (id, sequência,
pendente) e o mesmo evento segue: 422 sem recibo, nova tentativa, recibo, tela. É a contraparte
verde de 2b.

A repetição de 2b por fora (`kill -9` durante o E2E, já com a correção) **não conta como prova**: o
vigia disparou depois do fim do teste e não matou nada. Foi substituída pelo cenário acima.

**Suíte instrumentada inteira** (`:app:connectedDebugAndroidTest` sem filtro de classe, com a
fixture HTTPS no ar — uma configuração que nenhum laboratório da CI usa):

| árvore | casos | falhas | ignorados |
|---|---|---|---|
| HEAD original `8c6ee549` (worktree temporária) | 23 | **2** | 0 |
| com a correção, mesmo comando | 27 | **2** — as mesmas | 2 |
| com a correção, mais `webviewExpected=modern` | 27 | **1** — só a do E2E | 2 |

As duas falhas são **pré-existentes**, iguais no HEAD original:

- `RiderRealScreenInstrumentedTest` — `expected:<modern> but was:<null>`: o teste exige o argumento
  `webviewExpected`, que só o laboratório de WebView passa. Com o argumento, passa.
- `RiderHttpsWorkerEndToEndInstrumentedTest` (o caso de sempre) —
  `Worker did not accept HTTPS event receipt` quando roda no mesmo processo depois de outras
  classes. Isolado (como na CI) e depois da classe do renderizador, passa. A interferência **não foi
  investigada**.

Os 4 casos a mais são os 2 do renderizador (verdes) e os 2 cenários (ignorados sem a variável).
Nenhuma falha nova.

## 7. Offline e reconexão

**O que já existia** (JVM, sem aparelho; todos dentro dos 309 verdes): fila que sobrevive a reinício
(`RoomSyncRaceRecoveryTest`, 11 casos, entre eles `offlineBacklog250DrainsWithoutNewCapture` e
`sendingOutboxStillInOfflineQueueAfterRestart`), mesmo `event_id` não duplica e ordem dos toques
vira ordem do lote (`OperationalEventRecorderTest`), 422 mantém a idempotência até o recibo
(`SyncWorkerDualLoopbackHttpRoomTest`), pedidos repetidos de envio viram um trabalho só
(`SyncSchedulerWorkManagerTest`).

**O que faltava.** Nenhum teste exercia a restrição de rede de verdade: o E2E usa o driver de teste
do WorkManager, que libera o envio por decreto (`setAllConstraintsMet`).

**Escrito e rodado** — `actionTakenOfflineWaitsForTheNetworkAndIsNeverSentTwice`
(`LAB_HTTPS_SCENARIO=offline-reconnect`), no emulador, com o WorkManager **real**:

1. a tela carrega; o teste liga o modo avião (`cmd connectivity airplane-mode enable`) e confere que
   não há rede validada;
2. o "Cheguei" da tela grava a ação no Room e a tela mostra "guardada";
3. por 6 s seguidos (12 leituras): sem rede, ação `pending`, **0 tentativa**, trabalho `ENQUEUED`;
4. o modo avião é desligado e **ninguém toca em nada**: o WorkManager envia sozinho, a fixture
   responde 422 sem recibo, a ação vira `failed` e a tela diz "sem confirmação do servidor";
5. o motoboy toca em "Tentar sincronizar ações": segundo lote, recibo, `sent`, tela confirma 1 ação;
6. a fixture confere por fora: lotes **1 e 2** com a mesma identidade (id, chave de idempotência,
   sequência local, comando) e **nenhum terceiro** — um recibo, zero duplicata.

Resultado: saída 0 em 68 s; 1 executado, 0 falha; `airplane_mode_on` = 0 no fim.

**Mutação M5** — tirar a exigência de rede do envio imediato (`SyncWorker.kt:525`): o cenário
reprova com `LAB_OFFLINE_ACTION_LEFT_PENDING expected:<[pending]> but was:<[failed]>`. O teste não é
cego.

Limites: um evento só (a fixture aceita um por lote); rede cortada por modo avião, não por
`svc wifi/data`; a volta da rede no emulador leva ~8 s para ser validada. Troca Wi-Fi/dados e rede
ruim de verdade ficam para o Xiaomi (§10, X9–X12).

## 8. O que mudou na CI (não reexecutada)

- `tests/android/https_process_death_signature_v1.py` — lê `main`/`system` e imprime **só rótulos
  fixos e contagens**: renderizador morto, morte não tratada (morto ou quebrado), app ou
  renderizador mortos pelo `lmkd`, ANR, processo do app morto. 6/6 casos sintéticos
  (`run_https_process_death_signature_tests.py`) e conferido contra os logcats reais de 2a-1, 2a-2
  e 2a-3. Motivo: SIGKILL não deixa nada nos dois filtros que o script já tinha.
- `tests/android/run_https_lab.sh` — chama o classificador no caminho de falha; roda
  `RendererGoneRecoveryInstrumentedTest` antes do E2E, no mesmo processo (e avisa, na falha, que um
  SIGSEGV de renderizador é o `chrome://crash` proposital desse teste); aceita
  `LAB_HTTPS_SCENARIO=renderer-death|offline-reconnect` (§6 e §7), que **não** estão ligados ao
  workflow.
- `.github/workflows/deliveryos-android-https-end-to-end-lab.yml` — passa a exigir 2 casos
  **executados** da classe nova além do caso do E2E; ignorado não conta. A checagem foi extraída e
  executada sobre o JUnit real do Foxxy: passa.
- `tests/android/run_https_failure_category_tests.py` nunca importou `diagnose` (`NameError` no
  HEAD); agora importa e passa 3/3. Nenhum workflow o chama.
- `ram-size`/`heap-size`: **não tocados**.

## 9. O que NÃO foi provado

- A causa do run 43221183916 (§4).
- A correção e o classificador na CI do GitHub — só no Foxxy.
- Qualquer coisa em aparelho físico, inclusive o Xiaomi.
- Morte **espontânea** do renderizador por falta de memória: todas as mortes foram provocadas
  (`kill -9`, `terminate()`, `chrome://crash`).
- A captura de GPS atravessando a morte do renderizador com o serviço **ligado**: provado que o
  processo é o mesmo antes e depois, não que pontos continuaram chegando.
- Recarga depois de mortes em sequência no aparelho: o recuo está provado em JVM, não em WebView.
- WebView diferente da 113 (a imagem `google_apis` 34) e Android diferente do 14.
- Ordem de **dois** eventos offline no aparelho: a fixture aceita um evento por lote; a ordem está
  provada em JVM (`OperationalEventRecorderTest.ordemDosToquesViraOrdemDoLote`).

## 10. Gate do Xiaomi — roteiro (documento, NÃO executado)

Base: `docs/etapa-4-8/FIELD-GATE-ANDROID.md` §3–§5 (as consultas `Q1`–`Q7` são as de lá). Tudo
abaixo é `NOT_RUN`. `X` = serial do Xiaomi; `PKG` = `br.com.tata.entregas.pilot` (ou `.debug`).
Todo `adb` leva `-s $X`. O que depende de `run-as` só existe no build `debug`.

| # | item | como, a partir do Foxxy | PASS se |
|---|---|---|---|
| X0 | identificar o aparelho | `adb -s $X shell getprop ro.product.model; getprop ro.build.version.release; getprop ro.miui.ui.version.name; getprop ro.mi.os.version.name` | modelo, Android e MIUI/HyperOS anotados no registro |
| X1 | WebView do aparelho | `adb -s $X shell dumpsys webviewupdate \| grep "Current WebView package"` | versão anotada; a tela sai do `compatibilityHold` |
| X2 | permissão de localização | **humano**: aceitar o termo e tocar em "Durante o uso do app". Conferir: `adb -s $X shell dumpsys package $PKG \| grep -E "ACCESS_(FINE\|COARSE\|BACKGROUND)_LOCATION"` | o termo aparece **antes** do pedido; `ACCESS_FINE_LOCATION: granted=true` |
| X3 | "o tempo todo" | o mesmo comando de X2 | `ACCESS_BACKGROUND_LOCATION` **ausente** — o app não a declara de propósito (`AndroidManifest.xml:7`); o sistema não oferece "Permitir o tempo todo", e isso é o correto |
| X4 | serviço em primeiro plano na viagem | `adb -s $X shell dumpsys activity services $PKG \| grep -E "TripLocationService\|isForeground"` | `isForeground=true` depois da saída confirmada; notificação visível |
| X5 | GPS real em viagem | **exige humano na rua** (≥ 500 m). Evidência: `Q2`, `Q5` | trilha coerente; `Q5` vazia (sem repetição, sem buraco) |
| X6 | tela apagada | `adb -s $X shell input keyevent KEYCODE_SLEEP`; 5 min; `Q2` | pontos continuam chegando |
| X7 | Doze | `adb -s $X shell dumpsys battery unplug; dumpsys deviceidle force-idle; dumpsys deviceidle get deep`; 5 min; `dumpsys deviceidle unforce; dumpsys battery reset` | `get deep` = `IDLE`; depois do `unforce`, `Q2` tem pontos com `occurred_at` dentro da janela; `Q5` vazia. Repetir com `force-idle light` |
| X8 | restrição de segundo plano | `adb -s $X shell am get-standby-bucket $PKG; cmd appops get $PKG RUN_ANY_IN_BACKGROUND; dumpsys deviceidle whitelist \| grep $PKG` | bucket ≤ 20; `RUN_ANY_IN_BACKGROUND: allow`; app na lista depois de o humano pôr "Sem restrições" |
| X9 | perda de rede | `adb -s $X shell svc wifi disable; svc data disable` (o `adb` por USB continua) | `dumpsys connectivity \| grep -c VALIDATED` = 0; `Q2` para de crescer |
| X10 | fila offline | 10 min sem rede, com um "Cheguei". Build `debug`: `adb -s $X exec-out run-as $PKG cat databases/entregas.db > entregas.db` (e `-wal`, `-shm`), depois `SELECT syncState,count(*) FROM gps_point GROUP BY 1` e o mesmo em `outbox_event` | linhas `pending` crescem; a tela mostra a ação "guardada"; nada some |
| X11 | volta da rede | `adb -s $X shell svc wifi enable; svc data enable` | sem tocar em nada, `Q2` recebe todo o intervalo com `captured_offline` verdadeiro |
| X12 | troca Wi-Fi → dados → Wi-Fi | no meio da viagem: `svc wifi disable` (dados ligados), 3 min, `svc wifi enable` | `Q4`: `fatos = chaves`; `Q5` vazia |
| X13 | sincronização | `adb -s $X shell dumpsys jobscheduler \| grep -A4 $PKG` antes e depois de X11 | o job roda sozinho na volta da rede |
| X14 | deduplicação | `Q4`, `Q5` | `fatos = chaves`; nenhuma `sequence_local` repetida |
| X15 | recibos | tela do motoboy; build `debug`: `SELECT syncState,count(*) FROM outbox_event GROUP BY 1` | "confirmação do servidor para N ação(ões)" só depois do recibo; linhas `sent` = ações feitas |
| X16 | estados da entrega | **humano**: Confirmar saída → Cheguei → Entreguei, com o console aberto | cada toque vira o estado correspondente no console; nenhum estado sem toque |
| X17 | fim de viagem | encerrar no console; `adb -s $X shell dumpsys activity services $PKG` | o serviço some em até ~15 s; indicador "GPS DESLIGADO"; `Q2` para |
| X18 | morte do renderizador | build `debug`, no Chrome do Foxxy: `chrome://inspect` → WebView do app → navegar para `chrome://crash`. Antes e depois: `adb -s $X shell pidof $PKG` | o **mesmo** pid; a tela volta sozinha; X4 continua verdadeiro. Instalar o APK de teste no aparelho para rodar `RendererGoneRecoveryInstrumentedTest` é decisão do César |
| X19 | app tirado dos recentes | **humano**: deslizar o app com a viagem ativa; depois X4 | o serviço continua. Se cair: repetir com o app **travado** nos recentes e anotar os dois resultados |
| X20 | reinício no meio da viagem | `adb -s $X reboot` (decisão do humano); sem abrir o app: `adb -s $X shell pidof $PKG`; abrir o app | a fila de X10 está intacta e sincroniza. Anotar se o processo voltou sozinho |
| X21 | relógio | print da configuração; `adb -s $X shell date -u` contra o servidor | data e hora automáticas; diferença < 2 min |
| X22 | bateria | `adb -s $X shell dumpsys batterystats --reset` antes; depois de ≥ 2 h: `dumpsys batterystats $PKG` | consumo anotado; o limite aceitável é decisão do César |

**Armadilhas MIUI/HyperOS — e o que o código faz, ou não faz.**

| armadilha | proteção no código | o que sobra para o humano |
|---|---|---|
| Início automático desligado: o app não volta depois de boot ou de ser morto | **nenhuma própria.** Não há receptor de boot do app; `RECEIVE_BOOT_COMPLETED` (`AndroidManifest.xml:19`) só serve ao reagendamento do WorkManager, que precisa do processo poder subir | ligar "Início automático"; X20 mede |
| Economia de bateria por app | **nenhuma.** O código não lê nem pede isenção (`isIgnoringBatteryOptimizations`: 0 ocorrência). Só lê o modo economia **global** para ajustar a captura (`TripLocationService.kt:496`, `:585`) | pôr "Sem restrições"; X8 confere |
| Limpeza dos recentes mata o app | `stopWithTask="false"` (`AndroidManifest.xml:58`) e `START_REDELIVER_INTENT` (`TripLocationService.kt:262`) seguram no Android puro. Contra a limpeza da MIUI, que encerra o pacote, **não há defesa em código** | travar o app nos recentes; X19 mede |
| Restrição de atividade em segundo plano | serviço em primeiro plano do tipo `location` (`AndroidManifest.xml:57`, `TripLocationService.kt:379`), iniciado com o app na frente (`TripLocationService.kt:75`). Sem `ACCESS_BACKGROUND_LOCATION`, de propósito | X4, X6, X7 |
| O sistema mata o renderizador do WebView para liberar memória | **agora tratado**: `MainActivity.kt:437` e `:171`. Antes, derrubava o app e a captura | X18 |
| Notificação bloqueada | pedida no Android 13+ (`MainActivity.kt:95`); negar não impede a viagem | conferir que a notificação do serviço aparece (X4) |
| Fila sem rede | restrição `CONNECTED` do WorkManager (`SyncWorker.kt:492`), envio único por `KEEP` (`:530`), inserção idempotente no Room (`EntregasDatabase.kt:163`) | X9–X14 |

O que a MIUI faz de fato com cada item **não foi medido**: as linhas acima dizem o que o código
garante, não o que o aparelho vai fazer.

## 11. Entregas → Copiloto: o que existe e o menor passo que falta

O que já leva fato de Entregas até o Copiloto (somente leitura, nada editado aqui):

1. Aparelho → plataforma: lote de GPS em `/api/gps/batch` (`src/platform/runtime/rota-ingestao.ts:20`)
   vira `gps_batch_received` em `platform.event_log`.
2. Aparelho → piloto: ações do motoboy em `/api/events/batch` (`tools/entregas_pilot_server.ts:940`).
3. Piloto → plataforma: `EntregasLiveConsumer` (`src/platform/runtime/entregas-live-consumer.ts:208`),
   instanciado em `src/platform/bin/entregas-source-ingest.ts:84`, atrás de
   `DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED` (`src/platform/config/entregas-source-ingest-config.ts:79`).
   O próprio módulo declara que não está ligado ao runtime assíncrono (`:4`) e que não grava evento
   `real` (`:13`).
4. Adaptador: só `trip_created`, `trip_started`, `trip_return_started`, `trip_closed`
   (`src/platform/ingest/entregas-shadow-adapter.ts:35-41`) e `delivery_ready`/`delivery_removed`
   (`:44-47`).
5. Projeção: `TIPOS_DA_OPERACAO_VIVA` (`src/platform/runtime/handler-operacao-viva.ts:29-39`).
6. Leitura: `lerRealidadeDeEntregas` (`src/platform/leitura/realidade-de-entregas.ts`), chamada em
   `tools/product_system_server.ts:414-427`.
7. Copiloto: `/api/copiloto` (`tools/product_system_server.ts:709-727`) monta
   `entregas_observadas` com `copilotoEntregasLeitura`
   (`src/product/viewmodels/copiloto-entregas-leitura.ts:34`) e as células com `celulasCopilotoV33`;
   a tela usa em `src/product/ui/surfaces/copiloto.js:160` e `:302`.

O que isso entrega hoje: **contagem de viagens na projeção histórica, por unidade e modo** — não
viagens ativas, não fila, não atraso (o próprio contrato diz, `copiloto-entregas-leitura.ts:8-9`).

**Lacunas, da menor para a maior:**

- **Home.** `/api/home` (`tools/product_system_server.ts:612-628`) chama `homeDaOperacao` (`:184`),
  que só conhece a demanda do Gestor e a saúde do Reader. Não lê Entregas. *Menor passo:* entregar a
  `homeDaOperacao` a mesma `LeituraDeRealidade` que `/api/copiloto` já lê e publicá-la como mais
  uma fonte, com os mesmos três estados (indisponível, sem evidência, observado). Uma chamada e uma
  linha de fonte; nenhum SQL novo.
- **"Cheguei" e "Entreguei" não chegam ao Copiloto.** `arrival_detected` e `delivery_confirmed` são
  "não equivalentes por desenho" no adaptador (`entregas-shadow-adapter.ts:23-26`): fato de uma
  entrega não vira estado da viagem. Falta um tipo próprio na plataforma, como `delivery_ready`
  ganhou. É decisão de produto, não de código.
- **Modo real.** O consumidor do passo 3 não grava `real`. Em operação real, o que chega ao log por
  esse caminho é só o GPS do passo 1. Ligar o passo 3 em `real` é ativação — decisão do César.

## 12. Limpeza

Conferido ao final, no Foxxy:

- emulador encerrado (`adb emu kill`): nenhum `qemu-system`/`emulator.exe`;
- daemons do Gradle parados (`gradlew --stop`): nenhum `java.exe`;
- fixtures: nenhum `python` além dos três que já existiam antes desta sessão (mesmos PIDs);
- portas 5193, 8080, 5554 e 5555 livres; `adb devices -l` vazio;
- AVD descartável `deliveryos_cilike_tmp` apagado — `deliveryos_api34` e
  `deliveryos_connected_20261102` intactos, sem `-wipe-data`;
- worktree temporária do HEAD original removida e podada;
- modo avião do emulador desligado antes de encerrar.

Ficou de pé o servidor `adb`, que já estava no ar.

## 13. Commits desta frente (locais, sem push)

| commit | o que é |
|---|---|
| `548502b9` | a correção e o teste instrumentado da morte do renderizador; clientes de laboratório herdam |
| `03cec0d2` | a regra em JVM (`RendererGoneClientTest`) |
| `a93f126e` | classificador sanitizado, teste do renderizador no laboratório HTTPS, exigência no workflow |
| `e9e7c120` | cenários `offline-reconnect` e `renderer-death` do E2E |
| o seguinte | este documento e o aviso do SIGSEGV proposital no script |

## 14. Depois da integração (14/11) — a CI rodou

A frente foi integrada ao branch de trabalho da V1 (merge `ba90c3dc`, zero arquivo em comum com a frente do Gestor) e publicada
na PR #137 em rascunho. Em `adbdf0a1` os três laboratórios Android ficaram `success` (runs 43570466464, 43570466367 e
43570466369), com o workflow HTTPS exigindo 2 casos executados de `RendererGoneRecoveryInstrumentedTest`. Isto fecha o item
"a correção, o classificador e a nova exigência do workflow na CI" da §9. Todo o resto da §9 continua não provado, e o
roteiro do Xiaomi (§10) continua inteiro em `NOT_RUN`.
