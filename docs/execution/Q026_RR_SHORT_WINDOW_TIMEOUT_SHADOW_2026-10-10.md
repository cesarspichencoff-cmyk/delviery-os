# Q-026 — Snapshot curta do PR #45, escalas 120k–1,03M e recuperação após timeout (SHADOW)

**Data da prova:** 2026-10-10. **Fonte do código funcional:** [PR #45](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/45), branch `fix/q026-entregas-single-snapshot-20261010` @ `c61e9baec72f20ef52ed5f63268ff2cb7d2b9a5f`, **não integrada**. O PR #43 é outra candidata, mais antiga, em que a projeção CPU ainda acontecia dentro da transação. Esta pesquisa não promove nenhuma das duas.

## Evidência principal

[CI `38063725552`](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38063725552): **5/5 jobs SUCCESS** no código da branch (120k, 300k, 1,03M, timeout PostgreSQL e verificação conjunta dos artefatos). PostgreSQL 16 descartável com migrations reais; dados **100% sintéticos**, uma unidade/viagem/aparelho.

A porta real `lerRealidadeDeEntregas` do PR #45 executa todos os SELECTs necessários na **mesma** transação `REPEATABLE READ, READ ONLY`. Ao concluir a leitura SQL, o callback devolve apenas as estruturas materializadas; o adaptador confirma com COMMIT e então a porta constrói os objetos e chama `projetar` **fora da transação**, mantendo o contrato da interface. Um escritor externo confirma um novo fato depois do SELECT inicial, mas antes das demais consultas; a leitura continua exibindo viagem e contagem de aparelho do instantâneo anterior, e o observador externo vê o novo fato. Nenhum `backend_xmin` permanece após o COMMIT.

**Medições do HEAD de código `86dc1a3c2a6ca5db0cba026f8831f4e43c36e6eb`:**

| Escala | Leituras medidas | Mediana transação RR | Mediana leitor total | Mediana trabalho pós-COMMIT, inclui checagem | RSS Node observado após leitura |
| --- | ---: | ---: | ---: | ---: | ---: |
| 120.000 fatos | 4, após 1 aquecimento | **777,87 ms** | **951,72 ms** | **164,67 ms** | mediana **391,41 MiB** |
| 300.000 fatos | 4, após 1 aquecimento | **1.484,53 ms** | **1.823,81 ms** | **369,26 ms** | mediana **808,71 MiB** |
| 1.030.000 fatos | **1**, sem aquecimento | **8.066,46 ms** | **9.851,34 ms** | **1.784,52 ms** | **1.321,90 MiB** |

Para 1,03M, `event_log SELECT` gastou 5.074,24 ms, consulta do último lote 1.014,18 ms, contagem 194,37 ms. `backend_xmin` foi observado durante a leitura e desapareceu depois do COMMIT. Os tempos da transação são medidos do início da transação ao COMMIT, sem o observador posterior; a janela `first SELECT→COMMIT` é um limite superior aproximado, não o timestamp exato de criação da snapshot PostgreSQL.

**Limite de interpretação:** os números por escala vieram de runners independentes, com cache e recursos variáveis. Os quatro valores de 120k/300k não são um p95/p99 de operação; **uma única observação de 1,03M não estabelece latência típica, limite nem SLO**. RSS é uma observação de memória do **Node após a leitura**, não memória do servidor PostgreSQL nem pico da transação. A base continua lendo todos os fatos O(N), projetando uma só viagem — não incorpora a compactação dos PRs #39/#40 nem o índice de leitura hipotético do PR #42.

## Segurança de falha: timeout sem resultado parcial

Script `tests/product/run-q026-rr-timeout-recovery-shadow.ts` e job `server-timeout-and-rollback`. Injetou **apenas no teste** `SET LOCAL statement_timeout='60ms'`, antes do primeiro SELECT, e `SELECT pg_sleep(0.15)` **no servidor real** em dois momentos:

1. Depois de SELECT de fatos já ter estabelecido snapshot; 
2. Antes da consulta `GROUP BY device_id, source_mode` de contagens.

O PostgreSQL retornou `57014 query_canceled` nos dois casos; a função de leitura **rejeitou a Promise sem emitir resultado parcial**, o adaptador `PgSqlClient.transaction` executou rollback, e a conexão no pool voltou ao estado **`idle`** sem `backend_xmin`. A leitura normal posterior na mesma pool projetou os 500 fatos íntegros. **4/4 verificações positivas**, em [CI `38063725552`](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38063725552).

**Isso NÃO prova que já exista um prazo total de resposta no runtime**: `PgSqlClient` tem configuração de `statement_timeout` por comando (padrão atual 15.000 ms), que não é limite do tempo agregado da transação inteira, do mapeamento CPU ou do HTTP. O `60ms` desta prova não deve ser copiado para produção. Tampouco foi testado o status HTTP devolvido em cancelamento, saturação de pool, cliente desconectado, autovacuum real, atualizações sustentadas ou hardware do Itaim.

## Evidência e decisão segura

- **Confirmado em PG16 descartável:** uma snapshot consistente para fatos, aparelhos, último lote e contagens; o trabalho de projeção fica depois do COMMIT; erros reais de timeout devolvem falha e liberam conexão/snapshot; a pool recupera. Código existente do replay Q-016 permanece intacto nessa pesquisa.
- **Novo limite visível:** no laboratório de 1,03M a transação RR **ainda durou 8,07 segundos** e o leitor total chegou a 9,85 segundos. Reduzir somente a parte de CPU dentro da transação não elimina o custo de transferência/consulta completa da Q-016.
- **Não autorizado:** merge, deploy, criação de índice real, migração, corte/janela histórica, descarte de dados `UNKNOWN`, alterações de produção ou gastos.
- **Portões adicionais antes de promover:** leitura compacta sob uma única snapshot e preservação rigorosa do contrato global (inclusive escopos sem viagem), memória de Node/PostgreSQL em carga representativa, cancelamento ponta a ponta no HTTP e gestão de observabilidade de `backend_xmin`/duração da transação. A decisão Q-026 de janela e retenção permanece humana e **aberta**.

**Estado:** teste SHADOW `TEST_PASS`; **não `WORLD_PROVEN`**, não `DEPLOYED`, não 10/10. PR associado permanece DRAFT/HOLD.
