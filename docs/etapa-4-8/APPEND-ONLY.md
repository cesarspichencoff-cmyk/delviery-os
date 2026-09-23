---
lifecycle:
  artefato: docs/etapa-4-8/APPEND-ONLY.md
  status: ACTIVE
  authority_scope: event_log_append_only
  superseded_by: null
  atualizado_em: "2026-09-23"
  state_basis: 7ae2236
  question_refs: ["Q-015", "Q-016", "Q-017"]
---

# Append-Only Closure — o event log é append-only também contra TRUNCATE

Base: `14db61eac1e7f61047bf2474897be237a6b691a6`.

**Isto corrige uma invariante que já existia (L3, D10). Não é decisão nova
de produto.** Nenhuma pergunta nova. Q-003, Q-004 e Q-015 continuam
`open`/`PAUSE`; Q-016 e Q-017 continuam respondidas. Nada de retenção, purge,
arquivamento, TTL ou política de exclusão.

## Critério final, item a item

| # | critério | onde está provado |
|---|---|---|
| 1 | UPDATE não altera nem reclassifica fato | D2 e B15 (recusado, linhas intactas); D8 (aplicar a 0004 não muda linha: md5 igual, NULL segue NULL) |
| 2 | DELETE não apaga fato | D3, B16 |
| 3 | TRUNCATE não apaga o log | D4, D5, D6, B18 |
| 4 | INSERT válido continua funcionando | D1, F1 (papel não dono), B14 |
| 5 | as proteções sobrevivem a backup e restore | B9–B12 (catálogo), B15–B18 (executando) |
| 6 | o teste de backup não destrói nem limpa o event log compartilhado | P1 (nem conecta), P2 (md5 igual), M4–M7 |
| 7 | uma suíte não apaga patrimônio de outra para montar fixture | P3–P7, M8, M8b; `banco-isolado.ts` |
| 8 | Q-016 e Q-017 continuam verdes | §7 |
| 9 | nenhum `FAIL_NOVO` | §7 |

| fase | commit | prova |
|---|---|---|
| 1 · o buraco, reproduzido antes de fechar | `9039cfc` | `test:platform:append-only` 5/5 no schema da 0003 |
| 4 · nenhuma suíte monta fixture com patrimônio alheio | `2787e82` | backup 18/18, repos 19/19, pg 17/17, banco compartilhado idêntico |
| 2, 3 · a 0004 e a proteção executada | `7083dfc` | append-only 16/16, backup 19/19 |
| 5 · patrimônio, medido de fora | `2699fa2` | `test:platform:backup:patrimonio` 7/7 |
| 7, 8 · mutações e fronteira de privilégio | `7ae2236` | 11 mutações, zero cegas; append-only 20/20 |
| 9, 10 · regressão e continuidade | este documento | §7 |

**A ordem das fases mudou, e por quê.** Com a 0004 antes da Fase 4, o push
sairia vermelho: `test:platform:pg` aplica todas as migrations no banco
compartilhado, e na mesma regressão `backup` e `repos` quebrariam no
`TRUNCATE`. Primeiro as suítes deixaram de depender da violação; depois a
violação foi fechada. Cada commit subiu com os gates da própria fase verdes;
a regressão integral rodou sobre o último commit de código (§7).

---

## 1 — O buraco, reproduzido

A trava da 0001:

```sql
CREATE TRIGGER event_log_sem_update
    BEFORE UPDATE OR DELETE ON platform.event_log
    FOR EACH ROW EXECUTE FUNCTION platform.impedir_mutacao_event_log();
```

`TRUNCATE` não dispara trigger de linha. Medido num banco isolado, migrado
pelo runner real até a 0003 (`run-append-only-tests.ts`, A0–A4):

| operação | resultado |
|---|---|
| canal | `SELECT 'canal_ok'` devolve o que executou; banco exatamente em 0001–0003 |
| INSERT de 3 fatos | 3 linhas |
| UPDATE | recusado: `event_log e append-only: UPDATE nao e permitido` |
| DELETE | recusado: `... DELETE nao e permitido`; 3 linhas |
| **TRUNCATE** | **aceito sem erro; 0 linhas** |

