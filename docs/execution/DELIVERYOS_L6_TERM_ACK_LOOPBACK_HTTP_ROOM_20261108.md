# Delivery OS V1 — L6: HTTP local real → recibo identificado → Room (08/11/2026)

**Escopo autorizado:** apenas **Delivery OS Itaim**, PR [#137](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/137), branch `feat/gestor-shadow-observer-20261103`, aberta e em rascunho. A fonte nativa das comandas é tratada em outra frente e não foi acessada aqui. Fonte metodológica VÉRTICE verificada em `cesarspichencoff-cmyk/vertice-runtime.`, `vertice-active`, `VERTICE_ENTRY.md`, blob `912a02f932acc42e76cb1fb7d46b3f1f8a0c380d`.

## Diferença que esta rodada fechou

A rodada anterior havia provado **275/275 testes** com o método `SyncWorker.doWork()`, Room/SQLite e respostas de API simuladas via MockK. **Não havia exercitado o cliente HTTP real** nem o parsing de status/corpo por uma conexão de rede local. Um recibo gerado manualmente no MockK não equivale a bytes realmente enviados e recebidos.

O ganho atual foi atravessar a rota HTTP real de laboratório, preservando o mesmo parser e a mesma transição de recibo/Room que o Worker utiliza, **sem conectar a produção**.

## Implementação estritamente delimitada

1. `android/app/src/main/java/br/com/tata/entregas/sync/TermAckReceipt.kt`: foram extraídos dois pontos reutilizáveis:
   - `termAckWireJson(ack)`, com os mesmos 14 campos já enviados pelo `SyncWorker` (identidade do aceite, ator, unidade, termo, hash, estado, data, aparelho e metadados);
   - `persistTermAckOnVerifiedReceipt(db, ack, response)`, que aceita somente `ApiResult.Ok` com `confirmsTermAckOnPilot` verdadeiro e então chama o DAO Room `termAcks().markSent`. Qualquer resposta sem recibo exato retorna falso e **não escreve em Room**.
2. `SyncWorker.kt`: substitui o encoder privado e a gravação inline por **essas mesmas duas funções**, sem alterar a política já comprovada de `unconfirmedTermAck`, tentativas rápidas, `Result.failure()`, sessão, GPS ou eventos operacionais.
3. `android/app/src/test/java/br/com/tata/entregas/TermAckLoopbackHttpRoomTest.kt`: oito testes Robolectric com **`EntregasApi.sendTermAcknowledgement` real**, servidor TCP HTTP/1.1 efêmero ligado **exclusivamente a `127.0.0.1`**, JSON real do Worker e banco SQLite/Room em arquivo. O teste de sucesso fecha/reabre o Room para verificar `sent` persistente.
4. `.github/workflows/deliveryos-android-room-recovery.yml`: observa os dois arquivos novos/alterados e exige no relatório JUnit **pelo menos oito execuções de `TermAckLoopbackHttpRoomTest`**, além das suítes anteriores. Não gera APK, não instala nem faz deployment.

### Casos realmente exercitados

| Entrada recebida via HTTP loopback | Resultado do caminho HTTP → verificador → Room |
|---|---|
| 200 com recibo completo e correspondente | `ApiResult.Ok`, `sent` após reabertura SQLite |
| 200 sem objeto de recibo | Continua `pending` |
| 200 com aparelho diferente | Continua `pending` |
| HTTP 422 sem recibo do aceite | `ApiResult.Rejected`; continua `pending` |
| HTTP 401 | `ApiResult.Unauthorized`; consentimento local preservado |
| 200 com JSON inválido | `ApiResult.Retryable`; continua `pending` |
| Reenvio com mesmos bytes + `stored=false` e recibo válido | Um registro local, mesma identidade, `sent` após validação |
| Servidor local desligado | Erro de transporte classificado `Retryable`; continua `pending` |

O teste de sucesso confere o JSON de saída enviado ao servidor de bancada (ID, ator, unidade, aparelho, hash) e que o cabeçalho `Authorization` não foi enviado ao endpoint do piloto neste cenário de teste.

## Falha inicial, causa e contra-rota

A primeira CI [#42510186320](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42510186320) **não** é a prova atual: o commit `937a4394a35fd76b61bffa227fbd4add2ab6bd22` falhou na compilação de teste porque `com.sun.net.httpserver.HttpServer` não está disponível na classpath do Android Gradle Plugin. **Zero testes dessa nova suíte foram executados nessa tentativa**.

Em vez de adicionar dependências de servidor, tentar forçar módulos JVM à classpath Android ou ignorar a falha, a bancada foi reescrita para usar apenas `java.net.ServerSocket` e APIs padrão. Mantidos os oito cenários, sem alterar o cliente HTTP ou a semântica do domínio.

## Evidência da versão efetivamente aprovada

**Commit de código e testes: `f1667689939dc20c92e1204465d471474c0c37ee`.**

- [Android Room Recovery #42510602760](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42510602760): **`completed/success`**, `BUILD SUCCESSFUL in 2m 36s`, **27 suítes JUnit, 283/283 testes, zero falhas, zero erros** e gate `ANDROID_ROOM_4XX_REAL_DAO_TEST_PASS`.
- [Delivery OS silent fixture #42510602769](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/42510602769): **`completed/success`, 5/5 jobs**, inclusive browser de laboratório e Windows sem console em runner isolado. Não prova ausência de pop-up no caixa operacional.
- 275 testes anteriores continuaram válidos e os 8 de HTTP local foram acrescentados. Nenhuma evidência de campo foi artificialmente contabilizada.

## O que esta prova NÃO significa

- Este teste junta **HTTP de loopback real + parser real + funções reais compartilhadas com o Worker + DAO Room real**, mas **não executa o `SyncWorker.doWork()` com endpoints HTTP reais no mesmo teste**. A execução do `doWork()` foi comprovada separadamente com MockK. Não afirmar `Worker+HTTPS+Room end-to-end comprovado`.
- **HTTP local não é HTTPS de campo**: não prova certificado, proxy, firewall, sessões e delegação reais, rede móvel, bateria/Doze, reconexão no Xiaomi, autorização, recibos do servidor piloto, idempotência remota ou mensagem observada pelo motoboy.
- Não houve acesso ao banco de dados operacional, atendimento a pedido de cliente, autenticação de funcionário, impressão, acesso ao Xiaomi, instalação de APK, merge ou deploy.

**Resultado:** `L6_TERM_HTTP_LOOPBACK=TEST_PASS`; `L6_TERM_ROOM_PERSIST=TEST_PASS_IN_LAB`; `L6_WORKER_DOWORK_MOCK_API=TEST_PASS`; `L6_XIAOMI_FIELD=NOT_RUN`; `L6_PILOT_HTTPS_ACK=UNKNOWN`; `L6_REAL_OPERATOR_UI=UNKNOWN`; `L4_HOME_LIVE=HOLD`; `L7_JOURNEY=HOLD`; `L8_FIELD=HOLD`; **V1=0/8 aceites integrais de campo**.

**Próximo passo de maior valor:** bancada de integração controlada do Worker completo com os dois endpoints HTTP locais isolados (plataforma e piloto), registrando recibo válido, cenário 4xx, reinício e interface de pendência, sem permitir tráfego a servidores reais. Depois, quando autorizada a validação humana, ensaio no Xiaomi com identidade e consentimento verificáveis.
