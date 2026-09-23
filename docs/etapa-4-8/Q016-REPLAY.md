---
lifecycle:
  artefato: docs/etapa-4-8/Q016-REPLAY.md
  status: ACTIVE
  authority_scope: q016_replay_operacao_viva
  superseded_by: null
  atualizado_em: "2026-09-23"
  state_basis: 47c8060
  question_refs: ["Q-015", "Q-016", "Q-017"]
---

# Q-016 — A projeção da Operação Viva sobrevive ao reinício

> Base: `baa46e358e0753a6b2714160689a27184277276f`.
> Decisão do César: **`platform.event_log` governa a reconstrução, e o runtime
> assíncrono a executa no boot, antes do laço da outbox.** Autorizar isso não
> autoriza inventar informação ausente.
>
> Critério: matar e reiniciar o runtime assíncrono não pode apagar o
> conhecimento operacional já derivável dos fatos duráveis, e reconstruí-lo
> nunca pode exigir inventar informação que o event log não preservou.

| fase | commit | prova |
|---|---|---|
| 1 · o gap, provado antes de corrigir | `9ebe5ea` | 7/7 |
| 2 · contrato durável de `source_mode` | `6c17640` | 16/16 |
| 3 · porta de leitura do event log | `8c33001` | 26/26 |
| 4, 5, 6 · boot, efeitos, restart real | `988ea8b` | 13/13 com binários de `dist/` |
| 7 · mutações | `47c8060` | 12 mutações, zero cegas |
| 8 · Q-016 respondida, regressão | este documento | ver §8 |

Os números da tabela são os de cada commit. P11 e A6 entraram na Fase 7, porque
duas mutações seriam cegas sem eles (§7): no estado final, `test:platform:q016`
tem **27** provas e `test:platform:q016:processos` tem **14**.

---

## 1 — O gap, provado antes de qualquer correção

O comentário do `async-runtime` afirmava: "`reconstruirPorReplay` a recompõe.
Um reinício do worker não perde nada". Nenhuma linha de código chamava a
função. E mesmo que chamasse, faltava o dado: o `EventEnvelope` carregava
`source_mode`, a mensagem da outbox carregava, e o `platform.event_log` não.

A prova não leu código à procura de coluna ausente. Ela **ingeriu** fatos pelo
caminho real — `ingerir()` com o `PgTransactionalWriter` que o binário crítico
usa — contra PostgreSQL real, num banco isolado.

Dois fatos iguais em tudo que o domínio descreve, diferentes só no modo. No
event log eles eram **a mesma linha**. O que dá sentido a isso são dois
controles:

- **G4** — a comparação ENXERGA diferença que o log preserva: dois fatos
  diferindo em `sequence` saem diferindo exatamente em `sequence_local`;
- **G2** — a diferença de modo EXISTIA na entrada: na outbox, os dois diferem
  exatamente em `source_mode`.

Sem G4, "as linhas são iguais" poderia ser só uma comparação cega. Sem G2,
poderia ser que os modos nunca diferiram. Com os dois de pé, G5 significa:
nenhuma função da linha devolve o modo certo para os dois fatos.

## 2 — O contrato durável

Migration `0003_event_log_source_mode.sql`, aditiva. Três escolhas:

1. **Coluna anulável, sem default.** `DEFAULT 'real'` faria o simulado virar
   real na ausência do campo — a violação que L9 nomeia.
2. **Obrigatória para fato novo, pelo banco:**
   `CHECK (source_mode IS NOT NULL AND source_mode IN ('real','simulated','control')) NOT VALID`.
   Vale para qualquer escritor, como o append-only. `NOT VALID` isenta o que
   já existia. O tipo recusa antes: o compilador apontou exatamente os dois
   fixtures que construíam fato sem modo.
3. **Nenhum backfill.** Preencher o histórico exigiria `UPDATE` no log, que a
   trigger de L3 recusa (H3). E não há registro durável de onde o modo antigo
   saia com prova: a outbox é mutável — H5 reescreve `simulated` para `real` sem
   deixar rastro. Histórico fica `NULL`, e `NULL` significa **UNKNOWN**.

Com o mesmo instrumento e os mesmos fatos da Fase 1, onde a comparação dava
`[]` ela passou a dar `["source_mode"]` (C5), e a linha do log reconstrói o
envelope **sozinha**, sem emprestar nada da outbox (C7).