Esse bloco continua no gate depois da correção, como controle positivo: a
mesma operação, pelo mesmo cliente, contra o schema sem a 0004.

### O mecanismo causal — e por que ninguém viu

A trava protegia **linha a linha**, e `TRUNCATE` esvazia a tabela sem passar
por linha nenhuma. O buraco chegou a ser lido como prova do contrário. A
decisão D10 (`DECISIONS.md`) registrava que "a limpeza da suíte de
repositórios **bateu na trava** e teve que usar `TRUNCATE`", como evidência
de que a garantia valia para todo mundo, e o comentário da suíte dizia o
mesmo. O `TRUNCATE` que passava era justamente a garantia que faltava, e
duas suítes oficiais passaram a montar o próprio fixture por ele.

---

## 2 — A classe: suítes que montavam fixture com o patrimônio alheio

Medido no código de `14db61e`, não no relato:

| suíte | o que fazia no banco de `DELIVERYOS_PG_URL` |
|---|---|
| `test:platform:backup` | `DELETE` em `entregas.gps_point` e `entregas.trip`, `TRUNCATE platform.event_log`, e `DROP DATABASE IF EXISTS <banco>_restaurado`, de nome **fixo**, antes de criar. Apagaria um banco com esse nome que não fosse dela |
| `test:platform:repos` | `DELETE` em `outbox`, `job`, `inbox`, `audit` e `TRUNCATE` no event log, com um comentário que celebrava a trava que o `TRUNCATE` contornava |
| `test:platform:pg` | `DELETE` em `outbox`, `job`, `inbox`, `entregas.gps_point`, `entregas.delivery`, `entregas.trip`, e as migrations reaplicadas num banco já migrado, chamado de "banco limpo" |

**A correção foi para a classe, não para o caso.** `banco-isolado.ts` virou o
núcleo único do contrato de patrimônio:

- nome próprio; `CREATE DATABASE`, que **falha** em colisão
  (`ColisaoDeBanco`), nunca `DROP ... IF EXISTS` antes de criar;
- `descartar()` apaga só o que **este** objeto criou, e uma vez só;
- se algo falha **depois** de criar (migration, conexão), o banco é apagado
  antes de a falha subir. Antes, ele vazava;
- `bancoVazio()`: sem schema e sem tabela de controle, o alvo de restore.

Ele não cobre `SIGKILL`, e nunca apaga "por prefixo" para compensar, porque
esse seria o jeito de apagar o que não criou.

As três suítes passaram a ter banco próprio. Medido em cada uma: o banco
compartilhado fica idêntico antes e depois (event log com o mesmo md5;
outbox, job, inbox, trip e gps com as mesmas contagens), e o conjunto de
bancos do servidor também.

---

## 3 — A 0004

```sql
DROP TRIGGER IF EXISTS event_log_sem_truncate ON platform.event_log;
CREATE TRIGGER event_log_sem_truncate
    BEFORE TRUNCATE ON platform.event_log
    FOR EACH STATEMENT EXECUTE FUNCTION platform.impedir_mutacao_event_log();
```

- **A mesma função da 0001.** Ela já recusa citando `TG_OP`; com `TRUNCATE`,
  a mensagem é `event_log e append-only: TRUNCATE nao e permitido`. Uma
  segunda função seria um segundo lugar para a regra divergir.
