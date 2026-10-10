# Q-026 — HTTP disconnect, prazo global e rollback PostgreSQL (SHADOW)

**Data:** 10/10/2026 · **PR #54**, a partir do PR #53. Nenhuma alteração na rota/runtime operacional, somente script e workflow de pesquisa.

## Descoberta real no código existente

`tools/product_system_server.ts`, `GET /api/entregas`:
- contabiliza requisições admitidas com `DELIVERYOS_ENTREGAS_MAX_INFLIGHT=1/2/4` **somente por opt-in**; omisso, limite zero;
- aguarda `lerRealidade(clientePlataforma)` e libera slot em `.finally()`, independentemente do estado do socket;
- não acompanha evento de fechamento da resposta, não passa sinal de cancelamento à transação SQL, e não define deadline global HTTP → PG.
- `src/platform/persistence/sql-client.ts` executa `BEGIN`, `COMMIT/ROLLBACK` e `finally release()` corretamente; `statement_timeout=15000` é **por comando**.
Logo, o experimento em PR #53 que interrompe `pg_sleep` não estava conectado à rota real.

## O experimento que realmente executamos

`tests/product/run-q026-http-disconnect-deadline-shadow.ts` abre **um servidor HTTP real e isolado no localhost**, e mantém o **verdadeiro** leitor RR canônico `lerRealidadeDeEntregas`. Esse servidor está no script de testes, NÃO substitui `tools/product_system_server.ts`. Após o primeiro SELECT do log (que fixa `backend_xmin`), injeta exclusivamente na fixture um `SELECT pg_sleep(10)`, reproduzindo uma consulta bloqueada com `statement_timeout=15000`.

O adaptador de teste rastreia o PID da transação, conecta `ServerResponse.close` ao cancelamento por `pg_cancel_backend`, estabelece prazo de 4,5 s **a partir da admissão HTTP** e executa a transação via adaptador canônico que faz rollback/release. Pool leitor: 1 conexão, com admissão 1. Há um processo de observação independente, que inspeciona `pg_stat_activity`.

Em cada volume o teste verifica:
1. conexão HTTP realmente encerrada pelo cliente **enquanto PG está ativo**; código PostgreSQL `57014`; rollback e `backend_xmin=NULL`, backend reaproveitado; nenhuma falsa resposta 200 ao cliente que saiu;
2. seis GETs concorrentes rejeitados com `503 Retry-After: 1`, sem aumento da ocupação; `/health` responde 200;
3. requisição não abortada pelo usuário recebe `503 prazo_total_excedido` depois da deadline experimental de 4,5s, cancelando a consulta PostgreSQL ainda em andamento e liberando conexão;
4. commit independente de GPS depois dos cancelamentos, nova resposta HTTP 200 e Q-016 replay com N+1 eventos, sem corrupção.

## Evidência verificada

[GitHub Actions **38087100195**](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38087100195): **3/3 jobs SUCCESS** nos volumes 20.000 e 120.000, mais regressões Q-016, Product, governança e recusa sem PostgreSQL (exit 78). O primeiro CI 38087049467 falhou na **tipagem do script**, corrigida por `aa49ce8967033185247e0de2c088165f795e9c9c`. Não reclassificar primeira execução como aprovada.

| Eventos | Rejeições concorrentes | Cliente aborta → handler conclui | Timeout → handler conclui | Parede até deadline |
|---:|---:|---:|---:|---:|
| 20.000 | 6× 503 | 1,28 ms | 1,52 ms | 4.502,33 ms |
| 120.000 | 6× 503 | 1,29 ms | 1,65 ms | 4.502,69 ms |

Essas são **amostras únicas** em CI, com `pg_sleep(10)` deliberado e cancelamento realizado pelo backend PostgreSQL no mesmo ambiente. Os tempos de abort e deadline medem do sinal até o término do `finally` de tratamento na fixture; não são SLA de rede, dispositivo ou produção. O prazo é 4,5s programado no adaptador SHADOW, **não** uma configuração disponível no produto.

### Fronteira de responsabilidade

O PR #54 demonstra que cancelamento de socket + limite global podem interromper uma consulta ativa e liberar o backend e o slot HTTP com rollback, sob fixture sintética. Não prova que o `GET /api/entregas` existente possua esse comportamento. Também não cobre conexão perdida entre dois SELECTs, cancelamento durante tempo de CPU após COMMIT, pressão multiprocessos em pool compartilhado, p95/p99, Preview, mobile, cargas reais nem segurança em produção.

**Decisão:** seguir HOLD; próximo gate adequado é produzir, em *nova branch isolada* e opt-in explicitamente desativado por padrão, implementação candidata **na rota real** e prova adversarial no servidor real. Não autorizar merge/deploy ou alterações em main/integração antes de demonstração de limite total, cancelamento em SQL ativo, retorno seguro e contratos HTTP.

**DRAFT / NÃO MERGE / NÃO DEPLOY / NÃO MAIN / NÃO INTEGRAÇÃO / NÃO BANCO OPERACIONAL / NÃO MIGRAÇÕES / NÃO RETENÇÃO / NÃO GASTO.** Q-026 continua OPEN.