**H7 fechou um risco que só apareceu ao desenhar:** se o restore recriasse a
restrição como válida, o histórico nulo a violaria, e todo backup tirado depois
da 0003 num ambiente com histórico seria irrecuperável. `pg_dump`/`pg_restore`
reais: restaura, a restrição volta **não validada**, e o banco restaurado segue
recusando fato sem modo.

O banco compartilhado de teste recebeu a 0003 pelo binário oficial de migrate
("1 aplicada, 2 já estavam") e mostrou o caso real: 4 linhas históricas, todas
`NULL`, intocadas.

### Três testes existentes caíram na mesma armadilha, e nenhum foi afrouxado

O CHECK de modo roda antes de trigger, índice único e outbox. Em
`test:platform:pg` e `test:platform:backup`, fixtures sem modo passaram a ser
recusadas **pelo motivo errado**: o DELETE "passava" porque o INSERT de
preparação nem tinha entrado; o teste de unicidade recebia erro de CHECK; o de
transação falhava no fato em vez de na outbox. Aceitar qualquer recusa na regex
teria deixado os três verdes medindo nada. A correção foi dar a cada fixture um
modo **válido**, para que a única razão de recusa fosse a invariante que o
teste promete. `test:platform:pg` passou a aplicar todas as migrations e ficou
17/17 no banco compartilhado e num banco limpo.

## 3 — A porta de leitura

`src/platform/projections/replay-do-event-log.ts`. Existe para ler, e cada
garantia tem um mecanismo, não uma intenção:

| garantia | mecanismo |
|---|---|
| nunca escreve | transação `READ ONLY` declarada ao PostgreSQL — MQ8 mostra o banco recusando |
| modo nunca inventado | `NULL` fica fora e é contado (`sem_modo`); fora do contrato é corrupção, com motivo |
| um reconstrutor só | o envelope sai de `envelopeDaMensagem`, a mesma função do consumo vivo (P5) |
| sem dependência de ordem | sem `ORDER BY`; P7 prova com ordens **comprovadamente** diferentes da original |
| a fonte é o log | P11: outbox purgada e adulterada não mudam uma vírgula da leitura |

**O que o log não preserva, declarado.** `occurred_at` é `timestamptz`: o log
guarda o **instante**, não a grafia. `"09:00:00-03:00"` volta como
`"12:00:00.000Z"` (P6). A projeção compara instantes, e a equivalência é medida
em instantes. `sequence_local` é `BIGINT` e o driver devolve texto; sem
conversão explícita, a sequência se perderia e o envelope relido desempataria
diferente do vivo (P4).

## 4 — O boot

```
banco → migrations → Operação Viva montada → fatos aptos lidos
      → reconstruirPorReplay → resultado registrado → SÓ ENTÃO o laço
```

O `AsyncRuntime` passou a ser **construído** depois do replay: nenhum tick
consome a fila sobre memória vazia.

### Recusar ou subir degradado — decidido por evidência

| situação | comportamento | por quê |
|---|---|---|
| log ilegível (schema sem a 0003, banco inacessível) | **recusa o boot, 78** | o replay não produz nada; subir mostraria projeção feita só de fatos pós-reinício como se fosse completa. É corrigível, a outbox guarda o backlog, e o crítico não depende deste processo (L1) |
| linha corrompida (modo fora do contrato) | **sobe DEGRADADO, declarado** | o log é append-only (L3): a linha nunca será corrigida. Recusar o boot por ela deixaria o worker permanentemente incapaz de subir |
| histórico sem modo | estado **completo**, UNKNOWN contado | não é falha: é o que a 0003 classificou |

Os três comportamentos estão provados com o binário real (A3, A4, A5).

## 5 — Os efeitos

Replay reconstrói estado derivado. Com processo real (B1): nenhuma linha nova
no log, nenhuma mensagem, nenhum job, nenhuma entrada na inbox, nenhuma
tentativa ou estado de mensagem antiga alterado — uma `dead` com 5 tentativas e
uma `done` atravessam o boot intactas.

Por estrutura (A0): o crítico **não** alcança nenhuma das duas peças do replay;
o fecho do replay tem duas dependências externas, numa **lista permitida** —
`pg` (o canal de leitura, travado em READ ONLY) e `node:crypto` (o digest,
computação pura).

### Um ponto cego do grafo de imports, fechado com impacto zero medido