- **Trigger de comando, porque não há outra forma.** O PostgreSQL recusa
  `BEFORE TRUNCATE ... FOR EACH ROW` ("TRUNCATE FOR EACH ROW triggers are not
  supported"), medido no D10.
- **A 0001 não foi editada.** A 0004 é aditiva e reexecutável, sem
  `BEGIN/COMMIT` (o runner abre a transação e registra o checksum), como a
  0003.
- **Chega ao artefato.** `build:platform` copia 4 migrations para `dist/`; a
  0004 de `dist/` é byte a byte igual à fonte, e o carimbo de build a inclui
  (`tools/carimbar_build.js` hasheia `src/platform/migrations/*.sql`).

### Provada executando (`test:platform:append-only`, 20/20)

| ID | medido |
|---|---|
| D0 | banco na última migration; trava de comando, `BEFORE`, na função da 0001. O catálogo só confirma o que a execução prova |
| D1 | INSERT válido continua permitido |
| D2–D4 | UPDATE, DELETE e TRUNCATE recusados; linhas intactas |
| D5 | `ONLY`, `TABLE`, `CASCADE`, `RESTART IDENTITY`: todos recusados |
| D6 | `TRUNCATE platform.outbox, platform.event_log` é recusado inteiro; a outbox não perde linha |
| D7 | a mesma função recusa as três, com `^event_log e append-only: <OP> nao e permitido$` |
| D8 | sobre banco que já existia (histórico sem modo na 0002, fatos com modo na 0003): o runner aplica o que falta, nenhuma linha muda (md5), NULL segue NULL, e o TRUNCATE passa a ser recusado |
| D9 | a 0004 rodada de novo duas vezes: sem erro, uma trava só, recusando |
| D10 | a forma de LINHA é recusada pelo próprio PostgreSQL |

**Na composição oficial, em containers** (`tools/append_only_compose_real.sh`,
10 medidas): o job `deliveryos-migrate` da imagem construída deste checkout
aplica 0001–0004 (lista derivada do diretório, nunca escrita à mão), e o banco
da composição aceita INSERT e recusa UPDATE, DELETE e TRUNCATE, com as 2
linhas intactas. O contrato de patrimônio é o do `q017_compose_real.sh`: a
ferramenta recusa rodar onde já houver composição, o que foi provado com um
volume `deliveryos-platform-pgdados` plantado com marca (exit 2, nenhum
container criado, marca intacta).

---

## 4 — Backup e restauração com patrimônio próprio (`test:platform:backup`, 19/19)

A fonte nasce na 0002 com histórico sem modo **de verdade**, é migrada pelo
runner até a última, e recebe um fato de cada modo com microssegundo no
instante. O destino é um banco vazio. Tudo é comparado **fonte × destino**,
nunca contra lista escrita à mão:

| ID | medido |
|---|---|
| B0 | fonte própria, na última migration (lista derivada do diretório), com os três modos, histórico sem modo e 4 fatos aptos ao replay |
| B1–B3 | `pg_dump` custom não vazio (`PGDMP`); destino sem nenhuma relação; `pg_restore --exit-on-error` limpo |
| B4–B8 | os sete schemas; contagem exata de **toda** tabela; cada fato em cada coluna; instante ao microssegundo; modo de cada fato; o NULL continua NULL |
| B9 | constraints iguais; a da 0003 volta **não validada** |
| B10–B12 | índices, triggers, funções e registro de migrations iguais |
| B13 | **a reconstrução da Q-016 a partir do banco restaurado é idêntica à da fonte** (escopos, digests, UNKNOWN contado) |
| B14–B18 | no restaurado: INSERT novo aceito; UPDATE, DELETE e **TRUNCATE** recusados; coordenada inválida, chave repetida e fato sem modo recusados |

A suíte nunca abre conexão com o banco da URL, e apaga só os dois bancos
dela, também em falha e em SIGINT/SIGTERM. Nenhum procedimento de restauração
do repositório depende de `TRUNCATE`: o serviço de backup do compose só roda
`pg_dump`, e nenhum runbook usa `--clean`, `--data-only` ou
`--disable-triggers`.

---

## 5 — Patrimônio, medido de fora (`test:platform:backup:patrimonio`, 7/7)

O gate de backup roda como processo contra um banco de referência com linhas
conhecidas em cada tabela que o gate antigo tocava:

| ID | medido |
|---|---|
| P1 | referência **trancada** (`ALLOW_CONNECTIONS false`): o gate passa, e nem conecta nela |
| P2 | referência aberta: count e md5 de cada tabela idênticos depois do gate |
| P3 | conjunto de bancos do servidor idêntico depois do sucesso |
| P4 | `pg_restore` falso que sai 1: o gate falha e nenhum banco fica |
| P5 | SIGTERM no meio do restore, com os dois bancos criados: o gate sai 143 e nenhum banco fica |
| P6 | bancos hostis com nome semelhante (`<ref>_restaurado`, `bkpfonte_hostil_*`, `bkpdestino_hostil_*`) sobrevivem com a marca |
| P7 | colisão exata: `bancoIsolado`/`bancoVazio` com nome existente → `ColisaoDeBanco`; banco e marca intactos |

**Medido no caminho, e isso decidiu o desenho:** `SIGTERM` no `npm exec` faz o
`npx` sair 143 **sem repassar o sinal**; o `tsx` e o script ficam órfãos,
rodando. O meta-gate roda o gate como UM processo, com o loader do `tsx` que
o carrega (`process.execArgv`).

---

## 6 — Mutações e fronteira de privilégio

### Mutações (`test:platform:append-only:mutacoes`, 14/14: 3 controles e 11 mutações, zero cegas)

| ID | defeito devolvido | acusaram |
|---|---|---|
| M1 | a trava some da 0004 | D4 (e D0, D5–D9, F1–F3) |
| M2 | a trava vira de comando para **DELETE** | D4. **O D0 não vê**: no catálogo ela parece proteção |
| M3 | a função deixa TRUNCATE passar | D4 |
| M10 | a trava bloqueia INSERT por engano | D1 |
| M4 | o gate faz TRUNCATE no banco compartilhado | P1 P2 |
| M5 | o gate troca por DELETE no compartilhado | P1 P2 |
| M6 | o gate desliga as travas e limpa o compartilhado | P1 P2 (md5 da referência) |
| M7 | o gate usa o compartilhado como fonte | P1 P2 |
| M8 | `banco-isolado` apaga o banco que já existia | P7 |
| M8b | o gate apaga o `<banco>_restaurado` de nome fixo | P6 (e P3, P7) |
| M9 | a trava não volta no restore | B11 B18 |

Cada âncora tem ocorrência única, e a restauração é por SHA-256, conferida
também por fora.

### A fronteira de privilégio (F0–F3)

| quem | o que consegue |
|---|---|
| papel **não dono** com `SELECT, INSERT, UPDATE, DELETE, TRUNCATE` concedidos | só INSERT. UPDATE/DELETE/TRUNCATE recusados pela trava; `DISABLE TRIGGER`, `DROP TRIGGER`, `DROP TABLE` → *must be owner*; `session_replication_role = replica` → *permission denied* |
| **dono / superusuário** | toda ESCRITA continua recusada (D2–D6 rodam como superusuário), mas `DISABLE TRIGGER USER` ou `session_replication_role = replica` deixam o TRUNCATE passar. Medido dentro de transação desfeita |

**Na composição oficial, o runtime é esse dono.** Medido: o compose
renderizado mostra migrate, crítico e assíncrono conectando como
`POSTGRES_USER` (`deliveryos`), e a imagem `postgres:16-bookworm` (16.15)
cria esse usuário como **superusuário** (`rolsuper`, `rolcreaterole`,
`rolbypassrls`). Na composição de pé, o `current_user` é `deliveryos`, com
`rolsuper = true` (`PAPEL_DO_RUNTIME` em `tools/append_only_compose_real.sh`).

**Classificação:**

- **PROTEGIDO POR CONTRATO NORMAL:** todo caminho de escrita, de qualquer
  papel, inclusive o superusuário do runtime. Nenhum UPDATE, DELETE ou
  TRUNCATE altera ou apaga fato, e nenhum caminho oficial emite DDL contra a
  trava.
- **ADMIN/SUPERUSUÁRIO AINDA CONSEGUE SABOTAR:** por DDL (desligar ou
  derrubar a trava, derrubar a tabela) ou por `session_replication_role`. No
  compose oficial, o próprio runtime tem esse poder. Separar o papel do
  runtime do dono do schema é modelo de IAM. Fica fora desta missão,
  declarado, sem pergunta nova: não é uma das decisões do §6 do índice
  canônico, e a missão proibiu expandir o IAM.

---

## 7 — Regressão

### Rodada 1: o código final (`7ae2236`), antes desta documentação

Árvore limpa no HEAD remoto `7ae2236`, 52 gates, cada um isolado
(`timeout 1800 npm run <gate>`), com o `DELIVERYOS_PG_URL` do sandbox: a
cobertura da regressão final da Q-017 mais os dois gates novos. Cada falha
foi comparada, log contra log, com a da regressão final da Q-017,
normalizando só tempo e caminho temporário.

| classe | n | gates |
|---|---|---|
| **PASS** | **48** | todos os outros |
| FAIL_PREEXISTENTE | 3 | `test:entregas` (as mesmas 2 falhas de "Persistência sobrevivendo à recriação", `impossible_timestamp`); `test:platform:governanca` (G6b do `STATE.json` e G9 da Q-014, as duas da medição pós-commit da Q-017); `test:platform:governanca:mutacoes` (aborta em cascata pelas mesmas duas) |
| BLOCKED | 1 | `test:platform:m1b-perceptual`: `ECONNREFUSED 127.0.0.1:5292`, servidor ausente, igual |
| **FAIL_NOVO** | **0** | |

O que a missão pediu, dentro dos 48:

| pedido | gate | resultado |
|---|---|---|
| migrations | `test:platform:append-only` | 20/20 |
| integração com PostgreSQL | `test:platform:pg` | 17/17, em banco próprio |
| repositórios | `test:platform:repos` | 19/19, em banco próprio |
| backup/restore | `test:platform:backup` · `test:platform:backup:patrimonio` | 19/19 · 7/7 |
| PB19 | `test:platform:pb19` · `test:platform:higiene` | 27/27 · 5/5 |
| Q-016 | `test:platform:q016` · `test:platform:q016:processos` | 27/27 · 14/14 |
| Q-017 | `test:platform:q017` · `test:platform:q017:compose` | 18/18 · 7/7 |
| replay | B13 no banco restaurado · `q016:processos` · `spine:processos` | idêntico à fonte · 14/14 · 7/7 |
| build e carimbo | `build` · `build:platform` | 4 migrations em `dist/`, a 0004 byte a byte igual à fonte; carimbo com commit `7ae2236` e 56 fontes |
| governança | `test:platform:governanca` | só G6b e G9, pré-existentes |
| Entregas | `test:entregas` | as mesmas 2 falhas pré-existentes |

Rodado à parte, na mesma árvore:

| o quê | resultado |
|---|---|
| `test:platform:append-only:mutacoes` | 14/14 (3 controles, 11 mutações), zero cegas; acusações idênticas às da Fase 7 |
| `test:platform:q016:mutacoes` | 14/14 (2 controles, 12 mutações), zero cegas; a MQ3 continua caindo no H1 |
| `test:platform:q017:mutacoes` | 17/17 (2 controles, 15 mutações), zero cegas; as mesmas linhas de resultado da Q-017 |
| `test:platform:pb19:mutacoes` | 14/14, zero cegas; as mesmas linhas de resultado da Q-017 |
| `test:platform:spine:mutacoes` · `test:lab:v4:evidencias:mutacoes` (dentro dos 52) | 31/31 · 6/6 |
| `test:entregas:deploy-audit`: o último elo da cadeia `test:entregas`, que a falha pré-existente do elo anterior impede de rodar | 36/36 |
| `tools/q017_compose_real.sh`, a composição oficial em containers, com a 0004 | 31 medidas, `Q017_COMPOSE_REAL_GREEN`, idênticas às da Q-017; imagem construída de `7ae2236` (fontes `2e21deaa428a`), no estágio `build` pelo bloqueio Debian já declarado no PB19 |
| a trava na composição oficial: o job `deliveryos-migrate` da imagem real e o banco da composição | `tools/append_only_compose_real.sh`, 10 medidas, `AO_COMPOSE_TRAVA_GREEN` (§3). A primeira execução, ainda no rascunho, saiu RED por erro de expectativa do próprio script (`super=t`: o PostgreSQL concatena booleano como `true`); corrigida a expectativa, não o produto |

**NOT_RUN, por desenho:** `evidence:lab:v4:refresh`, que substitui a evidência
versionada e é ato explícito (D4). Os subscripts de `test:entregas`,
`test:lab` e `test:platform:r5` rodam dentro das cadeias.

### Rodada 2: a árvore final, com esta documentação

Documentação também reprova gate. A primeira passada dos gates que leem
documento, com a L3 da skill editada, derrubou o `test:platform:m1-bridge`
(M-J, achado 5). A edição foi revertida e o gate voltou a 34/34. Por isso a
regressão integral roda de novo sobre o commit que traz esta documentação,
com a governança medida depois do commit (L45). O resultado entra no commit
seguinte, que só o registra.

---

## 8 — Achados, documentados e não expandidos

1. **Duas listas escritas à mão na Q-016 quebraram com a 0004** sem que
   nenhuma propriedade mudasse: H1 ("só a 0003 foi aplicada") e H5 ("o log
   tem exatamente a trigger X", que era o controle de que a consulta enxerga
   trava). A forma foi corrigida, não a intenção: lista derivada do
   diretório, e presença em vez de lista exata. A mutação MQ3 continua caindo
   no H1.
2. **`npm exec` não repassa SIGTERM.** Um harness que mata `npm run` por
   timeout deixa o teste rodando órfão. Não alterado; registrado.
3. **A decisão D10 celebrava o buraco como prova.** Corrigida com nota, sem
   mudar a decisão (§1).
4. **O banco compartilhado do sandbox ganha um GPS `simulated` a cada
   `test:platform:pb19`**: o controle positivo do PB19 grava nele por
   desenho. É inserção, não destruição, mas é a última suíte que escreve no
   banco da URL.
5. **A L3 da skill de guardrails continua citando só `UPDATE` e `DELETE`.**
   Ela não mente, porque os dois são recusados, mas não nomeia o `TRUNCATE`.
   A atualização foi escrita e **revertida**: a guarda M-J de
   `test:platform:m1-bridge` amarra a contagem de linhas de cada skill à
   inspeção que a M1A.1 registrou em `docs/design/M1_CANONICAL_SUCCESSION.md`
   (163 linhas), e a skill editada passou a ter 168. Trocar o número seria
   declarar uma leitura que a M1A.1 não fez; manter 163 linhas com outro
   conteúdo seria enganar a guarda. Atualizar a skill exige nova inspeção
   registrada na sucessão M1, e M1 está fora desta etapa. A invariante
   completa está na D10, no Preservation Set do `PLANO.md` e aqui.

---

## 9 — O que continua aberto

- **Q-015:** o estado próprio da Intelligence Spine não sobrevive a
  reinício. Intocada.
- **Q-003, Q-004:** intocadas, `open`/`PAUSE`.
- **Q-016, Q-017:** continuam respondidas; os gates delas seguem verdes.
- **UNKNOWN:** o modelo de papéis de um banco hospedado (Supabase ou outro)
  não foi medido. A medição de privilégio é da composição oficial em
  container.
- **Limite declarado:** superusuário e dono podem desligar a trava. O
  PostgreSQL não se defende do próprio superusuário, e esta missão não
  tentou.
- **A L3 da skill de guardrails** segue incompleta (achado 5): atualizá-la
  exige nova inspeção registrada na sucessão M1.
