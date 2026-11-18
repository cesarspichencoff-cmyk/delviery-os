# Delivery OS Itaim — L6: Worker Android real + HTTPS + Room + tela rider-mobile (08/11/2026)

**PR:** #137; branch `feat/gestor-shadow-observer-20261103`, permanece **OPEN/DRAFT/HOLD**. **HEAD de execução:** `2cf3a34a6a1334f934f71c2aa317339b0c48859a`. Dados inteiramente fictícios; nada de caixa, Foxxy, Xiaomi, cliente, produção, iFood, Teknisa, GPS, instalação, merge, deploy, impressão ou novo serviço contratado.

## Lacuna fechada no laboratório

A etapa anterior já comprovava separadamente: (A) o `SyncWorker.doWork()` com HTTP real em JVM Robolectric contra dois servidores loopback, e (B) o `rider-mobile` real no Android com uma transição `failed → sent` aplicada manualmente pelo teste ao DAO após um recibo sintético. **Ainda faltava provar tudo junto, sem o teste marcar `sent` no Room.**

Novos arquivos exclusivos da branch de revisão:

- `tests/android/https_two_server_fixture.py`: dois servidores HTTPS de laboratório **diferentes**, ligados apenas a `127.0.0.1:8080` (plataforma) e `127.0.0.1:5193` (piloto), acessíveis pelo emulador via `10.0.2.2`. A plataforma fictícia autentica o aparelho, devolve um token sem privilégio real e emite uma delegação exclusivamente para o piloto. O piloto rejeita qualquer Authorization diferente da delegação fictícia. Primeira tentativa de um evento fixo: HTTP 422 sem recibo por evento. Segunda tentativa **idêntica**: HTTP 200 com recibo `ok:true` para o mesmo `event_id`. Identidade, sequência, comando e chave de idempotência precisam coincidir nas duas tentativas; um terceiro envio é proibido pelo verificador.
- `tests/android/run_https_lab.sh`: execução **somente** no workspace do runner do GitHub. Gera CA e certificado TLS novos para cada rodada, incluindo SAN IP `10.0.2.2`, válidos por um dia; configura uma *resource overlay* temporária **exclusivamente na variante debug do runner**, confiando apenas nessa CA e nas raízes do sistema. O certificado privado, a CA privada e a alteração temporária da configuração de rede **não são commitados**. Não existe `trust-all`, override de `HostnameVerifier` ou downgrade para HTTP.
- `android/app/src/androidTest/java/br/com/tata/entregas/RiderHttpsWorkerEndToEndInstrumentedTest.kt`: instrumentação no emulador Android 14; abre a **UI verdadeira** por assets do APK instrumental, com HTTPS interceptado **somente na WebView** para servir a interface/JSON de sessão fictício. O comando falso é colocado no Room pelo `OperationalEventRecorder`; o motoboy toca o botão `syncNow` **real** e o `TestDriver` libera a execução do trabalho que o WorkManager realmente agendou. O `SyncWorker` e seu `EntregasApi` fazem requisições **HTTPS reais** à dupla plataforma/piloto da bancada, com TLS do Android. Na primeira tentativa o Worker termina como `FAILED`, mantendo a linha `failed` no Room; a UI não mostra ACK. Após novo toque, uma nova solicitação de WorkManager executa o Worker, valida o recibo individual remoto, marca **ele próprio** `sent` e a tela mostra a confirmação. `sequenceLocal` e `idempotencyKey` permanecem iguais. A UI não recebe token da plataforma ou delegação.
- `.github/workflows/deliveryos-android-https-end-to-end-lab.yml`: workflow PR com emulador efêmero API 34 e verificação de XML por `testcase.classname`. Bloqueia variáveis de acesso a dados externos; aceita apenas uma instância instrumental sem falhas, além das duas tentativas HTTPS comprovadas no log da fixture.

**Efeito operacional:** zero. O script **não foi executado no caixa** nem nos computadores da equipe.

