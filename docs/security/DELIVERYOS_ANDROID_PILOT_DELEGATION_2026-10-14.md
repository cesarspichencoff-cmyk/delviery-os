# DeliveryOS — delegação exclusiva Android → plataforma → piloto

**14/10/2026 · Candidato em revisão · DRAFT/HOLD · Sem ativação operacional.**

## Bloqueio tratado
No PR #116, o piloto já dispõe de verificação Ed25519 exclusiva e consulta online ao cadastro da plataforma; porém o `SyncWorker` usava `EntregasApi(ENTREGAS_BASE_URL, { null })` em `POST /api/events/batch`, causando HTTP 401 e evento retido no Room.

## Implementação proposta
- `EntregasApi.requestPilotWriteToken(expectedActor)`: POST **somente à plataforma**, em `/api/device/pilot-delegation`, com token da sessão da plataforma.
- `PilotDelegation.kt`: confere formato `pt1`, audiência `deliveryos-pilot-event-write`, janela de validade 1–300 s, ator registrado no estado do aparelho e presença de identidade de unidade/aparelho. Resposta inválida nunca vira autorização.
- `PilotEventDispatch.kt`: usa apenas o token `pt1` na chamada `POST /api/events/batch` do piloto; sob HTTP 401 do piloto, faz **uma única renovação** na plataforma e **no máximo mais um envio**, reutilizando o mesmo lote, IDs e idempotência.
- `SyncWorker.kt`: mantém a sessão de plataforma separada; só 401 da **plataforma** invalida a sessão de plataforma. Falha/revogação do piloto mantém o evento `failed` no SQLite/Room, e a execução não reporta `SUCCEEDED` na recusa de delegação.
- **Nenhuma credencial do piloto é persistida** em Room, preferences, Keystore ou WebView: o token de vida curta existe exclusivamente na memória da tentativa. A sessão da plataforma continua com a proteção já implementada por `DeviceSession`.

## Provas realmente executadas
- APK `assembleDebug` e `:app:testDebugUnitTest`: **BUILD SUCCESSFUL**, **88 testes**, **0 falhas** em 14 suítes, incluindo novas regressões de validade, ator divergente, 401/403/503, separação de cabeçalhos em **dois receptores HTTP loopback**, reenvio limitado e preservação dos IDs.
- Projeto Android: **43/43 PASS**.
- Guarda M1/C6: **40/40 PASS**.
- APK debug de laboratório SHA-256: `DCA17AD16D8E3C99B25A75970AFAF6B0F6D7C04F02AD71495F77638D6EEC572E`.
- `git diff --check`: 0; worktree original do candidato #108 permaneceu limpa.

## Limites que impedem produção
1. O teste de separação dos Bearers usa dois receptores **HTTP em loopback JVM**. Ainda falta prova com **dois servidores HTTPS reais**, verificação de certificados e PostgreSQL de laboratório. O token de aparelho em produção precisa da rota da plataforma e da emissão com chaves autorizadas, nunca fixture.
2. Não foi executada ainda a nova versão com **WorkManager real no emulador** junto à emissão delegada e recibos oficiais na mesma viagem. Os ensaios anteriores comprovam WorkManager e Room separadamente; não transferir essa prova.
3. As rotas legadas de **aceite de termo e políticas** ainda usam o cliente do piloto sem token de usuário. **Não declarar essas rotas integradas** pela mera liberação de `/api/events/batch`; exigir autorização apropriada e regressões específicas antes de piloto real.
4. Recibos individuais, replay offline real, GPS/privacidade, isolamento por unidade, CI remoto, backup/restore, assinatura da variante de campo e aceite humano seguem portões materiais.
5. Não houve merge, deploy, operação real, acesso a pedidos de clientes, ativação de GPS ou liberação de um aparelho de loja.

**Próxima prova prioritária:** autenticação real de bancada (certificados válidos em debug), `POST /api/device/pilot-delegation` pela plataforma crítica em modo simulado → `POST /api/events/batch` no piloto autenticado → recibo persistido e o mesmo `event_id` observado Entregas/Copiloto, usando WorkManager/Room no emulador, com revogação/queda da rede. Só depois considerar piloto supervisionado.
