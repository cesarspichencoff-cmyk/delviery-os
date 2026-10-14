# DeliveryOS — WorkManager real, retry automático e incompatibilidade de autenticação do piloto

**13/10/2026 · Bancada Android 14/API 34 no Foxxy · Estado: TESTE FÍSICO EM EMULADOR CONCLUÍDO, BLOQUEIO OPERACIONAL COMPROVADO.**

## Contexto e isolamento

- Commit fonte `9121c252d864a8b74ef33e8c9e5c0d81d687ffa3`, PR #108. PR #106 e #109 permanecem DRAFT/HOLD; não houve merge ou deploy.
- Código funcional **intocado**. Construção apenas em worktree temporária `deliveryos-workmanager-sync-lab-20261013`, com CA efêmera debug e classe de teste instrumentado adicionada **somente à bancada**. `assembleDebug assembleDebugAndroidTest --offline`: **BUILD SUCCESSFUL**.
- Android: AVD `deliveryos_api34` (`emulator-5554`), GPS sempre `location_mode=0`, nenhuma permissão de localização concedida e nenhum ponto GPS produzido.
- TLS local com validação de hostname e CA debug, portas **8080 (plataforma fictícia)** e **5193 (piloto)** apenas em `127.0.0.1`; não houve ligação com plataforma ou banco existente, aplicativos reais, pedido real, iFood, Neemo ou Teknisa.
- A fixture de **plataforma** não implementa autenticação produtiva: gera token aleatório de laboratório e vincula identidade `rid-WM-LAB` ao dispositivo sintético apenas no teste. **Não é prova de autorização humana nem segurança criptográfica operacional.**
- O piloto na primeira recuperação é outra fixture HTTPS. Na última fase foi **o servidor original `tools/entregas_pilot_server.ts`**, em `mode=test`, `source_mode=simulated`, `gps_production=false`, com tokens gerados aleatoriamente e armazenados **fora do Git**. Nenhuma configuração do piloto oficial teve sua autenticação relaxada.

## Provas: cinco testes instrumentados, todos PASS

| Fase | Execução e observação | Resultado |
|---|---|---|
| **1. WorkManager com piloto fora do ar** | `SyncScheduler.requestNow` acionou WorkManager REAL, que executou `SyncWorker`; a plataforma fictícia registrou 1 sessão e uso do token no endpoint de contagem; o evento sintético permaneceu `failed` no Room após falha do endpoint HTTPS do piloto | **PASS 1/1** |
| **2. Recuperação automática** | O piloto fixture voltou à porta 5193. **Sem chamar `requestNow` novamente**, o trabalho já agendado no Android reenviou e o recibo individual válido tornou a fila `pending=0`; servidor registrou **1 requisição, 1 ID único, 0 erros** | **PASS 1/1** |
| **3. Piloto oficial em teste** | Após trocar a fixture pelo código ORIGINAL do servidor piloto, `SyncWorker` tentou enviar segundo evento sem token de sessão do piloto. O item ficou `failed` no Room e **nenhum evento foi gravado** no outbox do piloto | **PASS 1/1 (recusa prevista, não sucesso de envio)** |
| **4. HTTP 401 e estado de execução** | A classe REAL `EntregasApi.sendEvents` confirmou `ApiResult.Unauthorized(status=401)` diante do piloto; WorkManager marcou a execução `SUCCEEDED` enquanto **1 evento continuava failed/pending** no SQLite | **PASS 1/1 (falha operacional comprovada)** |
| **99. Limpeza da bancada** | Teste instrumentado cancelou os únicos trabalhos `entregas-sync-now-v2` e `entregas-sync-periodic-v2` **do aplicativo de laboratório** | **PASS 1/1** |

Fixtures ao final: a plataforma fictícia contabilizou `session_ok=1`, `queue_authorized=2`, `queue_missing_token=0`, `location_points_requests=0`, `invalid=0`. A fixture de piloto contabilizou `unique=1`, `requests=1`, `invalid=0`, `source_mode=simulated`.

## Defeito reproduzido e causa

