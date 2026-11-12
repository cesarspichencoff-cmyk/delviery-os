# Reader Itaim V2 — plano SQL real em cache, custo observado e fronteira de atomicidade (04/11/2026)

**Operação desta etapa:** somente leitura, via Desktop Commander no CAIXA_MOOCA com token Windows HIGH previamente comprovado. **Nenhuma comanda SQL foi consultada e nenhuma impressora ou serviço foi alterado.** A origem canônica VÉRTICE foi revalidada: `cesarspichencoff-cmyk/vertice-runtime.` → `vertice-active` → `VERTICE_ENTRY.md`.

## Fonte real e contexto operacional

- Worker que executa SQL: `C:\ProgramData\TataComandaReader\bin\tata_reader_continuous_watch_candidate_v2.ps1`, SHA-256 pinado `92b33e82ed72426be46fe20bcb2a4f4557f9716108886f89e15a4e262c506d44`, supervisionado pelo script V1. NÃO substituir por candidato V1 antigo.
- Sessão real do Reader foi anteriormente provada na DMV SQL: conta `NT SERVICE\TataComandaReader`, app `TataReaderContinuousWatchV1`, host CAIXA_MOOCA, `host_process_id` igual ao filho do supervisor, `transaction_isolation_level=2` (**READ COMMITTED**), banco `teknisa`.
- `sys.databases`: `is_read_committed_snapshot_on=0` (**RCSI OFF**), `snapshot_isolation_state_desc=OFF`. Nenhuma das quatro tabelas Reader (COMANDAVEN, ITCOMANDAVEN, VENDAREST, PRODUTO) possui `rowversion`, temporal habilitado ou Change Tracking habilitado.
- A consulta instalada seleciona notas de pedido e item e `observation_scan_complete=true`, porém usa origem `IDORGCMDVENDA LIKE N'DLV[_]%'`, mais ampla que a exigida `DLV_IFO`. A admissibilidade no Copiloto/Conferência deve exigir igualdade estrita.
- A PR #137 já contém ponte **opcional, desligada por padrão**, para o SHA-256 legado em maiúsculas: ela recalcula a impressão digital sobre o conteúdo canônico, respeita checkpoint original e bloqueia divergência; não duplicar. Isso **não** prova isolamento do SQL nem identidade iFood independente.

## Nova prova: plano de consulta que JÁ foi executada (somente DMVs)

A tentativa de compilar plano estimado para uma consulta nova e limitada a uma comanda via `SET SHOWPLAN_XML ON` **não retornou plano válido**. O `SELECT` dessa tentativa **não foi executado**; `SHOWPLAN_XML` era configuração **somente da sessão isolada**, encerrada sem pooling, não configuração do banco. NÃO usar essa tentativa para afirmar custo baixo de uma consulta diferente.

A DMV `sys.dm_exec_connections.most_recent_sql_handle` não tinha o plano no cache. Aplicou-se então uma rota distinta: `sys.dm_exec_query_stats`, `sys.dm_exec_sql_text` e `sys.dm_exec_query_plan` **somente em consulta de metadados**. Foi encontrado **um plano com texto SQL contendo a consulta do Reader V2 instalado**. A atribuição foi validada localmente: depois de normalizar apenas espaços em branco, **todo o corpo SQL extraído do here-string instalado está contido no texto cacheado**. A diferença é o prefixo de declaração de parâmetros adicionado ao batch cacheado. Não exportamos texto SQL completo, XML nem identificadores de pedidos.

**Amostra das estatísticas desse plano no momento da leitura**:
- `execution_count=10` (somente o período de vida do plano cacheado; **não** total histórico).
- `last_elapsed_time=28,70 ms`; `max_elapsed_time=47,62 ms` dentro desse mesmo plano cacheado.
- `last_logical_reads=9.249`, `max_logical_reads=10.529`.
- Operadores: **3 Index/Clustered Index Seeks** em `COMANDAVEN`, `VENDAREST` e `ITCOMANDAVEN`; **1 Index Scan** em `PRODUTO`, além de Hash Match, Nested Loops, Sort e Top.
- Estes números são **descritivos da consulta existente e desse plano**, não benchmark isolado, garantia de tempo, contagem física de discos ou previsão de bloqueios sob isolamento `SERIALIZABLE`.

Consultas de catálogo anteriores comprovaram índices com chaves adequadas para localização nativa nas quatro tabelas (1/5/4/18 prefixos candidatos, respectivamente). **Isso não equivale a demonstrar um plano seguro da nova consulta**.

## Diferença entre provas

**FATOS observados:** identidade SQL efetiva Reader, RCSI OFF, SNAPSHOT OFF, esquema sem rowversion, SQL V2 com quatro campos de notas, hashes legados em maiúsculas, um plano cacheado com seus operadores e estatísticas.

