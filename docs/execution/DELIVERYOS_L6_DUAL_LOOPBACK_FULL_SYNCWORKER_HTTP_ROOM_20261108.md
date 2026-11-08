# Delivery OS V1 Itaim — L6: SyncWorker completo com dois HTTP locais e Room (08/11/2026)

## Missão e fronteira

Continuidade **somente do Delivery OS Itaim**, PR [#137](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/137), branch `feat/gestor-shadow-observer-20261103`, **aberta e em rascunho**. A outra frente de comandas não foi alterada. VÉRTICE canônico confirmado no repositório literal `cesarspichencoff-cmyk/vertice-runtime.`, branch `vertice-active`, `VERTICE_ENTRY.md` (blob `912a02f932acc42e76cb1fb7d46b3f1f8a0c380d`).

**Objetivo desta rodada:** fechar a distância entre os testes anteriores de `SyncWorker.doWork()` com MockK HTTP (275/275) e do cliente HTTP + recibo + Room sem executar o Worker (283/283). Era necessário testar o **Worker inteiro**, atravessando de fato duas rotas de rede distintas, sem depender de produção.

## Execução no código da PR

Foi criado **um arquivo de testes**, `android/app/src/test/java/br/com/tata/entregas/SyncWorkerDualLoopbackHttpRoomTest.kt`, com quatro testes Robolectric. A workflow já existente `.github/workflows/deliveryos-android-room-recovery.yml` passou a incluir o arquivo no filtro `paths` e **exigir no relatório JUnit pelo menos quatro métodos executados** dessa classe.

- O teste executa **`SyncWorker.doWork()` real** por `TestListenableWorkerBuilder<SyncWorker>`.
- Utiliza o **`EntregasDatabase`/Room/SQLite real** em arquivo descartável.
- Levanta **dois** `ServerSocket` HTTP/1.1 efêmeros, ambos limitados a `127.0.0.1`, cada um com porta independente: **plataforma** (delegação curta, GPS, contagem agregada) e **piloto** (aceite do termo, evento operacional, política indisponível).
- A identidade do aparelho/sessão é fictícia e injetada no mock do objeto `DeviceSession`. O mock de construção de `EntregasApi` **substitui somente o destino das chamadas do Worker** por instâncias do **cliente HTTP real `EntregasApi`**, construídas antes da instrumentação e configuradas explicitamente para esses dois servidores locais. Não há chamada à plataforma/piloto reais, nem desativação de TLS de campo; o loopback de bancada usa HTTP.
- O teste recusa métodos HTTP inesperados em vez de tentar autenticar qualquer serviço externo. Os requests e as respostas percorrem o encoder/parser reais, a delegação `pt1`, os verificadores de recibo, a política de falhas e os DAOs Room. Tokens como `PLATFORM-DEVICE-ONLY-FICTICIO` são **somente valores de teste**.
- Nenhum arquivo de produção foi alterado: a execução é um **novo teste de integração** + filtro/contagem de CI.

## Quatro contraprovas executadas

| Teste | Prova |
|---|---|
| `twoLoopbackServersConfirmTermEventAndGpsWithoutSharingBearer` | `Result.Success`; termo `sent`, evento/GPS sem pendentes; recibos após reabrir o SQLite. Delegação, lote GPS e contagem foram para **plataforma** com bearer de dispositivo fictício; termo e evento foram para **piloto** sem esse bearer. Evento usa apenas token `pt1` delegado, nunca o da plataforma. |
| `term422CannotClaimWorkerSuccessWhileOtherLanesSucceed` | HTTP 422 de termo leva a `Result.Failure` após limite rápido, com ack `pending` preservado mesmo quando GPS e evento recebem ACK. Quando o servidor fictício retorna recibo válido no reenvio, o termo passa a `sent`. |
| `event422KeepsOriginalIdempotencyUntilPerEventReceiptArrives` | HTTP 422 do **lote** não vira recusa terminal individual; o evento fica `failed` com `eventId` e `idempotencyKey` originais. Reenvio após receber recibo por evento confirma o mesmo identificador e mantém `rejectedCount=0`. |
| `platformDelegation403CannotSendToPilotOrConsumeEvent` | Delegação recusada pela plataforma não dispara envio do evento ao piloto, mantém o evento na fila com idempotência intacta e retorna `Result.Failure`; termo e GPS nas suas rotas permanecem independentes. |

## Provas reais do laboratório

**Commit de código e CI:** `b7b6f4856e61d37de6a3a057a9a4a9cd1c8b5233`.

- [Android Room Recovery #42511719012](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42511719012): **`completed/success`**, `BUILD SUCCESSFUL in 2m 25s`, **28 suítes, 287/287 testes, 0 falhas e 0 erros**, marcador `ANDROID_ROOM_4XX_REAL_DAO_TEST_PASS`. Os quatro testes novos estão exigidos pela CI, não apenas presentes no repositório.
- [Delivery OS silent fixture #42511719035](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42511719035): **`completed/success`, 5/5 jobs** (Chromium, contratos estáticos, Edge, integração de fixture, Windows sem console). São runners descartáveis; não provam silêncio visual no caixa.
- Continuidade quantitativa estrita: 283 testes anteriores + 4 do Worker HTTP duplo = 287. A reprovação da primeira bancada que utilizou `com.sun.net.httpserver.HttpServer` ocorreu **antes** deste commit e já havia sido corrigida por `ServerSocket`; não confundir tentativas falhas anteriores com a prova atual.

## Fronteira do resultado

**Comprovado em laboratório:**
`L6_WORKER_DOWORK_WITH_TWO_LOCAL_REAL_HTTP_ROUTES=TEST_PASS`;
`L6_PLATFORM_TOKEN_PILOT_AUDIENCE_SEPARATION=PASS_SYNTHETIC`;
`L6_TERM_RECEIPT_AND_ROOM=PASS_IN_LAB`;
`L6_EVENT_IDEMPOTENT_RECOVERY=PASS_IN_LAB`;
`L6_ANDROID_GRADLE=287/287_PASS`;
`L6_MAIN_CI=5/5_PASS`.

**Não comprovado:** a criação real de sessão e credenciais no dispositivo, confiança TLS e HTTPS dos servidores verdadeiros, renovação de token, rede móvel, Doze/agendamento de 15 minutos, visualização da pendência no Xiaomi, recebimento nos serviços reais, consentimento e GPS no campo, eventos operacionais reais autorizados, idempotência remota em produção. O constructor mock direciona URLs apenas na bancada e **não prova** as URLs/infraestruturas do APK de campo. Teste de token fictício não é teste de segurança real de credenciais. Nenhuma aprovação visual humana foi colhida.

**Sem efeitos reais:** não houve acesso ao `CAIXA_MOOCA`, comandos/shell no caixa, impressão, SQL, dados de cliente, GPS real, Xiaomi, instalação de APK, deploy, merge, corte de serviço ou custo novo.

**Plano V1:** L6 avança tecnicamente, mas **0/8 critérios integralmente aceitos em campo**; L4 Home real, L7 jornada integrada, L8 segurança operacional e demais linhas permanecem em `HOLD`. A frente de comandas é externa a este checkpoint.

**Próximo movimento com maior valor:** garantir o aviso visual de ack pendente/confirmado em dispositivo de laboratório com fonte local e executar o ciclo de rede/retorno após interrupção; depois, com autorização operacional específica, homologar o Xiaomi e os endpoints HTTPS reais. Nenhum novo refinamento de mock pode substituir essas provas de campo.
