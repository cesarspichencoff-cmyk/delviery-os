# Q-026 — o ganho do leitor incremental depende da cardinalidade das viagens

Data: 10/10/2026. Pesquisa adversarial de #70, PR #75. PostgreSQL16 descartável, duas execuções Node separadas por modo, fixtures determinísticas equivalentes.

## Pergunta

Os benchmarks de 1,036 milhão de eventos concentram muitos registros em uma viagem longa. O acumulador compacto armazena apenas a contagem de eventos por viagem e por isso economiza bastante memória nesse perfil. O que acontece se muitos eventos pertencerem a **viagens diferentes**?

## Método

`tests/product/run-q026-high-trip-cardinality-child.ts` cria 30.000 ou 120.000 viagens diferentes, cada uma com um evento GPS, 1 device e fonte simulated. Usa a leitura canônica `lerRealidadeDeEntregas` ou a leitura incremental reutilizável `lerRealidadeDeEntregasIncremental`. Para cada modo, um processo separado cria novo banco descartável, executa a leitura, registra `process.resourceUsage().maxRSS`, RSS após a fixture, tempo, todos os campos de todas as viagens, aparelho, histórico sem modo e quatro respostas completas de `entregasVM`. SHA-256 do modelo de apresentação precisa coincidir. Sem leitura de IDs forenses da projeção compactada, cujo contrato é intencionalmente apenas `eventos.length`. O replay canônico Q-016 permanece separado.

## Provas verificáveis

[GitHub Actions #38095694006](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38095694006): **2/2 jobs SUCCESS** no SHA `06c7d8a4e6ffe22f215eedbfe944b02975c2d79f` (benchmark A/B + regressões Q-016/Product/governança).

| Cenário | Pico RSS canônico | Pico RSS incremental | Leitura canônica | Leitura incremental |
|---|---:|---:|---:|---:|
| 30.000 viagens, 1 fato/viagem | 272,75 MiB | 269,14 MiB | 394,03ms | 450,25ms |
| 120.000 viagens, 1 fato/viagem | 629,16 MiB | 624,57 MiB | 1356,03ms | 1673,86ms |

SHA-256 de modelo de apresentação + quatro viewmodels: **idênticos dentro de cada volume**. O teste não afirma superioridade de desempenho, somente paridade e medições.

Diferença de pico RSS incremental vs canônico: **-3,61 MiB (30k)** e **-4,59 MiB (120k)**, ou apenas ~1,3% / ~0,7% nesta amostra. O incremental gastou aproximadamente **14,3%** mais tempo em 30k e **23,4%** mais em 120k. Esses valores são amostras únicas em GitHub CI: não utilizar como SLAs ou percentis, nem generalizar para todos os dados.

## Interpretação e implicação operacional

O consumo do leitor compacto cresce com **número de viagens/projeções**, além do lote de FETCH. Assim, a redução superior a 90% medida com 1,03M eventos concentrados em poucas viagens **não é propriedade universal** do sistema.

Não mudar para um seletor adaptativo automático sem dados representativos: contagem de DISTINCT trips, topologia e custo da própria escolha também consomem PostgreSQL/CPU, podem estender RR e introduzir novas transações. A decisão segura é manter o incremental **opt-in desativado por padrão** enquanto se mede a distribuição operacional, com orçamento de conexões e limites de HTTP.

## Fronteira

Nenhum merge, deploy, mudança na API, schema, migração, banco operacional, custo novo ou acesso a dados reais. Benchmark usa apenas fixtures ficcionais e mesmo hardware de runner, porém processos separados e sem repetição estatística. Q-026 OPEN/HOLD até Preview, credenciais least privilege, multi-worker, p95/p99 e testes físicos.
