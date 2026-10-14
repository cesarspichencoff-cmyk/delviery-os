# DeliveryOS — autenticação delegada do piloto, contrato isolado

**Estado: CANDIDATO EM REVISÃO · DRAFT/HOLD · SEM ATIVAÇÃO DE HTTP OU ANDROID.**

## Causa observada e decisão de fronteira

Auditoria anterior `docs/auditorias/DELIVERYOS_WORKMANAGER_REAL_AUTH_401_2026-10-13.md`:
- `SyncWorker` envia corretamente token de aparelho **somente à plataforma**.
- `POST /api/events/batch` no piloto exige ator autenticado; o Android envia `{ null }` na criação de seu cliente HTTP do piloto.
- Em laboratório Android 14, o piloto original retornou HTTP 401, deixou o evento `failed` no Room e o WorkManager concluiu o job `SUCCEEDED`. A fila não se perde, mas a viagem não é sincronizada.
- `tools/product_system_server.ts` é explicitamente somente leitura (405 em verbos mutáveis). Não é autorizado utilizá-lo como gateway de comandos operacionais.

**Não enviar o token da plataforma ao piloto. Não transformar 401 em sucesso. Não liberar comandos por identidade declarada no payload.**

## Candidato de menor exposição

Propõe-se credencial independente, emitida pela **plataforma depois** de atestar aparelho, autorização humana, unidade e ator. Assinatura **Ed25519**, chave privada **somente da plataforma** (fora de Git e APK); piloto recebe exclusivamente chaves públicas explicitamente registradas e com `kid` conhecido, sem segredo de emissão.

Formato verificado no módulo `src/entregas/pilot/delegated-authorization.ts`:
- `pt1.<claims_base64url>.<assinatura_ed25519_base64url>`;
- `iss=deliveryos-platform-delegator`, `aud=deliveryos-pilot-event-write`;
- `scope=entregas:events:write`, `v=pilot-delegation@0.1.0`;
- `kid`, `jti`, `device_id`, `actor_id`, `unit_id`, `role`, `iat`, `nbf`, `exp`;
- validade máxima **300 segundos**, com tempo injetado para teste;
- verificação local da assinatura **antes de confiar em claims**, em seguida comparação de audiência, unidade, papel, escopo e validade;
- **consulta online obrigatória ao cadastro autoritativo**: negativa/revogação → 403; indisponível/UNKNOWN → 503, nunca aprovação implícita;
- token de plataforma original (dois segmentos) é recusado como credencial do piloto.

## O que o módulo NÃO faz (obrigatório antes do wiring)

1. **Não emite** tokens reais; os testes assinam com chaves efêmeras geradas localmente. A emissão pertence ao servidor crítico de sessão, com registro de autorização humana existente e chave distinta. Nenhuma chave privada compartilhada entre serviços.
2. **Não autentica rotas atuais**. `/api/events/batch` mantém o contrato atual e 401; o servidor oficial não incorpora o verificador nesta proposta.
3. **Não dá permissão universal de execução.** O servidor futuro precisará derivar `ActorContext` da credencial atestada (nunca do corpo recebido) e executar `assertCan(actor, action)` do domínio, **por evento**, além de comparar `unit_id`, `actor_id`, `device_id`, `trip_id` quando cabíveis.
4. **Não garante revogação apenas pela validade do token.** A consulta ao cadastro online precisa verificar device/ator/unidade e revogação de modo autoritativo a cada admissão. Prova do cadastro/timeout/fail-closed ainda precisa de teste HTTP.
5. **Não altera o Android.** O token específico do piloto deve ser obtido por uma rota atestada da plataforma, armazenado via Keystore/Room com finalidade distinta da sessão da plataforma, renovado e enviado **somente à URL HTTPS do piloto**. Não colocar token em WebView, log, binário ou URL.
6. **Não corrige sozinho** a conclusão `SUCCEEDED` após HTTP 401. O Worker precisará classificar a ausência da credencial do piloto e manter o status de sincronização observável; aplicar retentativas **limitadas**, sem retry infinito de 401 nem alterações à outbox nativa sem testes.
7. **Não expõe** serviço, deploy, GPS, dispositivo físico, pedidos reais ou alterações em Q-018/Q-019/Q-020. É apenas contrato testável, sem concessão de autoridade de execução operacional.

## Verificações atuais

`npx --offline --yes tsx src/entregas/pilot/run-delegated-authorization-tests.ts`:
**25/25 PASS**, incluindo assinatura falsa, token de audiência incorreta, expiração, unidade errada, aparelho revogado, cadastro indisponível, identidade inconsistente e token de plataforma recusado. `tsc -p tsconfig.json --noEmit`: exit 0. M1/C6: 40/40 PASS.

Esses testes são **unitários, isolados, sem network**. Eles **não provam** autorização de produção ou integração real.

## Portões para habilitar integração

1. Aprovar o contrato de audiência, emissão, cadastro/revogação e responsabilidade por chaves com segurança e autoridade humana; definir política de rotação/cutover sem downtime.
2. Testar o emissor real na plataforma e verificar que emitir requer autorização de aparelho/ator/unidade (não recebe role do Android).
3. Integrar verificador no piloto em branch separada, vincular todos os comandos/entregas à unidade e role e rejeitar payloads com identidade conflitante (403), sem mudar os consumidores de leitura.
4. Testar com duas unidades e três atores, expiração, suspensão, revogação, alteração de papel, replays e falha da consulta ao cadastro. Nenhum bypass para ambiente sem configuração.
5. Instrumentar Android API34/WorkManager: credenciais **por audiência**, falha de rede real, renovação após 401, recibo individual, persistência sem perda e backoff limitado. Testes com servidor oficial, não só fixture.
6. Repetir M1/C6, TypeScript, suíte Entregas e CI remoto. Manter PR em DRAFT/HOLD até revisão; nenhum merge/deploy.

**Resultado de hoje:** contrato e regras negativas comprovados isoladamente; integração entre plataforma/Android/piloto, operação real e autorização de ativação **NÃO COMPROVADAS**.
