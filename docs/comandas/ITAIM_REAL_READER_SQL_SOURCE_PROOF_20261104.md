# Reader do Itaim — prova de identidade SQL e integridade de eventos (04/11/2026)

**Estado:** auditoria administrativa **somente leitura**, na sessão legítima do CAIXA_MOOCA; nenhum restart, configuração, impressão, ACL ou SQL de pedidos alterado. **A fonte VÉRTICE canônica foi revalidada**: `cesarspichencoff-cmyk/vertice-runtime.`, `vertice-active`, `VERTICE_ENTRY.md`.

## Descoberta que corrige a interpretação anterior

O arquivo instalado `bin/tata_reader_continuous_watch_candidate_v1.ps1` **não é o coletor SQL**: ele é um **supervisor de subprocessos**, com controle de heartbeat/reinício/child record e hash pinado do worker. O coletor efetivamente configurado é `bin/tata_reader_continuous_watch_candidate_v2.ps1`. **Não instalar a versão V1 de 13.363 bytes do GitHub sobre a instalação atual.** O diagnóstico anterior de ausência de campos de observação em V1 não descreve o worker V2 em produção.

- Supervisor instalado: 34.708 bytes, SHA-256 `2b6dc012918f317c8d244531b3ccb2fd33e33b226c6e6e668bee4b698936bef5`.
- Worker V2 instalado: 17.871 bytes, SHA-256 `92b33e82ed72426be46fe20bcb2a4f4557f9716108886f89e15a4e262c506d44`.
- `tata_reader_supervisor_v1.config.json`: pin de worker corresponde exatamente à SHA-256 do V2; execução em lotes de 20 polls, 3 s por poll, heartbeat a cada 5 s.
- Heartbeat de 04/11 por volta de 02h19 BRT: `RUNNING`, assinatura de worker `sha256_verified=true`, último lote `OK`, 20 polls, zero erros, 1000 snapshots observados e 1000 duplicatas suprimidas; nenhum novo evento (resultado esperado na amostra daquele lote). Acumulados históricos de falhas não equivalem à falha atual.
- O V2 instalado seleciona `DSOBSCOMANDA`, `DSOBSDESCIT`, `DSOBSPEDDIGCMD` e `TXPRODCOMVEN`, gera `observation_rows` e declara `observation_scan_complete=true`. O código atual verifica `WindowsIdentity.GetCurrent()`, `SUSER_SNAME()` e `DB_NAME()` antes de capturar.
- O filtro SQL instalado ainda aceita `IDORGCMDVENDA LIKE N'DLV[_]%'` (mais amplo que apenas `DLV_IFO`). **O consumidor de Conferência precisa recusar origens diferentes de `DLV_IFO`**. A declaração de completude é interna ao produtor; não é prova independente de snapshot transacional.

## Prova SQL obtida sem interromper o Reader

Uma consulta de catálogo via **conta administrativa** validou o banco `teknisa` e retornou:
- `is_read_committed_snapshot_on = 0` (**RCSI OFF**).
- `snapshot_isolation_state_desc = OFF` (**SNAPSHOT OFF**).

Uma segunda consulta restrita a `sys.dm_exec_sessions` / `sys.dm_exec_connections`, ainda via admin e **sem ler dados de pedidos**, encontrou **uma sessão atual** do coletor, com:
- `login_name = NT SERVICE\\TataComandaReader`, `program_name = TataReaderContinuousWatchV1`, `host_name = CAIXA_MOOCA`, `database = teknisa`.
- `host_process_id` corresponde ao PID do worker registrado no `reader-supervisor-child-v1.json`.
- `transaction_isolation_level = 2` (**READ COMMITTED**); a sessão estava `sleeping` naquele instante.

Isto **comprova a sessão e identidade SQL vistas do servidor**, não exige alegar que a consulta de catálogo administrativa foi executada pelo Reader. Sob `READ COMMITTED` com RCSI OFF, a leitura de várias tabelas **não tem snapshot por versão garantido**: locks compartilhados podem ser liberados enquanto a consulta percorre linhas. Um SHA correto preserva bytes capturados, não prova que todas as linhas pertençam à mesma revisão.

Consulta de catálogo `sys.tables/sys.columns/sys.types/sys.change_tracking_tables`, limitada às quatro tabelas `TEKNISA.COMANDAVEN`, `ITCOMANDAVEN`, `VENDAREST`, `PRODUTO`:
- `rowversion`/timestamp: **0** nas quatro.
- `temporal_type = 0` nas quatro.
- Change Tracking: **não habilitado** nas quatro.
- Esta observação **não exclui** outros mecanismos proprietários de revisão fora dessas quatro tabelas.

Referências Microsoft:
- https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide
- https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql
- https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-exec-sessions-transact-sql

## Índices nativos (consulta adicional, ainda sem ler pedidos)

