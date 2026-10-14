# DeliveryOS — Android WorkManager expõe corretamente recusa 401 do piloto (13/10/2026)

**Resultado comprovado em laboratório: BUG DE SINALIZAÇÃO CORRIGIDO; AUTENTICAÇÃO OPERACIONAL AINDA BLOQUEADA.**

## Escopo exato e fonte
- PR **#111**, https://github.com/cesarspichencoff-cmyk/delviery-os/pull/111, branch `fix/deliveryos-workmanager-visible-pilot-auth-401-20261013`.
- Commit `d6dc4c76845139f72f24adfd7df30aa52bcd679c` baseado exatamente na Q019 `9121c252d864a8b74ef33e8c9e5c0d81d687ffa3` (PR #108).
- Diff de código de produção **único**: `android/app/src/main/java/br/com/tata/entregas/sync/SyncWorker.kt` (11 inserções e 5 remoções). Nenhum visual, token, API, banco, sensor ou Q019 alterado.
- Bancada Foxxy: emulador Android 14/API34, app debug com CA efêmera de laboratório (não incluída no PR), plataforma falsa de sessão e **`tools/entregas_pilot_server.ts` original** em `mode=test`, `source_mode=simulated` e GPS OFF. Não houve conexão com banco ou pedidos reais.

## Falha anterior

No piloto oficial em modo test, `POST /api/events/batch` recebe evento sem credencial própria e retorna **401**. O aplicativo preserva o evento no SQLite/Room (`failed`), mas o `SyncWorker` concluía `Result.success()`, resultando em WorkManager `SUCCEEDED` com outbox ainda pendente. Reproduzido antes no relatório `DELIVERYOS_WORKMANAGER_REAL_AUTH_401_2026-10-13.md`.

## Correção limitada e segura

`SyncWorker` conserva `markFailed` e o token da **plataforma**. Apenas passa a marcar falha da autorização do **piloto** e retornar `Result.failure()` quando não existe outro motivo transitório que requeira retentativa. Falhas transitórias dos outros fluxos mantêm precedência e política limitada `retryOrYield()`. Não transforma 401 em permissão, não reutiliza credenciais, não modifica outbox nem liga GPS.

## Provas executadas na cópia temporária

- Android debug compilação inicial e final `assembleDebug`: **PASS**, APK final de bancada SHA-256 `9FCC95519E4FABCC19DA15EC3E94E4FC5DD40D4F963BB4E21CFEB24FF0BB0C47`.
- `stage03_official_pilot_denies_unauthenticated_sync_fail_closed`: **PASS (1/1)**. O WorkManager real transmite o evento fictício; piloto oficial recusa sem token; evento fica `failed`.
- `stage04_confirm_401_and_worker_terminal_state`: **PASS (1/1)**. HTTP 401 confirmado; WorkManager **FAILED**; 1 evento ainda pendente no SQLite, não removido.
- Teste unitário Android `SyncRetryPolicyTest`: **PASS**, Gradle exit 0.
- Testes estruturais do projeto Android: **43/43 PASS**.
- Guarda M1/C6: **40/40 PASS**.
- GPS foi observado em `location_mode=0` durante as provas.
- Os dois testes instrumentados foram executados **após a compilação final** da nova implementação, não apenas na primeira versão do patch.

## Arquivos de evidência preservados

Em `docs/auditorias/evidencias/workmanager-visible-401-20261013/`:
- `workmanager-stage03.txt`, `workmanager-stage04.txt`: saídas integrais dos testes reais no emulador.
- `WorkManagerNetworkAuthLabTest.kt`: teste instrumentado de bancada adaptado para esperar `WorkInfo.State.FAILED`.
- `build-final.log`, `android-unit.log`, `android-structure.log`, `m1.log`: compilação e regressões.

**Nenhuma chave privada, token, arquivo de configuração de piloto ou certificado foi incluído nas evidências.**

## Não confundir com DeliveryOS operacional

A falha 401 do piloto **permanece real e intencional**: o servidor só deve receber comandos de uma identidade atestada. O PR #111 torna a falha explícita, mas não autentica o Android. A proposta de contrato no PR #110 passou 25 testes isolados, porém ainda não está integrada ao emissor da plataforma, piloto e cliente nativo. Outras provas necessárias: CI remoto, autenticação por audiência, revogação, emissão e recebimento ponta a ponta, piloto físico supervisionado, homologação humana. **MANTER TODOS OS PRs EM DRAFT/HOLD, SEM MERGE/DEPLOY.**