**INFERÊNCIA:** limitar um SELECT a uma comanda por parâmetros nativos pode reduzir conjunto de trabalho. **Não está medido**; Index Scan em PRODUTO no plano existente sinaliza que estimar custo de locks sem plano da futura consulta seria arriscado.

**NÃO PROVADO:** leitura transacional atômica de cabeçalho/itens/observações; prova de todos os itens em instantes concorrentes; completude independente das notas; associação iFood por UUID confirmado; semântica de pronto de estados 3/P/X; emissão exclusiva/sem duplicidade da Conferência; densidade noturna física.

## Ajuste de tipos nativos e regressão (verificado depois do plano)

Nova leitura **somente de catálogo** (`sys.columns` + `sys.types`) confirmou que `TEKNISA.COMANDAVEN.NRVENDAREST` e `NRCOMANDA` são **`varchar(10)`**, ambas com collation `Latin1_General_CI_AS`. A candidata `tools/comandas_reader_one_order_serializable_REVIEW_ONLY.sql` antes recomendava genericamente `nvarchar(64)`; esse tipo não coincide com a coluna. Pela precedência de tipos SQL, a comparação pode envolver conversão implícita e prejudicar planos; com collation Windows o grau de impacto depende do otimizador/plano, **não** declarar Index Scan inevitável.

A especificação foi corrigida na PR #135 para exigir **`SqlDbType.VarChar`, `Size=10` em ambos os parâmetros**, com revalidação do esquema no futuro piloto. O teste `tools/verificar_comandas_reader_one_order_serializable_review_only.cjs` passou **9/9** na worktree isolada Foxxy (commit `39deca62`), incluindo novo caso contra `NVarChar(64)`; o gate existente de isolamento passou **23/23**. Uma outra regressão de revisão misturada **não rodou nessa worktree** porque sua dependência `dist/src/production/currentPackagingBridgeV63.js` não estava compilada: **não chamar essa suíte de aprovada nessa execução**. O teste 6/6 havia passado antes em um ambiente Foxxy já compilado, separadamente. CI da nova alteração deve ser verificada pelo SHA exato.

Fontes externas de apoio: [Microsoft — Data type precedence](https://learn.microsoft.com/en-us/sql/t-sql/data-types/data-type-precedence-transact-sql), [Microsoft Q&A — `nvarchar` em coluna `varchar` e influência da collation](https://learn.microsoft.com/en-gb/answers/questions/640059/nvarchar-convert-to-varchar-cause-index-scan).

## Decisão de execução

1. **Não** executar `ALTER DATABASE`, RCSI/SNAPSHOT ON, hints `HOLDLOCK`, `SERIALIZABLE`, `UPDLOCK`, `NOLOCK`, DDL, nem criar outro watcher em produção como atalho.
2. Manter Reader V2 e supervisor **como instalados**, operação normal. A ponte em memória da #137 já elimina a urgência de migrar 250 hashes/checkpoints para visualização diagnóstica. Os bloqueios de `ordersPublishable=0`, `ready_for_dispatch=null` e `print=false` devem permanecer.
3. Preparar **em laboratório** uma candidata SQL de uma única comanda: filtros `CDFILIAL=0001`, `CDLOJA=01`, `IDORGCMDVENDA=DLV_IFO`, `NRVENDAREST=@nr` e `NRCOMANDA=@nc` de tipo `varchar(10)`, notas/itens no mesmo SELECT; sem nomes/telefone/endereço e com limites explícitos. O plano de execução novo **ainda não foi obtido**, mesmo sem executar a consulta.
4. Homologar plano/impacto de locking e abortar caso varredura ampla, timeout, escalonamento de locks, latência ou bloqueio de gravações. `READ COMMITTED` com três polls estáveis é um **sinal heurístico**, nunca prova formal de snapshot. Somente liberar captura operacional após prova de consistência, identidade e read completeness.
5. Na sequência, usar um canal **independente e autorizado** para o UUID iFood, event sourcing de praça e ready físico; depois ledger de sequência, dedupe da via de Conferência e ensaio noturno na Epson mediante autorização própria.

**Efeitos:** 0 linhas de pedidos lidas via SQL; **somente DMVs e metadados**; 0 DML/DDL, 0 alteração de RCSI, 0 serviço reiniciado, 0 impressão, 0 arquivo operacional modificado. Os estados `CURRENT_READER_SQL_PLAN=OBSERVED`, `ONE_ORDER_PLAN=UNKNOWN`, `NEW_QUERY_LOCK_IMPACT=UNKNOWN`, `ATOMICITY=NOT_PROVEN`, `IFOOD_ID=NOT_PROVEN`, `AUTO_PRINT=HOLD` são intencionais.

**Fontes técnicas:** Microsoft [SET TRANSACTION ISOLATION LEVEL](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql); [sys.dm_exec_query_stats](https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-exec-query-stats-transact-sql); [SET SHOWPLAN_XML](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-showplan-xml-transact-sql).