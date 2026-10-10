# Q-026 — limite nativo de checkout do pool PostgreSQL no GET HTTP real (CANDIDATO / HOLD)

**Data:** 10/10/2026 · **PR #57** sobre #56 · escopo controlado: rota HTTP de apresentação em branch de pesquisa e fixture de testes. **Nenhuma mudança de produção/main/integração, banco operacional ou migração.**

## Evidência da causa

O adaptador `src/platform/persistence/sql-client.ts` cria `pg.Pool` com `connectionTimeoutMillis: opts.connectionTimeoutMillis ?? 5_000`. O servidor `tools/product_system_server.ts`, no código candidato do PR #55, usa `createPgClient({url:URL_PLATAFORMA,max:2})` para `/api/entregas`. Uma deadline explicitamente configurada em 3.000 ms pode responder 503 ao cliente enquanto uma aquisição FIFO do pool espera até 5.000 ms. `AbortSignal` não interrompe diretamente a fila de `pool.connect()`; um `Promise.race` ingênuo deixaria um checkout aguardando que poderia entregar uma conexão posteriormente sem cleanup seguro.

## Mudança proposta

No `criarServidor()`, somente quando `DELIVERYOS_ENTREGAS_RR_DEADLINE_MS` for explicitamente habilitada (1000..15000 ms e admissão 1/2/4 exigida pela política anterior), passar `connectionTimeoutMillis:Math.min(1000,PRAZO_ENTREGAS_RR_MS)` ao `createPgClient` de leitura; sem a flag, mantém código anterior e timeout de 5.000 ms. Isto utiliza a **fila e timeout nativos do driver pg-pool**. Não configura limite novo global para o banco nem modifica as transações de escrita/outros componentes.

O limite de 1s vale para **adquirir uma conexão** ao pool e também para o estabelecimento de novas conexões. A fila fica limitada, mas a chamada HTTP como um todo ainda depende de processamento CPU/event loop. Não declarar deadline global rígida.

## Teste adversarial na rota real

`tests/product/run-q026-http-failure-paths-shadow.ts`, PostgreSQL 16 descartável, eventos 12.000 sintéticos, `platform.event_log` bloqueada por outra sessão com `ACCESS EXCLUSIVE LOCK`. A requisição HTTP usa **`tools/product_system_server.ts` real**, no localhost, com opt-in `MAX_INFLIGHT=4`, prazo 3.000 ms e pool de 2 conexões. O leitor continua realizando SELECT e transação RR reais.

[GitHub Actions #38090563453](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38090563453) no commit `43c5f08370422717784729db3171e960b382e489`: **4/4 jobs SUCCESS**, com:
- `pool_checkout_fast`: 2 leituras esperando conexão encerram em **1.005,77 ms** e **1.005,87 ms**; retornam HTTP **200** com `leitura.disponivel=false` e `motivo=indisponivel`, jamais um objeto vazio saudável. As 2 consultas já ativas recebem **503 `prazo_total_excedido`** em **3.006,02/3.005,94 ms**. Quinta requisição recebe 503 de admissão; health 200; após liberar lock, novo HTTP 200 disponível, sem consultas órfãs ativas.
- `pool_saturated`: 8 GETs simultâneos geram **4 recusas de admissão** em ~6–8ms, 2 leituras com timeout de aquisição em **1.004,21/1.005,72ms**, e 2 deadlines ativas em **3.006,88/3.006,98ms**. Health 200, recuperação 200 e nenhuma consulta ativa de Entregas na sondagem final.
- `cancel_denied`: mesmo que a role PostgreSQL não superusuária perca `EXECUTE` em `pg_cancel_backend(integer)` **exclusivamente no cluster de teste**, o SQL bloqueado termina por `SET LOCAL statement_timeout` (HTTP 503 após 3.004,05ms), sem consulta bloqueada remanescente, e a rota recupera.
- `regression`: Q-016, Product, governança e recusa sem PG real (exit 78).

### Linha de verdade

A primeira rodada #38090473633 teve **falha na configuração do teste `pool_checkout_fast`**, que foi criado com limite de admissão 1 por um ternário não estendido para o caso novo; não havia como obter duas sessões SQL ativas. Corrigido no script de pesquisa para `CASE==="cancel_denied"?"1":"4"`; o produto não foi alterado. A execução correta é #38090563453; não contar a primeira como prova.

## Limitações

- HTTP **200 indisponível** após timeout de aquisição é consistente com a estrutura pública atual de `lerRealidade()` para falha de leitura. Não é HTTP 503 de sobrecarga e pode confundir clientes que inspecionam só o status — decisão explícita de contrato antes da produção.
- A configuração 1.000 ms é conservadora e pode aumentar indisponibilidade aparente ao criar novas conexões com handshake/TLS lento. Benchmark e tuning por ambiente necessários.
- O timeout de conexão não é um sinal cooperativo de abort de `pool.connect()` e não cobre CPU síncrona, `COMMIT/ROLLBACK` congestionados, múltiplos workers, durabilidade de conexão, p95/p99, env Preview/dispositivos ou comportamento de rede real.
- A rota real ainda materializa todos os fatos em memória. A implementação incremental com RSS reduzido da pesquisa #52 **não está integrada**; prioridade de trabalho reservada a outra branch/Claude.
- Não provar ausência universal de vazamento por uma única coleta `pg_stat_activity`, nem extrapolar amostras únicas CI para SLA.

## Próximo gate de maior valor

Revisar contrato HTTP para diferenciar pool cheio de indisponibilidade geral sem perder dados de diagnóstico; testar p95/p99 e falhas durante acquire em um cluster de trabalho mais realista; combinar a redução de memória apenas depois de auditoria e prova de paridade. Q-026 **OPEN/HOLD**, sem autorização para promoção.