A primeira medição disse "nenhum especificador externo" no fecho do replay, que
inclui `sql-client.ts` — e ele carrega o driver com `await import("pg")`. A
regex compartilhada não casava `import()` dinâmico: um falso negativo
exatamente na pergunta "este código alcança I/O?". O percurso do grafo tinha o
mesmo ponto cego para `import("./x")` relativo — hoje latente (o único
`import()` de produção é o do `pg`), e um falso verde no primeiro módulo
carregado assim. Corrigido no módulo único, para percurso e extração; o
carimbo de build, que hasheia os fechos dos três binários, ficou **idêntico**
antes e depois.

## 6 — O restart real

Como comparar a projeção de dois processos que nunca calculam no mesmo
instante? `projetar` é função pura de (fatos, relógio): memória igual por
escopo implica projeção igual para **qualquer** relógio. O binário passou a
registrar, no replay e em cada passada produtiva, um resumo verificável da
memória — fatos, digest (com `occurred_at` normalizado para instante) e
histograma de frescor — e os contadores do consumo vivo.

Sequência com três modos, duas unidades, duplicata e fora de ordem. O primeiro
processo consome e desliga. **Com ninguém rodando**, um GPS gravado a 115 s
cruza a janela de 120 s. Um processo novo, do zero:

| | prova |
|---|---|
| C2 | antes de qualquer fato novo, memória idêntica escopo a escopo |
| C3 | o GPS chega `aging` — frescor contra o relógio de agora, nunca congelado |
| C4 | modos e unidades continuam separados |
| C5 | fato novo é aplicado uma vez, só no próprio escopo |
| C6 | um terceiro boot reconstrói o que o segundo tinha |

**A2 é a prova de identidade entre as duas reconstruções:** mensagens
PENDENTES de fatos já relidos são contadas como duplicatas (`aplicados: 0`). Se
o envelope relido tivesse outra chave ou outro escopo, a mensagem seria
aplicada de novo — e sem os contadores da ponte isso seria invisível, porque a
memória é um mapa por chave.

**A6 decide a corrida de propósito:** uma sessão segura `LOCK` exclusivo no
`event_log` enquanto o worker sobe. O código certo fica parado no replay.

## 7 — Mutações

`npm run test:platform:q016:mutacoes` — 12 mutações, **zero cegas**, cada uma
restaurando um defeito e exigindo que o gate caia pelo ID exato do teste certo:

| | mutação | caiu em |
|---|---|---|
| MQ1 | escritor deixa de gravar o modo | C1 — o banco recusa a ingestão |
| MQ2 | ... e a obrigatoriedade some | C5 — o log volta a igualar os modos |
| MQ3 | restrição criada validada | H1 — a migration morre sobre histórico |
| MQ4 | porta defaulta ausente para real | P2 — UNKNOWN deixa de ser contado |
| MQ5 | migration com `DEFAULT 'real'` | C3 — "a coluna tem DEFAULT ('real'::text) — coerção silenciosa" |
| MQ6 | memória mistura os modos | P8 — "(simulated) caiu no escopo real" |
| MQ7 | porta lê da outbox | P11 — "a leitura mudou quando só a outbox mudou" |
| MQ8 | porta emite outbox dentro da leitura | o banco: "cannot execute INSERT in a read-only transaction" |
| MQ9 | boot emite outbox fora da leitura | B1 — "o replay alterou log, fila, job ou inbox" |
| MQ10 | replay depois de o consumo começar | A6 — "o worker consumiu a fila com o replay bloqueado" |
| MQ11 | fato relido com identidade própria | A2 — a mensagem pendente é reaplicada |
| MQ12 | frescor com o relógio do último fato | C3 — "o frescor ficou congelado no estado antigo" |

**Duas provas foram escritas porque duas mutações seriam cegas.** "Reconstruir
da outbox" seria pega só por acaso, e nenhum teste afirmava a decisão em si —
daí P11. "Replay depois do consumo" deixa o programa em corrida, e quando o
replay ganha, A1 passa com o defeito no lugar — daí A6, que decide a corrida
com um `LOCK`.

## 8 — Regressão

48 gates, cada um isolado, com PostgreSQL 16.13 real, sobre a árvore final.

```
PASS: 44   FAIL: 4
```

