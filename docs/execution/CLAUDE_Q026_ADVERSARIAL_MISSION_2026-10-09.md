# MISSÃO CLAUDE — Q-026 / REVISÃO ADVERSARIAL DE DESEMPENHO E EVENTOS

Data: 2026-10-09
Executor alvo: Claude Code, usando assinatura existente do César (sem habilitar API paga).
Repo: cesarspichencoff-cmyk/delviery-os
Branch de origem a revalidar: research/deliveryos-q026-window-shadow-20261009
Destino de entrega: branch NOVA feat/claude-q026-replay-adversarial-20261009, exclusivamente, sem merge.
Integração operacional: integration/deliveryos-product-ux-android-20261009 @ d0716fda380fc66cecfd791593cb6cc8c017b37a, intacta até nova autorização.
VÉRTICE: cesarspichencoff-cmyk/vertice-runtime. @ vertice-active, VERTICE_ENTRY.md (ponto final é literal).
Produto real: DeliveryOS somente ITAIM. Sem TATÁ Comanda.

## Objetivo

Ser a segunda inteligência INDEPENDENTE, adversarial, da frente que ChatGPT está investigando. NÃO confirmar por inércia a hipótese de "projeção incremental": tente falsificá-la. Encontre uma arquitetura menor que resolva o verdadeiro gargalo, ou prove por que não existe sob os contratos atuais.

## Verdade já provada e ainda não provada

- Q-025 Product UX+Android foi integrada somente em branch de teste d0716fd e os dois CIs pós-merge passaram.
- Q-026 permanece OPEN: janela N horas, turno, descarte do HTTP legado, checkpoints ou retenção não foram aprovados.
- Benchmark ANTERIOR em dados simulados: 1.030.000 fatos -> 23,7 s HTTP, 20,5 s porta, 8.253 KiB HTTP, +1,19 GiB de memória por clique; SQL apenas 420 ms. Não é medição de produção.
- PR #29 DRAFT: oito contraexemplos de cortes temporais via projetar() real, CI PASS em 2f31a3c; experimento adicional de cursor PostgreSQL pode estar em curso. Verificar o HEAD e cada CI antes de afirmar que passou.
- Schema real no 0001 tem event_id TEXT PRIMARY KEY, recorded_at TIMESTAMPTZ DEFAULT now(), occurred_at TIMESTAMPTZ e idempotency_key UNIQUE; 0002 adiciona sequence_local por aparelho, NÃO global; 0003 source_mode sem backfill. Sem chave ordinal de commit confirmada.
- O consumidor projeta e deduplica por chave; o reader lerFatosParaReplay reconstrói todos os envelopes; o read model Entregas chama essa porta em cada GET. Q-016 exige replay do log; Q-015 governa retenção de outra camada (Intelligence Spine), não autoriza descartar o event_log.

## Leia só o necessário

1. Confirmar origem HEAD, status limpo e fonte canônica (boot enxuto).
2. docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md, CLAUDE.md, docs/execution/PERGUNTAS.jsonl (Q-016/Q-024/Q-026), docs/execution/Q026_ENTREGAS_WINDOW_SHADOW_2026-10-09.md.
3. src/platform/migrations/0001_platform_foundation.sql, 0002_event_log_contexto_dispositivo.sql, 0003_event_log_source_mode.sql.
4. src/platform/projections/replay-do-event-log.ts, operacao-viva.ts, consumidor.ts; src/platform/leitura/realidade-de-entregas.ts; src/platform/persistence/pg-repositories.ts.
5. tests/product/run-q026-window-shadow-tests.ts e run-q026-ingest-cursor-pg-tests.ts, conforme HEAD.

## Trabalhe como revisor e arquiteto independente

A) Derrube ou valide as alegações dos testes: late-arriving records, clock_trust, source_mode, idempotência, reordenação, uma viagem antiga aberta e terminal atrasado. Distinga falha lógica de lacuna de contrato.

B) Cheque se recorded_at, event_id, sequence_local, postgres sequence ID, txid, commit timestamp, WAL/LSN, outbox claim/ack ou qualquer cursor de entrega existente podem fornecer marca incremental sem perder commits concorrentes. Não aceite "auto incremento" como ordenação de commit sem uma prova de corrida. Evite suposições sobre recursos PostgreSQL não ativados.

C) Compare 3 estratégias em prova, não em opinião: (1) melhoria sem checkpoint (streaming, memoization controlada, agrupamento prévio, leitura com filtro por unidade somente para Product System e projeção completa), (2) projeção incremental transacional com fonte de eventos ordenada, (3) snapshot reconciliável/versionado ou outro mecanismo já existente. Para cada: efeito sobre sem_modo, corrupção, dedupe, ordem por occurred_at/sequence/event_id, pureza de projetar(), idades, proveniência, múltiplas unidades e modos, auditoria, crash, restauração, evolução de versão e custo de memória. Atenção: state.events carrega todos event_ids, podendo ser O(n) mesmo em snapshot; não ocultar isto.

D) Inspecione a diferença entre a API de leitura e a Q-016 (reconstrução integral canônica) e proponha eventual separação de leitura rápida humana e replay forense, sem violar ausência de fato = UNKNOWN.

E) Defina teste de equivalência verificável e benchmark determinístico num banco descartável em 1k, 100k e ~1M eventos com p50/p95, RSS e resposta; não executar carga gigantesca no computador do usuário sem checar limites. Use GitHub Actions se habilitado/gratuito.

F) Recomendação única: o menor experimento seguro com critérios binários de aceite/rejeição, dependências de autorização e plano rollback. Não editar runtime nem schema para esconder Q-026.

## Proibições

- Não fazer merge, não tocar main/produção, não mudar o TATÁ Comanda, Android, impressão, reader CAIXA, forma de GPS do dispositivo, schema operacional ou HTTP em uso.
- Não aceitar recursos pagos, não instalar aplicações/credenciais, não usar dados operacionais reais para testes, não promover fixture a fato.
- Se falta auth, permissão de ferramenta, tempo ou quota, registrar LIMITAÇÃO; não fingir execução.
- Não reabrir Q-025. Q-026 é decisão separada e humana. Branch de testes já validada permanece intacta.

## Entrega

1. Arquivo docs/execution/CLAUDE_Q026_ADVERSARIAL_REVIEW_2026-10-09.md na SUA nova branch com HEAD/base, evidência, testes executados, provas, alternativas eliminadas, falha mais séria no plano do ChatGPT, proposta concreta, bloqueios e custo.
2. PR DRAFT contra a branch research (não merge), apenas docs e testes SHADOW se necessários.
3. Handoff em uma frase: "aprovar / rejeitar / investigar" o experimento sugerido, e por quê. Adversarial de verdade: se ChatGPT estiver errado, diga.
