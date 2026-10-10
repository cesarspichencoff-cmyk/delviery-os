# Q-026 — cancelamento PostgreSQL negado e saturação do pool no HTTP real (SHADOW)

**Data:** 2026-10-10 · **PR #56** empilhado sobre #55 · somente teste, workflow e esta documentação. Mantém HOLD, sem merge ou deploy.

## Por que este teste existe

O PR #55 liga experimentalmente `GET /api/entregas` a cancelamento PostgreSQL e deadline opt-in. Entretanto, testes bem-sucedidos de `pg_cancel_backend` com a mesma role não provam o tratamento quando a permissão é revogada ou quando **mais requisições HTTP são admitidas do que o número de conexões do pool**.

A proteção candidata ainda é ativada apenas com `DELIVERYOS_ENTREGAS_RR_DEADLINE_MS=3000` e `DELIVERYOS_ENTREGAS_MAX_INFLIGHT=1/2/4`, no processo isolado de teste. A configuração não foi ativada em produção.

## Teste e fronteira da fixture

`tests/product/run-q026-http-failure-paths-shadow.ts` importa a **rota HTTP real** de `tools/product_system_server.ts`, cria banco PostgreSQL 16 descartável, sem operação real, com 12.000 eventos sintéticos, e bloqueia a tabela `platform.event_log` com `ACCESS EXCLUSIVE LOCK` de outra sessão. As requisições usam sockets HTTP localhost reais e a consulta original do leitor RR canônico, não uma simulação de handler.

O workflow `.github/workflows/deliveryos-q026-http-failure-paths-shadow.yml` tem matriz de dois cenários, mais regressões Q-016, Product e governança. Se faltar o banco PostgreSQL, o script sai com **78**; nenhum sucesso simulado.

### Cenário A: `cancel_denied`

Cria uma role PostgreSQL **não superusuária** com `SELECT` sobre `identity.device` e `platform.event_log` apenas, e remove **no cluster PostgreSQL descartável de CI** o privilégio `EXECUTE` de `pg_catalog.pg_cancel_backend(integer)` da role via `REVOKE ... FROM PUBLIC`. Verifica programaticamente que `has_function_privilege=FALSE` e que uma chamada do próprio usuário retorna SQLSTATE **42501**.

Em seguida, faz `GET /api/entregas` enquanto o SQL real está bloqueado por lock, tenta outro GET e exige controle de admissão. Com `pg_cancel_backend` negado, o `SET LOCAL statement_timeout` no caminho RR deve interromper a consulta sem enfileiramento eterno. Após a resposta, a observação deve confirmar que não sobrou SQL bloqueado. Libera lock e exige novo HTTP **200** com dados disponíveis, além de `/api/health` 200.

**[CI #38089243877](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38089243877)**: PASS, status HTTP **503** em **3.004,47 ms**, permissão SQL negada com **42501**, consulta bloqueada encerrada, health e nova leitura HTTP **200**. Não extrapolar esse valor único para p95/p99.

### Cenário B: `pool_saturated`

`MAX_INFLIGHT=4` e cliente PostgreSQL de `max=2`: inicia 4 GETs simultâneos contra o SELECT bloqueado. A quinta solicitação excedente deve ser rejeitada imediatamente com 503 `leitura_temporariamente_ocupada`, `Retry-After: 1`. O prazo total de 3000 ms vence para os 4 GETs admitidos, cada um respondendo **503 `prazo_total_excedido`**. A rota de saúde continua 200. Após liberar o lock, nova leitura HTTP 200 e ausência de consultas ativas/em transação de Entregas.

No mesmo CI: PASS, durações observadas dos quatro GETs de **3006,86 / 3006,85 / 3006,78 / 3007,44 ms**, fifth request 503, health 200, recuperação 200, zero consultas ativas de Entregas na sondagem final.

### Integridade metodológica

A primeira execução [#38089135635](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38089135635) reprovou em TS por inferência errada no tipo do callback Promise; foi corrigida. A segunda [#38089185901](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38089185901) aprovou `cancel_denied`, mas `pool_saturated` falhou porque a consulta SQL do **próprio observador** era contada como sessão ativa (autorreferência no filtro `query LIKE '%platform.event_log%'`). O terceiro CI corrigiu adicionando `pid<>pg_backend_pid()`; não houve alteração do produto nem redução das exigências de resposta. **Só a terceira execução deve contar como prova completa desses cenários.**

## O que está provado — e o que não está

**PROVADO NA FIXTURE:** a rota real com flags opt-in recusa excesso de chamadas e mantém saúde HTTP, o fallback `SET LOCAL statement_timeout` encerra leitura bloqueada quando `pg_cancel_backend` está proibido, resposta de deadline é deliberada, nova leitura após falha é possível e testes de regressão Q-016/Product/governança não foram quebrados.

**AINDA NÃO PROVADO:** limite rígido do `pool.connect()`, pool com múltiplos processos/workers, carga real ou p95/p99, desligamento de socket em múltiplas fases do request, consumo de memória do leitor incremental conectado à rota, prevenção de CPU que monopoliza o event loop, Preview, SSL/role operacional real e dispositivos físicos.

Uma resposta 503 dentro do budget não garante que a conexão SQL tenha sido liberada **antes do mesmo instante** quando o pool está saturado. O código atual retém o slot HTTP até fim do processamento, protegendo contra dupla admissão, mas a espera pelo pool não está sujeita a cancelamento estrito pelo AbortSignal.

**Decisão:** pesquisa útil e aprovada em ambiente isolado, mas **Q-026 permanece OPEN / HOLD**. Sem merge, produção, integração, migrações, banco operacional, retention ou gasto autorizado.