| classificação | quais |
|---|---|
| PASS | 44 — inclui `q016`, `q016:processos`, `pb19`, `spine:processos`, `test:lab` e as mutações de D4 |
| FAIL_PREEXISTENTE | `governanca` (G6b + G9), `governanca:mutacoes` (cascata: exige `governanca` verde antes de mutar), `entregas` (fixture com data fixa, **idêntica** ao baseline C0) |
| BLOCKED | `m1b-perceptual` — exige servidor M1 na 5292, `ECONNREFUSED` |
| **FAIL_NOVO** | **0** |

Mais, à parte por custo: `test:platform:q016:mutacoes` e `test:platform:pb19:mutacoes`,
registradas no fim desta seção.

**Sobre o G6b, sem arredondar.** A falha é a mesma de sempre — a base declarada
do `STATE.json` (`274141e`) está obsoleta desde antes do C0. O **texto** mudou:
ele cita o último commit que tocou um caminho observado pelo `STATE.json`, e
esses caminhos são `src/product/`, `src/perfil-delivery/` e `labs/`. A D4
(`baa46e3`) mexeu em `labs/`, então a mensagem passou de `9e738b1` para
`baa46e3`. A Q-016 não toca nenhum dos três. Não é mais "byte a byte igual ao
C0", e está dito aqui por que.

### Uma falha nova apareceu, e foi fechada na classe

A primeira regressão desta fase deu 43/48: `spine:processos` caiu no P5, "a
espinha não enxergou os dois escopos". Ele tinha passado mais cedo nesta mesma
missão, então "pré-existente" estava descartado de saída.

O P5 espera exatamente dois escopos e presumia que o worker começa só com as
mensagens do próprio teste. Depois da Q-016 o worker — corretamente —
reconstrói do event log no boot, e o banco compartilhado tinha fatos de outras
suítes. Passava ou caía conforme a **ordem** das suítes: o `backup` faz
`TRUNCATE` no log compartilhado, e o `pb19` grava GPS nele.

Reproduzido de forma determinística num banco isolado: limpo, **7/7**; o mesmo
banco com **um** fato alheio plantado, **6/7**, com a mensagem exata da
regressão.

É a mesma classe do defeito que o PB19 corrigiu nesta suíte (25 mensagens
alheias na outbox). Aquela correção tratou o sintoma daquela vez; esta trata a
classe: a suíte passou a criar banco próprio e apagá-lo no fim
(`src/platform/banco-isolado.ts`, generalizado a partir do suporte da Q-016).
Provado no cenário que reprovava: **7/7 apontada para o banco contaminado**, e
nenhum banco isolado deixado para trás. A regressão final, acima, já roda com a
correção.

### As suítes adversariais, sobre a árvore final

| suíte | resultado |
|---|---|
| `test:platform:q016:mutacoes` | 14/14 — 2 controles positivos e 12 mutações, **zero cegas** |
| `test:platform:pb19:mutacoes` | 14/14, **zero cegas** — a 0003 e o replay não desfizeram nada do PB19 |

### O teste de fogo da D4, de passagem

A regressão inteira roda `test:lab`, que sobe o navegador de verdade. Depois
dela, `git status` trouxe só as edições desta missão: os 12 PNGs versionados
continuam intocados.

## 9 — O que fica aberto, e onde

- **Q-015 continua aberta.** O estado PRÓPRIO da Intelligence Spine —
  `anteriores`, `passadas`, `ultima_em` — continua em memória e não sobrevive a
  reinício. O comentário do `C3.4-5` atribuía essa lacuna à Q-016; ele foi
  corrigido para a Q-015, e a asserção não mudou.
- **Q-017 aberta por esta missão.** `src/platform/bin/critical.ts` faz
  `process.env.DELIVERYOS_SOURCE_MODE ?? "real"`, contra o próprio comentário e
  contra a interface da rota, e nenhum arquivo de deploy declara a variável. Na
  composição oficial, todo fato é carimbado `real` por padrão — e desde a Q-016
  esse carimbo é durável. Medido: os 2 GPS gravados pelo binário crítico nos
  gates do PB19 estão `real` sem que nada os tenha declarado. Mudar exige tocar
  o caminho crítico e a composição, que esta missão não autorizava.
- **Crescimento da memória.** A memória da projeção guarda todo fato desde
  sempre, e o replay a recompõe inteira a cada boot. Isso é anterior à Q-016 —
  o consumo vivo já crescia sem teto — e retenção não foi pedida nem escolhida
  aqui.
