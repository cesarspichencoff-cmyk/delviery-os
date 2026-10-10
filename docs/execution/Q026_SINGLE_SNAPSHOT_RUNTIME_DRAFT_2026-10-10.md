# Q-026 — PR #45, correção isolada da leitura temporal de Entregas

**Data:** 2026-10-10. **Base exata:** `integration/deliveryos-product-ux-android-20261009`, SHA `99b0c72e6a254c68358767b5addffe673707d934`.  
**Autoridade adversarial:** auditoria Claude Q-026 da issue #36, [PR #41](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/41), cenários S1 e S2 (PR de pesquisa não modificado).  
**Modo:** DRAFT / HOLD; não merge, não deploy, não leitura de produção.

## Problema comprovado anteriormente

A porta `lerRealidadeDeEntregas` fazia uma transação `READ ONLY` para o replay Q-016 e outra para aparelhos, último lote e contagens, no isolamento padrão `READ COMMITTED`. Um GPS chegando entre consultas podia mostrar simultaneamente uma viagem sem posição havia 9 minutos e seu aparelho com posição atual. S1 e S2 foram reproduzidos em PG16 descartável com escritor concorrente. Isso é um **contraexemplo alcançável**, mas não comprova frequência real em produção.

## Correção mínima neste PR

- `src/platform/leitura/realidade-de-entregas.ts`: inicia uma única `cliente.transaction` e emite como **primeiro comando após BEGIN** `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`. Lê fatos canônicos, aparelhos, último lote e contagens dentro do **mesmo objeto `tx`**, materializa as respostas e **encerra a transação antes de mapear os aparelhos e executar `projetar` em CPU**. Isso não reduz os fatos carregados em memória, mas encurta a retenção MVCC.
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

## Provas complementares — API HTTP e custo da transação (10/10/2026)

Após a correção inicial, foram implementados mais dois gates usando apenas PostgreSQL 16 descartável, sem banco operacional, alterações de schema ou serviço externo.

**API de apresentação real:** `tests/product/run-q026-http-single-snapshot-pg.ts` — **6/6 PASS**. Exercita `criarServidor()` e o handler `GET /api/entregas` (não uma simulação de roteador) com `DELIVERYOS_DATABASE_URL` apontando explicitamente para o banco temporário. Confirma: `/api/health` read-only, viagem e aparelho lidos do PG, GET subsequente vendo um novo GPS após COMMIT, filtro de unidade inexistente sem abrir o escopo, POST recusado com 405 e contagem do banco intacta, e banco temporário destruído resultando em `indisponivel` sem vazar URL/credenciais.

**Fronteira MVCC:** `tests/product/run-q026-transaction-window-pg.ts` — **3/3 PASS**. Em fixture com **1.800 fatos sintéticos**, o teste observou `backend_xmin` presente na transação, `backend_xmin` liberado após COMMIT e a função `transaction` retornando **apenas respostas SQL materializadas**; as projeções e os aparelhos são compostos depois dessa fronteira. Medição em **uma execução específica da CI**: **44,31 ms** dentro da transação e **52,27 ms** na função inteira. Esse valor é observação do runner descartável, **não** latência típica, SLO, comparação A/B ou custo projetado sob carga. Nenhum efeito em `VACUUM` foi medido.

**Execução final de código anterior a este ajuste documental:** [CI 38062468929](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38062468929), **SUCCESS**. Log com `Q026_SINGLE_SNAPSHOT_ACCEPTANCE: 6/6 PASS`, `Q026_HTTP_SINGLE_SNAPSHOT: 6/6 PASS`, `Q026_TRANSACTION_WINDOW: 3/3 PASS`, `GOVERNANCE_GATE_GREEN`, replay Q-016, Product, tipagem e verificação `no_db_exit=78`.

### Restrição de efeito

O código Q-026 continua **DRAFT/HOLD**, sem merge, deploy ou mudança na instância real. O teste HTTP é de **servidor real local**, não prova de acesso HTTP produtivo. O alívio de retenção MVCC é estrutural e comprovado nesse fixture; custos de memória, VACUUM, leitores concorrentes numerosos e latência em milhões de fatos ainda são UNKNOWN.

## Prova de carga controlada e leituras concorrentes — 10/10/2026

**O que foi executado:** `tests/product/run-q026-read-concurrency-pg.ts`, com banco PostgreSQL 16 descartável, migrations reais, **8 aparelhos e 8 viagens**, cruzando 2 unidades e 2 modos de origem (`simulated` e `control`). A matriz mede **2.000 e 16.000 fatos**, com **1, 4 e 8 leituras simultâneas**, pool configurado com **4 conexões**. Usa o leitor canônico real, sem copiar o algoritmo nem acessar dados produtivos.

O teste valida simultaneamente a **integridade completa das 8 viagens e seus eventos**, as contagens independentes por modo, identidade de aparelho, histórico UNKNOWN não inventado, uma transação por leitura, limite de callbacks em conexões emprestadas, e **ausência de backend ocioso em transação ou retendo `backend_xmin` depois das leituras**. Quando chegam 8 pedidos de leitura, no máximo **4 callbacks de transação** realmente usam conexão; as demais aguardam no pool.

**CI final do teste de carga com contador corrigido:** [run 38064050034](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38064050034), HEAD de implementação `975a3a8e4d0930ddf5e15d27b3a8b390b53dc31a`; **6/6** cenários do stress, e demais **15/15** verificações específicas da etapa anterior, além de tipagem, Q-016, Product e governança GREEN.

