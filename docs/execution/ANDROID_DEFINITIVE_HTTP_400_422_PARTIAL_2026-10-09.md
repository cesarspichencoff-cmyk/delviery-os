# Android DeliveryOS — classificação preliminar de 400/422 do piloto
2026-10-09 | Escopo: Android / outbox, sem CAIXA e sem TATÁ Comanda.

## Resultado real
**PARCIAL — classificador CODE_READY + TEST_PASS, integração no SyncWorker NÃO IMPLEMENTADA.**
Base: `feat/deliveryos-android-event-receipt-fixed-20261009` @ `90a2278ef981bd79f0c2a408f3ea625e3146f033`.
Branch de trabalho: `feat/deliveryos-android-definitive-rejection-fixed-20261009`.

Observação de código: `SyncWorker.kt` ainda trata `ApiResult.Rejected` de `piloto.sendEvents` com `db.outbox().markFailed(ids, r.reason)`, mantendo um lote inválido passível de novo envio periódico. A rota piloto não está comprovadamente autenticada pelo Android; `401` não pode ser classificado como recusa de domínio.

## O que foi implementado
- `sync/PilotEventFailure.kt`: helper puro `decidePilotEventFailure`. Somente `ApiResult.Rejected` HTTP **400/422** em `ReviewRequired`, motivo saneado e limitado; os demais erros geram `KeepRetryable`.
- `PilotEventHttpFailureTest.kt`: 6 novos testes de classificação: 400, 422, 401, outros 4xx, 408/429/503 e limite de erro.
- `.github/workflows/deliveryos-android-definitive-rejection.yml`: CI isolado sem deploy.

## Provas
- Branch controle sem helper: `feat/deliveryos-android-definitive-rejection-20261009`, GitHub Actions `37939229248`, FAILED por ausência das funções recém-exigidas nos testes; esse RED comprova ausência de implementação, não teste de comportamento em rede.
- Branch helper: GitHub Actions `37939326684`, **SUCCESS**, `ANDROID_DEFINITIVE_JUNIT: suites=12, tests=83, failures=0, errors=0`.
- Esta prova NÃO autoriza declarar resolvida a repetição de HTTP 400/422 porque `SyncWorker.kt` ainda não chama o helper.

## Bloqueio
Houve bloqueio de segurança da ferramenta em três tentativas de alterar cirurgicamente `SyncWorker.kt` (inclusive edição de bloco na cópia local). O bloqueio foi respeitado; não houve instalação, merge ou alteração em produção. Componente Android permanece funcional no código-base anterior, sem regressão nova pelo helper não utilizado.

## Próximo passo
Em ambiente e permissões apropriados, integrar no branch isolado o resultado de `decidePilotEventFailure(r)` ao caso `ApiResult.Rejected` do `SyncWorker`, usando `markRejected` para 400/422 e mantendo `markFailed` para outras situações; criar ensaio de fluxo com Room e HTTP real e repetir CI. A decisão de como suspender tentativas 401/403 do piloto deve ser tratada à parte, sem perder eventos. Não fazer merge antes da integração e testes. 
