# Q-026 — Duração da leitura RR sob append concorrente (SHADOW)

**Data:** 2026-10-10. **Base exata:** PR #43, commit `6201d67b1bea6a8baa959cf23ef1b7f2243404c2`; integração original `99b0c72e6a254c68358767b5addffe673707d934`. **Somente laboratório:** PostgreSQL 16 descartável, uma unidade e uma viagem sintética por volume. Não foram alteradas migrations, código operacional, produtos, esquema de produção, política de retenção, `main` ou integração.

## Objetivo e principal diferença frente ao PR #44

O [PR #43](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/43) demonstra a correção de uma inconsistência real encontrada pelo Claude: eventos, cadastro, último lote e contagens passam a vir de uma única `REPEATABLE READ, READ ONLY`. O [PR #44](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/44) comprovou fisicamente que uma snapshot aberta retém versões antigas de linhas atualizadas, e que `VACUUM` só consegue removê-las após o COMMIT.

Este experimento mede quanto tempo **a função real `lerRealidadeDeEntregas`** conserva essa transação em dois volumes sintéticos, com um escritor PostgreSQL **em conexão separada**, que confirma um novo fato **depois do primeiro SELECT do log, antes das consultas de aparelhos/últimos lotes/contagens**. A prova exige que a leitura atual ignore o fato posterior enquanto a próxima leitura pode observá-lo. O leitor operacional **não** foi substituído por uma projeção compacta.

## Procedimento e definição das medidas

Arquivo: `tests/product/run-q026-rr-duration-shadow.ts`; CI: `.github/workflows/deliveryos-q026-rr-duration-shadow.yml`.

Cada job provisiona PostgreSQL 16 descartável, aplica migrations reais, cadastra uma unidade/aparelho de laboratório e preenche `platform.event_log` com N=20.000 ou N=120.000 `gps_batch_received` em uma só viagem. Em cada volume, executa **2 leituras de aquecimento + 12 leituras medidas**. O escritor confirma **um novo fato por leitura**, independentemente da transação RR; total de 14 commits externos por job (28 nos dois jobs).

A cada leitura:
1. O teste confirma `REPEATABLE READ, READ ONLY`, captura o PID PostgreSQL que executa a transação real e mede a primeira consulta ao event log;
2. Após os fatos, consulta `pg_stat_activity.backend_xmin` de fora e exige valor não nulo; o escritor confirma a inserção;
3. Ainda durante RR, verifica que `backend_xmin` é o mesmo; as consultas seguintes seguem na mesma transação;
4. Na saída, exige número **idêntico** de fatos projetados na viagem e contagem do dispositivo, correspondendo à snapshot **antes** do append; um observador independente vê **um fato a mais** já confirmado;
5. Imediatamente após o COMMIT, exige `backend_xmin = NULL` na sessão do leitor; não deixa sessão com snapshot presa;
6. Registra a duração da transação, os tempos de cada consulta, o tempo do escritor e o RSS do Node após a leitura. O segundo job verifica ambos os artefatos.

Definições:
- `wall_ms`: tempo de entrada da transação até o COMMIT, sem consulta do observador posterior.
- `snapshot_upper_ms`: do início do primeiro `SELECT` sobre o log até COMMIT; **limite superior estimado** do tempo de snapshot, e não timestamp exato de início de MVCC do servidor.
- `xmin_age_ms`: **do fim** do primeiro SELECT até COMMIT, limite inferior observado, não a duração integral da snapshot.
- `p95_sample` e `p99_sample`: quantis descritivos `nearest-rank` das **12 amostras**, ambos iguais ao máximo nesta amostra pequena. **Não são p95/p99 operacionais, nem têm confiança estatística para definir um SLO.**
- Medidas em runners independentes de GitHub Actions, sob interferência variável, sem carga longa/sustentada, distribuição representativa, autovacuum ao longo de horas ou hardware do Itaim.

## Evidência validada

[GitHub Actions `38061427028`](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38061427028), commit de teste/workflow `f74c79b9578bb859f836adc0ce4c266d3be510e2`: **3/3 jobs SUCCESS**: testes de 20k e 120k com TypeScript estrito + comparador dos artefatos. Todos os 24 cenários medidos mantiveram consistência entre viagens e aparelhos; **nenhum `backend_xmin` permaneceu após COMMIT**. O writer confirmou os 28 fatos externos.

| Medição | 20 mil fatos | 120 mil fatos |
| --- | ---: | ---: |
| Mediana `wall_ms` (12 amostras) | **207,96 ms** | **1.167,96 ms** |
| Maior `wall_ms` (também p95_sample/p99_sample) | 239,24 ms | 1.262,58 ms |
| Mediana `snapshot_upper_ms` | 207,13 ms | 1.167,14 ms |
| Mediana `xmin_age_ms` (após primeiro SELECT) | 99,54 ms | 601,41 ms |
| Mediana SELECT inicial do event log | 107,64 ms | 564,01 ms |
| Mediana SELECT último lote | 26,91 ms | 177,51 ms |
| Mediana SELECT contagens | 6,85 ms | 27,01 ms |
| Mediana INSERT do escritor concorrente | 0,78 ms | 0,72 ms |
| Mediana RSS Node observada após leitura | 217,11 MiB | 650,71 MiB |

**Interpretar com precisão:** os valores de 120k não são comparáveis a latências medidas em outro runner/código do PR #39 e não significam aumento causal de 5,6× ao apenas aumentar volume; os cenários são diferentes, o runtime permanece completo O(N), e os runners podem ter níveis distintos de CPU/disco. O RSS observado é do Node e inclui aquecimento, alocador e GC; não equivale a uso de memória do PostgreSQL nem prova de pico por transação. Há somente uma gravação concorrente por leitura; não é prova de impacto de throughput/latência em escrita sob pico.

## Decisão e limites

- **Confirmado:** com histórico estático sintético de até 120k, a transação RR da função real fechou em todos os 14 testes por volume e liberou seu horizonte MVCC. A leitura manteve contagens coerentes embora outra sessão fizesse append entre consultas. Limites temporais observados permanecem dentro do que a fixture exercitou; não assumir que se aplicam a 1,03M, volume real ou hardware físico.
- **Não demonstrado:** p95/p99 representativos, impacto de indexação alternativa/PR #42, VACUUM sob carga real contínua, RPS, saturação de pool, HTTP em produção e custo físico de snapshots sob 1,03M eventos. Não escolher timeout/limite absoluto com base em 12 amostras.
- **Condição antes de merge:** preservar replay Q-016 e contrato de proveniência; combinar limite operacional de duração/transação com observabilidade de `backend_xmin`/`idle in transaction`, validação em Preview com carga representativa e revisão do custo de manter versões; aprovação humana para merge/deploy.
- **Estado:** `SHADOW TEST_PASS`, não `DEPLOYED`, não `WORLD_PROVEN`. PR DRAFT/HOLD; Q-026 continua **OPEN**.

**Nota de instrumento corrigido:** o primeiro CI falhou na compilação por `top-level await` sob `module=commonjs`; o script foi corrigido para uma função async encapsulada. O CI seguinte passou. Em uma segunda correção, o tempo de transação deixou de incluir a leitura do observador após o COMMIT, e o limite superior da snapshot passou a começar antes do primeiro SELECT; por isso apenas os valores do CI `38061427028` são referidos acima.
