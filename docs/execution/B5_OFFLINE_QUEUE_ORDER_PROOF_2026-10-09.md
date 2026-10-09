# DeliveryOS B5 — ordenação de relatórios da fila offline
Data: 2026-10-09
Branch: `feat/deliveryos-b5-queue-order-20261009`
Base: `feat/cloud-solo-reader-resilience-20261007` @ `cac840b0a2a92750529c824522b1dfa4f874e6e0`.

## Objetivo
Evoluir o DeliveryOS independentemente do TATÁ Comanda, sem acessar CAIXA, Teknisa, reader, impressão ou produção.

## Falha reproduzida (RED)
O contrato B5 aceita apenas dois contadores de fila offline e captura `agora` no servidor antes da persistência. Porém, quando uma solicitação mais antiga conclui depois de outra mais nova, o `UPDATE identity.device` incondicional sobrescreve os contadores e `queue_depth_reported_at` já atualizados.

Em PostgreSQL **real, isolado**, antes da correção:
- primeira medição: `7 pontos / 3 eventos`, recebida `2026-10-06T09:01:00Z`;
- medição atrasada: `99 / 88`, recebida `2026-10-06T09:00:30Z`;
- resultado antigo: **99 / 88, timestamp 09:00:30** (regressão demonstrada).
- O teste `src/platform/run-device-queue-depth-pg-tests.ts` falhou por assert `snapshot antigo/empate nao pode regredir fila e tempo`.

## Correção (GREEN)
`src/platform/persistence/pg-repositories.ts` no método `PgDeviceRegistry.registrarFilaOffline`:
- atualização atômica por coluna com `CASE` baseado no timestamp persistido;
- só atualiza contadores e `queue_depth_reported_at` quando timestamp novo é **estritamente posterior**; empate não muda leitura;
- se timestamp novo é antigo/igual, preserva estado existente e mantém resposta de dispositivo ativo;
- `WHERE revoked_at IS NULL` permanece inalterado, logo revogação não é relaxada;
- o contrato HTTP, permissões do papel SQL, payload Android e Product System não foram ampliados.

Extensão dos asserts de PostgreSQL:
- request anterior é ignorado;
- timestamp igual é ignorado;
- request posterior com zero medido é aceito e preserva `0 != NULL`;
- após relato posterior restaurado, revogação continua impedindo escrita.

## Provas no Foxxy, sem efeito de produção
- `npx --no-install tsx src/platform/run-device-queue-depth-pg-tests.ts`, com `DELIVERYOS_PG_URL` apontando a PostgreSQL local isolado: **12/12 PASS**, exit 0, após RED comprovado.
- `npx --no-install tsx src/platform/run-device-queue-depth-tests.ts`: **10/10 PASS**.
- `npx --no-install tsc --noEmit`: exit 0.
- `npm run -s build:platform`: exit 0, 9 migrations copiadas, build stamp local.
- `npx --no-install tsx src/platform/run-device-queue-depth-http-pg-tests.ts`: **8/8 PASS**, exit 0.
- Nenhum deploy, cutover, serviço Windows ou uso da CAIXA.

## Limites e sequência
- `CODE_READY + TEST_PASS` em ambiente PostgreSQL/HTTP local. `DEPLOYED=false`; `WORLD_PROVEN` de aparelho físico pendente.
- Não resolve automaticamente B5 em telefone Android real; o aparelho precisa reportar os dois contadores e o Product System refletir a medição.
- Não altera TATÁ Comanda. Não foi feito merge em main.
- Próxima frente DeliveryOS pode seguir em branch isolada; não é necessário esperar o reader TATÁ.