Uma consulta de catálogo `sys.indexes`, `sys.index_columns` e `sys.columns` encontrou índices com os identificadores nativos nas primeiras colunas de chave: `COMANDAVEN` 1 índice com prefixo `CDFILIAL,CDLOJA,NRVENDAREST,NRCOMANDA`; `ITCOMANDAVEN` 5; `VENDAREST` 4; `PRODUTO` 18. Trata-se de **índices existentes**, não de índices criados ou otimizados nesta rodada. A presença de índices torna uma leitura localizada plausível, mas **não** prova que um SELECT real os utilizará ou quanto bloqueará o caixa.

Nenhum SELECT de pedidos, `SERIALIZABLE`, `HOLDLOCK`, `SET TRANSACTION ISOLATION LEVEL`, plano executado ou mudança de schema foi realizado. Qualquer ensaio futuro de bloqueio em produção exige avaliação do plano/impacto e janela explicitamente autorizada, mesmo para uma única comanda.

## Eventos locais: inspeção estatística sem exportar PII

**Amostra 1:** 100 eventos mais recentes (por data de modificação de arquivo). 100/100 com campos requeridos e `observation_scan_complete=true`; SHA-256 armazenado em **maiúsculas** em 100/100, SHA recalculado por Node coincide em **100/100 após lowercase**; origem `DLV_IFO` em 98/100. O hash sem conversão seria rejeitado pelo replay que exige `^[0-9a-f]{64}$`.

**Amostra 2:** 240 eventos históricos distribuídos entre 14.268 arquivos com nome de evento; 240/240 com SHA em maiúsculas e **240/240 com paridade canônica após lowercase**; `DLV_IFO` em 232/240; `observation_scan_complete=true` em 234/240; 229 com notas e 11 sem; 68 arquivos modificados nos últimos sete dias na época da auditoria. As amostras **podem se sobrepor** — não somá-las como 340 arquivos únicos.

**Limite do hash:** entre as amostras lidas, nenhum valor de observação continha apóstrofo. O teste diferencial anterior com fixture sintética mostrou que `ConvertTo-Json -Compress` pode escapar apóstrofo de maneira diferente de `JSON.stringify`. Portanto, **não basta substituir o hash maiúsculo por minúsculo sem recalcular sobre o JSON canônico e rejeitar divergências**. Os dados de clientes, códigos de produto, observações, números de pedido e nomes de arquivos não foram publicados nos resultados.

`ready_for_downstream_shadow=true` em um evento NÃO é autenticação de origem iFood, identidade UUID independente nem permissão para imprimir. Estados históricos `3/P/X` não foram reinterpretados como ciclo operacional comprovado.

## Decisão de segurança e rota de menor risco

**Provas novas:** `CURRENT_SQL_READER_LOGIN=OBSERVED`, `READER_EXECUTING_CONFIGURED_V2=CORROBORATED`, `RCSI=OFF`, `SNAPSHOT=OFF`, `READER_ISOLATION=READ_COMMITTED`, `EVENT_CANONICAL_DIGEST_PARITY=OBSERVED_IN_SAMPLES`.

**Ainda não provado:** `ATOMIC_NATIVE_ORDER_REVISION`, `INDEPENDENT_IFOOD_UUID_JOIN`, `TATA_SEQUENCE_LIVE_ATTESTED`, `OPERATIONAL_AUTO_PRINT`, `REAL_NIGHT_DENSITY_APPROVED`.

**Prioridade de correção, sem fazer mudanças em produção nesta rodada:**
1. Tratar o **V2 instalado** como fonte factual para qualquer futura correção, preservando supervisor e pin de hash; não sobrescrever com o candidato antigo do GitHub.
2. Em auditoria offline, exigir `DLV_IFO`, `observation_scan_complete=true`, chaves de linha e escopo Itaim, e **recomputar o digest canônico** antes de aceitar qualquer normalização de caixa. Falhas ficam em `HOLD`.
3. Propor mecanismo de consistência por revisão **adequado ao SQL atual** sem ligar RCSI global automaticamente. `SERIALIZABLE`/locks específicos podem criar bloqueio em operações da Teknisa; só ensaiar com plano/limites e autorização operacional própria. Releituras com hashes iguais aumentam confiança, mas **não são prova formal de snapshot**.
4. Após prova de consistência, capturar uma revisão atual e comprovar ID iFood por origem **independente**, sem criar serviço novo ou expor dados ao chat. Só então ledger, prevenção de duplicações e homologação física do contraste noturno da Conferência.

**Efeitos comprovados desta rodada:** consultas SELECT estritamente de catálogos/DMV, leituras locais de código/eventos, nenhum SELECT de pedidos, nenhuma escritura SQL, nenhuma alteração de serviço/ACL/tarefa/impressora, nenhum deploy, nenhum print. A sessão remota administrativa permanece sob controle de César.