| Fatos | Leituras simultâneas | Tempo total da rodada | Maior latência individual | Maior espera por conexão | Pico de callbacks com conexão | RSS Node após rodada |
|---:|---:|---:|---:|---:|---:|---:|
| 2.000 | 1 | 37,19 ms | 37,17 ms | 2,54 ms | 1 | 99,76 MB |
| 2.000 | 4 | 70,15 ms | 70,11 ms | 15,25 ms | 4 | 114,69 MB |
| 16.000 | 1 | 108,75 ms | 108,74 ms | 0,31 ms | 1 | 145,14 MB |
| 16.000 | 4 | 370,71 ms | 370,62 ms | 43,93 ms | 4 | 175,05 MB |
| 16.000 | 8 | 661,20 ms | 661,15 ms | **445,35 ms** | 4 | **298,32 MB** |

**Não interpretar como benchmark de produção.** É uma única rodada por configuração, em um runner compartilhado, com aquecimento, alocações e GC não controlados. A memória RSS é do processo Node observado **depois** da rodada, não pico exato e não comparação A/B com a base Q-016. A queda do heap no último cenário mostra ruído de coleta de lixo; não significa que o consumo tenha diminuído. O campo medido `callback_in_connection_max_ms` exclui a espera no pool e o `COMMIT` — não chama esses números de tempo total de transação. O teste não mede manutenção/efeito do VACUUM, comportamento com vários usuários reais, nem a distribuição de tamanhos do banco da operação.

**Interpretação verificável:** o desenho de instantâneo único evita as contradições concorrentes testadas, preserva dados e limita callbacks com conexão às quatro disponíveis. Mas **16.000 fatos × 8 leituras** já causou espera de pool de até 445 ms e RSS após a rodada próxima de 300 MB num processo pequeno, o que torna **prematuro publicar sem um ensaio representativo de uso e sem estratégia separada de capacidade/memória**. Os PRs #37/#41 continuam intocados e a otimização de memória do #37 permanece não autorizada para merge.

## Defesa opcional contra saturação HTTP — 10/10/2026

**Falha de capacidade a prevenir:** o `pg.Pool` limita conexões SQL, mas não é um limite de requisições HTTP ainda aguardando execução. Nos ensaios anteriores com 16.000 eventos, oito solicitações provocaram espera no pool e retenção significativa de memória no processo Node.

**Implementado no PR #45, mas DESLIGADO POR PADRÃO:** `tools/product_system_server.ts` aceita a variável explícita `DELIVERYOS_ENTREGAS_MAX_INFLIGHT`, com valores **1, 2 ou 4**. Sem variável, o comportamento histórico fica idêntico. Valor inválido recusa a inicialização; nenhum valor é deduzido do horário, da configuração do PostgreSQL ou da observação de carga. A proteção afeta exclusivamente `GET/HEAD /api/entregas` com banco configurado: conta requisições admitidas por instância do servidor, e quando o máximo está ocupado retorna **HTTP 503** com `Retry-After: 1`, JSON `{"erro":"leitura_temporariamente_ocupada"}` e `Cache-Control: no-store`. Não há fila de espera criada por essa proteção; o contador é liberado no sucesso **e na falha**, sem expor dados de pedidos.

**Teste HTTP em execução real local:** `tests/product/run-q026-http-admission-pg.ts` configura explicitamente **2 entradas simultâneas**, carrega 16.000 fatos fictícios num PG16 descartável e dispara 10 requisições HTTP concorrentes. O código exige pelo menos 8 respostas 503, entre 1 e 2 respostas 200 e nenhuma resposta inesperada. Comprova `Retry-After`, ausência de dados sensíveis no bloqueio, liberação posterior de vagas, outras rotas acessíveis, recusa de POST e tratamento seguro de falha do banco sem travamento permanente.

**Verificação:** [CI 38067809017](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38067809017), **SUCCESS**, com `Q026_HTTP_OPT_IN_ADMISSION: 4/4 PASS`, além dos 21/21 testes anteriores, tipagem, regressões Q-016 e Product, e governança GREEN.

**Limites e próximos efeitos:**
- Esse é um mecanismo **opt-in não ativado**. O código não reduziu a memória do processo de produção e a CI não realizou benchmark comparativo `com vs sem limitação` sob condições equivalentes.
- A interface atual já trata 503 como leitura indisponível: em nova navegação mostra estado degradado sem simular zero; na releitura mantém a informação anterior identificada e envelhecendo. **Ainda não há mensagem especializada nem retry automático** para saturação; qualquer ajuste de UX precisará de teste separado.
- Não existe autorização para escolher **1, 2 ou 4** na operação, alterar configuração real, mudar SLO, ou ativar este recurso. O PR continua DRAFT/HOLD.
- Não resolve o uso de memória de uma leitura individual longa nem substitui as investigações do PR #37. A priorização de capacidade só pode usar representatividade comprovada.

## Lacunas e restrições

- O handler HTTP **real** `/api/entregas` foi exercitado num servidor local contra banco **descartável**. Não foi exercitado contra **servidor HTTP de produção**, dados operacionais ou aparelho físico; o código permanece na branch, não implantado.
- `REPEATABLE READ` retém horizonte MVCC até `COMMIT`; o leitor continua carregando todos os fatos em memória. Não foi medida latência, `backend_xmin` com carga real ou `VACUUM` sob uso produtivo; manter transações curtas, sem chamadas externas dentro delas.
- Não corrigidas neste PR: apresentação identificada de quarentena, empate `localeCompare` da Q-016, riscos de collation do cursor, memória da implementação mista, Q-026/Q-024. Decisão de alteração dos critérios históricos permanece de César.
- Os testes da Q-026 provam o cenário atacado, não equivalência irrestrita de todas as condições em produção.

**Estado:** `CODE_READY`, `TEST_PASS` com PostgreSQL 16 descartável, `NO_DEPLOY`, `NO_MERGE`; **não** `WORLD_PROVEN`, **não** `HUMAN_ACCEPTED`. PR #45 continua DRAFT.
