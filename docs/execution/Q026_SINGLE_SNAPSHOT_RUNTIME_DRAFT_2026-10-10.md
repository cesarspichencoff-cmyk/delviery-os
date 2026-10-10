# Q-026 — PR #45, correção isolada da leitura temporal de Entregas

**Data:** 2026-10-10. **Base exata:** `integration/deliveryos-product-ux-android-20261009`, SHA `99b0c72e6a254c68358767b5addffe673707d934`.  
**Autoridade adversarial:** auditoria Claude Q-026 da issue #36, [PR #41](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/41), cenários S1 e S2 (PR de pesquisa não modificado).  
**Modo:** DRAFT / HOLD; não merge, não deploy, não leitura de produção.

## Problema comprovado anteriormente

A porta `lerRealidadeDeEntregas` fazia uma transação `READ ONLY` para o replay Q-016 e outra para aparelhos, último lote e contagens, no isolamento padrão `READ COMMITTED`. Um GPS chegando entre consultas podia mostrar simultaneamente uma viagem sem posição havia 9 minutos e seu aparelho com posição atual. S1 e S2 foram reproduzidos em PG16 descartável com escritor concorrente. Isso é um **contraexemplo alcançável**, mas não comprova frequência real em produção.

## Correção mínima neste PR

- `src/platform/leitura/realidade-de-entregas.ts`: inicia uma única `cliente.transaction` e emite como **primeiro comando após BEGIN** `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`. Em seguida lê fatos canônicos, aparelhos, último lote e contagens dentro do **mesmo objeto `tx`**.
- `src/platform/projections/replay-do-event-log.ts`: extrai somente o corpo original do leitor/decodificador para `lerFatosParaReplayNaTransacao(tx,tipos)`; não muda filtros, reconstrução do envelope, transformação da sequência, contagem UNKNOWN ou quarentena. `lerFatosParaReplay(cliente,tipos)` mantém a API independente, que abre a própria transação `READ ONLY`. Esse helper é de uso restrito a chamador já dentro de transação apropriada.
- `PgSqlClient.transaction` existente garante conexão dedicada e `COMMIT/ROLLBACK/release` no `finally`; não foi modificado.
- Nenhuma mudança em SQL migrations, schema, cálculos do `projetar`, `eventos[]`, view model, contrato HTTP, fonte real Q-016, Q-024, compactação de memória ou PR #37/#41.

## Prova de aceite com PostgreSQL real descartável

`tests/product/run-q026-single-snapshot-acceptance-pg.ts` usa migrations reais, escritor independente e ganchos de commit determinísticos. Não usa banco operacional.

1. Replay Q-016 ainda abre sua própria transação `READ ONLY`.
2. A porta Entregas usa **uma** transação e o primeiro comando é `SET ... REPEATABLE READ, READ ONLY`.
3. Um GPS inserido após a consulta de fatos e antes do cadastro não contradiz nem viagem nem aparelho no mesmo snapshot; a VM real continua coerente e a **leitura seguinte** vê o GPS novo.
4. Um GPS inserido entre a consulta de último lote e `count(*)` também fica invisível à transação atual e visível à próxima.
5. Prova negativa: interceptador troca SOMENTE o `SET` por `READ COMMITTED, READ ONLY` e a divergência último lote velho/contagem nova reaparece.
6. Prova negativa de escrita: tentativa artificial de `INSERT` dentro da transação da porta é recusada pelo PostgreSQL com SQLSTATE `25006`; dados preservados.

`DELIVERYOS_PG_URL` ausente faz o teste sair com código **78**, não PASS. O job exige a linha `Q026_SINGLE_SNAPSHOT_ACCEPTANCE: 6/6 PASS`, além de `npx tsc --noEmit`, regressão Q-016, testes Product e `GOVERNANCE_GATE_GREEN`.

**CI comprovada:** [run 38061461480](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38061461480), commit de código `66e93174cc972fcce5b38de7eb534764b0e3fd90`. Resultado `success`, logs com 6/6, governança GREEN e verificação do exit 78. Na primeira tentativa, a governança falhou por checkout raso do workflow; foi corrigido com `fetch-depth: 0` sem alterar regras ou código de governança.

## Lacunas e restrições

- Não executado contra HTTP real, dados operacionais ou aparelho físico. O código está pronto em branch, não em produção.
- `REPEATABLE READ` retém horizonte MVCC até `COMMIT`; o leitor continua carregando todos os fatos em memória. Não foi medida latência, `backend_xmin` com carga real ou `VACUUM` sob uso produtivo; manter transações curtas, sem chamadas externas dentro delas.
- Não corrigidas neste PR: apresentação identificada de quarentena, empate `localeCompare` da Q-016, riscos de collation do cursor, memória da implementação mista, Q-026/Q-024. Decisão de alteração dos critérios históricos permanece de César.
- Os testes da Q-026 provam o cenário atacado, não equivalência irrestrita de todas as condições em produção.

**Estado:** `CODE_READY`, `TEST_PASS` com PostgreSQL 16 descartável, `NO_DEPLOY`, `NO_MERGE`; **não** `WORLD_PROVEN`, **não** `HUMAN_ACCEPTED`. PR #45 continua DRAFT.
