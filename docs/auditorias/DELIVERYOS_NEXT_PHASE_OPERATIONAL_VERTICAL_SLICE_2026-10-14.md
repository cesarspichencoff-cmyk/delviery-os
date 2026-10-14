# DeliveryOS — decisão de próxima fase para operação controlada

**Data:** 2026-10-14. **Status:** DECISÃO DE ENGENHARIA + REPRODUÇÃO DE RISCO, SEM LIBERAÇÃO OPERACIONAL.

## Objetivo e fonte da verdade

Entregar o primeiro fluxo **realmente funcional** do DeliveryOS para uma unidade do TATÁ, com viagem de entregador interno, identidade atestada, saída, chegada, confirmação de entrega, retorno, reinício/offline, recibo correto e leitura por Entregas/Copiloto.

Repositório de código: `cesarspichencoff-cmyk/delviery-os` (grafia literal). Base do candidato inspecionado: `9121c252d864a8b74ef33e8c9e5c0d81d687ffa3` (PR #108). Os PRs #106, #108, #109, #110 e #111 foram revalidados no GitHub como **DRAFT / sem merge**, na inspeção de 14/10. Nenhum CI remoto foi confirmado para os commits #110 e #111 na busca inicial.

A fonte de continuidade em `main/PROJECT_STATE.json` ancora um `state_basis_head=a441bc7e...`, anterior às provas mais recentes. Não interpretar o checkpoint antigo como negando a evolução comprovada nas branches; nem declarar o código novo em `main`/produção por existir em PRs.

## Descoberta nova e bloqueante — contexto de ator entre requisições

No piloto o handler resolve `actor=requestActor(token)` e chama `facade.bindActor(actor)` **antes** de `await readBody(req)`. A única `PilotApplicationFacade` guarda `private actor` mutável, também usado por `snapshot()` e `execute()`.

**Reprodução real em processo isolado, sem HTTP externo nem pedidos:** em uma fachada com armazenamento sintético temporário, iniciou-se `facade.snapshot()` com `LAB-RIDER`, trocou-se `facade.bindActor()` para `LAB-MANAGER` antes de resolver a leitura e a resposta da primeira operação trouxe **`LAB-MANAGER`**, não `LAB-RIDER`.

Log exato: [reprodução de contaminação](evidencias/operational-vertical-slice-2026-10-14/actor-context-concurrency.log). O teste de regressão é [actor-context-isolation.regression.ts](evidencias/operational-vertical-slice-2026-10-14/actor-context-isolation.regression.ts), **intencionalmente falhando no código atual**, devendo passar após a correção.

**Limite:** a reprodução comprova mistura de identidade **na leitura**, não execução indevida de comandos. Contudo, comandos assíncronos também usam o campo `actor` global; exigir teste de concorrência HTTP com atores/papéis diferentes e nenhuma escrita de unidade diferente antes de abrir o piloto. Corrigir pela identidade **imutável por requisição**; jamais usar `bindActor` em singleton para autoridade de requisições paralelas. Preservar política `assertCan` por comando.

## Análise de rotas

| Alternativa | Reuso atual | Exposição / mudança | Decisão |
|---|---|---|---|
| Credenciais estáticas de `cfg.users` diretamente no Android | `requestActor` aceita token de usuário já configurado | Não atesta aparelho nem estabelece renovação curta/revogação por aparelho; aumenta risco com token de longa duração | **Descartar para operação Android**; só uso já delimitado e supervisionado do piloto |
| Migrar todos os comandos/Trips para `product_system_server.ts` / plataforma | Plataforma já tem sessões e identidade | Product System hoje é **somente leitura**; exigiria portar domínio, estados, autorização, persistência e adaptar Android | **Adiar**; complexidade maior e risco de regressão sem ganho necessário para primeiro uso |
| Aproveitar servidor piloto/dominio existentes + delegação curta pela plataforma | PR #110: verificador Ed25519 unitário 25/25; `identity.device` e `identity.actor` têm vínculo, papel e status; PR #111 conserva erro 401 no Android | Implementar emissor, registro autoritativo, consumo isolado e contexto de ator seguro; testes negativos obrigatórios | **Escolher** para primeiro fluxo operacional |

O token da plataforma não pode ser encaminhado como se fosse token de piloto. O novo token deve ser assinado com chave privada **exclusiva da plataforma**, audiência `deliveryos-pilot-event-write`, expiração curta, ID do dispositivo, ator, papel e unidade atestados; o piloto verifica assinatura e consulta online a autorização atual (revogação não é opcional). Não remover 401 existente enquanto não houver passagem atestada.

## Próxima fase: um único recorte vertical, sem PRs auxiliares de dispersão

**Base de desenvolvimento:** worktree isolada a partir do candidato #108; reconciliar seletivamente as mudanças **#109 (correlação de parada), #110 (contrato de delegação) e #111 (falha visível do WorkManager)**. Não fazer merge automático em `main`, produção, ou PR #106. Unificar evidência e regressões em um único candidato de integração para revisão.

Ordem de execução:
1. **Corrigir identidade por requisição primeiro**. Reproduzir e eliminar a contaminação `RIDER -> MANAGER` e o inverso, com duas chamadas HTTPS sobrepostas, sem permissão cruzada nem ação atribuída a ator errado. Tornar actor explícito/imóvel em cada comando e snapshot; preservar deduplicação de comandos.
2. **Delegação de credencial**: plataforma emite somente depois de consultar registro autoritativo `identity.device` + `identity.actor` (papel ativo e unidade), usando o segredo atual da sessão apenas na plataforma. Piloto verifica `kid`, assinatura, `aud`, expiração e revogação por requisição, derivando `ActorContext` do cadastro. Testes de outra unidade, papel insuficiente, expiração, revogação, token de plataforma direto no piloto, indisponibilidade do registro e concorrência.
3. **Android com sessão própria do piloto**: token específico obtido na plataforma por rota autenticada, guardado cifrado via Keystore/Room com finalidade distinta da sessão atual; nunca em WebView/log/query/URL. `SyncWorker` renova sob 401 adequado, preserva itens no SQLite, registra erro visível se autorização não puder ser obtida, usa `Result.retry` limitado para falhas realmente transitórias e só marca `sent` com recibo individual válido.
4. **Uma viagem end-to-end no mesmo ambiente, sem ficções cruzadas**: criar Trip sintético → sair → chegar → confirmar entrega → retornar → encerrar; desligar/religar o destino HTTPS; recriar o processo; exigir IDs e idempotência idênticos no Android, piloto persistente, feed público, plataforma PostgreSQL temporária e leitura das duas superfícies. Rejeitar duplicidade/ator errado e auditar todos os recibos. **Três eventos de parada continuam isolados pelo adaptador canônico**; integrar a leitura de paradas por contrato próprio ou delimitar explicitamente a UI sem simular completude.
5. **Preparar um piloto real, estreito e reversível**: uma unidade (Itaim), um motoboy interno + líder, pedidos elegíveis explicitamente autorizados e operados sob supervisão. Sem GPS até termo, consentimento, privacidade e prova física; sem converter pedidos iFood de entregador externo em Trip nativa. TLS válido, acesso restrito, armazenamento durável, backup testado e plano de rollback obrigatório. Somente decisão humana autoriza o primeiro dado real.
6. **Gate de promoção**: build Android, 19 testes instrumentados básicos, regressões do Worker, M1/C6, suites de Entregas, testes de segurança/revogação, evidência visual, CI remoto e aceite humano. Para cada item distinguir `CODE_READY`, `TEST_PASS`, `DEPLOYED`, `WORLD_PROVEN` e `HUMAN_ACCEPTED`.

## Resultado e limite desta auditoria

- **PROVEN:** a identidade de leitura na fachada compartilhada foi contaminada por interleaving controlado; Git HEAD base limpo; PRs seguem Draft; source atual da plataforma possui tabelas de ator/aparelho, rota identity e sessão atestada.
- **PROVEN anteriormente em laboratório:** sincronização Android/Room de volta após indisponibilidade HTTPS; Piloto retorna 401 sem credencial; proposta PR #110 validou a assinatura e negativas isoladas; PR #111 corrige a falsa conclusão `SUCCEEDED`; quatro eventos canônicos da mesma Trip chegaram ao PostgreSQL e a Entregas/Copiloto.
- **INFERENCE / seleção:** delegação atestada mantendo o servidor piloto existente oferece o menor retrabalho seguro para MVP, **desde que** a identidade por requisição e as provas HTTP integradas sejam fechadas.
- **UNKNOWN:** readiness do serviço crítico em ambiente real, rotação/armazenamento de chaves de emissão, integração concreta das sessões com Android, prova de concorrência de comando, teste de backup restore operacional, conectividade TLS de aparelhos reais e CI remoto da integração.
- **BLOQUEADO:** merge em `main`, deploy produtivo, importar pedidos reais, ativar GPS e considerar a operação pronta antes dos portões.

**Próxima execução de maior valor:** implementar o isolamento imutável de ator e os testes concorrentes no mesmo branch de integração onde serão conectadas as duas pontas da credencial. Evitar novos mocks de UI e repetir suites já verdes sem novo risco identificado.
