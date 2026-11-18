# Delivery OS Itaim — linha de base de locks e investigação de histórico nativo (08/11/2026)

**Natureza:** evidência de campo **somente leitura**, sem piloto SERIALIZABLE, sem alterações operacionais, sem deploy. Escopo: uma revisão histórica `DLV_IFO` previamente validada em 07/11/2026 às 14h10 e metadados de sessão, catálogo e histórico da base `teknisa` no `CAIXA_MOOCA`. Dados de clientes, números de comandas, IDs de produto, observações e texto dos triggers não são reproduzidos neste documento.

**Referência de continuidade:** Delivery OS PR #137, branch `feat/gestor-shadow-observer-20261103`; TATÁ Comandas PR #135 mantém candidata `tools/comandas_reader_one_order_serializable_REVIEW_ONLY.sql` no Git blob `8ca857f8ec29a4718122a7ad7433b9d9dda101d5`. O plano estimado obtido no checkpoint anterior apresentou quatro buscas por índice; não houve execução daquele SELECT em `SERIALIZABLE`.

## 1. Linha de base real de bloqueios, após o jantar

Uma conexão ADO.NET local, sem pooling, autenticada como `CAIXA_MOOCA\Tata`, fez três amostras **apenas de DMVs** `sys.dm_exec_sessions`, `sys.dm_exec_requests` e `sys.dm_tran_locks` da base `teknisa`. `SET LOCK_TIMEOUT 300` e `CommandTimeout=4s`; sem `BEGIN TRAN`, sem consulta a tabelas de pedidos, sem ALTER/DDL/DML, sem alteração de serviços.

| Horário do servidor (BRT) | Sessões Reader identificadas | Requisições ativas no banco, excluindo auditoria | Requisições bloqueadas | Esperas `LCK_M` | Locks em espera |
|---|---:|---:|---:|---:|---:|
| 08/11 00:23:37.893 | 1 | 1 | 0 | 0 | 0 |
| 08/11 00:23:38.309 | 1 | 1 | 0 | 0 | 0 |
| 08/11 00:23:38.677 | 1 | 0 | 0 | 0 | 0 |

Em cada amostra havia **uma** entrada de lock relacionada à identidade do Reader. Uma consulta posterior de agregação por modo/status identificou **`resource_type=DATABASE`, `request_mode=S`, `request_status=GRANT`, quantidade 1**. Isso não comprova ausência de locks transitórios entre amostras, nem autoriza concluir que o Reader jamais segura locks de linha/página; é uma observação pontual fora de pico. Tampouco demonstra o efeito de uma consulta `SERIALIZABLE` que **não foi executada**.

O heartbeat observado após os testes, em `2026-11-08T00:30:00.8458329-03:00`, declarou `RUNNING`, último lote `OK`, `poll_errors=0`, `consecutive_failures=0` e `watcher.sha256_verified=true`. É evidência local de continuidade do processo no instante, não prova de ausência de flashes de Shell nem de impacto zero sobre todas as sessões SQL.

## 2. Alternativa investigada: histórico já mantido pela Teknisa

As quatro tabelas de origem usadas pelo Reader não tinham `rowversion`, temporal nem Change Tracking nas auditorias anteriores. Nesta rodada, uma nova leitura do **catálogo** identificou triggers `AFTER` ativos, **sem executar seus corpos**:

| Tabela de origem | Trigger | Eventos declarados | Objetos relacionados encontrados |
|---|---|---|---|
| `COMANDAVEN` | `DEL_PEDIDO_DLV` | DELETE | `LOGOPERFOS` |
| `COMANDAVEN` | `INS_CMDLOG` | INSERT, DELETE | `CMD_LOG` |
| `COMANDAVEN` | `INS_COMANDAVEN_TEMP` | INSERT, UPDATE | `COMANDAVENTEMP` |
| `COMANDAVEN` | `INS_HISTPEDCONS` | INSERT, UPDATE | `HISTPEDCONS` |
| `ITCOMANDAVEN` | `INS_ITCMD_LOG` | INSERT | `ITCMD_LOG` |
| `ITCOMANDAVEN` | `VD_ITCMD` | DELETE | Não demonstrou escrita para uma tabela de histórico |

A informação de eventos veio de `sys.trigger_events`; os objetos referenciados, de `sys.sql_expression_dependencies` e de uma inspeção lexical dos alvos de `INSERT INTO` das definições, em memória. **Os nomes e dependências não provam completude, retenção, cobertura efetiva de todos os caminhos ou ordenação transacional.** Não houve trigger `UPDATE` de itens entre os identificados; o esquema `ITCMD_LOG` não contém `CDLOJA`, `DSOBSDESCIT`, `DSOBSPEDDIGCMD` nem `TXPRODCOMVEN`. O corpo de `INS_ITCMD_LOG` não referenciava explicitamente os três campos de nota. Assim, a trilha nativa não é uma substituição comprovada de N2.

O catálogo identificou os índices existentes: `CMD_LOG_01` sobre `CDFILIAL, NRVENDAREST, NRCOMANDA, DTHRREGISTRO`; `ITCMD_LOG_01` sobre `CDFILIAL, NRVENDAREST, NRCOMANDA, NRPRODCOMVEN, DTHRINCOMVEN`; `PK_HISTPEDCONS` sobre `CDFILIAL, NRVENDAREST, NRCOMANDA, NRSEQHISTPED`. Essas chaves favoreceram a opção de sondagem localizada, **sem afirmar que o otimizador usou um plano específico**.

