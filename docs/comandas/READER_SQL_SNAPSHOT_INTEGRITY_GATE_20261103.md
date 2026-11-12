# Reader Itaim — consistência de revisão, origem e observações (03/11/2026)

**Natureza:** gate técnico em laboratório, PR #135 DRAFT. **Zero SQL real executado; nenhuma configuração do servidor ou serviço alterada.** Nenhum pedido operacional ou identidade iFood foi autenticado nesta etapa.

## Por que o gate é necessário

Uma consulta com o cabeçalho e as observações pode construir um evento cujo JSON e SHA-256 são **perfeitamente consistentes**, mas que nunca existiu como uma revisão única do banco. Exemplo adversarial: linha A de um instante anterior e linha B de um instante posterior, ambas com o mesmo cabeçalho. O montador puro consegue computar um hash desse conjunto, mas ele **não prova a simultaneidade**. Foi reproduzido em seis testes sintéticos; saída permanece `HOLD`.

O SQL Server distingue dois comportamentos relevantes:
- **READ COMMITTED com READ_COMMITTED_SNAPSHOT ON (RCSI):** linhas versionadas garantem visão consistente **para uma instrução SQL**, não necessariamente entre duas consultas distintas.
- **SNAPSHOT com ALLOW_SNAPSHOT_ISOLATION ON:** fornece visão consistente **na transação**, mas requer efetivamente uma transação sob esse nível.
- **READ COMMITTED com RCSI OFF:** usa locks compartilhados; não fornece automaticamente o mesmo snapshot de versão em todos os operadores/tabelas de uma consulta sob concorrência.
- Nunca usar `NOLOCK` / READ UNCOMMITTED para comprovar a fidelidade de observações de pedidos.

Fontes do fabricante: [Microsoft — Transaction Locking and Row Versioning Guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide), [Microsoft — SET TRANSACTION ISOLATION LEVEL](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql).

## Implementação mínima preparada no Foxxy

1. `tools/comandas_reader_isolation_catalog_v1_REVIEW_ONLY.sql`: **SELECT de catálogo não executado**; retorna somente nome do banco, login SQL e estados `is_read_committed_snapshot_on` / `snapshot_isolation_state_desc`. Nenhuma linha de pedido é consultada.
2. `tools/comandas_reader_sql_consistency_gate_v1_review_only.cjs`: módulo puro. Confere o escopo configurado Reader/Itaim, exatamente uma instrução para um pedido, proíbe NOLOCK, analisa a elegibilidade do isolamento e **NUNCA** transforma parâmetros/metadata fornecidos pelo chamador em origem autenticada. RCSI ON produz no máximo `CONFIG_ELIGIBLE_BUT_NOT_ATTESTED`, sempre `state=HOLD`, `ordersPublishable=0`, `printAuthorized=false`.
3. `tools/verificar_comandas_reader_sql_consistency_gate_v1_offline.cjs`: **23/23 testes** com metadata inventada (RCSI ON/OFF/unknown, SNAPSHOT ON/OFF, host/loja errados, login diferente, múltiplas consultas, `NOLOCK`, campos extras simulando autorizações).
4. `tools/verificar_comandas_reader_mixed_revision_risk_v1_offline.cjs`: **6/6 testes** demonstrando um par falso de itens de revisões diferentes que satisfaz a forma e gera hash, mas **não recebe** autenticidade nem liberação.

## Portão de prova operacional futura

- Confirmar por **canal oficial autorizado** os bytes/versionamento do Reader em execução e a identidade efetiva; não contornar ACL do diretório `bin`, nem usar conta administrativa alternativa.
- Se houver autorização pontual para consulta, obter `sys.databases` pelo próprio Reader e sua conexão atual. Verificar `DB_NAME()=teknisa`, `SUSER_SNAME()` esperado e estados do isolamento. **Os metadados lidos do banco e o usuário do processo precisam ter proveniência própria; um JSON autoassinado por simulador não serve.**
- Exigir **um único pedido por leitura** (filtro de escopo, `@top=1` aplicado efetivamente), todas as linhas/observações obtidas e contadas, nenhum truncamento, e consulta sob uma condição de isolamento validada. Se RCSI OFF ou indisponível, **não habilitar nova captura**; avaliar alternativa segura com autorização separada. Não ligar RCSI/SNAPSHOT, pois `ALTER DATABASE` muda comportamento global do POS.
- Preservar SQL do caixa em leitura sem `NOLOCK`, timeout e quantidade limitados. Ser consultado em horário monitorado não equivale a não afetar performance; validar custo antes do piloto.
- Confirmar depois que o próprio Reader emite um recibo de uma revisão atual e que uma segunda origem do iFood atesta a identidade do mesmo pedido. **Só então** desenhar sequência real, confirmação de estados, via de Conferência exclusiva e piloto supervisionado.

## Situação e não efeitos

`SQL_CATALOG_IN_PRODUCTION=NOT_RUN` · `ISOLATION_DB_CONFIG=UNKNOWN` · `ACTUAL_READER_SQL_LOGIN=UNKNOWN` · `ROWSET_SNAPSHOT_PROVEN=NO` · `SCHEMA_AND_HASH_LAB=PASS` · `LIVE_ORDER=UNKNOWN` · `REAL_PRINT=HOLD`.

Não foram alteradas tarefas, serviços, credenciais, ACL, banco, Teknisa, Gestor, iFood ou impressoras. O requisito de impressão noturna forte e nítida continua pendente de ensaio físico autorizado.
