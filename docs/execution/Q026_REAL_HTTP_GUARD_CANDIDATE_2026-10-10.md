# Q-026 — rota real HTTP com cancelamento e prazo total opt-in (CANDIDATO/HOLD)

**Data:** 2026-10-10. **PR #55**, empilhado sobre #54; sem merge, deploy, migrations, dados operacionais ou alteração de main/integração.

## Estado anterior do código (fonte no repositório)

A implementação existente de `GET /api/entregas` em `tools/product_system_server.ts` faz `facade.snapshot()`, `lerRealidade(clientePlataforma)`, `entregasVM` e retorna JSON. A proteção de admissão é opcional: `DELIVERYOS_ENTREGAS_MAX_INFLIGHT` aceita 1/2/4. **Não havia integração HTTP socket close → cancelamento PostgreSQL nem prazo global**. O adaptador SQL `PgSqlClient.transaction()` mantém a mesma conexão por BEGIN/COMMIT/ROLLBACK/release. `statement_timeout` por si só não limita sequências inteiras de statements.

## Alterações candidatas (apenas esta branch)

1. **`src/platform/leitura/leitor-rr-cancelavel.ts`**: wrapper da interface `TransactionalSqlClient` usada pelo verdadeiro `lerRealidadeDeEntregas`. Preserva SET TRANSACTION RR READ ONLY como primeiro comando após BEGIN. Obtém PID dentro da transação após o SET. Para cada comando subsequente, coloca `SET LOCAL statement_timeout` em função do tempo de parede restante, com limite máximo por statement de 15s. Trata `AbortSignal` cancelando consulta pelo `pg_cancel_backend(pid)` via conexão independente. Aguarda cancelamentos solicitados **antes** da liberação da conexão para não cancelar um backend que tenha sido entregue a outra requisição.
2. **`tools/product_system_server.ts`**: flag exclusivamente opt-in `DELIVERYOS_ENTREGAS_RR_DEADLINE_MS`, aceita 1000..15000 ms e **requer** `DELIVERYOS_ENTREGAS_MAX_INFLIGHT` 1/2/4; configuração inválida reprova boot. Quando flag ausente, rota original permanece sem abortador e sem pool adicional. Quando ativa, cria cancelador de uma conexão independente e deadline a partir da admissão, registra `ServerResponse.close` com `!writableEnded` (não `IncomingMessage.close`, que pode significar recebimento normal de GET). O deadline responde 503 JSON `prazo_total_excedido`, mas **não libera slot antes de a leitura/rollback efetivamente terminar**. Clientes desconectados não recebem 200 fictício.
3. **`tests/product/run-q026-real-http-guard-candidate.ts`**: testa **o próprio `criarServidor()`**, porta HTTP local aleatória, PostgreSQL 16 descartável, tabela `platform.event_log` com 2500 eventos sintéticos. Um writer mantém `LOCK TABLE platform.event_log IN ACCESS EXCLUSIVE MODE` para bloquear a leitura real sem injetar sleep no código do produto; observador detecta bloqueio em `pg_stat_activity`.

## Provas executadas em CI

