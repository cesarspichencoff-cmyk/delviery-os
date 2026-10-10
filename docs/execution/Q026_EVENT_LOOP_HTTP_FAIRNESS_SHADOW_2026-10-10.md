# Q-026 — responsividade do HTTP/event loop durante leitura RR canônica (SHADOW)

**Data:** 10/10/2026 · **PR #63**, baseada no PR #59. Apenas testes/CI/relatório; o código HTTP, SQL, memória, migrations e execução operacional não foram alterados nesta branch.

## Pergunta testada

O servidor de apresentação `tools/product_system_server.ts` e o leitor `lerRealidadeDeEntregas` retornam dados sob proteção opt-in, mas a materialização e projeção do modelo canônico ainda usam a thread JavaScript principal. A deadline HTTP e o tratamento da desconexão também dependem da execução oportuna do event loop. É possível que duas leituras simultâneas funcionem e, ainda assim, degradem as consultas leves de saúde.

## Montagem

`tests/product/run-q026-event-loop-http-fairness-shadow.ts` levanta PostgreSQL 16 real **descartável**, schema migrado e 20k/120k/300k eventos GPS inteiramente sintéticos. Cria **o servidor HTTP real** `criarServidor()` na porta local aleatória, habilita `DELIVERYOS_ENTREGAS_RR_DEADLINE_MS=15000` e `MAX_INFLIGHT=2`, faz dois `GET /api/entregas?unidade=ITAIM` em paralelo. Enquanto isso, emite sondas `GET /api/health` a cada 30ms, registra tempo de resposta e usa `monitorEventLoopDelay({resolution:10})` para atraso do loop, além de RSS antes/depois. Não executa dispositivos, tráfego operacional ou Preview. A obtenção, medição e cálculo ocorrem no mesmo processo Node, como a rota real; há potencial de interferência do próprio instrumento.

O CI imprime `Q026_EVENT_LOOP_HTTP_SHADOW_MEASURED`, **não** `PERFORMANCE_PASS`: um job verde apenas indica execução e integridade mínima do contrato, **não** meta de latência.

## Evidência — execução final

**[GitHub Actions #38092236110](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38092236110)** no SHA `4ee8862b7635dd34af3799121ac135d8f4f4f50c`: **4/4 jobs SUCCESS** (20k,120k,300k e regressões Q-016/Product/governança); o primeiro CI menor [#38092149512](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38092149512) também passou em 20k/120k mas não substitui a matriz ampliada.

| Eventos | Duas leituras HTTP (ms) | Pior /api/health (ms) | Event-loop max (ms) | RSS antes/depois (MiB) | Sondas health |
|---:|---:|---:|---:|---:|---:|
| 20.000 | 469,75 / 466,20 | 306,13 | 115,02 | 111,08 / 179,13 | 7 |
| 120.000 | 2331,28 / 2331,72 | 367,65 | 293,60 | 105,50 / 384,88 | 28 |
| 300.000 | 5796,17 / 5299,02 | **1279,69** | **1205,86** | 111,65 / **832,75** | 57 |

Todas as seis leituras responderam HTTP 200 com `leitura.disponivel=true`; /api/health respondeu 200 às sondas amostradas. Em 300k foram registrados três ticks com atraso acima de 100ms, além de um atraso máximo do monitor de ~1,21 segundo. Os percentis p95/p99 emitidos no log se aplicam **apenas** às amostras daquela única execução e, especialmente com 7 sondas em 20k, não devem ser lidos como percentis de serviço real.

### Interpretação responsável

- Fato: a leitura canônica sob concorrência sintética apresentou aumento de tempo, RSS e atraso observado do processamento HTTP à medida que o volume cresceu na matriz.
- Inferência provável, ainda a testar por fase: projeção síncrona/ordenação e materialização contribuem para o bloqueio do event loop. Sem instrumentação por fase, não repartir causalmente o atraso entre parsing do driver, mapeamento e projeção.
- Não foi provado que o serviço de produção experimentaria exatamente os mesmos valores. A memória RSS após a leitura **não é medição precisa de pico**, e os ensaios não isolaram garbage collector e variação do runner.
- A proteção de cancelamento de consulta PostgreSQL e timeout de pool **não** torna automaticamente a thread JavaScript responsiva. Se o loop estiver bloqueado, timers/sockets não são atendidos no horário nominal.

## Próximo gate

1. Medir separadamente o custo de query, tempo em transação RR e projeção pós-COMMIT, com testes isolados sem alterar código operacional.
2. Integrar leitor incremental full-model de #52 somente após paridade/adversarial e reexecutar a mesma prova de saúde e memória, usando comparação sob fixtures equivalentes.
3. Estabelecer limites operacionais reais por percentis com múltiplas execuções, Preview/multi-worker e dispositivos; não promover nesta etapa.
4. Preservar HOLD de Q-026, sem merge/deploy ou conclusão forçada.

**Q-026 OPEN. Evidência SHADOW e limitada.**