## 3. Prova limitada em uma comanda real já examinada

Após validar novamente a identidade e o SHA textual do evento local, uma consulta SQL parametrizada, filtrada por `CDFILIAL`, `NRVENDAREST`, `NRCOMANDA` (e `CDLOJA` em `HISTPEDCONS`), retornou somente três contagens: **1 linha em `CMD_LOG`**, **4 linhas de item em `ITCMD_LOG`, em quatro identificadores nativos distintos**, **2 linhas em `HISTPEDCONS`**; duração **58 ms**. Nenhum texto livre foi extraído.

Um segundo SELECT localizado em `ITCMD_LOG`, `TOP (41)` como teto, leu apenas `NRPRODCOMVEN`, `CDPRODUTO` e `QTPRODCOMVEN` para fazer a comparação **em memória** com os quatro itens do evento original. Quantidades foram normalizadas como `decimal` usando cultura invariável. Resultado: **4/4** identidades de linha, códigos de produto e quantidades coincidentes, **0** divergências de produto, **0** divergências de quantidade, **0** linhas extras ou duplicadas. Duração **38 ms**; somente totais e flags foram devolvidos, nenhum registro bruto foi publicado ou salvo.

**Limites materiais:** os logs são evidência adicional de inclusão histórica dos quatro itens naquela comanda, não autenticação independente do iFood. `ITCMD_LOG` não guarda o código da loja nem notas e só tem trigger identificado para `INSERT`, não `UPDATE`; não comprova alterações posteriores de quantidade ou observações, tampouco que o arquivo do Reader foi capturado atomicamente. Os tempos 58/38 ms são amostras de duas consultas diferentes, fora de pico, não previsão de latência no salão. A cobertura de períodos anteriores, retenção e comportamento com SKU repetido continuam desconhecidos. A classificação dos estados nativos, inclusive `P`, permanece sem semântica operacional aprovada.

## 4. Decisão técnica e próximo efeito autorizado

**Avanço aceito como evidência:** `L1_SQL_DMV_BASELINE_AFTER_HOURS=OBSERVED`; `L1_READER_DATABASE_SHARED_LOCK=OBSERVED_ONE_INSTANT`; `L1_NATIVE_JOURNAL_TABLES_DISCOVERED=YES`; `L1_ONE_EVENT_ITEM_LOG_PARITY=4/4`. Não promover a `ATOMIC_NATIVE_REVISION_PROVEN`.

**Rota descartada como atalho:** considerar `ITCMD_LOG` ou `HISTPEDCONS` uma reprodução integral, ordenada e imutável de notas e atualizações; o esquema e os eventos dos triggers não sustentam essa promoção. A observação sem bloqueios após o jantar também não substitui medição de interferência na operação real.

**Próximo gate seguro, antes de qualquer piloto `SERIALIZABLE`:** medir somente metadados de requests/locks em janelas representativas de almoço e jantar; observar latências/erros operacionais do Reader e do caixa, sem criar pedidos nem comandar o PDV. Preparar um ensaio *separado* de um SELECT por comanda com monitoramento independente de `blocking_session_id`/esperas `LCK_M` e registro de efeitos sobre escritores. Um resultado de execução só poderá ser avaliado com aprovação humana específica da janela, operador do caixa informado, escopo limitado a uma comanda, conexão isolada sem pooling, limite de linhas e tempo, possibilidade de cancelar **somente a sessão de teste**, e abortar diante de atraso dos escritores, timeout, divergência de conteúdo ou perda de identidade. O comportamento de cancelamento e a liberação de locks precisam ser atestados no piloto; não presumir que `LOCK_TIMEOUT=100` interrompa bloqueio imposto a escritores.

**Nenhuma ação de alto impacto foi autorizada ou executada nesta rodada.** O candidato `SERIALIZABLE` não foi executado; nenhuma alteração global de RCSI/SNAPSHOT, tabela, serviço, agenda, impressora, Home ou pedidos. PR #137 continua DRAFT. `N2_HISTORICAL_CAPTURE_ATOMICITY=HOLD`, `N4_INDEPENDENT_IFOOD_UUID=HOLD`, `N5_HOME=HOLD`, `PRINT=HOLD`, `DELIVERYOS_V1_ACCEPTED=0/8`.

**Referências técnicas oficiais:**
- [Microsoft — SET LOCK_TIMEOUT](https://learn.microsoft.com/pt-br/sql/t-sql/statements/set-lock-timeout-transact-sql): controla quanto tempo a instrução espera para adquirir um lock, não quanto tempo mantém locks sobre terceiros.
- [Microsoft — SET TRANSACTION ISOLATION LEVEL](https://learn.microsoft.com/pt-br/sql/t-sql/statements/set-transaction-isolation-level-transact-sql): bloqueios de intervalo em `SERIALIZABLE`.
- [Microsoft — DMVs para diagnóstico de bloqueios](https://learn.microsoft.com/pt-br/troubleshoot/sql/performance/understand-resolve-blocking): `sys.dm_exec_requests`, `sys.dm_os_waiting_tasks`, `sys.dm_tran_locks`.

**Efeitos desta rodada:** comandos PowerShell temporários via Desktop Commander executando SELECTs de metadados, duas consultas localizadas aos logs e leitura passiva do heartbeat. Nenhum script ou recibo gravado no host, nenhuma operação de escrita SQL ou impressão. Não se mediu efeito visual da invocação do Shell.
