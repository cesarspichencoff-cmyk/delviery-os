# Q-026 — Snapshot RR sob escrita ritmada: 120k, 300k e 1,03 milhão de fatos (SHADOW)

**Data:** 2026-10-10. **Base:** [PR #47](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/47), derivado do candidato RR [PR #43](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/43). **Prova de laboratório, não solução implantada.** Branch de pesquisa, apenas scripts de teste/workflows e este relatório; nenhum `src/`, API, migration, Android, banco de produção ou regra de retenção alterados.

## Por que executar

A [auditoria independente do Claude, PR #41](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/41), mostrou que duas snapshots `READ COMMITTED` podem misturar viagem e aparelho na mesma tela. O PR #43 faz a função original `lerRealidadeDeEntregas` processar projeção, aparelho, último lote e contagens numa única `REPEATABLE READ, READ ONLY`, preservando o replay Q-016. O [PR #44](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/44) demonstrou fisicamente que o RR retém versões necessárias à snapshot enquanto estiver aberta. O [PR #47](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/47) mediu períodos do RR com 20k e 120k e **um** append por leitura.

**Aqui a diferença é nova:** comparar leitor real com e sem uma SEQUÊNCIA de **30 INSERTs autocommit, espaçados em 12 ms** entre si, confirmados por sessão PostgreSQL separada DURANTE a transação, e elevar a escala para **300 mil** e **1,03 milhão de eventos**.

## Metodologia e prova

PostgreSQL 16 descartável, migrations reais, uma unidade (`ITAIM`) e um aparelho/viagem sintéticos, fonte `platform.event_log`. Semente de `gps_batch_received` `simulated` com `idempotency_key` única; a rotina real lê fatos, monta a projeção e consulta último lote/contagens.

- **120k e 300k**: em runners independentes, execução em ordem controlada `quiet→paced` para aquecer, seguida de oito leituras medidas alternadas ABBA (quatro quiet e quatro paced). Um escritor independente, com um pool dedicado, executa 30 INSERTs confirmados individualmente ao longo da leitura, iniciando **após o SELECT dos fatos**, e termina antes da consulta de contagens. Os intervalos de `pg_sleep(0.012)` são artificiais; todos os INSERTs devem estar confirmados **antes do COMMIT do leitor**. São 150 commits externos por escala, 300 nas duas.
- **1.030.000**: apenas **uma** leitura quiet e **uma** paced, sem aquecimentos, para limitar o custo e risco de memória. O processo Node recebeu `--max-old-space-size=4096`; não houve necessidade de aumentar a memória do servidor PostgreSQL. Houve 30 INSERTs externos confirmados; essa prova tem **n=1 por braço** e não tem inferência estatística.
- **Guarda material de consistência**: a viagem e as contagens do aparelho da leitura original DEVEM enxergar apenas os eventos anteriores ao snapshot; fora da transação o observador DEVE contar todos os INSERTs já confirmados. Em cada leitura `pg_stat_activity.backend_xmin` é observado após o primeiro SELECT e deve estar `NULL` depois do COMMIT. O processo falha se a contagem de commits externos for incorreta, se o horizonte permanecer preso ou se o leitor misturar snapshots.

## Evidências

No HEAD de código com o teste de milhão corrigido `8a5949596556c0fa93f29a107ccd0419da4de72d`:

[CI pareado `38062712850`](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38062712850): **3/3 jobs SUCCESS** (120k/300k mais comparador dos artefatos). A rodada anterior `38062407777` também obteve 3/3, mas com tempos diferentes; **não selecionar artificialmente só a rodada mais rápida**.

| Eventos sintéticos | Leitura | n | Mediana transação | Maior observação | Maior RSS Node após leitura |
| ---: | --- | ---: | ---: | ---: | ---: |
| 120.000 | quiet | 4 | 715,25 ms | 729,89 ms | 273,15 MiB |
| 120.000 | paced (30 INSERTs) | 4 | 1.011,36 ms | 1.024,20 ms | 272,63 MiB |
| 300.000 | quiet | 4 | 1.787,55 ms | 1.907,81 ms | 487,13 MiB |
| 300.000 | paced (30 INSERTs) | 4 | 1.900,26 ms | 2.039,85 ms | 486,26 MiB |

Writer paced duração mediana: **494,76 ms** (120k) e **653,00 ms** (300k). Essas pausas **não** correspondem à taxa real de chegada de pedidos ou GPS. Os valores de RSS são observações pontuais após leitura, não a RAM do PostgreSQL nem pico de memória de toda transação.

[CI de limite `38062712796`](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38062712796): **1/1 job SUCCESS**. Para o mesmo leitor real:

| 1.030.000 fatos em uma só viagem | Quiet, n=1 | Paced, n=1 |
| --- | ---: | ---: |
| Duração da transação | **7.964,81 ms** | **8.090,53 ms** |
| Janela medida entre início do primeiro SELECT e COMMIT | 7.963,28 ms | 8.087,28 ms |
| SELECT inicial de fatos | 3.792,57 ms | 4.026,50 ms |
| SELECT último lote | 706,24 ms | 697,29 ms |
| Duração dos 30 INSERTs | — | 1.935,41 ms |
| RSS Node observado após leitura | **1.306,82 MiB** | **1.365,87 MiB** |
| Heap Node observado após leitura | 1.146,86 MiB | 1.197,00 MiB |
| Fatos no snapshot | 1.030.000 | 1.030.000 |
| Fatos no observador após INSERTs | 1.030.000 | 1.030.030 |

As duas leituras de milhão mantiveram `backend_xmin` corretamente liberado depois do COMMIT. O intervalo até ~8 segundos no banco sintético **é material**: snapshot antigo prolongado pode reter versões durante VACUUM, conforme o PR #44, e o replay integral também consome muita memória Node. Isso é **evidência de risco a gerenciar**, não SLA do Itaim.

A execução inicial do smoke de milhão falhou em TypeScript estrito por dois tipos numéricos inferidos erroneamente, **antes da fase PostgreSQL**. Foi corrigida com anotações explícitas de tipo; a execução `38062712796` sobre a correção passou.

## O que NÃO está provado

- **Não são percentis operacionais.** Quatro amostras por cenário não identificam p95/p99. Um par de leituras de milhão não estima efeito causal da concorrência na latência.
- **Não é escrita sustentada de produção.** Trinta INSERTs individuais por leitura, ritmados por 12 ms, não são cargas realisticamente distribuídas entre aparelhos, mesas, horários e reprocessamentos; o sistema pode ter picos maiores, múltiplos leitores, updates de dispositivo, e concorrência de pool.
- **Não existe limite absoluto seguro comprovado.** O teste foi em runner GitHub com PostgreSQL descartável, uma unidade e uma viagem. Outros volumes, relógios, tipos, multiunidade, instâncias pequenas, cache frio ou quadro de `VACUUM` podem mudar a duração, uso de heap e plano do PostgreSQL.
- **Leitor testado NÃO é o incremental compactado** dos PRs #39/#40 nem usa o índice experimental #42. A correção RR do PR #43 preserva o replay completo Q-016; ela elimina snapshots misturados, não otimiza o custo O(N).
- **Sem gestão de custos de banco em produção, Preview, HTTP ou Android**, nem efeitos do PostgreSQL sob UPDATE/VACUUM contínuos. O PR #44 separadamente evidencia versões antigas retidas pelo RR.
- Nenhuma decisão de Q-026 sobre corte, janela recente ou retenção foi tomada; `UNKNOWN`, quarentena e cursors forenses Q-016 continuam obrigatórios.

## Próximo portão sugerido

1. Delimitar em arquitetura o uso de **uma snapshot RR curta** e preservar a fonte de replay forense Q-016 separadamente.
2. Medir no **Preview** com carga representativa, timeout por statement, duração da transação, `backend_xmin`, `idle in transaction`, efeito de múltiplos leitores e custo de escrita/memória do PostgreSQL. Instalar observabilidade antes da promoção.
3. Avaliar caminho de representação incremental só para UI contra o contrato completo, sem substituir replay forense; testar com snapshot único e concorrência antes de propor integração.
4. Manter PRs #43 e #48 **DRAFT/HOLD até autorização humana específica**. Não prometer 10/10, merge/deploy, alteração do banco real, custos novos ou comprovação operacional.

**Fronteira de conclusão:** testes de consistência em base sintética e limites de recursos OBSERVADOS; `CODE_READY + TEST_PASS` no SHADOW; `WORLD_PROVEN` e `DEPLOYED` NÃO.
