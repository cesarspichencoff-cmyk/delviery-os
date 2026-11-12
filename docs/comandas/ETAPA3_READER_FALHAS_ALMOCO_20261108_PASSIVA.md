# TATÁ Comandas — falhas intermitentes do Reader em 08/11/2026

**Estado:** `PASSIVE_FILE_EVIDENCE` · `SQL_CAUSALITY=UNKNOWN` · `INGRESS_IFOOD_RUNTIME=UNKNOWN` · `STAGE_3=IN_PROGRESS` · `PRINT/CUTOVER=HOLD`.

## Proveniência e limite da observação

Leitura **somente de arquivos preexistentes** no host físico do Itaim (`CAIXA_MOOCA`), via conector de arquivos: `C:\ProgramData\TataComandaReader\state\reader-heartbeat-v1.json`, `C:\ProgramData\TataComandaReader\evidence\continuous-watcher.stderr.log`, `C:\ProgramData\TataComandaReader\evidence\shadow-consumer-status.json` e `C:\ProgramData\DeliveryOS-Itaim-Observer\status.json`. Nenhum terminal, PowerShell, SQL, chamada de rede no host, controle de serviço, leitura do XEL binário, cópia de dados de pedido, alteração de impressora ou arquivo operacional foi feito nesta auditoria.

## Diferença comprovada desde a amostra de 04h20

| Indicador / registro | Antes | Evidência posterior |
|---|---|---|
| Total cumulativo `Reader.failed` | 605 no heartbeat de 08/11, 04:20:31 BRT | 608 no heartbeat de 08/11, 15:24:16 BRT |
| Lote final no heartbeat | `#14506 OK`, 0 falhas consecutivas | `#15153 OK`, 0 falhas consecutivas |
| Três falhas adicionais identificadas no stderr | — | 04:28:35, 07:39:14, 14:06:49 BRT |
| 04:28:35 e 07:39:14 | — | `BATCH_FAILED` e `SqlException` com tempo limite na execução (`ExecuteReader`) |
| 14:06:49 | — | `BATCH_FAILED` e `SqlException` com mensagem de espera de bloqueio durante leitura (`Read`) |
| Eventos cumulativos emitidos pelo Reader | 6194 no registro anterior | 6348 no posterior; **revisões/eventos não equivalem a número de pedidos únicos** |
| Shadow consumer | — | `RUNNING`, `processed=6459`, `ready_count=1171`, `blocked_count=5288`; são diagnósticos `shadow`, sem impressão |
| Observer local | anteriormente `UNAVAILABLE` | `OBSERVED_RECORDS` em `2026-11-08T18:23:39.746Z`, mas `sourceMode=CONTROL_DIAGNOSTIC_NOT_REAL_PROOF`, `liveSourceVerified=false`, `operationalOrderTotal=null` |

**Interpretação estrita:** falhas SQL **do Reader** ocorreram inclusive às 14h06, durante a janela do almoço. A última amostra demonstra recuperação do lote; não prova estabilidade permanente. Falha de leitura do Reader **não prova** falha ou não integração do iFood, perda de comanda, bloqueio do escritor da Teknisa, deadlock causado pelo Reader ou duplicação física de papel. `SqlException` e tempo de espera de lock tampouco provam um deadlock SQL Server 1205.

## Contraprova arquitetural já existente — não repetir ensaio arriscado

As auditorias `ITAIM_REAL_READER_SQL_SOURCE_PROOF_20261104.md` e `READER_V2_CACHED_SQL_PLAN_AND_ATOMICITY_GATE_20261104.md` já demonstraram que o worker instalado é **V2**, sob `READ COMMITTED`, com `RCSI OFF`, e que o plano da consulta atualmente instalada foi observado no cache. Não é seguro promover a candidata `SERIALIZABLE` em produção apenas porque ela aceita one-order ou porque falhas de leitura persistem: ela pode introduzir novos bloqueios, não demonstra o fechamento semântico de gravações posteriores e não cobre sozinha as tabelas filhas de itens/modificadores/observações.

**Próxima prova material:** a rota que consegue mudar a decisão sobre vias de produção é o **censo físico passivo já autorizado** (sem gerar papel ou alterar o caixa). Para determinar responsabilidade de lock/deadlock, a PR #143 contém o analisador **off-host** e requer XEL real íntegro por rota separadamente autorizada, sem ler binário XEL por conector textual no caixa. A conciliação independente iFood→Teknisa exige outra fonte real autorizada; nem o observer nem o Reader são fontes independentes do próprio sistema.

**Gates preservados:** `READER_CAUSALITY=UNKNOWN`, `N2_A_LOCK_SAFETY=UNKNOWN`, `N2_B_SEMANTIC_COMPLETENESS=UNKNOWN`, `PAPER_CENSUS_NOT_YET_COLLECTED`, `STAGE_3=IN_PROGRESS`, `STAGE_4=NOT_AUTHORIZED`, `PRINT/CUTOVER=HOLD`. Nenhuma prova de funcionamento 10/10 no mundo real foi alegada.