**[GitHub Actions #38088004495](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38088004495)**: 3/3 jobs SUCCESS no commit 08753f369e: regressões Q-016, Product, governança e matriz da rota real com candidato **desligado** e **ligado**. Após esse run, acrescentou-se teste explícito de Q-016 no cenário de restauração; exigida nova execução verde no HEAD final.

No modo enabled, `DELIVERYOS_ENTREGAS_MAX_INFLIGHT=1`, `DELIVERYOS_ENTREGAS_RR_DEADLINE_MS=3000`:
- GET 200 inicial, usuário desconecta enquanto SELECT real bloqueado por lock PostgreSQL: backend `state=idle` / `backend_xmin=NULL`; intervalo socket→observação idle **44,04 ms** (uma amostra).
- Seis HTTP GETs excedentes retornam 503 `leitura_temporariamente_ocupada`, Retry-After 1; endpoint `/api/health` continua 200.
- GET subsequente, ainda com lock, recebe HTTP **503** `prazo_total_excedido` após **3002,23 ms** (deadline 3000); backend liberado; PID reutilizado.
- Após desbloqueio e commit GPS novo, GET responde 200 com posição diferente — observa dado novo, não estado congelado — e POST permanece 405.
- Modo `disabled` também retorna 200 inicial e nova posição; mostra preservação do comportamento padrão.

O primeiro run **#38087931118 FALHOU** porque o teste lia `fatos_por_modo` (um campo interno), inexistente no contrato HTTP público. Corrigido para afirmar `ultima_posicao.observado` e diferença de `ultima_posicao.em`, sem alterar código de produto.

## Riscos e lacunas: NÃO PROMOVER

- A implementação candidata ainda usa o leitor **canônico integral** com materialização de fatos em memória. A melhoria RSS da prova #52 é código de pesquisa no teste, não substitui esse reader; portanto não fecha o risco de memória com 1 milhão de eventos na rota real.
- A deadline protege a resposta e os comandos SQL com `SET LOCAL statement_timeout`, mas **não prova interrupção imediata de `pool.connect()` ou de trabalho CPU síncrono após a transação**. A admissão permanece retida enquanto o trabalho termina; timeout de aquisição do pool ainda merece prova específica.
- Execução de `pg_cancel_backend` exige permissão PostgreSQL; o teste usa superusuário do PostgreSQL efêmero. O papel operacional real **não foi validado**. Exige ensaio com papel least privilege. Uma falha do cancelador independente depende do timeout de statement para terminar.
- Conexão de cancelamento adicional e aumento de round-trips por SET LOCAL demandam benchmarks reais, testes de carga (p95/p99), cenários de desconexão após COMMIT, crescimento do número de viagens distintas, concorrência em pools compartilhados, e prova real de isolamento, TLS e permissões.
- `tools/product_system_server.ts` é servidor de apresentação em modo read-only; esta alteração não substitui `critical.ts`, nem consiste em deploy de produção ou dispositivo físico.
- Somente o laboratório com lock sintético foi aprovado; Preview, autenticação real e uso em dispositivos permanecem UNKNOWN.

## Próximos portões

1. CI verde no HEAD final, com replay forense Q-016 explícito pós-cancelamento.
2. Auditoria adversarial independente de race de PID entre cancelamento e release, stuck pool checkout, timeouts e aplicação de READ ONLY.
3. Isolar papel PostgreSQL com menos privilégios e confirmar `pg_cancel_backend` da própria sessão do mesmo usuário; testar cancelador indisponível e pool saturado.
4. Refatorar o incremental **full model** do #52 em código reutilizável e conectar à rota real **somente** após prova de paridade, memory envelope, budget e regressões.
5. HTTP/Preview, testes físicos, critérios operacionais, autorização humana para promoção.

**Q-026 OPEN.** **CANDIDATE NOT PROVEN IN PRODUCTION**. Sem merge/deploy/main/integração/dados reais/migração/retention/gasto novo.

## Prova adicional: role PostgreSQL de privilégios mínimos

**[CI #38088254650](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38088254650) — SUCCESS 4/4 jobs**, HEAD `5d4a8fbb`. A matriz ampliada repete a rota real em **enabled/admin**, **enabled/reader**, **disabled/admin**, mais Q-016/Product/governança.

No teste `enabled/reader`, o banco PostgreSQL 16 temporário cria a role **LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION**, com `USAGE` nos schemas `identity/platform` e `SELECT` apenas nas tabelas `identity.device` e `platform.event_log`. A própria conexão autenticada confirma `current_user=q026_http_reader`. INSERT em `identity.unit` é recusado com SQLSTATE **42501**; não existe concessão de INSERT, UPDATE, DELETE nem `pg_signal_backend`.

Apesar disso, a mesma role consegue cancelar **sua própria consulta** de longa duração através da conexão independente de mesmo usuário, sem superusuário. Provas:
- Socket HTTP encerrado: `backend_xmin` liberado, PostgreSQL retorna a `idle` em **43,00 ms** (uma amostra).
- Deadline de 3000 ms: 503 após **3001,90 ms**, backend liberado e PID reutilizado.
- Seis concorrentes rejeitados, health 200, leitura nova 200 após commit, replay Q-016 com **2.501 eventos** íntegros.
- Role administradora e flag desligada passam separadamente.

A conta real de operação pode ter política de autenticação/TLS diferente; esta prova apenas indica que **o mecanismo PostgreSQL não exige superusuário** quando o mesmo usuário cancela sua própria sessão. Não usar esta role sintética em banco operacional e não supor que o usuário real já tenha exatamente essas permissões.

**Nova fronteira:** permanece sem prova de memória incremental na rota real em escala milionária, p95/p99, pool checkout sob saturação, falha do cancelador, timeouts durante CPU síncrona, Preview e dispositivos. Nenhum merge/deploy autorizado.
