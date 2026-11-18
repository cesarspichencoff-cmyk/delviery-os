# Delivery OS Itaim — L6: rider-mobile real em Android moderno e bloqueio legado

**Data:** 08/11/2026. **Escopo:** PR #137, branch `feat/gestor-shadow-observer-20261103`, DRAFT/HOLD. **Base de código verificada:** commit `941f36dea8201dec3d902b68c68c64ac6ce851c0`. Este checkpoint registra uma fronteira real de emulação Android; não é homologação no aparelho físico ou liberação operacional.

## Problema confirmado

O ensaio anterior de WebView Android usava HTML inline fictício. Ao passar a carregar os arquivos **reais** de `src/entregas/ui/rider-mobile/` em emulador Android 10, o módulo `rider.js` não inicializava a fila do aparelho. A instrumentação registrou a prova sanitizada:

- Motor WebView **`74.0.3729.185`** no Android API 29;
- Console **`UNEXPECTED_TOKEN`**, documento principal carregado e ponte nativa presente;
- `rider.js` solicitado, mas seus módulos não chegaram a ser importados;
- Os arquivos locais existiam; faltava somente `favicon.ico`, irrelevante para a fila.

A causa material era incompatibilidade da versão antiga do WebView com a sintaxe JavaScript atual. **Não houve evidência de perda de eventos no Room nem falha real de servidor.**

## Alteração feita somente na branch de revisão

- `rider-mobile/index.html` inicia com controles operacionais ocultos de verdade (`hidden` + `display:none`), inclusive navegação.
- `rider-mobile/compat-classic.js` é um bootstrap ES5 externo e não lê dados de pedido; enquanto não há prova de compatibilidade mantém a área operacional bloqueada. Se o teste de recurso não concluir, apresenta mensagem compreensível e orientação de não repetir confirmações.
- `rider-mobile/compat-modern-probe.js` é um **módulo externo** que exercita optional chaining e nullish coalescing; apenas um motor que consiga carregá-lo libera a interface e carrega `rider.js` real. Não há `eval`, `new Function` nem JavaScript inline.
- `RiderRealScreenInstrumentedTest.kt` empacota a UI real **apenas no APK de teste**, intercepta HTTPS na memória (sem servidor, DNS externo ou rede de campo) e usa ponte Kotlin, Room/SQLite e WorkManager test scheduler reais. No motor antigo, exige HOLD visível, controles efetivamente ocultos e nenhuma mutação da fila. No motor moderno, exige fila nativa pendente, botão `syncNow` ligado ao scheduler real, aviso sem falso ACK e estado `failed` persistido com idempotência preservada e sem exibição do texto arbitrário `last_error`.
- `RiderWebViewBridgeInstrumentedTest.kt` recebeu sincronização explícita com a navegação assíncrona inicial da `MainActivity`, evitando que o carregamento posterior do app sobrescreva o HTML de laboratório.
- A workflow `.github/workflows/deliveryos-android-webview-emulator-lab.yml` exige os dois testes instrumentais por classe, usando `testcase.classname` (e não nome do XML), e executa API 29 e API 34 em jobs separados. Os dois modos são explícitos e verificáveis.

## Provas executadas da versão exata

- [Android WebView emulator lab #42525260903](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42525260903): **`completed/success`**. 
  - **Android 10, API 29, legacy:** 2/2 testes instrumentais, 0 falhas/erros; o HOLD de compatibilidade foi mostrado e controles não ficaram disponíveis.
  - **Android 14, API 34, modern:** 2/2 testes instrumentais, 0 falhas/erros; a UI `rider-mobile` real carregou, leu a outbox real do Room, apresentou estado pendente e de tentativa solicitada, agendou trabalho nativo sem executar o Worker e depois mostrou falha não confirmada sem vazar o erro bruto.
  - Os logs registram `ANDROID_WEBVIEW_INSTRUMENTED: counts={'RiderWebViewBridgeInstrumentedTest': 1, 'RiderRealScreenInstrumentedTest': 1} failures=0 errors=0` em **cada** job e `ANDROID_WEBVIEW_MODERN_OR_LEGACY_GATE_PASS_NO_REMOTE_RECEIPT`.
- [Android Room Recovery #42525260992](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42525260992): **`completed/success`**, **29 suítes, 294/294 testes, 0 falhas/erros**.
- [Delivery OS silent fixture #42525260916](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42525260916): **`completed/success`**; CI geral isolada.

**Falhas anteriores preservadas como aprendizado verificável:** o primeiro ensaio real não executava o módulo no WebView 74; a primeira matriz teve erro de compilação na leitura dos argumentos de instrumentação; depois o teste inline antigo apresentou corrida contra a navegação assíncrona da `MainActivity` no Android moderno. As três classes de problema foram corrigidas com mudanças distintas e novo ensaio completo — não foram ocultadas por rerun idêntico.

## O que esta prova NÃO autoriza

- O WorkManager de emulação **foi agendado, não executado** pelo teste da UI. `failed` foi induzido no DAO Room da bancada; **não é HTTP 4xx recebido de um servidor real**.
- Não houve HTTP/HTTPS de produção, token remoto, recibo individual `sent` do domínio, confirmação de entrega física, sincronização pós-Doze, teste de rede móvel, GPS consentido, instalação no Xiaomi, dados reais, autorização de publicação de pedidos, impressão ou deploy.
- O bloqueio antigo é apenas de **interface**. Não comprova isolamento universal de `@JavascriptInterface` em subframes nem segurança diante de conteúdo de servidor comprometido.
- A origem dos fatos na L1 e a Home operacional real da L4 permanecem HOLD; a V1 continua com **0/8 critérios integralmente aceitos em campo**. PR #135 TATÁ Comandas não foi alterada.

## Próximo gate de maior valor

Unificar as duas provas já separadas: **UI real no emulador → clique `syncNow` → WorkManager executado → HTTPS/HTTP local de laboratório com recibo por `event_id` → estado `sent` no Room → confirmação visível da MESMA identidade na tela**. Incluir uma resposta 4xx não atestada que preserve evento/idempotência e não mostre sucesso, reinício/reconexão e auditoria de origem da WebView. Este gate exige fixture segura de serviço de teste e não deve se transformar em alteração de servidor de campo. Após esse ensaio, somente com autorização operacional específica, testar Xiaomi e HTTPS real.

**Efeito operacional desta rodada:** zero. Nenhum processo, task, janela, software, SQL, Reader, impressão, GPS, credencial, pedido, merge, deploy ou custo foi introduzido no CAIXA_MOOCA ou Foxxy.
