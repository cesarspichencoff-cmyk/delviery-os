# Q-026 — auditoria adversarial de instantâneo, cursor e memória (Claude)

**Data:** 2026-10-10. **Missão:** [issue #36](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/36)
e os dois comentários do César (12:07 e 12:33). **Estado:** SHADOW. Somente testes, CI isolado e este
documento. Nenhum runtime, Product UI, Android, migration, `main`, integração ou produção foi alterado.
**Q-026 e Q-024 continuam ABERTAS.** Este documento não decide nenhuma das duas.

**Independência.** Nenhum número do PR #37 entrou aqui como prova. Os leitores do PR #37 foram
reconstruídos do código (réplica fiel, linha a linha) e rodados contra PostgreSQL 16 descartável com
as migrations reais. O que sustenta cada afirmação abaixo é um teste que roda, e cada teste tem um
mutante que precisa derrubá-lo (§8).

---

## 0. Base revalidada nesta sessão

| | |
|---|---|
| Base exata | `integration/deliveryos-product-ux-android-20261009` = `99b0c72e6a254c68358767b5addffe673707d934` (conferido no remoto) |
| `main` | `185b73d324b31bfd1e3381ee00bac7d00763168e`, não tocada |
| PR #37 auditado | head **`dc0cd2f3`** (leitor "misto", `run-q026-mixed-cursor-full-ui-shadow.ts`) **e** o leitor de `43b6ad8f` (`run-q026-compact-view-shadow.ts`), que em `dc0cd2f3` continua sendo o leitor dos jobs de memória |
| VÉRTICE | `vertice-runtime.`, branch `vertice-active` = `e81b6d8` (autoritativo). O gateway MCP serve `6434732`, **atrasado** em relação a `vertice-active`. O frescor do gateway fica **UNKNOWN**, e esta auditoria usa como fonte o código em `99b0c72`, que é o próprio objeto auditado |
| PostgreSQL local | 16.15, isolamento padrão `read committed`, colação `C.UTF-8` |
| PostgreSQL do CI | `public.ecr.aws/docker/library/postgres:16` (a mesma imagem do PR #37) |

---

## 1. Veredito em seis linhas

1. **A porta canônica de Entregas mostra duas verdades na mesma tela** quando um lote confirma durante
   a leitura. Na mesma tela: "Viagem T-1 sem posicao recebida ha 9 min" e o aparelho dessa viagem com
   última posição "agora" (S1 NEG). Dentro da segunda transação, READ COMMITTED dá um instantâneo por
   comando, e a contagem fica nova enquanto o último lote fica velho (S2 NEG). **Alcançável.**
2. **A correção existe sem mudar o runtime:** tudo numa transação `REPEATABLE READ, READ ONLY` (S1 POS,
   S2 POS), ou duas conexões sobre o mesmo `pg_export_snapshot()` (S4).
3. **Um cursor sozinho é consistente até em READ COMMITTED**, porque guarda o instante do DECLARE
   (S3, C9). Mas qualquer consulta companheira na mesma transação (cadastro, último lote, contagens)
   vê outro mundo. **A tela precisa de mais de uma consulta, logo precisa de REPEATABLE READ.**
4. **O leitor misto do PR #37 (`dc0cd2f3`) é igual à porta canônica** em todas as categorias
   alcançáveis do banco adversarial: 7 escopos, inclusive o que só tem fato sem viagem, UNKNOWN 3,
   inválidos 2, sem viagem 5, VM inteira igual em 6 filtros, com FETCH 3 e 4096 (C12). Ele fechou C2,
   C3, C4 e C5 do leitor anterior. **O que sobra contra ele:** a composição (C15, alcançável), a
   colação (C14, condicional), o instante ilegível (C13, latente), a quarentena só contada (§5) e o
   empate de `localeCompare` (C16, latente).
5. **Os números de memória publicados no PR #37 não são de um leitor correto.** Eles foram medidos com
   o leitor de dois tipos e chave em texto (§6), que diverge do canônico fora da fixture (C1–C5, C8).
   O leitor que é igual ao canônico não tem medida de memória. É uma observação de procedência; não
   refiz benchmark, que a issue proíbe.
6. **Não existe O(1).** O cursor guarda o maior grupo inteiro. Aqui foram 9.003 linhas e 9.003 ids em
   `eventos[]` (C11). A memória é O(página + maior viagem + nº de viagens).

---

## 2. As seis noções de tempo e identidade — e o que cada uma NÃO garante

| Noção | O que é | Quem define (evidência) | Serve para | **Não** serve para | Provas |
|---|---|---|---|---|---|
| **Instantâneo PostgreSQL** (MVCC) | O conjunto de transações confirmadas que um comando enxerga | O servidor. Em READ COMMITTED, um por comando; o cursor fica com o do DECLARE. Em REPEATABLE READ, o do primeiro comando até o COMMIT | Fazer leituras concordarem entre si | Dizer algo sobre o tempo do mundo. Não fica gravado na linha | S1–S4, S8, C9, C15 |
| **`occurred_at`** | Quando o aparelho diz que aconteceu | O produtor | Ordenar a projeção (`projetar` ordena por ele, em ms) | Autoridade sobre frescor (o relógio pode estar adiantado: `relogioEfetivo`), ordem de chegada ou desempate | C10, C16 |
| **`recorded_at`** | Quando o servidor **recebeu o pedido**: hora da aplicação, carimbada **antes** do COMMIT | `ingest-service.ts:219,239` (`recebidoEm`), `pg-repositories.ts:535` | Medir a latência de sincronização. É a base do frescor quando o relógio não é confiável | Ordem de visibilidade ou de commit, marca d'água incremental (S5), unicidade (todos os fatos de um pedido empatam) | S5, S6 |
| **`sequence_local`** | Contador do aparelho | O aparelho: no GPS é inteiro ≥ 0 obrigatório (`device-ingest.ts:209`) | Desempatar depois do instante, dentro de um aparelho | Ordem entre aparelhos. Pode faltar (`NULL`) em produtor que não é aparelho. Acima de 2^53 é quarentena | C1, C3, S6 |
| **`idempotency_key`** | Identidade de deduplicação | O produtor. `UNIQUE` em `platform.event_log` (migration 0001) | Garantir que o mesmo fato não entra duas vezes (`projetar` deduplica por ela, `operacao-viva.ts:375`) | Ordem; nada sobre tempo | migration 0001 |
| **`event_id`** | Identidade do fato | O produtor: `ev-<hex>` no GPS (`device-ingest.ts:220`), `randomUUID()` nos públicos (`public-event-builder.ts:193`), qualquer texto não vazio no contrato (`event-catalog.ts:218`) | Identidade (PRIMARY KEY) | Ordem total: `projetar` desempata por `localeCompare` (`operacao-viva.ts:297`), que empata textos distintos em bytes | C10, C16 |

**Semântica UNKNOWN.** `source_mode` NULL é histórico anterior à 0003. Ele é contado
(`historico_sem_modo`), nunca projetado e nunca inferido. Os fixtures nascem como na operação: o banco
é migrado até a 0002, os fatos são gravados e só então `migrarTudo()` roda. Quem cumpre: a porta
canônica, o leitor misto (C12: 3) e o candidato (C7: 3, e MC9 prova que a comparação não é cega). Quem
não cumpre: o leitor `43b6ad8`, que cai alto (C1) ou, generalizado, deixa de contar em silêncio (C5).

---

## 3. Instantâneo e transações (item 1 e 3 da missão)

Suíte `tests/product/run-q026-snapshot-adversarial-pg.ts`, **11/11**. Cada caso cria um banco novo
com as migrations reais e um escritor numa conexão própria. O momento do commit é determinístico: um
gancho no cliente do leitor dispara a escrita entre as duas transações da porta, ou entre duas
consultas da mesma. Não há `sleep` disputando corrida.

| ID | Classe | O que mostra, com o número medido | Alcance |
|---|---|---|---|
| S1 CONTROLE | — | Sem escrita, viagem e aparelho contam a mesma história | — |
| **S1 NEG** | duas transações (`realidade-de-entregas.ts:99-104` + `:106-107`) | O lote de 5 s confirma entre os fatos e o cadastro. A VM real mostra **"Viagem T-1 sem posicao recebida ha 9 min"** e o aparelho dev-1, o telefone dessa viagem, com **última posição "agora"** (5 s) e 2 lotes contra 1 na projeção | **Alcançável**: qualquer lote que confirme durante a leitura |
| **S1 POS** | uma transação RR envolvendo a porta, sem tocá-la | O mesmo gancho não separa os mundos (os dois ficam em 540 s). A leitura seguinte vê o lote novo inteiro | — |
| **S2 NEG** | READ COMMITTED dentro da 2ª transação | Escrita antes do `count(*)`: último lote velho (540 s) e contagem 2 | **Alcançável** |
| **S2 POS** | RR | As três consultas do cadastro veem o mesmo instante (1 = 1), e a escrita confirmou (2 no banco) | — |
| S3 | cursor | Confirmadas antes: 3. Em **READ COMMITTED**: cursor 3, SELECT seguinte 5 (uma escrita entre o DECLARE e o 1º FETCH, outra depois). Em **REPEATABLE READ**: cursor 5, SELECT 5. **O cursor guarda o instante do DECLARE nos dois níveis** | — |
| S4 | duas conexões | Instantâneos independentes divergem (+1). Com `pg_export_snapshot()` + `SET TRANSACTION SNAPSHOT`, não divergem | — |
| **S5 NEG** | marca d'água por `recorded_at` | Um escritor carimba `recorded_at` 14:59:30 e confirma **depois** de outro, carimbado 14:59:50. A marca d'água fica em 14:59:50 e a releitura incremental vem **vazia**; o fato só aparece na releitura completa | **Alcançável** para qualquer desenho incremental. A porta atual não usa marca d'água |
| S6 ACHADO | `DISTINCT ON` do último lote (`realidade-de-entregas.ts:126-130`) | Com `recorded_at` empatado e sem `sequence_local`, o mesmo conjunto gravado A,B escolhe T-A, e gravado B,A escolhe T-B | **Latente**: o GPS do aparelho sempre traz sequência |
| S7 ACHADO | quarentena | `lerFatosParaReplay` põe a linha em quarentena, mas `RealidadeDeEntregas` e a VM **não a declaram em campo nenhum** | Latente (os produtores do repositório não geram linha inválida). É lacuna forense |
| S8 | custo do POS | `backend_xmin` medido: o cursor em READ COMMITTED segura o horizonte do VACUUM **do DECLARE ao CLOSE**; REPEATABLE READ segura **do 1º comando ao COMMIT** | — |

**Conclusão do item 1.** A janela existe e é visível ao usuário. Ela se desfaz na leitura seguinte,
porque nada é persistido, mas na tela é uma contradição sobre o mesmo telefone. A porta já a admite
em comentário (`realidade-de-entregas.ts:99-103`): "Entre as duas pode entrar um fato novo". Os testes
transformam essa frase em medida.

---

## 4. O cursor `DECLARE … FETCH FORWARD 4096` (item 2 e 3)

Suíte `tests/product/run-q026-cursor-adversarial-pg.ts`, **21/21**. Quatro leitores rodam sobre o
**mesmo** banco: o canônico, a réplica `43b6ad8`, a réplica `dc0cd2f3` e um candidato seguro.

O **banco adversarial** traz: 2 unidades, mais um par de ids com o separador `|`; 3 modos; UNKNOWN de
antes da 0003; tipos fora do filtro do PR #37 e fora da Operação Viva (`order_ready`); quarentena
(sequência −1, sequência 2^53+1, `occurred_at` infinito); a mesma viagem em dois modos e duas
unidades; um escopo (VILA, `real`) só com fato sem viagem; empate de instante sem sequência; e uma
viagem de **9.003** linhas atravessando **3 páginas de 4.096**. A referência canônica fica em
**9 viagens, 9.019 fatos projetados, UNKNOWN 3, quarentena 3, sem viagem 5, 7 escopos**.

### 4.1 O que o cursor PRECISA para preservar (unidade, modo, viagem)

| Requisito | Por quê (prova) |
|---|---|
| `ORDER BY` com a **chave inteira** do grupo: `unit_id, source_mode, object_type, object_id` | É a chave que o canônico usa: escopo (unidade, modo) e viagem = `object_id` quando `object_type = 'trip'` |
| **`COLLATE "C"`** em cada chave | Com colação não determinística, iguais "se misturam". Em C6 (colação no ORDER BY) saem 6 grupos para 2 viagens. Em C14 (colação **na coluna**, mudança de schema) o leitor misto, **sem mudar uma linha**, devolve **6 entradas para 2 viagens** (T-x ×3, T-X ×3). O candidato com `"C"` continua igual ao canônico. MC1 e MC11 provam que é exatamente o `COLLATE` que salva |
| `event_id COLLATE "C"` como **última** chave | Torna determinística a ordem de entrada de cada grupo. Sem ela, o empate de `localeCompare` herda a ordem física. C10: o candidato escolhe dev-A nas duas ordens de gravação, e MC2 tira a chave e o derruba |
| Isolamento **REPEATABLE READ, READ ONLY** sempre que houver mais de um comando | C9: com escrita depois do DECLARE, o cursor fica no instante do DECLARE nos dois níveis (9.003). A consulta companheira vê **9.005** em READ COMMITTED e **9.005 = 9.005** em REPEATABLE READ, porque aí o cursor também está em 9.005. MC3 prova que a rodada positiva não é cega |
| Chave comparada **campo a campo** (ou JSON), nunca texto com separador | C4: `A` + `B\|simulated\|C` e `A\|simulated\|B` + `C` viram **um** grupo no `43b6ad8` e uma viagem some sem erro. MC6 devolve a chave em texto ao leitor misto e C12 cai |
| Os **mesmos** tipos do replay (`TIPOS_DA_OPERACAO_VIVA`) | C2: com o filtro de dois tipos, T-B1 fica `em_rota` em vez de `encerrada`, com 0 ocorrências contra 1 e 2 fatos a menos. MC12 amplia o filtro e C2 cai |
| O **decodificador canônico** por grupo, com a mesma quarentena | C3: sequência −1 vira fato válido no `43b6ad8`, e a posição em quarentena vira "última posição". C1/C13: 2^53+1 e `infinity` derrubam a leitura inteira em vez de ir para a quarentena com motivo |
| Contar UNKNOWN e fato sem viagem, e **manter o escopo** que só tem fato sem viagem | C7 e C12 comparam os 7 escopos, inclusive `["VILA","real"]` com `viagens: []`, que é o pedido do comentário de 12:33. MC8 tira o escopo e C7 cai |
| Não esconder grupo repetido | **Recomendação, não implementada:** guardar as chaves já fechadas (O(nº de grupos)) e falhar se uma reaparecer. Isso transforma C14 de duplicação silenciosa em falha alta |

### 4.2 Contra o leitor `43b6ad8` (o leitor dos números de memória)

| ID | Resultado | Alcance |
|---|---|---|
| C0 CONTROLE | No fixture do próprio PR (um modo, uma unidade, dois tipos) as três réplicas são iguais ao canônico, com 3 viagens e 153 fatos | — |
| C1 NEG ×5 | Cai alto diante de: fato `real` (assert `simulated`), UNKNOWN, GPS sem viagem ("esperada uma viagem por grupo"), sequência 2^53+1, `occurred_at` infinito. O canônico lê e declara os cinco | `real` e UNKNOWN são **alcançáveis** |
| C2 NEG | Silencioso: `estado` `em_rota` × `encerrada`, ocorrências 0 × 1 | **Alcançável** (fim de viagem e ocorrência são fatos normais) |
| C3 NEG | Silencioso: sequência −1 projetada como válida | Latente (o aparelho recusa) |
| C4 NEG | Silencioso: dois grupos fundidos pelo separador | Latente |
| C5 NEG | Silencioso: UNKNOWN não contado (0 em vez de 2) | **Alcançável** em banco com histórico de antes da 0003 |
| C8 NEG | No banco adversarial inteiro, o estrito cai na 1ª linha fora da fixture. O generalizado cai no assert de sequência (s1-big vem antes de s3-inf na ordem do cursor) | — |

### 4.3 Contra o leitor misto `dc0cd2f3`

| ID | Resultado | Alcance |
|---|---|---|
| **C12 CONTROLE** | **Igual** à porta canônica no banco adversarial sem `infinity`: escopos e viagens compactas byte a byte, UNKNOWN 3, inválidos 2, sem viagem 5, escopo vazio `["VILA","real"]` presente, **VM inteira igual** nos filtros `null`, ITAIM, VILA, A, `A\|simulated\|B` e SEM-UNIDADE, com FETCH 3 (3.010 lotes) e FETCH 4096 (3 lotes) | — |
| **C15 NEG** | A **composição** do PR: `original = lerRealidadeDeEntregas(...)` **antes** do cursor (`mixed…:96`), `aparelhos` emprestado (`:166`), transação READ COMMITTED (`:109`). Um lote confirma entre as duas, e a VM mostra a **viagem T-1 com posição "agora" (fresca)** e o **aparelho dela parado "ha 9 min", 1 lote**. É o S1 ao contrário | **Alcançável**, se a composição for implementada como está |
| **C15 POS** | Os dois no mesmo instantâneo RR: aparelho e viagem concordam, e a leitura seguinte vê as duas pontas novas (2 lotes). MC4 e MC5 provam que nem o POS nem o NEG são cegos | — |
| C13 NEG | `occurred_at` infinito: o misto **cai** ("timestamp invalido no cursor", `mixed…:35`); o canônico põe em quarentena e segue | **Latente**: `checkEvent`/`ehIso` recusam na ingestão. Custo: disponibilidade (a tela inteira cai) |
| C14 NEG | Colação não determinística na coluna: o misto duplica viagens | **Condicional** a mudança de schema |
| C16 ACHADO | Com empate de `localeCompare` (NFC × NFD, mesmo instante e sequência), a porta canônica e o misto escolhem **aparelhos diferentes para a mesma viagem no mesmo banco**: 22 linhas, porta dev-B, misto dev-A. O sort do PostgreSQL não é estável e inverte o par em relação à ordem física que o canônico lê | **Latente**: os produtores do repositório geram ids ASCII. Depende da implementação do sort do PG 16 |

### 4.4 Um achado sobre o próprio canônico

`replay-do-event-log.ts:27-30` afirma "Sem dependência de ordem… a ordem em que o banco devolve as
linhas não pode mudar o resultado". **C10 refuta a afirmação** para ids distintos em bytes que
`localeCompare` empata: o mesmo conjunto de fatos, gravado NFC,NFD, dá dev-B, e gravado NFD,NFC dá
dev-A, porque o último aplicado vence (`operacao-viva.ts:437`). Consequência: **nenhum leitor
alternativo pode ser "byte a byte igual ao canônico" nessa classe**, já que o canônico não é função do
conjunto de fatos. A classe é latente, porque os produtores medidos geram `ev-<hex>` e UUID. Mudar o
comparador muda o replay da Q-016, e isso é decisão, não correção (§9).

---

## 5. Memória (item 4)

| Leitor | Memória durante a leitura | Evidência |
|---|---|---|
| Porta canônica | **O(L)**: todas as linhas dos tipos, os envelopes e o `eventos[]` de cada viagem retido em `RealidadeDeEntregas` | `replay-do-event-log.ts:85-89` (SELECT único), `operacao-viva.ts:454` |
| Cursor (misto ou candidato) | **O(página + maior grupo + nº de viagens)**. **Não é O(1)**: o grupo da maior viagem fica inteiro em memória e `projetar` devolve o `eventos[]` inteiro dele antes de virar contagem | C11: **9.003 linhas** no maior grupo e **9.003 ids** no maior `eventos[]`. O PR #32 forçou 120 mil numa viagem |

**O que a tela usa, e o que é proveniência.** A VM lê, de cada viagem: id, unidade, estado, frescor,
`device_id`, `ultima_posicao_em`, ocorrências, procedência (modo) e **`fatos: v.eventos.length`**
(`entregas-vm.ts:467`). Ela nunca lê um id de evento. O proxy `semIds` do PR #37 confirma isso por
construção, e C12 o reaproveita. **Proveniência forense:** os ids de `eventos[]`, as `corrompidas`
(event_id + motivo), a `quarentena` de `projetar`, o `cursor` e as `dimensoes`.

**O que uma leitura compacta não pode silenciar**:

- **UNKNOWN**: a porta e o misto contam. ✓
- **Corrompidas**: a porta **descarta** (S7). O misto conta (`invalid`, `mixed…:139`), mas **sem
  event_id nem motivo**. A lacuna existe hoje nos dois; compactar não pode piorá-la, e o certo seria
  declará-la.
- **`quarentena` de `projetar`**: vazia hoje, porque a porta não passa `consumer_version`.
- **`dimensoes`**: são por escopo. `calcularDimensoes` só precisa de estado, frescor, `ultimo_fato_em`,
  ocorrências e capacidade, e por isso é computável sobre as viagens compactas em O(nº de viagens).
  Mas a função não é exportada, e a porta hoje não expõe `dimensoes`. Um leitor compacto **não pode
  alegar** que as fornece sem chamar a mesma função.
- **`cursor`** (último fato aplicado no escopo, **inclusive fato sem viagem**): exige o máximo pelo
  comparador de `projetar` entre grupos e herda o empate de C10. A porta não o expõe.
- **Frescor**: é leitura contra `agora`, nunca fato. A leitura compacta recalcula a cada leitura e
  nunca guarda.

**O custo da alternativa segura** (S8): a transação RR segura o horizonte do VACUUM do 1º comando ao
COMMIT, e o cursor em READ COMMITTED **já** segurava do DECLARE ao CLOSE. **Não é uma classe nova de
custo**, só a obrigação de fechar a transação logo depois da última consulta. O efeito em inchaço de
tabela sob carga real (a outbox recebe UPDATE) **não foi medido**.

---

## 6. Procedência dos números de memória do PR #37

O run [38050635370](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38050635370)
(fases no mesmo processo, 188,5 × 1.237,8 MiB) e o run
[38051370730](https://github.com/cesarspichencoff-cmyk/delviery-os/actions/runs/38051370730) (A/B em
processos separados, pico 191,6 × 1.242,3 MiB, "~84,6% menor") medem o leitor de **dois tipos, chave
em texto e asserts de fixture**:

- `run-q026-compact-view-shadow.ts:62,129-130,149`;
- `run-q026-compact-independent-shadow.ts:68,153-154,173`, ambos em `dc0cd2f3`.

Esse leitor diverge do canônico fora da fixture (C1–C5, C8). O leitor que **é** igual ao canônico,
o misto (C12), rodou com 6.000 fatos e FETCH 3, **sem medida de memória**. A economia, portanto,
**ainda não é propriedade de um leitor correto**. Não afirmo que ela some: só que não foi medida onde
importa.

---

## 7. Forma de decisão (CLAUDE.md §8)

**(1) O que sabemos**, provado aqui com teste e número:

- A porta atual tem a janela de duas transações (S1) e a de READ COMMITTED por comando (S2), as duas
  visíveis na VM real.
- Uma transação RR sem tocar a porta fecha as duas (S1 POS, S2 POS).
- O cursor guarda o instante do DECLARE (S3, C9).
- O leitor misto do PR #37 é igual ao canônico nas categorias alcançáveis (C12), mas a composição dele
  reabre a janela (C15).
- `recorded_at` não é ordem de visibilidade (S5).
- O canônico depende da ordem física no empate de `localeCompare` (C10).

**(2) O que é hipótese:**

- Que a janela S1/S2 seja frequente em produção. Ela cresce com a duração da leitura (o PR #37 mede
  segundos para 1 M de fatos), mas não há dado de produção.
- Que a transação RR seja barata sob a carga real.
- Que o sort do PG 16 do CI inverta o par de C16 como o local. O CI responde a isso.

**(3) O que falta validar:**

- O caminho HTTP (`/api/entregas`), porque os testes chamam a porta direto.
- O aparelho físico.
- A duração real da leitura com ingestão concorrente.
- O inchaço de tabela durante uma leitura longa.
- PostgreSQL de outra versão maior.
- A memória do leitor **correto** (não deste PR; ver §9).

**(4) Risco:**

- Se o compacto entrar como está: contradição aparelho × viagem (C15, alcançável), tela inteira caindo
  com instante ilegível (C13), duplicação silenciosa se a colação mudar (C14) e quarentena sem nome
  (S7).
- Se a porta ficar como está: S1 e S2 continuam, transitórias mas visíveis.

**(5) Próxima ação mais segura:** decidir, por pergunta formal, se a porta passa a ler numa transação
`REPEATABLE READ, READ ONLY` com `lerFatosParaReplay` recebendo a mesma transação. É mudança de
runtime pequena, e S1 POS/S2 POS são os testes de aceite prontos. Qualquer leitor por cursor deve
cumprir as nove linhas de §4.1.

**(6) O que não fazer agora:**

- Merge do PR #37.
- Tratar a economia de memória como propriedade de um leitor correto.
- Marca d'água por `recorded_at`.
- Trocar o comparador de `projetar` sem decisão, porque isso muda o replay da Q-016.
- Decidir Q-026 ou Q-024 por conveniência técnica.

**Perguntas propostas.** Não foram registradas em `PERGUNTAS.jsonl` porque a missão restringe a
entrega a testes, CI e este documento. Todas têm `default_behavior: PAUSE`.

- **P1:** a leitura de Entregas deve ser um só instantâneo (RR)?
- **P2:** a quarentena deve aparecer na leitura, com event_id e motivo?
- **P3:** o desempate final de `projetar` deve ser por bytes (muda o replay)?

---

## 8. CODE_READY · TEST_PASS · BLOQUEIOS

**CODE_READY.** Somente testes, CI e documento:

| Arquivo | Papel |
|---|---|
| `tests/product/q026-adversarial-comum.ts` | ganchos de escrita e "um só instantâneo", só teste |
| `tests/product/run-q026-snapshot-adversarial-pg.ts` | S1–S8 |
| `tests/product/run-q026-cursor-adversarial-pg.ts` | C0–C16, com as réplicas `43b6ad8` e `dc0cd2f3` e o candidato |
| `tests/product/run-q026-adversarial-mutacoes.ts` | 19 mutantes. Cada um tira de um caso o mecanismo que ele afirma provar e precisa derrubá-lo |
| `.github/workflows/deliveryos-q026-snapshot-adversarial.yml` | job isolado com PG 16 descartável; push nesta branch + `workflow_dispatch` |
| este documento | |

**TEST_PASS local** (PostgreSQL 16.15, C.UTF-8):

- Instantâneo **11/11** e cursor **21/21**, idênticos em três reexecuções, inclusive os achados de
  ordem física.
- Mutações **19/19 mortos, 0 cegos**. O primeiro rascunho tinha **1 cego**: o C9 derivava o valor
  esperado do próprio nível de isolamento. Foi corrigido com rodadas explícitas, e é a razão de o gate
  existir.
- Sem `DELIVERYOS_PG_URL`, as três saem **78**, PULADAS em voz alta.
- `tsc --noEmit` do projeto verde, e tipagem `--strict` dos 4 arquivos verde.
- `test:platform:governanca` **GREEN** (14 guardas) com os arquivos novos.

**TEST_PASS CI:** registrado no PR draft. Um commit que registrasse o run aqui dispararia outro.

**BLOQUEIOS e NOT_RUN:**

- Dado de produção, aparelho físico e HTTP real: NOT_RUN, fora do escopo SHADOW.
- Benchmark de memória ou CPU: não feito, proibido pela issue e coberto pelo PR #33.
- Inchaço de tabela: não medido, só o horizonte (S8).
- C16 depende do algoritmo de sort do PG 16; em outra versão maior pode não reproduzir, e o teste
  então **falha alto**, nunca passa calado.
- A linha do `MISSION_LEDGER` e as perguntas formais aguardam decisão do César, porque a missão
  restringe a entrega.

---

## 9. Achado lateral, fora do escopo e não corrigido: atomicidade do executor de migrations

Achado pelo ruído do CI, sem relação com a Q-026. Fica registrado porque mexe com o banco operacional.

- **Fato (código):** `migrations/runner.ts:127-134` aplica cada migration dentro de
  `client.transaction(...)`: o corpo e o registro em `platform.schema_migration` deveriam confirmar
  juntos. Mas `0001`, `0002`, `0006`, `0007` e `0008` trazem `BEGIN; … COMMIT;` próprios.
- **Fato (medido):** o PostgreSQL registra, por banco migrado, `WARNING: there is already a transaction
  in progress` seguido de `WARNING: there is no transaction in progress`, um par por arquivo. No log do
  job do CI eram 4.106 linhas `WARNING` (e 830 `LOG` de checkpoint, na maior parte dos `CREATE
  DATABASE`). Pela semântica do PostgreSQL, o `COMMIT` do arquivo fecha a transação do executor. O
  `INSERT` em `schema_migration` roda então fora de transação, e o `COMMIT` final do executor não tem o
  que confirmar.
- **Hipótese (não reproduzida):** se o processo cair entre o `COMMIT` do arquivo e o registro, a
  migration fica aplicada sem estar registrada e roda de novo no boot seguinte. As migrations foram
  feitas para serem reexecutáveis (`run-migration-reexec-tests.ts`), o que atenua.
- **Não feito:** nenhuma migration, nenhum runtime. Corrigir é decisão do César, porque migrations
  estão fora desta missão. O workflow desta branch passa a pedir `log_min_messages = error` ao servidor
  descartável, para que esse ruído não tire a saída das suítes da janela de leitura do log.

## 10. Reproduzir

```bash
export DELIVERYOS_PG_URL=postgres://<admin>@<host-descartavel>/postgres   # nunca o operacional
npx tsx tests/product/run-q026-snapshot-adversarial-pg.ts   # Q026_SNAPSHOT_ADVERSARIAL: 11/11 PASS
npx tsx tests/product/run-q026-cursor-adversarial-pg.ts     # Q026_CURSOR_ADVERSARIAL: 21/21 PASS
npx tsx tests/product/run-q026-adversarial-mutacoes.ts      # Q026_ADVERSARIAL_MUTACOES: 19/19 mortos, 0 cegos
```

Cada suíte cria e destrói os próprios bancos (`banco-isolado.ts`). A suíte de mutações escreve os
mutantes num diretório temporário e não toca o repositório.
