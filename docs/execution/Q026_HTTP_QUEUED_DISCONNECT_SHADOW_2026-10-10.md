# Q-026 — cliente fecha socket enquanto ainda aguarda checkout PostgreSQL (SHADOW)

**Data:** 10/10/2026 · PR #62, empilhado no #59. Apenas script de teste, workflow e relatório; não modifica código de produto.

## Cenário e prova

A rota HTTP real `GET /api/entregas` está, apenas nesta branch de pesquisa, com proteção opt-in `MAX_INFLIGHT=4`, `DEADLINE_MS=3000`, leitor PostgreSQL `max=2` e checkout limitado a 1000ms. O teste abre servidor HTTP em localhost e banco PostgreSQL 16 descartável com 12.000 eventos sintéticos.

Duas requisições começam SELECTs reais de `platform.event_log`, bloqueadas por `ACCESS EXCLUSIVE LOCK`. Outras duas são admitidas, mas ficam na fila do pool, **sem backend PID SQL próprio**. Uma dessas clientes fecha a conexão antes do checkout. O quinto GET é recusado imediatamente por admissão cheia (503). Após o timeout nativo do pool, a solicitação abandonada deve deixar de ocupar slot; outro GET deve ser admitido, aguardar o seu próprio checkout e receber 503 após ~1s, não a recusa imediata. Os dois SQLs ativos expiram pelo limite de 3s; desbloqueamos a tabela e verificamos a nova leitura 200 com dados disponíveis e zero sessões SQL ativas na sondagem final.

**[GitHub Actions #38091974670](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38091974670)** no commit `b2fd7c60c05835459678803c3e68ced586a357f8`: **4/4 SUCCESS** (`queued_disconnect`, `pool_checkout_fast`, `permission_denied`, regressões Q-016/Product/governança).

Evidências instrumentadas do job `queued_disconnect`:
- `client_socket_closed=true`, `client_never_received_response=true`;
- a solicitação concorrente ainda enfileirada recebeu 503 em **1001,87ms**;
- substituta admitida após abandono e liberada por seu próprio checkout em **1002,93ms**, não bloqueada por admissão vazada;
- tempo observado entre abandono e conclusão da medida de substituição: **2966,19ms** (inclui a espera intencional antes da substituição, NÃO tempo de liberação do slot);
- dois SQLs ativos terminaram por deadline; nova leitura 200, `active_event_queries_after_cleanup=0` na observação final.

## Fronteira

A desconexão antes do checkout **não interrompe imediatamente a fila do pg-pool**. Ela aguarda o timeout nativo configurado em 1000ms; isto é aceitável nesta fixture porque evita `Promise.race` abandonando lease que poderia aparecer depois, mas **não** é um cancelamento cooperativo instantâneo do checkout. Nenhuma prova da carga multi-worker, perda de rede real, p95/p99, CPU event loop, Android, Preview ou produção. O teste não autoriza merge/deploy.

**Q-026 OPEN/HOLD; branch isolada. Sem banco operacional/migrations/main/integração/gasto.**
