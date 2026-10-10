# Q-026 — prazo total de transação RR, MVCC/VACUUM, pool e cancelamento (SHADOW)

**Data:** 2026-10-10 · **PR #53** empilhado sobre #52 · somente scripts, workflow e documentação.

## Contexto e objetivo

A prova anterior demonstrou que a leitura incremental de 1.036.000 fatos pode usar muito menos memória Node, mas mantém a transação PostgreSQL aberta por segundos. `statement_timeout` do cliente SQL atua **por comando SQL**, não como prazo total de todo `BEGIN ... COMMIT`. Um cursor com muitos `FETCH` curtos não tem, por esse parâmetro sozinho, limite global. O PR #50 já testou exceção JavaScript, timeout de statement `57014` e escrita proibida `25006`; este ensaio testa mecanismos diferentes.

## Experimento real

Arquivo: `tests/product/run-q026-total-budget-pool-mvcc-shadow.ts`. Cada job usa PostgreSQL 16 descartável, sem dados de operação, e cria uma tabela **exclusivamente da fixture** `public.q026_mvcc_probe` para observar a limpeza de 500 versões mortas, sem UPDATE ao `platform.event_log` append-only.

- N=120.000, 300.000 ou 1.030.000 eventos sintéticos de GPS em uma viagem; `FETCH 257` com `ORDER BY` de unidade/modo/tipo/viagem. O ensaio mantém `READ ONLY REPEATABLE READ`.
- Em uma conexão diferente, confirma **40 fatos novos** no log e atualiza 500 registros na tabela de teste enquanto a transação RR antiga está ativa.
- Consulta independente confirma `backend_xmin` fixo; `VACUUM (ANALYZE)` corre enquanto a transação RR ainda lê as versões antigas. Novo `VACUUM` após ROLLBACK.
- Pool leitor `max=1`, `connectionTimeoutMillis=200`: uma leitura concorrente deve falhar por esgotamento de conexão, sem passar inadvertidamente pela transação antiga ou ficar pendurada para sempre.
- Guard **experimental, entre operações `FETCH`**, com budget de 650 ms. A rejeição `Q026_TOTAL_BUDGET` força ROLLBACK e verificação de `backend_xmin=NULL`, estado `idle` e reutilização do mesmo PID.
- Em outra transação RR, a sessão é cancelada com `pg_cancel_backend(pid)` por conexão independente **durante statement ativo**. Exige SQLSTATE 57014, rollback, pool reutilizável e leitura canônica `lerRealidadeDeEntregas` + replay Q-016 completo depois da falha.
- Na ausência de URL PostgreSQL, o script encerra com código 78, nunca com sucesso simulado.

## Prova inicial, mais escala

**[Actions 38085867235](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38085867235)** — SUCCESS com 120k/300k + regressões.

**[Actions 38085949725](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38085949725)** — SUCCESS **4/4 jobs** com 120k/300k/1,03M + Q-016, Product, governança.

| Eventos | `FETCH` até budget | Máximo linhas/FETCH | Escritas confirmadas | `n_dead_tup` com RR/VACUUM | Após rollback/novo VACUUM | Parede observada até rollback* |
|---:|---:|---:|---:|---:|---:|---:|
| 120.000 | 9 | 257 | 40 | 500 | 0 | 1.054,37 ms |
| 300.000 | 9 | 257 | 40 | 500 | 0 | 1.132,17 ms |
| 1.030.000 | 9 | 257 | 40 | 500 | 0 | 2.060,79 ms |

*Duração inclui primeiro FETCH/sort, gravações externas, VACUUM, espera esgotada do pool e pausas de teste. O budget de 650 ms começa **depois** da fase de preparação do snapshot e é verificado **entre** FETCHes. Portanto, **não** é deadline rígida de 650 ms para todo request/SQL.*

Nos três tamanhos: o snapshot RR não viu as 40 escritas ou as 500 atualizações; o leitor seguinte as viu, `backend_xmin` foi liberado, a mesma sessão voltou ao pool, `pg_cancel_backend` provocou código `57014`, o leitor canônico e Q-016 reconstruíram fatos após cancelamento.

O tempo inicialmente chamado de `cancellation_ms` na primeira instrumentação **incluía também a leitura do modelo e o replay forense completos**, podendo levar dezenas de segundos no milhão. O código foi corrigido para publicar separadamente `pg_cancel_signal_to_query_settlement_ms` (cancelamento da consulta ativa) e `scenario_including_canonical_and_q016_replay_ms` (experimento inteiro). Não usar a métrica antiga como latência do sinal.

## Conclusões e próximos portões

**PROVEN (PG sintético):** mecanismo de rollback e liberação MVCC/pool quando a aplicação efetivamente interrompe a transação; limitação `max=1` com timeout de aquisição; versões antigas retidas por snapshot e recuperadas com VACUUM após término; cancelamento pelo servidor sem corromper Q-016.

**NÃO PROVEN:** existência de guard de prazo total no **runtime** (só SHADOW); abort automático de uma instrução FETCH bloqueada; fim-a-fim HTTP/Preview; desconexão do cliente; múltiplos leitores simultâneos com limite real de pool; métricas p95/p99; orçamento aceitável em produção; funcionamento de dispositivo físico ou integração real.

**Decisão técnica:** ganho de memória incremental confirmado em #52, mas transações prolongadas têm custo MVCC verificável. Uma promoção precisaria de guard real desde ANTES da obtenção da conexão e do primeiro FETCH, com cancelamento de statement ainda em execução e rollback comprovado; nenhum valor de SLA é proposto sem demanda operacional.

**HOLD: NÃO MERGE / NÃO DEPLOY / NÃO MAIN / NÃO INTEGRAÇÃO / NÃO DADOS OPERACIONAIS / NÃO MIGRAÇÃO/RETENÇÃO / NÃO GASTO.** Q-026 aberta; teste sintético não é aceitação operacional.
