# Q-026 — Quanto custa segurar uma snapshot REPEATABLE READ? (SHADOW)

**Data:** 2026-10-10. **Referência:** [PR #43](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/43) — candidato de correção de consistência. **Escopo deste relatório:** um teste adicional isolado; **nenhuma mudança no runtime**, banco real, schema de produção ou política de retenção.

## Por que esta medição existe

A auditoria independente do Claude ([PR #41](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/41)) demonstrou S1/S2/C15: a leitura de Entregas usava instantâneos diferentes para projeção, aparelhos, último lote e contagens. O PR #43 faz todas as consultas dentro de **uma transação PostgreSQL `REPEATABLE READ, READ ONLY`**; CI comprovou coerência com escritor concorrente e mutantes de `READ COMMITTED`.

Essa correção troca uma inconsistência comprovada por uma obrigação de operação: **não prolongar transações de leitura**, porque snapshots antigos podem reter versões de linhas que um `VACUUM` gostaria de limpar. O próprio cursor em `READ COMMITTED` também tem período de retenção entre DECLARE e CLOSE; não é custo exclusivo do RR.

## Prova real em PostgreSQL 16 descartável

Script `tests/product/run-q026-rr-vacuum-shadow.ts`; workflow `.github/workflows/deliveryos-q026-rr-vacuum-shadow.yml`.

[CI `38058489719`](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38058489719): **SUCCESS**, TypeScript completo e estrito, teste executado em banco descartável com as migrations reais do DeliveryOS.

1. Cria **20.000 linhas de laboratório** em `public.q026_vacuum_probe`, tabela mutável criada só no banco descartável; o log canônico `platform.event_log` continua append-only e não sofre UPDATE.
2. Executa a **função real `lerRealidadeDeEntregas` do PR #43**, interceptando a resposta do primeiro `SELECT` do event-log, sem alterar os comandos enviados.
3. Consulta `pg_stat_activity.backend_xmin` em **outra conexão**, comprovando que o instantâneo RR está retido; um **escritor independente** atualiza as 20.000 linhas, confirma e torna novos valores visíveis fora da transação de leitura.
4. Um terceiro cliente executa **`VACUUM (ANALYZE)`** enquanto a leitura RR permanece aberta. O leitor ainda enxerga as 20.000 linhas **anteriores**; fora dele já são visíveis 20.000 valores atualizados.
5. Mede fisicamente com `pgstattuple`, extensão disponível no PostgreSQL descartável. Depois do retorno do leitor e COMMIT, `backend_xmin` deixa de estar retido. Novo `VACUUM` pode remover as versões antigas.

| Medida física | Antes da atualização | Durante RR após UPDATE e VACUUM | Depois do COMMIT + novo VACUUM |
| --- | ---: | ---: | ---: |
| `table_len` (bytes) | 9.109.504 | 18.210.816 | 18.210.816 |
| `tuple_count` atual | 20.000 | 20.000 | 20.000 |
| `dead_tuple_count` | 0 | **20.000** | **0** |
| `free_percent` | 2,18% | 2,13% | **50,87%** |

Outras observações registradas: `backend_xmin` durante RR = `752` (apenas ID temporário deste teste); depois do COMMIT = `null`; primeiro VACUUM = **12,4 ms**; leitura total incluindo update e vacuum artificialmente injetados = **245,7 ms**. **Não utilizar nenhum desses tempos como estimativa de latência da tela no Itaim**.

**Interpretação:** o PostgreSQL manteve versões necessárias à transação RR, como exige MVCC. O `VACUUM` posterior recuperou espaço como reutilizável (`free_percent`), **sem necessariamente reduzir o tamanho físico do arquivo** (`table_len` continuou 18,21 MB). A medição contém uma carga de UPDATE artificial forçada num instante: NÃO mede ritmo real de autovacuum, de ingestão, inchaço sob semanas de operação, taxa de escrita, bloqueio de outras sessões, hardware ou tráfego real.

## Observações independentes de governança

Em paralelo, o [CI `38058368673`](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38058368673) na branch do PR #43 usou histórico Git completo `fetch-depth: 0`, **sem comandos posteriores `git fetch --depth=1`**. O gate de governança passou **no checkout de integração original `99b0c72` e no candidato**, `BASELINE_GOVERNANCE_STATUS=0`, `CANDIDATE_GOVERNANCE_STATUS=0`, `BASELINE_ISSUES=[]`, `CANDIDATE_ISSUES=[]`, `Q026_GOVERNANCE_BOTH_GREEN`.

As falhas antigas sobre `APPEND-ONLY.md` decorreram da falta de histórico Git local, não de falsidade do `state_basis`: a API do GitHub confirma que `7ae2236` é ancestral da integração e que o último commit do documento na linha histórica relevante é de 2026-09-23. **O documento histórico não foi editado e a política de governança não foi afrouxada.**

## Condições antes de considerar merge

- Preservar exatamente uma snapshot para eventos, aparelhos, último lote e contagens; replay Q-016 continua com seu contrato, quarentena, cursor e IDs.
- Definir e medir **duração máxima da transação e estratégias de encerramento rápido** com volume representativo (p95, p99), alertas de `backend_xmin`, `idle in transaction`, `pg_stat_activity` e pressão de autovacuum. Sem essa medida, `REPEATABLE READ` é **funcionalmente testado**, mas impacto de operação ainda **UNKNOWN**.
- Não aplicar automaticamente o índice experimental do [PR #42](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/42): benefício de leitura e custo de WAL/escrita exigem análise conjunta.
- Não decidir janela ou retenção da Q-026 nem divergências de desempate do replay sem autoridade humana; não alterar schema ou produto final nesta pesquisa.

**Estado:** `TEST_PASS` em PostgreSQL descartável, **não `WORLD_PROVEN`, não `DEPLOYED`**. Este PR de pesquisa permanece **DRAFT/HOLD**; a integração original e `main` continuam fora de alcance.
