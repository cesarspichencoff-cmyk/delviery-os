# Delivery OS Itaim — confirmação remota de termo no Android (04/11/2026)

**Escopo:** correção estreita da fila de `term_ack` nativa; desenvolvimento/testes somente no Foxxy. **Não** homologação de contrato de consentimento, HTTPS ou motoboy em campo.

## Difference Check antes do código

- Já existiam `TermAckEntity` append-only, `TermAckDao`, `EntregasApi.sendTermAcknowledgement`, `SyncWorker` e `src/entregas/consent/acknowledgement.ts`, incluindo recibo de servidor com `acknowledgement_id`, `recibo`, `unidade`, `versao_do_termo`, `impressao_do_texto`, `situacao` e `aparelho`. **Reusados integralmente.**
- Já existia `decideEventReceipt` para aceitar/recusar **cada evento operacional**, respeitando reenvio e incerteza. **Não alterado.**
- Lacuna comprovada por inspeção no `SyncWorker.kt` anterior: `is ApiResult.Ok -> db.termAcks().markSent(...)` marcava aceite local como sincronizado com **qualquer HTTP 2xx JSON válido**, sem confirmar o ID, o aparelho, a unidade, o hash e a escolha do termo. Assim, `200 {\"ok\":false}` ou recibo de outro aparelho poderia limpar a pendência — falha de certeza do estado.

## Correção minimalista na PR #137

- `android/app/src/main/java/br/com/tata/entregas/sync/TermAckReceipt.kt`: valida o recibo **já emitido pelo servidor**, sem formato/protocolo novo, sem segredo ou rede; confirma apenas `ok=true`, ID, unidade, versão do termo, hash, aparelho e status. Quando a rota inclui `record`, também exige ator, unidade, aparelho, hash e status idênticos. Mantém compatibilidade com resposta antiga contendo apenas `receipt` e `stored:false` legítimo.
- `android/app/src/main/java/br/com/tata/entregas/sync/SyncWorker.kt`: só chama `termAcks().markSent` quando `confirmsTermAckOnPilot` retorna verdadeiro; HTTP 2xx incorreto mantém a entrada **pending**, para revalidação; 401/403 não são tratados como aceite remoto.
- `android/app/src/test/java/br/com/tata/entregas/TermAckReceiptTest.kt`: 11 testes JUnit diretos com JSON fictício para sucesso, idempotência, falso 200, ausência de recibo, ID, loja, versão, hash, aparelho, declined, ator e status divergentes.

**Código verificado no commit `26489dfb9bc6c6e976b00ac366eb31016fdfc95e`.** A PR segue DRAFT/HOLD, sem merge.

## Provas efetivamente executadas

Ambiente: **Foxxy**, worktree independente, detached em `26489dfb`, em `C:\Users\italo\comandas-v2-foxxy-isolated-20261103\proof\android-term-ack-qa-20261104`. SDK já instalado em `C:\Users\italo\AppData\Local\Android\Sdk`, `--offline --no-daemon`, nenhuma dependência adquirida.

1. Teste direcionado Gradle `:app:testDebugUnitTest --tests br.com.tata.entregas.TermAckReceiptTest`: **BUILD SUCCESSFUL**, exit 0, JUnit XML: **11/11**, zero skipped/failures/errors.
2. Suíte completa `:app:testDebugUnitTest`: **BUILD SUCCESSFUL**, exit 0; **22 XML suites, 254 testes, zero skipped, zero failures, zero errors**. A compilação Kotlin e dos testes foi completada no processo.
3. A primeira tentativa na worktree falhou por não localizar o SDK, não por código. Reexecutado com `ANDROID_HOME` e `ANDROID_SDK_ROOT` apontando para o SDK local, sem mudar código/configurações persistentes. Os resultados acima são da execução corrigida.

## O que NÃO mudou e o que ainda está bloqueado

- Nenhum efeito no caixa `CAIXA_MOOCA`, SQL, watcher Reader, impressora, iFood, Teknisa, GPS ou serviço em operação. Nenhuma instalação APK ou mudança de infraestrutura; nenhuma ativação de termo real. Não incorporar estes resultados como `WORLD_PROVEN`.
- **Não foi fechada a autenticação do envio do termo pelo piloto.** A rota legada usa cliente sem token, e um recibo local do Room segue insuficiente. `PILOT_TERM_ACK_AUTH=HOLD`. Validar autenticação efetiva da rota, retorno remoto no mesmo actor/device/term e recusa/consentimento em campo.
- **Não foi corrigida a classificação geral de HTTP 4xx de lote operacional**: `ApiResult.Rejected` ainda vira `markFailed` e pode repetir; ela não pode ser alterada para `rejected` terminal sem separar autorização/credencial, inconsistência recuperável, erro de domínio e commit de resultado incerto, e provar nenhuma perda. Já há proteção adequada no recibo por `event_id`; não duplicá-la. `EVENT_BATCH_HTTP_REJECTION_POLICY=HOLD`.
- A Home do Copiloto, leitura das praças, pronto físico e Xiaomi real continuam com gates independentes; a correção elimina **um** risco de falsa confirmação, não fecha o lançamento.

**Estado final:** `TERM_ACK_RECEIPT_BINDING=CODE_READY+JVM_TEST_PASS`; `ANDROID_FULL_JVM=254/254`; `TERM_REMOTE_AUTH=UNKNOWN`; `BATCH_4XX_POLICY=HOLD`; `XIAOMI_PHYSICAL=UNKNOWN`; `DEPLOY=NO`; `HUMAN_ACCEPTED=NO`.
