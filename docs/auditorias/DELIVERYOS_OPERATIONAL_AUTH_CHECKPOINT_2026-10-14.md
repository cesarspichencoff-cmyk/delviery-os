# DeliveryOS — checkpoint de integração operacional (14/10/2026)

**Estado: PARCIAL / DEVELOPMENT CHECKPOINT. NÃO É CANDIDATO OPERACIONAL HOMOLOGADO.**

## Origem
- Repositório: `cesarspichencoff-cmyk/delviery-os`.
- Base de trabalho: `9121c252d864a8b74ef33e8c9e5c0d81d687ffa3` (PR #108, Draft/HOLD).
- Worktree isolada: `C:\Users\italo\deliveryos-operational-integration-20261014`, branch local `integration/deliveryos-operational-auth-20261014`.
- **Checkpoint de código confirmado em commit local:** `7b953c3`, isolamento de identidade por requisição.
- Alterações posteriores na mesma worktree incluem protótipo de emissor, contrato delegado e Worker; **não há prova de push dessa branch ao GitHub**. O executor recusou tentativas de `git push`; não presumir que o commit local esteja remotamente disponível.

## Primeiro bloqueio corrigido localmente: identidade de requisição
O servidor piloto chamava `facade.bindActor(actor)` numa única instância compartilhada. Um teste anterior reproduziu troca de identidade entre motoboy e gerente em leitura após `await`.

A branch local adicionou `AsyncLocalStorage` em `PilotApplicationFacade` e chama `facade.withActor(actor, async () => ...)` no handler HTTP. O ator é capturado como snapshot imutável por requisição; `getActor`, `snapshot` e `execute` usam o contexto assíncrono. O login HTTP não atualiza o ator global legado. `bindActor` permanece para chamadas legadas, **não deve voltar a ser usado como autoridade no handler HTTP**.

**Testes executados sobre a correção:** 
- `run-request-actor-isolation-tests.ts`: PASS (duas leituras simultâneas independentes e requisição sem identidade);
- `run-session-isolation-tests.ts`: **19/19 PASS**, incluindo rajada de 24 snapshots paralelos e testes de papéis e acesso sem token;
- `run-pilot-gate-tests.ts`: **14/14 PASS**;
- `run-source-mode-tests.ts`: **5/5 PASS**;
- `run-m1-bridge-tests.ts`: **40/40 PASS**;
- `tsc -p tsconfig.json` com emissão: exit 0.

Os testes não substituem uma auditoria de concorrência do armazenamento persistente sob carga nem homologação física.

## Autorização piloto — progresso parcial
- O verificador Ed25519 e teste do PR #110 foram copiados para a branch local; `run-delegated-authorization-tests.ts`: **25/25 PASS**. Token da plataforma nunca é reconhecido como token do piloto.
- `SyncWorker.kt` foi trazido da fonte exata do PR #111, mantendo evento na fila e execução `FAILED` após HTTP 401. Sua prova Android API34 pertence ao **PR #111 isolado**, não a esta integração composta.
- Foi criado `src/platform/auth/pilot-delegation-issuer.ts`, módulo puro **não conectado à rota HTTP**, que requer token autenticado, registro atual de aparelho e ator ativo na mesma unidade; inicialmente só `motoboy_interno`. Assina com chave Ed25519 injetada da plataforma.
- Foi preparado `src/platform/run-pilot-delegation-issuance-tests.ts` para integração emissor→verificador e recusas por expiração/identidade/unidade/revogação.
- Checagem TypeScript sobre o novo emissor: **exit 0**. **O teste executável de emissão ainda não passou nem falhou: sua execução foi bloqueada pelo executor remoto.** Portanto o emissor NÃO está provado funcionalmente.

## Limites e gate de próxima fase
1. Rodar as provas negativas emissor→verificador e validar material de chave apenas em sandbox; nenhuma chave privada real no repositório ou APK.
2. Integrar emissão por rota da plataforma usando cadastro autoritativo `identity.device` e `identity.actor`; sem aceitar papel/unidade de payload cliente.
3. Expor verificação online de revogação e papel ao piloto; falha de registro deve responder 503, não permitir comandos.
4. Preservar autorização por comando e identidade imutável por requisição; implementar sessão própria do piloto cifrada no Android.
5. Repetir um único fluxo sintético ponta-a-ponta entre Android, piloto, ingestão PostgreSQL, Entregas e Copiloto com HTTP/TLS real, perda de rede, replay e recibos.
6. Revisar CI remoto, backup/restore, isolamento de unidade, TLS, privacidade/GPS, dispositivo físico consentido e autorização humana antes do primeiro pedido real.

**PROIBIDO confundir:** commit local com código publicado; contrato TypeScript compilado com autenticação habilitada; teste simulado com operação TATÁ. Não houve merge, deploy, uso de pedidos reais, ativação GPS nem liberação operacional neste checkpoint.
