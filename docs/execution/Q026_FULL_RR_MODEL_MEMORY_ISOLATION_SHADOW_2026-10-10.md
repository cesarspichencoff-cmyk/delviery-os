# Q-026 — pico de RSS do modelo completo Entregas em processos independentes (SHADOW)

**Data:** 2026-10-10. **PR:** #52. **Base:** PR #51 @ `7cdeef0ffc78a47f21f14c9d8f62ccdc9f18633c`.

## O que foi feito

Script `tests/product/run-q026-full-rr-memory-isolated-shadow.ts`, com três volumes, duas rotas de leitura e comparação SHA-256. Em cada par, os processos Node e bancos PostgreSQL 16 são independentes, mas a fixture tem a mesma semente e timestamps explícitos. O leitor de referência é o **verdadeiro** `lerRealidadeDeEntregas` do PR #45; o candidato é o acumulador incremental de viagens dos PRs #40/#51 + aparelho/último GPS/contagens da MESMA transação `REPEATABLE READ, READ ONLY`.

Cada execução computa um hash que inclui **todos os campos não-forenses de RealidadeDeEntregas**, os 16 aparelhos e os quatro view models `entregasVM` reais. IDs forenses não são exportados pela UI compacta. O replay independente Q-016 permanece como era.

### Evidência CI

[GitHub Actions 38085065225](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38085065225) — **SUCCESS, quatro jobs verdes**, HEAD `30e8d472dda59b6e8e744b318a434af247bc97ff`. Matriz: 120k, 300k, 1.030.000 fatos na viagem longa, mais 6k mistos; job independente Q-016/governança; ausência de PostgreSQL retorna código 78, não PASS.

| Eventos totais | RSS canônico MiB | RSS incremental MiB | Redução | Leitura canônica ms | Leitura incremental ms | Transação incremental ms |
|---:|---:|---:|---:|---:|---:|---:|
| 126.000 | 280,08 | 154,21 | 44,9% | 1.345,08 | 1.664,79 | 1.656,33 |
| 306.000 | 478,85 | 158,77 | 66,8% | 2.514,00 | 3.065,09 | 3.058,62 |
| 1.036.000 | 1.311,27 | 128,20 | 90,2% | 6.888,91 | 7.112,24 | 7.107,44 |

Em todos os volumes, o digest do modelo completo e dos quatro filtros foi igual entre as duas rotas, no respectivo par de bancos. `FETCH` limitado a 257 linhas; 491, 1.191 e 4.032 lotes. Memória não cresce linearmente com a viagem longa na fixture.

**Correção durante execução:** a primeira CI `38084983252` detectou digest divergente. Causa rastreada ao `identity.device.registered_at` criado por `DEFAULT now()` em bancos independentes. Na nova execução os timestamps de cadastro são declarados explicitamente e os três hashes coincidem. Não rotular a tentativa anterior como PASS.

### O que os números não significam

- RSS é pico do processo Node, **inclui instalação/GC/semente e outros custos**, não memória exclusivamente de leitura. São processos isolados, com uma repetição por tamanho e runners não idênticos entre volumes.
- Não são p95/p99, SLA, condições reais do Itaim, medição de memória do PostgreSQL, custo de WAL, VACUUM ou do sistema inteiro.
- Benchmark **sem escrita concorrente**; os 30 commits durante RR foram comprovados separadamente no PR #51, inclusive com 1,03M.
- Melhor memória **não implica melhor latência**; incremental foi mais lento nas três amostras. A transação de aproximadamente 7,1 s no milhão ainda fixa horizonte MVCC, exigindo investigação.
- Os resultados da etapa anterior `14,28 s` com 30 writers não são comparações A/B contra o ensaio novo sem writers. A diferença inclui instrumentação e commits.
- Mesmo com hash de apresentação igual, isso não demonstra preservar os IDs, quarentena e exatidão forense sem a via canônica Q-016.
- O código compacto está apenas no script SHADOW: **não existe integração autorizada no runtime**.

### Próximos gates

1. Verificar orçamento real de transação/timeout/cancelamento do cursor com `backend_xmin` liberado após erro, sem confundir `statement_timeout` por comando com um limite de transação total.
2. Medir pressão de MVCC e pool com leitores e escritores simultâneos, no mesmo PostgreSQL descartável.
3. Revisão adversarial de desempates/semântica, HTTP/Preview e dispositivos físicos antes de qualquer proposta de integração.

**DRAFT / HOLD: NÃO MERGE, NÃO DEPLOY, NÃO MAIN, NÃO INTEGRAÇÃO, NÃO BANCO OPERACIONAL, NÃO MIGRATIONS, NÃO RETENÇÃO, NÃO GASTOS.** Q-026 permanece OPEN; resultado `TEST_PASS` sintético, não `WORLD_PROVEN`.
