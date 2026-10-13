# DeliveryOS — perda real de endpoint HTTPS, persistência Room e recuperação Android

**13/10/2026 · Estado: PROVA NATIVA DE BANCADA APROVADA NO ESCOPO DE TRANSPORTE. NÃO É PILOTO OPERACIONAL INTEGRADO.**

## Identidade e isolamento

- Fonte canônica do produto: `cesarspichencoff-cmyk/delviery-os` no commit **`9121c252d864a8b74ef33e8c9e5c0d81d687ffa3`** (PR #108 em HOLD). PR #106 e #109 não foram alterados.
- Cópia de bancada em worktree temporária `deliveryos-android-real-offline-lab-20261013`: mesmo commit, com **apenas** uma CA própria em `android/app/src/debug/res/raw/deliveryos_lab_ca.crt` e **uma nova classe de testes** `NativeOfflineNetworkLabTest.kt`. Nada disso foi incorporado ao produto, homologado ou publicado como build.
- APK debug do laboratório SHA-256: `726C2A58CB42B3C9A8A0319FE79AE798DC4C315A7457D8066EFDA55DB87EBA8A`; build `assembleDebug assembleDebugAndroidTest --offline` **BUILD SUCCESSFUL**.
- Ambiente: Foxxy, AVD `deliveryos_api34`, Android 14/API 34; `adb shell settings get secure location_mode` respondeu **0 antes, durante e depois**. Nenhum sensor, serviço de GPS, coordenada ou pedido real. Eventos fictícios identificados como `simulated` e unidade `LAB-NATIVE-20261013`.
- HTTPS temporário **somente em `127.0.0.1:5193`**, acessado pelo emulador em `https://10.0.2.2:5193`. CA de laboratório explícita no build debug, SAN exato, TLS com verificação normal do hostname; **sem** trust-all, HTTP em claro ou credenciais reais. Fixture de resposta simula o contrato mínimo `/api/events/batch` e guarda somente ID/contagem de requisições.

## Experimento faseado, com rede efetivamente inacessível

O teste não altera nenhuma flag de “offline” dentro da aplicação. A indisponibilidade é **real ao nível TCP/HTTPS** porque o endpoint na porta 5193 **não estava escutando**.

1. **Fase 1 — servidor fora do ar:** a instrumentação Android adicionou **um** `OutboxEventEntity` sintético ao SQLite/Room, chamou a classe real `EntregasApi.sendEvents` no endpoint ausente e recebeu `ApiResult.Retryable` (falha efetiva de conexão). Registrou falha com `markFailed`, fechou e reabriu o banco; o mesmo `event_id`, `idempotency_key`, estado `failed`, uma tentativa, e **1 item ainda enviável** sobreviveram à reabertura. Pontos GPS pendentes: **zero**.
2. **Fase 2 — HTTPS reaberto:** iniciou-se uma fixture HTTPS temporária com certificado válido para o emulador. Novo processo de instrumentação reabriu **o mesmo banco Room**, leu o evento falhado, usou a mesma classe `EntregasApi.sendEvents`, e validou o **recibo individual** através de `decideEventReceipt` do produto. Somente após `Apply` com ID exato o evento foi marcado `sent`. Nova reabertura do Room: **0 pendentes**; servidor: **1 ID único, 1 requisição, 0 erros**.
3. **Fase 3 — replay idempotente:** após forçar encerramento do app no emulador, outra instrumentação enviou novamente o **mesmo event_id e mesma chave** por HTTPS. O servidor contabilizou **2 requisições, 1 evento único, 1 duplicata e 0 erros**. Room continuou com **0 pendentes**.
4. **Limpeza de teste:** `stage99_lab_cleanup` excluiu o arquivo SQLite criado exclusivamente para a prova. **4/4 testes instrumentados passaram**, incluindo a limpeza. Nenhum APK assinado ou versão de produção foi produzido.

## Evidências reproduzíveis e não sensíveis

- [Teste nativo Kotlin, somente bancada](evidencias/native-https-offline-2026-10-13/NativeOfflineNetworkLabTest.kt).
- [Fixture temporária HTTPS, somente bancada](evidencias/native-https-offline-2026-10-13/https-fixture.cjs).
- [Fase 1: indisponibilidade e persistência](evidencias/native-https-offline-2026-10-13/phase01-no-endpoint.txt).
- [Fase 2: recibo e limpeza da fila](evidencias/native-https-offline-2026-10-13/phase02-endpoint-restored.txt).
- [Fase 3: mesmo ID sem duplicação](evidencias/native-https-offline-2026-10-13/phase03-idempotency.txt).
- [Limpeza instrumentada](evidencias/native-https-offline-2026-10-13/phase99-cleanup.txt).
- [Contagem independente do servidor](evidencias/native-https-offline-2026-10-13/native-receipts.json).

**Não há certificados, chaves privadas, tokens, coordenadas nem identificadores pessoais nos arquivos publicados.** A fixture é um receptor estritamente sintético, não implementação operacional.

## Limites da prova — não inflar

- O caminho TCP/HTTPS ficou genuinamente inacessível, mas **não foram desligadas todas as interfaces de rede do Android** nem demonstrada perda completa de internet da operadora/dispositivo. É prova de **falha do endpoint e recuperação**, não de corte físico do rádio.
- A instrumentação chama `EntregasApi`, `Room` e `decideEventReceipt` diretamente, aplicando a mesma regra de confirmação do produto. **Não executou o WorkManager/SyncWorker real**, sua autenticação de sessão de aparelho nem políticas de backoff.
- O receptor é uma **fixture de contrato**, sem autenticação de dispositivo e sem o domínio operacional real; não se deve dizer que o servidor oficial Neemo/Teknisa aceitou o evento.
- O teste nativo **não verifica a passagem ao PostgreSQL da plataforma/Copiloto**. Isso foi provado separadamente, com o piloto em arquivo, quatro eventos aceitos e três isolados, em [teste PostgreSQL anterior](DELIVERYOS_MESMA_TRIP_PLATFORM_COPILOTO_PG_2026-10-13.md). Não fundir resultados de dois laboratórios como se fossem uma transação única.
- Reinstalação de APK e `pm clear` afetaram **apenas o app debug do emulador de bancada**, sem aparelho físico ou dados pessoais.

## Próximo portão seguro

Habilitar em uma bancada integralmente sintética a **sessão fictícia da plataforma + pilot server de teste + WorkManager real**, executar interrupção do destino, persistência/retry/reabertura, e validar recibos do domínio com a mesma chave, sem atalhos de autorização. Só depois ensaio em Android físico consentido. Um patch isolado de clareza visual no cabeçalho do Copiloto continua separado do fluxo nativo.

**Sem merge, deploy, GPS, pedido real, homologação humana ou nova despesa nesta etapa.**