1. Em `SyncWorker.doWork()`, o cliente `api = EntregasApi(BuildConfig.ENTREGAS_PLATFORM_URL, { tokenAtual })` transmite corretamente o token da plataforma **somente** para a plataforma.
2. O cliente `piloto = EntregasApi(BuildConfig.ENTREGAS_BASE_URL, { null })` **nunca** envia credencial ao piloto.
3. `tools/entregas_pilot_server.ts`, `POST /api/events/batch`, exige `actor`; sem sessão retorna HTTP **401** e preserva a integridade do domínio.
4. Quando ocorre `ApiResult.Unauthorized`, o `SyncWorker` chama `db.outbox().markFailed(ids, ...)`, mas **não define `retryable=true`** para o envio de eventos. Se mais nada falhar no mesmo ciclo, `doWork()` retorna `Result.success()`; portanto, WorkManager registra **`SUCCEEDED` com evento ainda aguardando envio**. Reação futura depende de outro gatilho ou da rotina periódica de 15 minutos, não do retry automático do trabalho imediato.
5. A fase da fixture prova que o agendamento e o backoff **funcionam** sob indisponibilidade temporária; a ausência de credencial do piloto é o bloqueio específico. Não há prova de que a rota oficial possa aceitar eventos nativos legitimamente após recuperar a rede.

## O que NÃO fazer

- **Não** copiar `device_token` da plataforma para o piloto: audiência, autoridade e revogação pertencem à plataforma; reutilizar o mesmo token noutro serviço violaria a separação explícita no código.
- **Não** remover o `if (!actor) return 401` do piloto e **não** aceitar `rider_id` do payload como prova de identidade.
- **Não** alterar `Unauthorized` para retry infinito sem resolver o contrato de autenticação; apenas mascararia a falha com carga contínua e um item preso.

## Correção de maior valor — proposta, NÃO implementada

**Decisão arquitetural em aberto:**

A. **Preferência se a migração canônica já estiver autorizada:** mover o envio do comando operacional para uma rota autenticada da **plataforma**, com escopo de papel, unidade, device ID, deduplicação e recibos por evento, delegando execução ao domínio Entregas. Preserva um único emissor de token e elimina credencial implícita no piloto.

B. Caso o piloto continue recebendo comandos: criar um **token próprio e específico para o piloto**, emitido mediante sessão atestada da plataforma, com `audience` exclusiva do piloto, `unit_id`, `actor_id`, `device_id`, prazo curto, revogação e verificação server-side. Nunca reusar segredo bruto ou identidade enviada pela WebView. Contrato e autorização humana precedem ativação real.

Para ambas, exigir testes adversariais: identidade ausente → 401; token da plataforma direto no piloto → rejeição; token de outra unidade/papel → 403; expiração/revogação → 401/403 sem perder outbox; evento aceito → recibo individual idêntico; repetição → sem duplicação; falha temporária → `Result.retry` e retomada. Revisar estado do WorkManager com evento pendente antes do piloto.

## Evidências publicadas

Diretório: `docs/auditorias/evidencias/android-workmanager-auth-2026-10-13/`.

- `WorkManagerNetworkAuthLabTest.kt`: código da bateria instrumentada, sem dados pessoais.
- `stage01-offline.txt`, `stage02-recovery.txt`, `stage03-official-denial.txt`, `stage04-official-401-worker-state.txt`, `stage99-cancel.txt`: saídas originais de instrumentação (PASS).
- `platform-session.cjs`, `pilot-receipt.cjs`: apenas fixtures descartáveis de teste, **não** serviços autorizados para produção.
- `platform-stats.json`, `pilot-receipt-stats.json`: contagens independentes; nenhum token, senha, segredo bruto, chave TLS ou coordenada publicado.

**Veredito:** `TEST_PASS` para agendamento real, falha de endpoint, recuperação e classificação de 401; `WORLD_PROVEN` **não** alcançado. O impedimento de autenticação do piloto permanece aberto e deve bloquear homologação operacional, merge e deploy até resolução com provas.


## Atualização de continuação — contrato delegado isolado (13/10/2026)

Para atacar a incompatibilidade 401 sem compartilhar o token da plataforma com o piloto, foi criado o **PR Draft/HOLD #110**, https://github.com/cesarspichencoff-cmyk/delviery-os/pull/110, commit `029193a7f50f765ed7178df7a12d9a8449b32b86`. A proposta adiciona apenas um verificador Ed25519 puro para audiência exclusiva `deliveryos-pilot-event-write`, seus testes e ADR, **sem integração HTTP nem Android**. Provas locais: **25/25 testes adversariais PASS**, **M1/C6 40/40 PASS**, **TypeScript exit 0**. Diff de exatamente 3 arquivos, verificado no GitHub. A execução CI remota não estava confirmada.

**Estado honesto:** a recusa 401 do piloto continua intencional e o evento segue pendente no cenário real; o contrato candidato **não corrige ainda** o aplicativo. Próximo portão: emissão atestada na plataforma, verificação online de revogação no piloto, associação de identidade/papel/unidade a cada comando, integração Android com credenciais por audiência e teste instrumentado de fila/recibo no servidor oficial. Mantenha PR #110 em DRAFT/HOLD, sem merge ou deploy.
