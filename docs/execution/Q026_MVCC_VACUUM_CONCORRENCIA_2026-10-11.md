# Q-026: MVCC, VACUUM e limites reais de concorrência da candidata #77

**Data:** 2026-10-11 · **Branch:** `research/claude-q026-mvcc-vacuum-adversarial-20261011` ·
**Base:** HEAD do PR #77, `30a18fba6b38b5d216fdecd4ed641793f10c7abe`, revalidado no início e no fim ·
**Estado:** pesquisa **DRAFT/HOLD**.

Esta branch acrescenta somente testes, um workflow isolado, um patch **não aplicado** e este relatório.
Nenhum arquivo em `src/`, `tools/`, no frontend, nos gates de promoção ou na branch de integração foi alterado:
`git diff 30a18fba -- src tools` está vazio. Os dados são 100% sintéticos, nos modos `simulated` e `control`,
e o PostgreSQL 16 é descartável, criado e apagado a cada execução. **Este relatório não declara produção aprovada
nem a Q-026 concluída.** A autoridade sobre integração, gasto e operação continua com o César.

Classificação usada em todo o texto:

- **[medido]**: lido diretamente do PostgreSQL ou do processo, com o comando que reproduz;
- **[estimado]**: derivado de uma medida por uma conta declarada;
- **[sem observabilidade]**: não há como medir nesta montagem.

---

## 0. Respostas curtas

**1. Qual o risco real observado do snapshot prolongado?**

- **[medido]** Enquanto as leituras correm, o VACUUM deixa de remover versões mortas mais novas que o instante
  mais velho em aberto. Na montagem sintética, com cerca de 420 XIDs/s, foram até **2.008 a 3.835 versões** numa
  tabela quente. O horizonte atrasou no máximo **5,0 a 9,6 s** **[estimado]**: idade do corte em XIDs dividida pela
  taxa do escritor. O controle sem leitor ficou em ≤ 3 (uma vez, 124).
- **[medido]** O efeito é **transitório e limitado pela transação mais longa**: na fase PÓS e no VACUUM final, as
  versões não removíveis voltaram a **0** nos 9 cenários.
- **[medido]** O risco sério é outro. A transação dura **o tempo do banco mais toda pausa do event loop do Node**
  enquanto ela está aberta, e **o prazo da rota não limita isso**:
  - prazo de 5 s com o laço ocupado 8 s resultou num instante de **8,3 s** (incremental) e **9,5 a 10,2 s**
    (canônico);
  - isso aconteceu **sem injeção** no perfil de muitas viagens curtas com admissão 2: ociosidade em transação de
    até **5,0 s** e instante de até **10,5 s**.
- **[medido, achado novo]** A defesa clássica do lado do banco contra snapshot longo é `pg_terminate_backend` ou
  `idle_in_transaction_session_timeout`. Hoje ela **derruba o processo inteiro do servidor HTTP**: 9/9 no
  adaptador e 3/3 na rota, nos dois leitores. O defeito é anterior à #77 e está no adaptador compartilhado
  (seção 1).
- **[sem observabilidade]** O impacto em produção não pode ser medido aqui: taxa real de escrita, tamanho real do
  log, idade de `backend_xmin` em produção, réplicas, pooler e autovacuum real.

**2. Em quais cargas o ganho de memória justifica a troca, e em quais não?** **[medido]**

| perfil | RSS pico | laço máx | instante MVCC p50 | veredito |
|---|---|---|---|---|
| **longa** (200 mil fatos, 1 viagem) | −82 % (181 vs 998 MiB) | 30 vs 1.071 ms | +18 % (5,4 vs 4,6 s); máx 6,1 vs 6,6 s | **justifica** |
| **mista** (100 mil + 30 mil viagens × 3) | −39 % (622 vs 1.027 MiB) | 1,0 vs 2,1 s | +32 %; máx +20 % | justifica **com condições** (seção 6) |
| **curtas** (60 mil viagens × 3) | −8 % (1.399 vs 1.524 MiB) | ambos > 5 s | **+159 %** (6,1 vs 2,4 s); máx 10,5 vs 7,6 s; mortas máx 3.835 vs 2.611 | **não justifica** |

No perfil curtas, a memória e o laço vivem na projeção e no JSON de cerca de 92 MB, que os **dois** leitores
montam depois do COMMIT. Isolado, sem concorrência (CI), o instante do incremental é **+9 a +31 %** (longa) e
**+20 a +38 %** (curtas) maior que o do canônico, **em todo tamanho de lote**.

**3. Qual o limite de concorrência demonstrado?** **[medido, nesta montagem]**

A montagem: 4 vCPU, PostgreSQL no mesmo host, dados sintéticos, ≤ 200 mil fatos, escritor contínuo.

- **4 instâncias × admissão 1**, com até 190 mil fatos: instante ≤ **4,8 s**, horizonte do VACUUM ≤ **4,9 s**,
  nenhuma sessão vazada, nenhum erro HTTP e VACUUM limpo ao fim (3.4).
- **1 instância × admissão 2**: instante de até **10,5 s** no perfil de muitas viagens curtas. A ociosidade de até
  5 s vem da outra leitura do mesmo processo (3.1).
- **Snapshots simultâneos no banco = instâncias × admissão**, medido com 1, 2 e 4. A admissão é por processo; nada
  limita o total do lado do banco.
- Acima disso não há medida. O número **não se transfere** para outro hardware, para outra latência de rede (3.6)
  nem para outro volume de log.

**4. O que ainda impede o Preview?** Seção 6. Em uma linha: o processo cai quando o banco encerra a sessão, e
sem essa correção não existe limite do lado do banco para o instante quando o event loop para. Somam-se:

- a latência de rede real até o banco, que com o lote 257 multiplica o instante (3.6);
- a observabilidade de `backend_xmin` no PostgreSQL de Preview;
- um teto declarado de tamanho do log;
- os gates já abertos no runbook.

**5. Qual a menor intervenção para a falha comprovada?** Duas, nesta ordem, e **nenhuma aplicada aqui**:

1. **Código, 16 linhas, um arquivo.** O `PgSqlClient.transaction` passa a ouvir `error` na conexão emprestada e a
   devolvê-la ao pool marcada para descarte (patch em `tests/product/q026-mvcc-proposta/`). Contraprova: 9/9 → 0/9
   quedas no adaptador; E4 de 0/3 para 3/3 nos dois leitores; E1, E2, E3 e E5 sem regressão; as suítes anteriores
   (tipagem, repositórios, Q-016, leitor incremental e guarda HTTP) sem falha nova (seção 7). O algoritmo canônico,
   o SQL e os leitores não mudam.
2. **Configuração, só depois da 1.** `idle_in_transaction_session_timeout` no papel de leitura. Com a correção, o
   instante do E7 cai de 8,3 para **1,8 s** (incremental) e de 9,6–10,0 para **2,9–4,1 s** (canônico), com o
   processo vivo. **Sem a correção, a mesma configuração derruba o processo, provado.**
   - O limite que resulta é **prazo + timeout ocioso** **[estimado]**. O timeout só vale para a sessão **ociosa**;
     um comando **ativo**, por exemplo um `SELECT` grande travado em `ClientWrite` enquanto o Node está parado,
     continua limitado só pelo `statement_timeout` por comando que a rota já aplica (o prazo restante).
   - O valor do timeout é hipótese a calibrar no Preview (seção 6).

---

## 1. Achado novo: o banco encerra a sessão e o processo morre (comprovado, anterior à #77)

**Como apareceu.** O primeiro CI desta branch, [run 38114150701](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38114150701),
reprovou o caso E4 nos dois leitores. Depois de `pg_terminate_backend` na sessão de uma leitura em andamento, a
resposta foi `socket hang up` e o pedido seguinte foi recusado. **O processo do servidor tinha morrido.** O arnes
de falhas ainda não tinha rodado localmente antes daquele push; o CI achou primeiro.

