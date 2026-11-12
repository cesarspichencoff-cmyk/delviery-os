# TATÁ Comandas — consistência de uma revisão no SQL atual (04/11/2026)

**Status: somente candidata estática, NÃO executada.** Projeto: Itaim. Foi preparada para localizar a menor via de prova possível antes de alimentar o Copiloto. Não instalar, rodar no caixa, parar serviço, mudar base de dados nem usar a conta administrativa para capturar pedidos.

## O que já existia e não foi reconstruído

- A auditoria viva `docs/comandas/ITAIM_REAL_READER_SQL_SOURCE_PROOF_20261104.md` já confirmou a conta SQL ativa do Reader V2 (`NT SERVICE\\TataComandaReader`), os índices com chaves nativas e o banco `teknisa` com **RCSI OFF / SNAPSHOT OFF / READ COMMITTED**.
- `tools/comandas_reader_notes_single_select_v1_REVIEW_ONLY.sql` já previa as 17 colunas do cabeçalho, itens e observações em uma consulta — mas não assegurava isolamento.
- `tools/comandas_reader_sql_consistency_gate_v1_review_only.cjs` e testes `23/23` já barram alegações sem comprovação do SQL. `tools/verificar_comandas_reader_mixed_revision_risk_v1_offline.cjs` já demonstra que hash coerente pode representar linhas de instantes diferentes.
- A PR #137 já implementou a ponte em memória para digest antigo, sem modificar o watcher. Não ligar uma segunda captura nem migrar o checkpoint como primeiro passo.

## Por que o SQL atual é o bloqueio central

No SQL Server, com `READ_COMMITTED_SNAPSHOT = OFF`, `READ COMMITTED` protege contra leitura de dados não confirmados, mas pode liberar bloqueios de leitura durante o percurso e não garante um único snapshot versionado da consulta. Duas leituras iguais e um SHA correto são **indícios de estabilidade, não prova formal de revisão única**. <https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql>

`SERIALIZABLE` numa **consulta única e uma conexão dedicada** é uma candidata a isolamento transacional mais forte **sem alterar o banco globalmente**. Mas pode segurar bloqueios de leitura/faixa até a conclusão e atrasar escritas da própria Teknisa. `LOCK_TIMEOUT 100` limita apenas a espera **da consulta leitora** para adquirir bloqueio; **não** limita o tempo durante o qual ela pode bloquear o caixa. `DEADLOCK_PRIORITY LOW` favorece a outra transação em um deadlock, não impede bloqueio comum. Nenhum desses controles substitui medição real de plano/custo nem garante que a **aplicação** grave cabeçalho e itens na mesma transação. Fontes: <https://learn.microsoft.com/en-us/sql/t-sql/statements/set-lock-timeout-transact-sql>, <https://learn.microsoft.com/sql/t-sql/statements/set-deadlock-priority-transact-sql>.

## Nova candidata mínima

`tools/comandas_reader_one_order_serializable_REVIEW_ONLY.sql` **não é um script de deploy**. Declara, para análise: somente uma comanda nativa exata (`CDFILIAL=0001`, `CDLOJA=01`, `IDORGCMDVENDA=DLV_IFO`, `@nrVendaRest`, `@nrComanda`); 17 campos já previstos; uma instrução `SELECT TOP (201)` com `ORDER BY i.NRPRODCOMVEN`; `SERIALIZABLE`, `LOCK_TIMEOUT 100`, prioridade de deadlock baixa e `MAXDOP 1`. Nenhum DML/DDL ou coluna dedicada a cadastro/fiscal. **Observações livres podem conter dados pessoais ou de saúde; nunca registrar ou exportar seus textos.** Nenhum acesso a iFood, impressão ou sistema externo.

**Limites explícitos:**
1. `TOP(201)` é um **sentinela de cobertura**: resultado com 201 linhas deve ser `HOLD`, nunca tomar 200 primeiros como completos; porém `TOP` não garante que o plano leia no máximo 201 linhas internamente.
2. Os tipos dos parâmetros são **desconhecidos até verificar o catálogo real** e precisam coincidir exatamente com os tipos das colunas — não assumir `nvarchar(64)`; evitar conversão implícita/scan. Exigir plano estimado revisado, preferencialmente seek nos índices já observados; **a presença de índice não garante plano seek**.
3. Executar no futuro, se houver aprovação específica para bloqueios, **somente no contexto de sessão do Reader verificado**, conexão nova exclusiva e sem pooling, timeout de comando curto, abort/rollback e telemetria de esperas; jamais usar a conta administrativa como substituta.
4. Um `SERIALIZABLE` com consulta única pode proteger a visão transacional do SQL, mas **não prova atomicidade lógica entre transações da aplicação** caso a Teknisa escreva cabeçalho, itens e observações em commits separados. Exigir uma evidência própria desse ciclo e de linhas completas, sem promover automaticamente a impressão ou prontidão por praça.
5. Conflito, timeout, plano caro, lock de escrita, cardinalidade >200, revisão contraditória ou diagnóstico ausente = `HOLD` sem reintento agressivo. Não habilitar RCSI/SNAPSHOT global; não usar `NOLOCK`, `READPAST`, captura por conta de operador, nem serviço concorrente.

## Testes e fronteira de aprovação

- `tools/verificar_comandas_reader_one_order_serializable_review_only.cjs`: **8/8 PASS** executados na worktree isolada do Foxxy, sem SQL. Verifica seleção única, todas as colunas, filtros Itaim, ausência de efeitos, isolamento declarado, aviso de bloqueio e reutilização do validador anterior, que corretamente devolve **HOLD** mesmo diante da proposta `SERIALIZABLE`.
- O teste foi acrescentado ao workflow existente `DeliveryOS Thermal Shadow Gate` da PR #135. Este relatório não assume que o CI terminou; conferir o SHA exato e o resultado antes de marcar `CI_PASS`.

**Próximo gate, não autorizado por este arquivo:** análise do plano/impacto sem ler pedidos, e só depois decisão operacional para **um ensaio de uma comanda real** que possa adquirir bloqueios, em janela supervisionada e com rollback/STOP. A autorização anterior de manutenção não significa que um novo padrão de lock no SQL esteja automaticamente liberado. Até lá: `CODE_REVIEW_READY`, `STATIC_TEST_PASS=8/8`, `SQL_REAL_NOT_EXECUTED`, `ROWSET_ATOMICITY=UNKNOWN`, `COPILOT_LIVE_READY=NO`, `PRINT=NO`.

**Efeito desta alteração:** apenas um modelo SQL de revisão, oito verificações e um gate CI em PR DRAFT; sem mudança no caixa, serviço, banco, impressão ou usuário SQL.
