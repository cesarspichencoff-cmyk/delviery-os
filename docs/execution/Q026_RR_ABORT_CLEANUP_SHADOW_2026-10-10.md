# Q-026 — Rollback e liberação de snapshot após falhas (SHADOW)

**Data:** 2026-10-10. **Base operacional:** candidato PR #43, commit `6201d67b1bea6a8baa959cf23ef1b7f2243404c2`, derivado da integração congelada `99b0c72e6a254c68358767b5addffe673707d934`. **Este experimento é somente teste, não integração.**

## Hipótese atacada

A leitura da tela Entregas usa UMA transação `REPEATABLE READ, READ ONLY` para evitar a contradição de aparelhos, viagens e contagens reproduzida na auditoria independente do Claude (#41). Os PRs #44 e #47/#48 comprovaram, em PostgreSQL descartável, que a snapshot RR retém versões MVCC durante seu período de vida; com 1,03 milhão de fatos o leitor integral gastou aproximadamente oito segundos e atingiu ~1,3 GiB RSS no Node em duas observações artificiais.

Essas provas de sucesso NÃO bastavam para responder: **se a leitura for abortada após adquirir uma snapshot, o driver libera a transação e a conexão, ou deixa `backend_xmin` pendurado e o pool contaminado?**

## Procedimento

Arquivo `tests/product/run-q026-rr-abort-cleanup-shadow.ts`. CI `.github/workflows/deliveryos-q026-rr-abort-cleanup-shadow.yml`.

PostgreSQL 16 descartável + migrations reais; `platform.event_log` inicial com **2.000 fatos sintéticos** em uma viagem/unidade/modo, um dispositivo vinculado. Um pool leitor PostgreSQL de **máximo uma conexão**, escritor independente e observador independente.

Em cada cenário, a função **real** `lerRealidadeDeEntregas` inicia `REPEATABLE READ, READ ONLY`, lê os fatos, e a instrumentação comprova `backend_xmin` presente no PostgreSQL. Outra sessão **confirma um novo evento** depois dessa primeira leitura. Então o teste injeta uma das três falhas determinísticas:

1. **Exceção de aplicação** `Q026_INJECTED_JS_ERROR` após aquisição da snapshot;
2. **Timeout no servidor PostgreSQL**, `SET LOCAL statement_timeout = '80ms'` seguido de `SELECT pg_sleep(0.30)`, com código SQLSTATE **57014**, e não um timer que apenas ignora a resposta;
3. **Tentativa de INSERT na própria transação READ ONLY**, obrigatoriamente recusada pelo servidor com código SQLSTATE **25006**.

O teste exige que a falha seja propagada ao chamador, que o adaptador `PgSqlClient.transaction` execute ROLLBACK, que a sessão PostgreSQL volte a `state='idle'` com `backend_xmin IS NULL`, e que o pool MAX=1 reutilize o **mesmo backend PID**, com isolamento padrão restaurado (`read committed`). Também executa uma leitura nova para confirmar que ela enxerga o evento externo e que a escrita recusada não persistiu. No fim, valida a função pública Q-016 `lerFatosParaReplay` sem mudança de contrato.

## Resultado executado

[GitHub Actions 38071126145](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38071126145): **1/1 job SUCCESS** no commit `e37f2d49b7fb8fadf41a497c39f2420d306c7841`; projeto e script passaram no TypeScript estrito. Resultado físico no banco efêmero:

| Falha | Código | Snapshot liberada? | Mesmo backend reutilizado? | Leitura posterior atualizada? |
| --- | --- | --- | --- | --- |
| Exceção no callback | erro de aplicação | **Sim** | **Sim** | **Sim, 2.001 fatos** |
| Timeout de statement no servidor | **57014** | **Sim** | **Sim** | **Sim, 2.002 fatos** |
| INSERT vedado na transação READ ONLY | **25006** | **Sim** | **Sim** | **Sim, 2.003 fatos** |

O teste também verifica que a contagem de eventos no `platform.event_log` corresponde aos três INSERTs externos confirmados, sem nenhum evento recusado persistido.

## Fronteiras de prova

- **Comprovado apenas no PostgreSQL 16 descartável com 2.000 eventos sintéticos**: o adaptador real limpa a sessão após exceção do callback e dois erros retornados pelo PostgreSQL. Isso não demonstra que o transporte HTTP/cliente Android tratará a falha corretamente.
- **Não testados:** falha de rede no meio do COMMIT, término forçado de backend, indisponibilidade de pool, cliente que abandona conexão sem esperar callback, `idle in transaction` durante desligamento de processo, transação com 1,03M em momento de erro, latência p95/p99 da operação. O driver usa rollback implícito quando uma conexão realmente morre; esse caminho não foi exercitado.
- É um **teste de recuperação**, não uma alteração do timeout ou do comportamento operacional. Não há novos índices, migrações, políticas de retenção, alterações na UI nem dados reais.
- Preservar replay Q-016, modos `UNKNOWN`, quarentena, dimensões, cursor e contrato HTTP; Q-026 segue **ABERTA**. O PR #43 continua candidato funcional, sem autorização de merge/deploy, e sua pressão de memória com histórico grande permanece conhecida.

**Estado:** `TEST_PASS` do rollback nesses três cenários; **não** `WORLD_PROVEN`, `DEPLOYED` ou fechamento da Q-026. PR de pesquisa DRAFT/HOLD.