**Reprodução isolada, sem servidor, rota ou leitor** (`tests/product/run-q026-mvcc-conexao-derrubada.ts`). Só
`createPgClient().transaction()`, em processo filho:

| modo | gatilho | HEAD (#77) | com a proposta |
|---|---|---|---|
| `ativo` | `pg_terminate_backend` com `pg_sleep` em execução | 3/3 **processo morre** (`Connection terminated unexpectedly`) | 3/3 vivo; transação rejeita `57P01`; consulta seguinte ok |
| `ocioso` | `pg_terminate_backend` com a sessão `idle in transaction` | 3/3 **morre** (`terminating connection due to administrator command`) | 3/3 vivo; rejeita (`not queryable`); seguinte ok |
| `ocioso_timeout` | o próprio banco, por `idle_in_transaction_session_timeout` (FATAL 25P03) | 3/3 **morre** (`terminating connection due to idle-in-transaction timeout`) | 3/3 vivo; seguinte ok |

**Causa, por leitura de código e confirmada pela reprodução:**

- durante o empréstimo, o pg-pool 3.14.0 tira o ouvinte de `error` da conexão (`node_modules/pg-pool/index.js:344`)
  e só o devolve no `release` (`:385`);
- quando o servidor encerra a sessão, o pg 8.13.1 emite `error` no cliente (`node_modules/pg/lib/client.js:340`,
  via `_handleErrorEvent`);
- o `PgSqlClient.transaction` (`src/platform/persistence/sql-client.ts:60-84`) não põe ouvinte nenhum, então o Node
  lança `Unhandled 'error' event` e o processo sai com código 1;
- o `pool.on("error")` de `createPgClient` só cobre conexões **ociosas**, e o `pool.query` do pg-pool tem ouvinte
  próprio. Só o caminho **emprestado**, que é o de toda transação, fica descoberto.

**Alcance.**

- **[medido]** A rota `/api/entregas` da candidata cai nos dois leitores (E4, 0/3 em cada), e também com a
  mitigação de banco (E7 com timeout, 0/3 em cada leitor no HEAD).
- **[por leitura de código, não medido aqui]** O mesmo `transaction()` serve a leitura padrão com as flags
  desligadas, o replay da Q-016 (`replay-do-event-log.ts:79`), os repositórios do runtime crítico
  (`pg-repositories.ts:516`), Entregas (`pg-uow.ts:509`) e as migrations. Desligar as flags da candidata, que é o
  rollback do runbook, **não remove** este risco.
- **Gatilhos reais:**
  - `pg_terminate_backend` de um DBA, que é a ação padrão contra snapshot longo;
  - `idle_in_transaction_session_timeout`;
  - reinício ou failover do PostgreSQL;
  - queda de TCP e poolers que encerram conexões do servidor.

  Fora o primeiro e o segundo, os gatilhos são hipótese por código, não exercitados aqui.

**Correção proposta (não aplicada):** `tests/product/q026-mvcc-proposta/sql-client-ouvinte-de-erro.patch`, 16
linhas a mais e 2 a menos em `sql-client.ts`. O erro só é guardado, porque o comando em curso já rejeita sozinho, e
a conexão volta ao pool com `release(erro)`, que a descarta. Contraprova na seção 7.

---

## 2. Método

**O que roda é o servidor real.** Cada instância é um processo Node que importa `tools/product_system_server.ts` e
chama `criarServidor()` com as flags opt-in da candidata: `DELIVERYOS_ENTREGAS_MAX_INFLIGHT` (admissão por
instância), `DELIVERYOS_ENTREGAS_RR_DEADLINE_MS` (prazo) e `DELIVERYOS_ENTREGAS_INCREMENTAL_RR=1` (só no
incremental). Cada instância usa um papel PostgreSQL próprio, `NOSUPERUSER`, com `SELECT` só em `identity.device`
e `platform.event_log`. Isso permite separar as instâncias pelo usuário no `pg_stat_activity`.

**[medido] no PostgreSQL**, pelas sessões do papel amostradas a cada ~20 ms (`q026-mvcc-amostrador-filho.ts`):

- **instante MVCC**: de `xact_start` à primeira amostra sem a transação. Os limites inferior e superior ficam no
  JSON; a resolução é o período de amostragem.
- **maior intervalo contínuo ocioso em transação**: `clock_timestamp() − state_change` com
  `state = 'idle in transaction'`. É o tempo em que o banco segura o instante esperando o Node.
- **snapshots e conexões simultâneos** por instância. Workers de consulta paralela, com o mesmo usuário e o mesmo
  `xact_start` do líder, são contados à parte (`backend_type`).
- **efeito no VACUUM**: `VACUUM (VERBOSE)` a cada ~1 s numa tabela sintética sem autovacuum, sob `UPDATE` contínuo
  de outro processo. Do próprio VACUUM sai quantas versões ele **não pôde remover** e a idade, em XIDs, do corte.
  A medida cobre as fases PRÉ (sem servidor), CARGA e PÓS, mais um VACUUM final sem leitor, que tem de dar 0.

**[medido] no processo do servidor**, por instrumentação de teste em volta dele (`q026-mvcc-servidor-filho.ts`):

- **atraso do event loop** por batimento de 10 ms. O intervalo de um bloqueio nunca é zerado antes de ser anotado.
  Cada execução começa com um bloqueio conhecido de 250 ms e reprova se ele não aparecer. Foram vistos de 252,7 a
  259,4 ms.
- **espera de checkout** de cada pool `pg` e fila máxima.
- **RSS** e pico.

**[medido] de fora:**

- resposta de cada `GET /api/entregas` em clientes de laço fechado (status, latência, corpo);
- `GET /api/health` a cada ~25 ms por instância. Essa rota não toca o banco: a latência dela é o que o event loop
  faz com quem chega.

**[estimado]:** atraso do horizonte em segundos = idade do corte em XIDs ÷ taxa do escritor (~420 XIDs/s).

**Outros instrumentos**, todos em `tests/product/`, todos com PostgreSQL descartável e saída 78 sem banco:

| instrumento | arquivo | o que faz |
|---|---|---|
| falhas no meio da leitura (E1 a E7) | `run-q026-mvcc-falhas.ts` | 3 a 4 instâncias do servidor real; confere instante, conexão, processo vivo e leitura seguinte |
| sessão encerrada × processo | `run-q026-mvcc-conexao-derrubada.ts` | só o adaptador, em processo filho |
| lote × embrulho | `run-q026-mvcc-lote-envelope.ts` | leitura isolada; tempo por classe de comando |
| latência de rede | `run-q026-mvcc-rtt.ts` | proxy TCP com atraso medido entre leitor e banco |
| pool compartilhado | `run-q026-mvcc-pool-compartilhado.ts` | sonda do histórico enquanto Entregas lê |
| keep-alive | `run-q026-mvcc-keepalive.ts` | Node `http` puro, sem banco |

**Carga sintética.** Fixture determinística, só `simulated` e `control`, e banco apagado ao fim. Três perfis:

- `longa`: 200 mil fatos de GPS numa viagem;
- `curtas`: 60 mil viagens × 3 fatos;
- `mista`: 100 mil fatos numa viagem e 30 mil viagens × 3.

Durante toda a linha do tempo, o escritor faz 400 `UPDATE`/s e insere 20 fatos/s.

**Ambiente local:** 4 vCPU, 16 GB, PostgreSQL 16.15 no mesmo host, Node 22.22.0. **CI:** `ubuntu-latest`, PG 16.15
em contêiner e Node 22.23.3.

**Estatística.** p95 só com n ≥ 20 e p99 só com n ≥ 200; abaixo disso aparecem só p50 e máximo, com o n.
Leituras de 5 a 13 s produzem 9 a 22 amostras por minuto. Por isso as rodadas de **percentis** usam um log menor e
rodadas mais longas (seção 3.5), e nenhum número de uma execução única é apresentado como p95/p99 estável.

---

## 3. Resultados

### 3.1 Uma instância, admissão 2, dois clientes em laço fechado, 60 s, prazo 15 s (local) **[medido]**

| cenário | n leituras (200) | outras respostas | instante MVCC p50 / p95 / máx (ms) | maior ocioso em tx p50 / máx (ms) | mortas não removíveis CARGA p50 / máx · PRÉ máx · PÓS máx · final | horizonte máx ≈ s | /api/health n · p50 / p99 / máx (ms) | laço máx (ms) | RSS pico (MiB) | lida HTTP p50 / máx (ms) | pico snapshots |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| longa 200k · controle | 0 | – | – | – | 0 / 3 · 1 · 0 · 0 | 0,0 | – | – | – | – | 0 |
| longa 200k · canônico | 21 | – | 4.623 / 6.382 / 6.550 | 720 / 1.164 | 1.261 / 2.510 · 2 · 1 · 0 | 6,3 | 259 · 138,5 / 1.052,7 / 1.160 | 1.071 | 998 | 5.598 / 7.706 | 2 |
| longa 200k · incremental | 22 | – | 5.444 / 5.896 / 6.110 | 12 / 20 | 1.301 / 2.283 · 2 · 2 · 0 | 5,7 | 2.414 · 4,1 / 13,8 / 21 | 30 | 181 | 5.464 / 6.152 | 2 |
| curtas 180k · controle | 0 | – | – | – | 0 / 2 · 2 · 1 · 0 | 0,0 | – | – | – | – | 0 |
| curtas 180k · canônico | 9 | `ECONNRESET`: 3 | 2.364 / – / 7.610 | 611 / 1.036 | 1 / 2.611 · 0 · 1 · 0 | 6,5 | 95 · 124,0 / – / 5.154 | 6.359 | 1.524 | 12.538 / 19.907 | 2 |
| curtas 180k · incremental | 9 | – | 6.119 / – / 10.479 | 2.785 / 5.024 | 834 / 3.835 · 1 · 2 · 0 | 9,6 | 574 · 5,4 / 3.159,4 / 5.119 | 5.131 | 1.399 | 13.015 / 20.475 | 2 |
| mista 190k · controle | 0 | – | – | – | 0 / 124 · 1 · 1 · 0 | 0,3 | – | – | – | – | 0 |
| mista 190k · canônico | 16 | – | 4.520 / – / 5.423 | 685 / 2.388 | 978 / 2.008 · 1 · 1 · 0 | 5,0 | 183 · 128,2 / – / 2.256 | 2.144 | 1.027 | 7.722 / 9.641 | 2 |
| mista 190k · incremental | 16 | – | 5.954 / – / 6.491 | 851 / 988 | 1.291 / 2.404 · 1 · 1 · 0 | 6,0 | 1.550 · 4,8 / 702,3 / 993 | 1.004 | 622 | 7.628 / 8.387 | 2 |

Leitura dos números:

- **Nenhum vazamento.** Ao fim de cada cenário, nenhuma sessão do papel ficou em transação ou com `backend_xmin`, e
  o VACUUM final deu 0 nos 9.
- **O incremental mantém o instante aberto por mais tempo no p50 em todos os perfis.** No perfil curtas, a
  ociosidade em transação chega a 5 s. Não é o leitor esperando o banco: é **a outra leitura da mesma instância
  bloqueando o laço** ao montar a projeção e o JSON de ~92 MB depois do COMMIT dela. Cada um dos ~700 FETCH precisa
  de uma volta do laço; no canônico, a transferência em massa é um comando só.

  **Evidência da causa [medido, só com dados do PostgreSQL].** As transações do incremental foram separadas em dois
  grupos: aquelas dentro das quais **outra** leitura da mesma instância fez COMMIT, e as demais.

  | perfil | ocioso máx com COMMIT de outra leitura dentro | ocioso máx sem |
  |---|---|---|
  | curtas | 2.785–5.024 ms (n=5) | 14–24 ms (n=4) |
  | mista | 696–988 ms (n=11) | 11–20 ms (n=5) |
  | longa | 8–20 ms (n=21) | 14 ms (n=1) |

  A separação é perfeita. No perfil longa não há efeito porque a projeção de uma viagem só é barata. A intervenção
  confirma a causa: **com admissão 1**, sem outra leitura no mesmo processo, o maior ocioso do incremental cai para
  31 ms (curtas, local, 3.4) e para 9–73 ms (mista com 1, 2 e 4 instâncias, CI `fc1c371`).
- **No perfil curtas, os dois bloqueiam o laço por mais de 5 s.** O canônico perdeu 3 de 12 pedidos com
  `ECONNRESET`. O **mecanismo** foi reproduzido isoladamente no Node 22.22
  (`tests/product/run-q026-mvcc-keepalive.ts`, `http` puro, sem banco). O servidor bloqueia o laço depois de
  responder; o cliente reusa o socket keep-alive 1 s depois:
  - bloqueio de 7 s com `keepAliveTimeout` padrão (5 s): `ECONNRESET` 2/2;
  - bloqueio de 3 s: 0/2;
  - bloqueio de 7 s com `keepAliveTimeout` de 10 s: 0/2.

  `tools/product_system_server.ts` não configura `keepAliveTimeout`. Que **estes** 3 resets venham disso é
  inferência: bloqueio medido de 6,4 s e reset no pedido seguinte, consistente com o mecanismo, mas sem captura de
  pacote.
- A `/api/health` com o canônico respondeu **95 a 259 vezes em 60 s**; com o incremental, **574 a 2.414**. Com o
  canônico, até a mediana de quem chega fica acima de 120 ms.
- **Viés desta tabela, achado depois.** Aqui o cliente de carga e a sonda de `/api/health` dividiam o mesmo
  processo, e o `JSON.parse` de respostas grandes (curtas ~92 MB, mista ~46 MB) atrasava a sonda e entrava na
  latência "lida HTTP". Nos perfis curtas e mista, `/api/health` e "lida HTTP" estão **inflados**; no longa (uma
  viagem, resposta pequena), não. O **laço máx** é medido dentro do servidor e não sofre esse viés, nem o instante,
  a ociosidade e o VACUUM, que vêm do PostgreSQL. A partir de `4ffecc4`, cada cliente roda em processo próprio, a
  sonda em outro, e a latência é anotada antes do parse (3.4, 3.5).
- **Sondas sequenciais subestimam bloqueios** ("omissão coordenada"): um bloqueio de 5 s gera **uma** amostra
  lenta. Por isso as tabelas seguintes trazem a **fração do tempo de carga em que o laço ficou indisponível por
  ≥ 100 ms** (soma das latências ≥ 100 ms das sondas ÷ duração), além do p99.

### 3.2 Isolado, sem concorrência: lote × embrulho cancelável **[medido, CI desta branch, commit `fc1c371`]**

Um processo por medida, 3 repetições em ordem rotativa e digest único exigido (passou). O **embrulho** é o
`leitorRrCancelavel` da rota real: `SET LOCAL statement_timeout` antes de cada comando. O PR #85 mediu os lotes
**sem** o embrulho.

| perfil | variante | instante (corpo da tx) p50 (mín–máx) ms | comandos | laço máx ms | RSS MiB |
|---|---|---:|---:|---:|---:|
| longa 200k | canônico / + embrulho | 1.547 (1.523–1.562) / 1.515 (1.513–1.552) | 5 / 10 | 388 / 394 | 348 / 344 |
| longa 200k | incremental 257 / + embrulho | 1.747 (1.746–1.788) / **1.990** (1.979–2.021) | 786 / 1.572 | 14 / 13 | 143 / 144 |
| longa 200k | incremental 1024 / + embrulho | 1.918 / 1.818 | 203 / 406 | 23 / 18 | 153 / 149 |
| longa 200k | incremental 4096 / + embrulho | 1.688 / 1.749 | 56 / 112 | 40 / 45 | 194 / 183 |
| longa 200k | incremental 20000 / + embrulho | 1.735 / 1.854 | 17 / 34 | 87 / 80 | 250 / 208 |
| curtas 180k | canônico / + embrulho | 726 / 740 | 5 / 10 | 263 / 277 | 337 / 311 |
| curtas 180k | incremental 257 / + embrulho | 872 / **1.005** | 708 / 1.416 | 27 / 25 | 215 / 218 |
| curtas 180k | incremental 1024 / + embrulho | 838 / 899 | 183 / 366 | 21 / 26 | 214 / 216 |
| curtas 180k | incremental 4096 / + embrulho | 850 / 891 | 51 / 102 | 29 / 30 | 210 / 209 |
| curtas 180k | incremental 20000 / + embrulho | 948 / 970 | 16 / 32 | 62 / 46 | 315 / 253 |

Leitura dos números:

- **O embrulho custa 14 a 15 % do instante no lote 257** (+243 ms em 200 mil fatos; +133 ms em 180 mil): 786 e
  708 idas e voltas a mais de `SET LOCAL`. O PR #85 mediu sem ele.
- **Nenhum tamanho de lote leva o instante do incremental ao do canônico.** O melhor, 4096 com embrulho, fica
  +15 % (longa) e +20 % (curtas). O tempo é dominado pela leitura das linhas (fetch ~1,0–1,4 s), não pelo número de
  comandos.
- Lote maior **piora** o que o incremental tinha de bom: o laço máximo vai de 13 para 80–87 ms e o RSS de 144 para
  208–250 MiB.
- Isolado, o instante do perfil curtas é **0,7 a 1,0 s**. Sob concorrência (3.1) ele foi a **2,4 a 10,5 s**. A
  janela é propriedade **do processo**, não só do leitor.

### 3.3 Falhas no meio da leitura, rota real (local, 3 rodadas; HEAD × proposta) **[medido]**

Cenário: 200 mil fatos e três instâncias do servidor real.

- **A:** prazo 15 s, admissão 2.
- **B:** prazo 1 s, admissão 1.
- **C:** prazo 5 s, admissão 1. Com mitigação, `ALTER ROLE … SET idle_in_transaction_session_timeout = '1500ms'`.

Depois de **cada** falha, a instância tem de servir uma leitura completa (200, `disponivel: true`), e o PostgreSQL tem
de mostrar a sessão do papel sem transação e sem `backend_xmin`. O arnes confere se o **processo** continua vivo.
Se morreu, o caso reprova com a causa lida do stderr, e a instância é levantada de novo para o caso seguinte.

| caso | HEAD #77, incremental | HEAD #77, canônico | com a proposta, incremental | com a proposta, canônico |
|---|---|---|---|---|
| **E1** cliente desconecta no meio | 3/3; instante solto em 12,6–13,9 ms | 3/3; 309–330 ms | 3/3; 16–25 ms | 3/3; 287–305 ms |
| **E2** prazo de 1 s vence | 3/3; 503 em 1.004–1.007 ms; admissão presa 0 ms | 3/3; 503 em 1.013–1.070 ms; admissão presa **86–136 ms** | 3/3; 0 ms | 3/3; 102–179 ms |
| **E3** erro SQL no meio (`pg_cancel_backend` → 57014) | 3/3; 200 `disponivel:false`; solto em 1,0–2,3 ms | 3/3; 1,7–3,3 ms | 3/3; 1,0–1,4 ms | 3/3; 1,4–1,6 ms |
| **E4** banco encerra a sessão no meio (`pg_terminate_backend`) | **0/3: o processo morreu nas 3** | **0/3: morreu nas 3** | **3/3**; 200 `disponivel:false`; solto em 1,0–1,4 ms; leitura seguinte 200 | **3/3**; 1,1–1,9 ms |
| **E5** exceção JavaScript no meio (300º FETCH no incremental; consulta de aparelhos no canônico) | 3/3; 200 `disponivel:false`; solto em 1,3–2,4 ms | 3/3; 1,8–2,6 ms | 3/3; 1,4–2,1 ms | 3/3; 1,6–1,9 ms |
| **E6** dois prazos de 1 s vencem juntos (admissão 2) e disputam o único canal de cancelamento | 3/3; os dois 503 em 1.002–1.011 ms; solto em 1,5–28 ms; espera pelo canal ≤ 15 ms | 3/3; 503 em 1.040–1.068 ms; solto em 1,5–40 ms; espera pelo canal 77–96 ms; admissão presa 108–160 ms | (no CI) | (no CI) |
| **E7** laço ocupado 8 s com prazo 5 s, **sem** mitigação | 0/3; instante **8.284–8.297 ms** (ocioso contínuo ~8,0 s) | 0/3; **9.523–10.172 ms** | 0/3; 8.272–8.306 ms | 0/3; 9.603–9.963 ms |
| **E7 com** `idle_in_transaction_session_timeout` 1,5 s | 0/3: instante 1.767–1.774 ms, mas **o processo morreu nas 3** | 0/3: 2.828–2.912 ms, **morreu nas 3** | **3/3**; instante **1.768–1.777 ms**; processo vivo; leitura seguinte 200 | **3/3**; 2.862–4.127 ms |

Leitura dos números:

- E1, E2, E3 e E5 mostram que a candidata devolve conexão e instante. A mesma instância serve a leitura seguinte,
  repetida três vezes depois de falha, nos dois leitores, com e sem a proposta.
- No canônico, a admissão só volta quando a leitura assenta, depois do 503 de prazo. Isso é intencional no código
  (`tools/product_system_server.ts`, "Never release the admission slot merely because a 503 was sent"): um pedido
  feito logo depois recebe `leitura_temporariamente_ocupada` por 86 a 179 ms.
- A desconexão solta o instante em ~13–25 ms no incremental, que cancela entre FETCH. No canônico leva ~300 ms,
  porque o `SELECT` em curso precisa ser cancelado.

### 3.4 Escala: 1, 2 e 4 instâncias, admissão 1 (local) **[medido]**

Montagem: um cliente em laço fechado por instância, o que satura a admissão sem laço de recusas; 60 s de carga;
escritor a ~420 XIDs/s; cliente e sonda corrigidos (processos separados, latência antes do parse).

| cenário | n leituras (200) | instante MVCC p50 / p95 / máx (ms) | maior ocioso em tx p50 / máx (ms) | mortas não removíveis CARGA p50 / máx (PRÉ máx) | horizonte máx ≈ s | laço máx (ms) | laço indisponível ≥ 100 ms (% da carga) | RSS pico por instância (MiB) | lida HTTP p50 / máx (ms) | pico de snapshots no banco |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| curtas 180k · canônico · 1 × adm 1 | 8 | 2.114 / – / 2.436 | 577 / 663 | 0 / 888 (1) | 2,2 | 5.491 | 72,8 | 1.163 | 6.337 / 7.728 | 1 |
| curtas 180k · incremental · 1 × adm 1 | 8 | 3.093 / – / 3.379 | **12 / 31** | 1 / 1.286 (1) | 3,2 | 3.874 | 38,6 | 1.022 | 6.624 / 7.351 | 1 |
| mista 190k · canônico · 1 × adm 1 | 13 | 2.336 / – / 2.741 | 618 / 849 | 1 / 855 (0) | 2,1 | 1.820 | 74,5 | 1.058 | 3.915 / 4.662 | 1 |
| mista 190k · incremental · 1 × adm 1 | 13 | 3.382 / – / 3.764 | 7 / 15 | 410 / 1.363 (1) | 3,4 | 1.054 | 16,9 | 580 | 4.387 / 4.808 | 1 |
| mista 190k · canônico · 2 × adm 1 | 22 | 2.684 / 3.459 / 3.803 | 678 / 1.240 | 160 / 1.344 (0) | 3,4 | 2.496 | 71,6 | 849 | 4.627 / 5.739 | **2** |
| mista 190k · incremental · 2 × adm 1 | 22 | 3.684 / 4.061 / 4.251 | 15 / 19 | 584 / 1.681 (1) | 4,2 | 1.168 | 17,5 | 534 | 4.743 / 5.378 | **2** |
| mista 190k · canônico · 4 × adm 1 | 32 | 3.573 / 4.331 / 4.762 | 951 / 1.651 | 174 / 1.640 (1) | 4,1 | 4.080 | 67,5 | 1.064 | 6.342 / 9.074 | **4** |
| mista 190k · incremental · 4 × adm 1 | 36 | 4.512 / 4.819 / 4.832 | 28 / 52 | 926 / 1.960 (2) | 4,9 | 1.904 | 17,1 | 531 | 6.066 / 7.249 | **4** |

Leitura dos números:

- **A admissão é por processo.** O pico de snapshots no banco foi exatamente o número de instâncias × admissão
  (1, 2 e 4). Nada limita o total do lado do banco.
- **A janela cresce com o número de instâncias.** O incremental foi de 3,4 a 3,7 e a 4,5 s no p50; o canônico, de
  2,3 a 2,7 e a 3,6 s. A causa provável é a disputa de CPU: 4 servidores, o PostgreSQL, o escritor e o amostrador
  dividem 4 vCPU. Em produção o valor depende do hardware **[sem observabilidade]**.
- **Com admissão 1, a ociosidade do incremental some** (máx 15–52 ms). É a intervenção que confirma a causa de 3.1.
  O instante do incremental continua 29 a 46 % maior que o do canônico no p50: é o custo das ~1.500 idas e voltas.
- **O VACUUM recuperou tudo nos 8 cenários** (PÓS e final em 0), sem vazamento de sessão.

### 3.5 Percentis com amostra suficiente **[medido]**

Leituras de 5 a 10 s não dão amostra para p99 em minutos. Para medir a **forma** da distribuição, o log foi reduzido
a 19 mil fatos (mista ×0,1), com 150 s de carga, admissão 2, dois clientes e **duas repetições independentes** por
leitor. Isso dá n ≈ 400 por rodada; o IC95 do p95 vem de bootstrap com semente fixa.

| leitor | rodada | n | instante MVCC p50 / p95 [IC95] / p99 / máx (ms) | lida HTTP p50 / p95 / p99 / máx (ms) | `/api/health` p50 / p99 (ms) | laço indisponível ≥ 100 ms |
|---|---|---:|---|---|---|---:|
| canônico | 1 | 397 | 428 / 561 [541–577] / 618 / 675 | 691 / 854 / 917 / 1.086 | 71,5 / 188,2 | 65,0 % |
| canônico | 2 | 425 | 412 / 495 [481–499] / 523 / 590 | 651 / 766 / 798 / 849 | 68,0 / 160,7 | 57,3 % |
| incremental | 1 | 397 | 607 / 695 [680–713] / 729 / 785 | 710 / 799 / 840 / 899 | 3,9 / 88,5 | 1,2 % |
| incremental | 2 | 396 | 601 / 712 [694–733] / 770 / 822 | 705 / 819 / 888 / 946 | 3,7 / 85,0 | 1,1 % |

Leitura dos números:

- **A diferença entre rodadas passa do intervalo de confiança de cada uma.** No canônico, o p95 do instante foi
  561 numa rodada e 495 na outra, com IC95 que não se cruzam. Uma rodada só **não** é p95 estável; é por isso que
  há duas.
- **Com o log pequeno, o padrão se mantém:** o incremental segura o instante 42 a 46 % mais no p50 e 24 a 44 % mais
  no p95. A latência HTTP fica parecida (p95 799–819 contra 766–854 ms), e o laço fica livre (1 % contra 57–65 % do
  tempo indisponível).
- Estes percentis valem para **19 mil fatos neste host**. Não são p95/p99 de produção nem de 200 mil fatos.

### 3.6 Latência de rede até o banco **[medido, proxy local com atraso]**

Tudo o que veio antes rodou com o banco no mesmo host (ida e volta ~0,1 ms). Num PostgreSQL gerenciado, cada ida e
volta custa milissegundos, e o incremental com o embrulho da rota faz **1.572 comandos** por leitura de 200 mil
fatos: um `SET LOCAL` e um `FETCH` por lote de 257.

Montagem (`tests/product/run-q026-mvcc-rtt.ts`): um proxy TCP com atraso fixo por sentido entre o leitor e o banco,
leitura isolada, sem escritor, 2 repetições, digest único exigido (passou). A ida e volta foi **medida** pelo próprio
caminho: mediana de 50 `SELECT 1`.

| perfil | ida e volta medida | canônico + embrulho | incremental 257 + embrulho | incremental 4096 + embrulho |
|---|---:|---:|---:|---:|
| longa 200k | 0,11 ms | 2.059 ms | 2.925 ms | 2.284 ms |
| longa 200k | 2,94 ms | 1.966 ms | **6.411 ms** | 2.400 ms |
| longa 200k | 6,86 ms | 2.000 ms | **12.822 ms** | 2.601 ms |
| curtas 180k | 0,09 ms | 1.419 ms | 2.311 ms | 1.884 ms |
| curtas 180k | 3,05 ms | 1.665 ms | **5.482 ms** | 1.992 ms |
| curtas 180k | 6,85 ms | 1.523 ms | **11.251 ms** | 2.468 ms |

Leitura dos números:

- **O canônico não sente a rede** (um comando de transferência em massa).
- **O incremental 257 com o embrulho sente toda ela.** No longa, são +3,5 s a 2,94 ms e +9,9 s a 6,86 ms, cerca de
  1.200 a 1.450 idas e voltas no caminho crítico: com 7 ms, o instante fica **6,4× o do canônico**. No curtas, a
  proporção é a mesma: 11,3 s contra 1,5 s, ou **7,4×**.
- **Lote 4096 corta ~95 % dessa penalidade** (+0,1 s e +0,3 s). Em localhost, o tamanho do lote não fecha a
  distância para o canônico (3.2); com rede, ele domina. O padrão da candidata é 257.
- Nenhuma latência de rede real do Preview é conhecida **[sem observabilidade]**.

### 3.7 O pool de leitura é dividido com o histórico **[medido]**

O servidor cria **um** pool de leitura (`max: 2`; checkout limitado a min(1 s, prazo) com a candidata ligada) e o
usa em `/api/entregas` **e** em `/api/historico`, `/api/operacao-viva` e `/api/copiloto`
(`tools/product_system_server.ts:378-385, 532-545`). A admissão da candidata conta só Entregas.

Montagem (`tests/product/run-q026-mvcc-pool-compartilhado.ts`): mista com 190 mil fatos, incremental, dois clientes
de Entregas em laço fechado por 30 s e uma sonda de `/api/historico?unit_id=ITAIM` a cada 200 ms.

| admissão | histórico sozinho | histórico sob Entregas: respostas degradadas ("Falha ao ler event log") | histórico ms p50 / máx |
|---:|---|---:|---|
| 2 | 200 em 26,9 ms | **9 de 45** | 18,1 / 1.703,6 |
| 1 | 200 em 32,2 ms | **0 de 104** | 9,8 / 968,6 |

- Com admissão 2, as duas leituras de Entregas ocupam as duas conexões. O histórico espera o checkout por 1 s e cai
  na própria degradação: responde 200, mas sem a leitura do log. É uma falha **silenciosa para quem olha o status**.
- Com admissão 1, sobra uma conexão. O preço aparece no cliente de Entregas: 27.058 recusas
  `503 leitura_temporariamente_ocupada` em 30 s, porque o segundo cliente não tem tempo de pensar entre os pedidos
  (é o pior caso).
- **Orçamento de conexões por instância** com a candidata ligada: 2 de leitura (compartilhadas) + 1 de
  cancelamento = **3**. Com N instâncias, 3N. A admissão não reduz isso; o teto é o `max` do pool.

### 3.8 CI desta branch

⟨PENDENTE: links do CI final⟩

---

## 4. Hipóteses falsificadas

1. **"A redução de memória compensa automaticamente a janela MVCC maior."** **Falsa** para muitas viagens curtas:
   −8 % de RSS contra +159 % de instante no p50, +47 % de versões mortas no máximo e o laço bloqueado mesmo assim.
   Verdadeira, com folga, para viagem longa. O ganho depende de **onde** está a memória: na lista de fatos crus,
   que o incremental evita, ou na projeção e no JSON por viagem, que os dois montam.
2. **"Mudar o tamanho do lote resolve."** **Falsa como enunciada.** Com o banco no mesmo host, nenhum lote entre 257 e
   20.000 iguala o canônico (3.2), e lote grande devolve o bloqueio do laço e a memória. **Com rede, porém, o lote
   domina.** A 6,86 ms de ida e volta, o 257 com o embrulho leva o instante a 12,8 s; o 4096 fica em 2,6 s, contra
   2,0 s do canônico (3.6). Lote é parâmetro de rede, não remédio para a janela.
3. **"O prazo da rota limita o instante MVCC."** **Falsa** quando o event loop não roda (E7): o prazo de 5 s virou
   8,3 a 9,7 s de instante. O prazo é um temporizador do mesmo laço que está parado.
4. **"`idle_in_transaction_session_timeout` sozinho é a menor intervenção segura."** Era a **minha** hipótese
   inicial, e é **falsa**: sem a correção do adaptador, o timeout converte instante longo em **queda do processo**
   (E7 com mitigação no HEAD: 0/2, processo morto).
5. **"Cliente que desconecta deixa o instante aberto até o fim da leitura."** **Falsa** para a candidata: o
   instante é solto **13 a 25 ms** depois da desconexão (incremental) e **~300 ms** depois (canônico, que termina
   o comando em curso).

---

## 5. Riscos priorizados

| # | risco | estado | evidência |
|---|---|---|---|
| R1 | Sessão encerrada pelo banco durante transação **derruba o processo** (rota, leitura padrão e, por código, runtime crítico) | **COMPROVADO**; correção proposta com contraprova, não aplicada | seção 1; E4; teste de adaptador 9/9 |
| R2 | Event loop parado mantém o instante aberto **além do prazo**, sem limite do lado do banco | **COMPROVADO** (E7: 8,3–9,7 s com prazo 5 s; natural até 10,5 s em curtas × admissão 2) | 3.1, 3.3 |
| R3 | Instante maior do incremental (+9 a +38 % isolado; até +159 % sob concorrência em curtas) | **COMPROVADO**; o efeito no VACUUM é transitório e limitado à transação mais longa | 3.1, 3.2 |
| R4 | Projeção e JSON de ~92 MB (60 mil viagens) bloqueiam o laço > 5 s nos dois leitores; `ECONNRESET` no canônico | **COMPROVADO** o bloqueio; o mecanismo de reset (laço parado > `keepAliveTimeout` de 5 s) foi **reproduzido isolado**; atribuir os 3 eventos a ele é inferência | 3.1 |
| R5 | Admissão por processo, sem limite global: snapshots simultâneos = Σ instâncias × admissão | **COMPROVADO** (pico 1, 2 e 4 com 1, 2 e 4 instâncias × admissão 1); o pool de leitura (max 2) é o teto **por instância** | 3.4 |
| R6 | Janela cresce com o tamanho do log inteiro (sem teto) | **COMPROVADO** por proporcionalidade nas medidas (PR #75, #85 e esta); teto **não decidido** (Q-026 aberta) | 3.2 |
| R7 | Desconexão, prazo, erro SQL e exceção JS no meio liberam conexão e instante | **MITIGADO** pela candidata: E1, E2, E3 e E5 3/3 nos dois leitores | 3.3 |
| R8 | Admissão presa 74–125 ms depois de um 503 de prazo (canônico): o pedido imediato recebe `ocupada` | **COMPROVADO**, limitado e declarado | 3.3 |
| R9 | Impacto real em produção (taxa de escrita, réplicas, pooler, autovacuum, TLS) | **DESCONHECIDO** [sem observabilidade] | – |
| R10 | Pool de leitura (max 2) dividido entre Entregas e histórico, Operação Viva e Copiloto; com admissão 2, o histórico degrada calado (200 sem a leitura do log) | **COMPROVADO** (9/45 com admissão 2; 0/104 com admissão 1) | 3.7 |
| R11 | Dois prazos vencendo juntos disputam o único canal de cancelamento | **MITIGADO** pela candidata: E6 3/3 nos dois leitores; espera pelo canal ≤ 96 ms, sem falha | 3.3 |
| R12 | Latência de rede multiplica o instante do incremental com o lote 257 e o embrulho (~1.500 idas e voltas por 200 mil fatos) | **COMPROVADO** com proxy: 6,86 ms de ida e volta → 12,8 s contra 2,0 s do canônico; com lote 4096, 2,6 s. A latência real do Preview é **DESCONHECIDA** | 3.6 |

---

## 6. Limite operacional conservador e o que bloqueia o Preview

### 6.1 O que foi demonstrado (nesta montagem, dados sintéticos, ≤ 200 mil fatos)

| configuração | instante MVCC máx | horizonte máx ≈ | laço indisponível | vazamentos | fonte |
|---|---|---|---|---|---|
| 1 instância × admissão 2, 180–200 mil fatos | incremental **10,5 s** (curtas) / canônico 7,6 s | 9,6 s | – | 0 | 3.1, local |
| 1, 2 e 4 instâncias × admissão 1, 190 mil fatos | incremental **4,8 s** / canônico 4,8 s | 4,9 s | incremental ~17 % / canônico 68–75 % | 0 | 3.4, local |
| 1 instância × admissão 2, 19 mil fatos, 150 s × 2 | incremental 0,82 s / canônico 0,68 s | 0,7 s | 1 % / 57–65 % | 0 | 3.5, local |

Nos **21 cenários locais** (18 com leitor), nenhuma sessão de leitura ficou em transação ou com `backend_xmin`
depois da carga, e o VACUUM final não deixou versão morta não removível. O mesmo vale para os 12 cenários de
cada execução de CI desta branch (3.8). **Isso não demonstra comportamento em
produção.** O número transferível é a janela em segundos e o fato de ela ser limitada pela transação mais longa.

### 6.2 Limite conservador recomendado para um Preview

**Hipótese de operação. Não é limite validado em produção.**

1. **Admissão 1 por instância** (`DELIVERYOS_ENTREGAS_MAX_INFLIGHT=1`). Com admissão 2, o pós-COMMIT de uma
   leitura vira ociosidade em transação da outra (3.1), e as duas leituras ocupam o pool inteiro, que é
   compartilhado com as rotas de histórico: com admissão 2, 9 de 45 respostas do histórico vieram degradadas; com
   admissão 1, 0 de 104 (3.7).
2. **No máximo 2 instâncias** com a candidata, o que dá no máximo 2 instantes longos simultâneos no banco. O
   orçamento é de 3 conexões por instância (2 de leitura e 1 de cancelamento), e a admissão **não é global**.
3. **Teto de volume do log lido pela rota: 200 mil fatos**, a faixa medida aqui. A leitura cobre o histórico
   inteiro e a janela cresce com ele. Acima disso não há medida, e a Q-026 (janela) segue aberta.
4. **Nenhum limite do lado do banco antes da correção do adaptador** (seção 1), porque ele derruba o processo.
   Depois dela, `idle_in_transaction_session_timeout` só no papel de leitura, com valor inicial de **3 s**. A conta
   é ≥ 2× a maior ociosidade legítima medida: canônico, ≤ 1,2 s de decodificação dentro da transação com 200 mil
   fatos; incremental com admissão 1, ≤ 73 ms. O valor precisa ser revisto se o volume crescer, porque a
   decodificação do canônico cresce com ele.
5. **Alarmes no PostgreSQL do Preview** para o papel de leitura: `now() − xact_start > 15 s`,
   `state = 'idle in transaction'` por mais de 2 s e crescimento de `n_dead_tup` nas tabelas quentes do mesmo banco.
6. **Medir a latência de rede até o banco antes de ligar o incremental.** Com o padrão da candidata (lote 257, um
   `SET LOCAL` por `FETCH`), o instante cresce ~1,4 s por milissegundo de ida e volta em 200 mil fatos (3.6). Se a
   ida e volta passar de ~0,5 ms, o lote 257 não deve ser ligado sem nova medida. Trocar o lote é parâmetro de
   runtime e decisão do César, não desta pesquisa.

### 6.3 O que ainda impede o Preview (requisitos, não opiniões)

1. **R1 corrigido**, ou seja, o adaptador sobrevive a sessão encerrada pelo banco. Decisão do César: o arquivo é
   compartilhado com o runtime crítico, e a proposta está pronta com contraprova (seção 7).
2. **Limite do lado do banco para o instante (R2)** configurado no papel de leitura, só depois do item 1, com o
   valor provado no **próprio PostgreSQL do Preview**. É preciso saber se há pooler e se a configuração por papel
   chega à sessão.
3. **Observabilidade** de `xact_start`, `state` e `backend_xmin` das sessões de leitura no Preview. Sem ela, o risco
   real fica **[sem observabilidade]**.
4. **Teto de volume declarado** ou decisão da janela da Q-026: o caminho de leitura não tem limite de histórico.
5. **Latência de rede medida até o PostgreSQL do Preview** e lote decidido para ela (3.6).
6. **Instâncias e admissão declaradas**, com o orçamento de conexões do PR #86 aplicado ao número real de
   instâncias.
7. Os gates que o runbook já lista: destino de Preview, PostgreSQL de Preview com TLS e papel, prova ao vivo,
   p50/p95/p99 com carga representativa, Android e auditoria.

---

## 7. Proposta mínima e contraprova

**O que é:** `tests/product/q026-mvcc-proposta/sql-client-ouvinte-de-erro.patch`, um arquivo
(`src/platform/persistence/sql-client.ts`), 16 linhas a mais e 2 a menos. **Não está aplicado nesta branch.** A
missão proíbe mudar o runtime, e o arquivo é o adaptador compartilhado pelo runtime crítico: aplicar é decisão do
César.

```ts
const conn = await this.pool.connect();
let erroDaConexao: Error | undefined;
const aoErro = (erro: Error) => { erroDaConexao = erro; };
conn.on("error", aoErro);          // emprestada, a conexão não tem outro ouvinte
try { … BEGIN / fn / COMMIT, ou ROLLBACK … }
finally {
  conn.off("error", aoErro);
  conn.release(erroDaConexao);     // com erro, o pg-pool descarta a conexão
}
```

**O que não muda:** o algoritmo canônico, o SQL, os dois leitores, a Q-016, a rota, a admissão, o prazo e os
pools. Erros de **comando** (57014, 25006, exceção JS) não passam por `error` do cliente: continuam rejeitando o
comando, e a conexão volta saudável ao pool (E3 e E5 com a proposta, 3/3).

**O que ela não faz:** sozinha, não limita o instante (E7 sem mitigação segue 0/3). Ela é o pré-requisito para que
qualquer limite **do lado do banco** possa existir sem derrubar o processo.

**Contraprova (falha antes, passa depois), toda no HEAD desta branch:**

| prova | sem a proposta (runtime do HEAD #77) | com a proposta (patch aplicado só numa worktree de rascunho) |
|---|---|---|
| adaptador puro, 3 modos × 3 rodadas (`run-q026-mvcc-conexao-derrubada.ts`) | **9/9 processos morrem** | **0/9**; a transação rejeita e a consulta seguinte funciona |
| E4 na rota, incremental e canônico | 0/3 e 0/3 (morte) | 3/3 e 3/3 |
| E7 com `idle_in_transaction_session_timeout`, incremental e canônico | 0/3 e 0/3 (morte) | 3/3 e 3/3 |
| E1, E2, E3 e E5, incremental e canônico | 3/3 em todos | 3/3 em todos (sem regressão) |
| suítes anteriores: tipagem, repositórios PG, Q-016, leitor incremental PG e guarda HTTP real (admin, papel leitor, desligado) | ⟨PENDENTE: CI⟩ | ⟨PENDENTE: CI⟩ |

**Alternativas consideradas:**

- **`process.on("uncaughtException")`: recusada.** Esconderia qualquer outro defeito e deixaria o processo em
  estado indefinido.
- **Ouvinte só no `leitorRrCancelavel`: recusada.** Protegeria só o caminho opt-in. O defeito está no adaptador, e
  o wrapper nem enxerga a conexão crua.
- **Ouvinte permanente por conexão, no evento `connect` do pool: alternativa equivalente**, ainda menor. Depende de
  o pg-pool descartar sozinho a conexão marcada `_queryable = false`, um campo interno. A proposta usa o caminho
  documentado: `release(erro)` destrói a conexão.

---

## 8. Contraprovas do próprio instrumento (o que quase passou)

1. **Medidor do laço cego.** `monitorEventLoopDelay().reset()` zera a referência: o bloqueio de calibração de
   250 ms foi visto como 11 ms. Troquei por batimento próprio, e a calibração passou a reprovar a execução se não
   enxergar ≥ 200 ms.
2. **Workers paralelos contados como transações.** O primeiro amostrador viu 66 "snapshots" para 22 leituras, com
   pico 4 num pool de 2. Os workers de consulta paralela têm o mesmo usuário e o mesmo `xact_start` do líder. Passaram
   a ser contados à parte; a matriz foi **refeita do zero**.
3. **Aquecimento dentro da fase PRÉ** contaminava o controle. Ganhou fase própria.
4. **"Maior ocioso" por sequência de amostras** subestimava os intervalos. Foi trocado por `state_change`.
5. **E1 rotulado errado.** "desconexão até liberar" incluía a leitura seguinte (~3,5 s); o valor real é 13–25 ms.
6. **E2 com critério estrito demais.** O pedido *imediatamente* seguinte ao 503 tinha de ser aceito. O canônico
   reprovou porque a admissão só volta quando a leitura assenta, depois da resposta. O tempo preso passou a ser
   **medido e publicado** (local: 74–179 ms), e o critério virou "a instância volta a aceitar". A mudança está
   declarada aqui; não foi silenciosa.
7. **O E4 só rodou primeiro no CI.** O defeito da seção 1 foi achado por ele, não por mim localmente.
8. **E7 com mitigação** reprovou 2 de 3 na primeira rodada, pela mesma corrida de admissão do item 6. Ganhou a mesma
   espera, medida.
9. **O limite de 3 s para a admissão presa era meu, e o CI o derrubou.** No CI `38116089526`, o canônico com a
   proposta e o timeout de banco segurou a admissão **5,7 s** depois do 503 numa rodada, embora o instante tenha
   sido 2,3 s e o processo tenha seguido vivo. A explicação mais provável é que o Node ainda estava processando, na
   CPU, linhas já recebidas do `SELECT` grande, e só ao fim notou o prazo vencido. Isso é **hipótese**, consistente
   com o log do PostgreSQL, mas sem traço do processo. O caso passou a reprovar só se a instância não voltar a aceitar
   em 15 s, e o tempo preso é publicado em todo resultado.
10. **O teste de rede falhou primeiro por defeito meu.** O proxy com atraso morava no mesmo processo que lançava a
    medida com `spawnSync`, então o laço parado congelava o proxy ("Connection terminated unexpectedly"). Passou a
    lançar de forma assíncrona.
11. **O CI tropeçou numa sobra de teste da própria #77.** `run-q026-real-http-guard-candidate.ts` cria o papel
    global `q026_http_reader` e não o apaga, então uma segunda rodada no mesmo cluster falha no `CREATE ROLE`. Na
    comparação antes/depois, isso apareceu como falha nova com a proposta. Não era: o workflow agora apaga a sobra
    antes de cada rodada.
12. **O PostgreSQL local caiu uma vez** com o reinício do contêiner. Os experimentos que rodaram sem banco falharam
    na conexão e foram refeitos inteiros depois; nenhum resultado parcial foi aproveitado.

---

## 9. Limitações

- Tudo é sintético e local ou de CI: 4 vCPU, com PostgreSQL e Node **no mesmo host**, disputando CPU. Isso amplia a
  contenção que alonga instantes, e não mede rede, TLS, pooler nem réplica.
- A taxa de escrita (~420 XIDs/s) é arbitrária. O número transferível é a **janela em segundos**. Versões mortas em
  produção ≈ taxa real de `UPDATE`/`DELETE` nas tabelas do mesmo banco × janela **[estimado]**.
- O horizonte em segundos é estimado. A medida direta é a idade em XIDs.
- Clientes em laço fechado, sem tempo de pensar, são **pior caso**. A tela de Entregas só relê quando a pessoa
  pede: o temporizador de 15 s em `app.js` apenas marca a idade da leitura.
- Amostras pequenas por cenário, de 9 a 22 leituras. p95 aparece só com n ≥ 20 e p99 só com n ≥ 200.
- O `idle_in_transaction_session_timeout` foi provado por papel (`ALTER ROLE ... SET`). Com um pooler em modo
  transação, configuração por papel pode não valer **[sem observabilidade]**.
- A latência de rede (3.6) foi simulada por um proxy TCP em espaço de usuário, com atraso fixo e sem perda, jitter
  ou TLS. Ele mede a forma da dependência (instante × ida e volta), não a rede do Preview.
- As réplicas (`hot_standby_feedback`), os slots de replicação lógica e o autovacuum real das tabelas do produto não
  foram exercitados; só a tabela sintética sem autovacuum. O `transaction_timeout`, que limitaria a transação
  inteira, só existe a partir do PostgreSQL 17; aqui é 16.
- Não houve dado real, aparelho, Android, TLS operacional, Preview nem produção.

---

## 10. Como reproduzir

Tudo exige um PostgreSQL 16 **descartável**: as suítes criam e apagam o próprio banco e os próprios papéis. Nunca
apontar para o operacional. Sem `DELIVERYOS_PG_URL`, todas saem 78 (PULADO), nunca verdes.

```bash
export DELIVERYOS_PG_URL=postgres://<admin>@<host-descartavel>:5432/postgres

# 1. Sessão encerrada pelo banco × processo (adaptador puro). No HEAD: código 1 e "falhas":9.
npx tsx tests/product/run-q026-mvcc-conexao-derrubada.ts

# 2. Falhas no meio da leitura, rota real (E1 a E7; 3 rodadas por padrão)
Q026_FALHAS_LEITOR=incremental npx tsx tests/product/run-q026-mvcc-falhas.ts
Q026_FALHAS_LEITOR=canonico    npx tsx tests/product/run-q026-mvcc-falhas.ts
Q026_FALHAS_LEITOR=incremental Q026_FALHAS_CASOS=E7 Q026_FALHAS_MITIGACAO=sim npx tsx tests/product/run-q026-mvcc-falhas.ts

# 3. A proposta, só numa cópia (nunca na branch):
git worktree add --detach /tmp/q026-proposta HEAD && cd /tmp/q026-proposta && ln -s "$OLDPWD/node_modules" node_modules
git apply tests/product/q026-mvcc-proposta/sql-client-ouvinte-de-erro.patch   # repetir 1 e 2 aqui

# 4. MVCC/VACUUM sob escrita contínua, servidor real, matriz perfil:leitor:instâncias:admissão
Q026_MVCC_MATRIZ="longa:controle:1:2 longa:canonico:1:2 longa:incremental:1:2" \
  Q026_MVCC_DURACAO_S=60 Q026_MVCC_SAIDA_DIR=resultados bash tests/product/run-q026-mvcc-matriz.sh
Q026_MVCC_MATRIZ="mista:canonico:4:1 mista:incremental:4:1" Q026_MVCC_CLIENTES_POR_INSTANCIA=1 \
  Q026_MVCC_DURACAO_S=60 Q026_MVCC_SAIDA_DIR=resultados bash tests/product/run-q026-mvcc-matriz.sh

# 5. Instante por lote × embrulho cancelável (sem escritor; digest único exigido)
Q026_LOTE_PERFIL=longa Q026_LOTE_REPETICOES=3 npx tsx tests/product/run-q026-mvcc-lote-envelope.ts

# 6. Latência de rede (proxy com atraso medido) e pool compartilhado com o histórico
Q026_RTT_PERFIL=longa Q026_RTT_ATRASOS_MS=0,1,3 npx tsx tests/product/run-q026-mvcc-rtt.ts
Q026_POOL_ADMISSOES=2,1 npx tsx tests/product/run-q026-mvcc-pool-compartilhado.ts

# 7. Mecanismo do ECONNRESET (sem banco)
npx tsx tests/product/run-q026-mvcc-keepalive.ts
```

O mesmo conjunto roda no workflow `.github/workflows/q026-mvcc-vacuum-adversarial.yml`, com PostgreSQL 16 em
contêiner por job. Os JSONs de cada cenário (com as amostras brutas) ficam nos artefatos.

---

## 11. Decisões que ficam com o César

Nenhuma foi tomada por esta pesquisa. Os ledgers de governança (`PERGUNTAS.jsonl`, `STATE.json`, `EVIDENCE.jsonl`)
**não** foram tocados, para não interferir na integração nem na proteção de CI em curso em outra frente. Registrar
estas decisões neles é passo a decidir junto.

1. **Aplicar a correção do adaptador** (seção 7). Ela mexe em `src/platform/persistence/sql-client.ts`, que o
   runtime crítico também usa. É um defeito comprovado e anterior à #77.
2. **Limite do lado do banco** (`idle_in_transaction_session_timeout` no papel de leitura): se, quando e com que
   valor. Só depois do item 1.
3. **Lote do incremental para o banco real.** O padrão 257 com o embrulho é o pior caso com latência de rede (3.6).
4. **Teto de volume do log lido pela rota**, ou a decisão da janela da Q-026.
5. **Instâncias e admissão do Preview** (admissão 1 recomendada), com o orçamento de conexões.
6. **`keepAliveTimeout` do servidor de produto**: hoje é o padrão de 5 s, e um laço parado acima disso reseta
   pedidos (3.1). É um ajuste de servidor, fora do escopo desta missão.