## Provas do GitHub (commit exato)

- [Strict HTTPS end-to-end #42546954053](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42546954053) — **COMPLETED/SUCCESS**, Android emulado API 34. Logs: `LAB_HTTPS_LOCAL_SERVERS_REACHABLE`, `Finished 1 tests`, `BUILD SUCCESSFUL in 2m 30s`, `LAB_HTTPS_TWO_IDENTICAL_EVENT_ATTEMPTS_RECEIVED`, `ANDROID_REAL_HTTPS_WORKER_UI: cases=1 failed=0 errors=0`, `ANDROID_REAL_HTTPS_WORKER_UI_LAB_PASS_NOT_FIELD_PROVEN`. O Worker real **executou duas vezes**; não houve `markSent` manual pelo teste.
- [Android Room Recovery #42546953905](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42546953905) — **COMPLETED/SUCCESS**, 29 suítes, **294/294** testes sem erro ou falha.
- [WebView emulator lab #42546953853](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42546953853) — **COMPLETED/SUCCESS**, legado API 29 **2/2**, moderno API 34 **2/2**, sem falhas; preserva a tela de bloqueio seguro no WebView antigo.
- [Delivery OS silent fixture #42546953825](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42546953825) — **COMPLETED/SUCCESS** após **uma** repetição isolada do job Windows. A primeira tentativa falhou com `ONE_SHOT_TIMEOUT` aguardando 6000 ms, sem evidência de regressão no código relacionado; a segunda passou e registrou `NATIVE_READER_ONE_SHOT_NO_CONSOLE_LAB_PASS ... NO_FOCUS_CHANGE NO_PII`. **A causa da instabilidade de tempo no runner Windows continua não comprovada**, e reincidência exige investigação específica, não reruns indefinidos.

## Delimitação da prova

**PASSOU apenas em ambiente isolado:** `L6_NATIVE_WORKMANAGER_TO_STRICT_HTTPS_TO_ROOM_TO_REAL_UI = EMULATOR_TEST_PASS`; `L6_UNATTESTED_422_PRESERVES_EVENT_AND_IDEMPOTENCY = PASS`; `L6_MATCHED_SERVER_RECEIPT_PERSISTED_BY_WORKER = PASS`; `L6_PLATFORM_TOKEN_NOT_SENT_TO_PILOT = LAB_ENFORCED`; `L6_WEBVIEW_LEGACY_HOLD = PASS`.

**Ainda sem prova:** instalação e testes em **Xiaomi físico**, HTTPS e autenticação com servidor operacional autorizado, ação humana gerada pelo próprio `rider-mobile` (neste teste o evento é pré-semeado pelo produtor nativo), queda real de rede móvel/retorno automático do WorkManager, Doze/bateria/GPS, expiração/renovação de token em campo, identidade real de usuário, proteção universal da interface JavaScript em subframes, retenção, e aceitação integral de L1/L4/L7/L8. O comando e o token do laboratório não são identidade/autorização reais.

**V1:** permanece **0/8 gates integralmente homologados em campo**. L1 ainda precisa comprovar a fonte real de comandas com observações; L4 Home requer dados reais; L6 exige teste autorizado no aparelho; L8 inclui segurança WebView/iframe.

## Próximo trabalho de maior valor

1. Fechar teste adversarial de segurança da ponte em `iframe` e origem do JS, com prova instrumental de que frames de terceiros não podem chamar comandos nativos; somente depois considerar exposição a conteúdo web produtivo.
2. Tornar reproduzível a geração da ação pela **tela verdadeira** do motoboy (não pré-semeada), mantendo os mesmos recibos HTTPS.
3. Submeter a autorização humana para teste limitado no Xiaomi físico com endpoints autenticados de laboratório/infra autorizada; não instalar nem abrir produção no caixa.

Toda execução foi na PR, com fronteiras de produção preservadas.