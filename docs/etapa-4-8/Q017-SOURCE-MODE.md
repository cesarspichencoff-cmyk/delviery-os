---
lifecycle:
  artefato: docs/etapa-4-8/Q017-SOURCE-MODE.md
  status: ACTIVE
  authority_scope: q017_source_mode_da_instancia
  superseded_by: null
  atualizado_em: "2026-09-23"
  state_basis: 847be0c
  question_refs: ["Q-015", "Q-016", "Q-017"]
---

# Q-017 — Nenhum fato é real por esquecimento

> Base: `b52c57284ac51d9da5cb1e7ae0ef4bd923c70e42`.
>
> Decisão do César: **na ausência de `DELIVERYOS_SOURCE_MODE`, o runtime
> crítico RECUSA o boot. Não existe mais default implícito para `real`.**
>
> **AUSENTE ≠ REAL · UNKNOWN ≠ REAL · DEFAULT ≠ ATESTAÇÃO.** Um fato só pode
> receber `source_mode = real` porque uma configuração operacional declarou
> explicitamente que aquela instância produz fatos do mundo real.
>
> Critério: pelos caminhos oficiais do sistema, tem de ser impossível um fato
> ganhar o rótulo durável `real` só porque ninguém declarou o modo do runtime.

`source_mode` descreve a **natureza da evidência** — real, simulada ou braço
de controle —, não o mecanismo que a capturou. Esta missão não decidiu nem
tocou em como o DeliveryOS adquire dado (iFood Gestor, Teknisa, Odhen, tela,
UI Automation, spooler, API oficial): a arquitetura de aquisição continua
**source-agnostic**, e `real` continua sem significar "veio da API oficial".

| fase | commit | prova |
|---|---|---|
| 1 · o defeito, provado antes de corrigir | `2364a2d` | 4/4 com binário e PostgreSQL |
| 2 a 5 · recusa, escopo, boot declara, provas | `ad16635` | `test:platform:q017` 18/18 |
| 6a · a composição exige, só no crítico | `1296bca` | `test:platform:q017:compose` 7/7 |
| 6b · a composição em containers | `aeb3ed3` | `tools/q017_compose_real.sh` 31 medidas |
| 7 · mutações | `847be0c` | 15 mutações, zero cegas |
| 8, 9 · regressão, Q-017 respondida | este documento | ver §6 |

---

## 1 — O defeito, provado antes de corrigir

`bin/critical.ts` em `b52c572`:

```ts
const modoBruto = (process.env.DELIVERYOS_SOURCE_MODE ?? "real").trim();
```

Medido com o binário compilado, ingestão HTTP real (aparelho cadastrado,
token assinado) e PostgreSQL real, em banco isolado:

| `DELIVERYOS_SOURCE_MODE` | sobe | `event_log` | outbox |
|---|---|---|---|
| **ausente** | **sim** | **`real`** | **`real`** |
| `simulated` | sim | `simulated` | `simulated` |
| `control` | sim | `control` | `control` |
| `real` | sim | `real` | `real` |
| `""`, `"   "`, `REAL` | não, exit 78 | — | — |

**Defeito de DEFAULT, não de PROPAGAÇÃO.** O controle positivo (os três modos
declarados chegando intactos) é o que permite a distinção: o modo declarado
não se perde no caminho; o modo **ausente** vira um.

**A premissa era mais larga que o defeito.** Vazio, só espaço e maiúsculas já
saíam 78; só a *ausência* (`undefined`, pelo `??`) virava `real`.

**O boot não dizia o modo.** Nenhuma linha `[critico]` mostrava o que a
instância estava autorizada a gravar.

### O mecanismo causal

O contrato do envelope **já** recusava a ausência — `event-catalog.ts`:
*"NÃO existe valor padrão. A ausência do campo é recusada na validação"*, e
`eventos.schema.json`: `"padrao": "NENHUM — a ausência é recusada"`. O padrão
da instância entrava **antes** de o envelope existir: o validador recebia um
`real` bem formado e não tinha como saber que ninguém o declarou. A defesa
estava no lugar errado para esse defeito — por isso a correção mora na borda
da configuração, e não no validador.

Desde a Q-016 o modo fica gravado em `platform.event_log`, sobrevive a
reinício e governa a reconstrução da Operação Viva. O padrão deixou de ser um
valor em memória e virou carimbo durável com cara de atestação.

---

## 2 — A correção

### Recusa antes de qualquer efeito

`src/platform/config/modo-da-instancia.ts` — `lerModoDaInstancia(env)`:

| entrada | resultado |
|---|---|
| ausente | `ModoDaInstanciaInvalido("ausente")` |
| vazio ou só espaço | `ModoDaInstanciaInvalido("vazio")` |
| fora de `real`, `simulated`, `control` — `REAL`, `prod`, `true`, `unknown`, listas | `ModoDaInstanciaInvalido("invalido")` |
| `real`, `simulated`, `control` | o valor declarado |

Diferença de maiúsculas conta. Só o espaço **em volta** é removido, como em
toda variável de `platform-config.ts`: `" simulated\n"` declara `simulated`,
espaço sozinho não declara nada.

`ModoDaInstanciaInvalido` **é** um `ConfigError`: o crítico trata a recusa pelo
mesmo caminho da configuração — mensagem e `exit 78` — **logo depois de
`loadPlatformConfig`, antes de conexão, migration e porta**.

**Melhor que o desenho previsto, por causa da evidência.** A missão pedia
exit 78; a medida mostrou que o código antigo conferia o modo **depois** de
conectar ao banco e de aplicar migrations. A recusa foi para antes de
qualquer efeito, e isso está provado com controle positivo (A2, A3 abaixo).

Valor inválido é ecoado no log só se for curto e só letras (`"REAL"`, que é o
que diagnostica o erro). Qualquer outra coisa — uma URL com senha, um segredo
colado na linha errada do `.env` — aparece só pelo tamanho.

### O boot declara o modo

```
[critico] iniciando {"ambiente":"pilot","banco":"postgres://deliveryos-postgres:5432/deliveryos", … ,"source_mode":"simulated"}
```

O banco aparece sem usuário e sem senha (`describe()`, inalterado); o
segredo de aparelho não aparece.

### Escopo

- `deploy/compose.platform.yaml`: `DELIVERYOS_SOURCE_MODE:
  ${DELIVERYOS_SOURCE_MODE:?source mode obrigatorio}` **só** em
  `deliveryos-critical`, nunca em `x-ambiente`. O assíncrono não lê a
  variável: o modo de cada fato que ele consome ou reconstrói vem do fato.
- `deploy/.env.platform.example`: a variável **vazia**, com os três valores e
  o significado de cada um. Nenhum `DELIVERYOS_SOURCE_MODE=real` em lugar
  nenhum.
- `docs/cloud/FUNDACAO_NUVEM.md`: a exigência, para quem hospedar fora da
  composição.

### Quem dependia do padrão — e o motivo errado que isso criaria

Todo lugar que subia o crítico sem modo passou a declarar **`simulated`**
(tudo ali é sintético — `control` é braço de experimento, não teste):
`run-pb19-deploy-tests.ts` (`bootQueDeveMorrer`), `tools/pb19_ingestao_real.js`
e `spine:processos` P4.

Sem isso, os controles negativos do PB19 — contrato ausente, corrompido,
incompatível; segredo ausente ou curto — passariam a morrer 78 **pelo motivo
errado**. Eles já conferiam o motivo, e reprovariam; o **D2-6** não: ele só
conferia que o segredo não vazou, e com a recusa nova antes do contrato ele
passaria sem ter medido nada. Agora exige morrer no contrato. O **D3b-3**
passa a exigir `MODO=simulated` no banco.

---

## 3 — Provas com binários e PostgreSQL (`test:platform:q017`, 18/18)

Binários de `dist/`, GPS pelo caminho HTTP real, PostgreSQL real, banco
isolado por prova. `U` roda sem processo.

| ID | propriedade |
|---|---|
| U1–U4 | o leitor: ausente, vazio, inválido recusados; os três declarados aceitos |
| U5 | **propriedade**: só a declaração de `real` produz `real` — nenhuma outra entrada do corpus |
| U6 | valor com cara de credencial não é ecoado |
| A1 | ausente: exit 78, motivo no log, nunca escuta, nada responde na porta, nenhum fato |
| A2 | ausente com `MIGRATE_ON_BOOT=true` num banco **vazio**: o banco fica vazio · **controle**: declarado, o mesmo boot migra |
| A3 | ausente com banco **inalcançável**: 78 do modo · **controle**: declarado, o mesmo processo morre em `ECONNREFUSED` dentro de `runMigrations` (exit 1) — a recusa vem antes da conexão |
| B1 | vazio, espaços, tab: 78 |
| C1 | `REAL`, `prod`, `true`, `unknown`, `real,simulated`: 78 |
| C2 | inválido com senha dentro: 78, e a senha não aparece |
| O1 | o boot declara cada um dos três modos |
| O2 | boot **saudável** (ingerindo), com senha na URL do banco: nem a senha nem o segredo aparecem |
| D/E/F-1 | `real`, `simulated`, `control`: cada fato gravado com o **seu** modo, no log e na outbox |
| D/E/F-2 | o assíncrono, reiniciado **duas** vezes, reconstrói cada fato só no seu modo; a segunda memória é idêntica à primeira |
| G1 | crítico `simulated` grava A; crítico `real` grava B; **o ponto de A reenviado ao crítico `real` volta `duplicado`**; A continua `simulated`, sem segunda linha; o replay é o mesmo com a variável **vazada de propósito** para o assíncrono (ausente, `real`, `control`) |
| H1 | histórico anterior à 0003 continua `NULL` e fora do replay (`sem_modo_unknown: 2`) com um crítico `real` gravando **na mesma unidade**; nenhum backfill |

G1 mede uma escolha que já estava no schema e agora está provada: a
idempotência é da chave do ponto (`UNIQUE (idempotency_key)`), não do modo.
O primeiro rótulo durável vence; um processo com outro modo não cria uma
cópia reclassificada.

---

## 4 — A composição

### Pelo renderizador do compose (`test:platform:q017:compose`, 7/7)

Pelo `docker compose config --format json` — o ambiente que cada container
**recebe** depois da interpolação, nunca leitura do YAML. Não precisa de
daemon.

| ID | propriedade |
|---|---|
| K1 | ausente: `config` recusa nomeando a variável · **controle**: o mesmo arquivo com o modo renderiza |
| K2 | vazio, espaços, tab: o compose apara e o `:?` recusa |
| K3 | `real`, `simulated`, `control`: o crítico recebe exatamente o declarado |
| K4 | dos cinco serviços, só `deliveryos-critical` recebe a variável |
| K5 | `REAL` e `prod` passam **sem normalização** — o compose garante presença, o crítico garante validade |
| K6 | `.env` hostil (`real`) no diretório do projeto não entra com `--env-file` · **controle**: sem `--env-file`, entra |
| K7 | o exemplo versionado traz a variável vazia; preenchido o resto, a composição recusa |

Medido antes de escrever a suíte: **variável exportada no shell vence o
`--env-file`**, e um `deploy/.env` local entra sem ele. Por isso o compose
roda com ambiente saneado (só `PATH` e `HOME`) e arquivo próprio — sem isso,
o caso "ausente" mediria a máquina de quem roda.

### Em containers (`tools/q017_compose_real.sh`, 31 medidas)

Imagem construída de `1296bca`; o hash das fontes do carimbo dentro dela
(`036b75ae…`) é idêntico ao do build local da mesma árvore. Estágio `build`,
pelo bloqueio de repositório Debian já declarado no PB19
(`compose.sandbox.override.yaml`, que muda só o `target`).

| bloco | medido |
|---|---|
| N1 | `up` sem modo: compose recusa; **nenhum** container criado |
| S | `simulated`: crítico healthy, boot declara `simulated`; no ambiente **efetivo** dos cinco containers, só o crítico tem a variável; GPS aceito |
| G | crítico recriado `real`: boot declara `real`; B aceito; o ponto de A reenviado volta `duplicado`; no log A=`simulated`, B=`real`; outbox `simulated,real` |
| R | assíncrono reiniciado: replay `completo`, `Q17C\|real:1`, `Q17C\|simulated:1` |
| N2 | a **imagem**, contornando o compose: ausente 78 com motivo, vazio 78 · **controle**: a mesma imagem com `control` escuta |
| N3 | `REAL` passa pelo compose e o crítico entra em ciclo: exit 78, nunca healthy, nunca escuta — **8 reinícios em 20 s** |
| fim | 2 fatos no log — nenhuma recusa gravou nada |

**Patrimônio inalcançável.** A composição usa nomes fixos de volume
(`deliveryos-platform-pgdados`) e a ferramenta termina em `down -v`. Rodada
numa máquina com composição real, apagaria o banco. Por isso ela **recusa
rodar** (exit 2) se existir qualquer container `deliveryos-*` ou volume
`deliveryos-platform-*`. Provado: volume oficial vazio com uma marca →
`RECUSADO`, exit 2, marca intacta. Ela também recusa imagem de outro código.

---

## 5 — Mutações

`test:platform:q017:mutacoes` — **17/17: 2 controles positivos e 15
mutações, zero cegas.** Âncora conferida com ocorrência única, disco relido,
`dist/` apagado antes de todo build que exercita binário, restauração byte a
byte por SHA-256 — e conferida de novo por fora, ao fim: os seis arquivos
mutados voltaram idênticos à origem. Gate que PULA não conta como verde.
Nenhum detector procura palavra no código.

| ID | defeito devolvido | acusaram |
|---|---|---|
| M1 | `?? "real"` volta ao crítico — o defeito **original**, validação intacta | A1 A2 A3 |
| M2 | padrão `real` no **helper** (o leitor do modo) | U1 U5 A1 A2 A3 |
| M2b | padrão `real` na **config** — `loadPlatformConfig` o injeta no ambiente | A1 A2 A3 |
| M3 | compose `${DELIVERYOS_SOURCE_MODE:-real}` | K1 K2 K6 K7 |
| M3b | compose deixa de passar a variável ao crítico | K1 K2 K3 K4 K5 K6 K7 |
| M4 | vazio cai para `real` | U2 U5 B1 |
| M5 | valor desconhecido aceito — e vira `real` | U3 U5 U6 C1 C2 |
| M6 | instância `simulated` persiste o fato como `real` | D/E/F-1 D/E/F-2 G1 |
| M7 | instância `control` persiste o fato como `real` | D/E/F-1 D/E/F-2 |
| M8 | o replay reclassifica o fato antigo pelo modo do **processo** atual | G1 H1 |
| M9 | histórico `NULL` lido como `real` | H1 |
| M10 | a variável vaza para `x-ambiente` | K4 |
| M11 | o boot deixa de declarar o modo | O1 |
| M12 | a recusa volta para **depois** de conectar e migrar — a ordem antiga | A1 A2 A3 O1 |
| M13 | o erro volta a ecoar o valor inteiro | U6 C2 |

M1–M10 são as dez pedidas; M2b, M3b, M11, M12 e M13 foram acrescentadas
porque cada uma ataca um jeito diferente de a mesma propriedade cair.

Onde duas camadas deveriam acusar, a assinatura exige **as duas** — M2, M4, M5
e M13: a função e o binário que a chama. Duas leituras que só as mutações
dão:

- **M2b mostra por que a camada de processo existe.** Um padrão injetado pela
  configuração não aparece no teste da função, que recebe o ambiente pronto.
  Só o binário — que passa pela config antes do leitor — acusa.
- **M12 mostra por que A2 e A3 existem.** A ordem antiga sai 78, com o motivo
  certo, e mesmo assim depois de conectar e migrar. Só o banco vazio que
  deixou de estar vazio (A2) e a conexão tentada (A3) enxergam isso.

---

## 6 — Regressão

50 gates, cada um isolado, com PostgreSQL 16.13 real, sobre a árvore de
`847be0c` — os 48 da Q-016 mais `q017` e `q017:compose`.

```
PASS: 46   FAIL: 4
```

| classificação | quais |
|---|---|
| PASS | 46 — inclui `q017`, `q017:compose`, `pb19`, `q016`, `q016:processos`, `spine:processos`, `spine:mutacoes` (âncoras MS8/MS9 no `critical.ts` intactas), `deploy`, `test:platform` e `test:lab` |
| FAIL_PREEXISTENTE | `entregas` — `impossible_timestamp` em fixture de GPS com data fixa, dentro de `src/entregas/` (Preservation Set); log **idêntico** ao da Q-016 a menos do nome aleatório de um diretório temporário |
| FAIL_PREEXISTENTE | `governanca` — G6b (`STATE.json`, desde antes do PB19) e G9 (`Q-014`), mais o **G6c nascido em `b52c572`**, a base desta missão (§7) |
| FAIL_PREEXISTENTE | `governanca:mutacoes` — cascata: só muta com a governança verde; a única linha diferente da Q-016 é o G6c |
| BLOCKED | `m1b-perceptual` — exige servidor M1 na 5292, `ECONNREFUSED`; log idêntico ao da Q-016 |
| **FAIL_NOVO** | **0** |

O log da governança da regressão da Q-016 registra `HEAD 47c8060` — a
confirmação, dentro da própria evidência de então, de que ela rodou antes do
commit de documentos que criou o G6c.

### As suítes adversariais, sobre a árvore final

| suíte | resultado |
|---|---|
| `test:platform:q017:mutacoes` | 17/17 — 2 controles positivos e 15 mutações, **zero cegas** (§5) |
| `test:platform:pb19:mutacoes` | 14/14, **zero cegas** — as âncoras do PB19 no `critical.ts` e no compose sobreviveram à Q-017 |
| `test:platform:q016:mutacoes` | 14/14, **zero cegas** — nada do replay da Q-016 foi desfeito |

Depois das três, os seis arquivos que a suíte da Q-017 muta foram conferidos
por fora contra o SHA-256 de antes: idênticos; `git status` limpo.

### Governança depois do commit desta fase

Medida com `HEAD 40796dd` — o commit que trouxe este documento —, árvore
limpa:

```
HEAD 40796dd · 30 artefatos com lifecycle · rota de 20 caminhos
G6b FALHOU: docs/execution/STATE.json: observa mudou em baa46e3, depois da base declarada 274141e
G9 FALHOU:  Q-014: estado invalido
G6c verde
```

Só as duas pré-existentes. O G6c que a Q-016 criou está fechado, e agora
medido onde ele mede. `governanca:mutacoes` segue abortando em cascata pelas
mesmas duas.

---

## 7 — Achados vizinhos: documentados, não expandidos

1. **G6c da governança, introduzido pela própria Q-016.** O commit `b52c572`
   alterou `CLAUDE.md`, `PLANO.md`, `BLOCKERS.md`, `EVIDENCE.jsonl` e
   `PERGUNTAS.jsonl` em 2026-09-23 com cabeçalhos declarando datas
   anteriores. A regressão da Q-016 não viu porque rodou **antes** do commit:
   o G6c compara com a data do último commit, e mudança não commitada não tem
   data. Localizado por bisseção (`ae5b046`, `baa46e3`, `9ebe5ea`, `47c8060`:
   sem G6c; `b52c572`: com). Fechado nesta fase: os cinco arquivos ganham a
   data do commit que os altera. Medido **antes** do commit: só G6b e G9. A
   medida **depois** do commit está no §6 — é exatamente o que o G6c exige
   (L45, `PROMPT_LESSONS.md`).
2. **`is_mock` é recusado em qualquer modo**, com o motivo "localização
   simulada em lote real" — inclusive numa instância `simulated`, onde o lote
   não é real. Anterior à Q-017; se uma instância `simulated` deve aceitar
   localização simulada é decisão de produto. Não alterado.
3. **`restart: unless-stopped` com exit 78 vira ciclo de reinício** (N3: 8 em
   20 s). Vale para toda recusa de configuração do crítico (contrato, segredo,
   modo), não só esta. O ciclo não fica pronto nem grava — é ruído
   operacional, não risco de dado. Política de reinício é decisão de operação.
4. **As outras recusas do crítico — contrato e segredo — ainda vêm depois de
   conectar e migrar.** Só o modo foi movido, porque só ele é desta missão.
5. **O cabeçalho de `compose.platform.yaml` ainda diz "NÃO EXECUTADO NESTA
   MÁQUINA: não há Docker aqui"** — falso desde o PB19. Não alterado.
6. **`FUNDACAO_NUVEM.md` não lista `DELIVERYOS_DEVICE_TOKEN_SECRET`** (lacuna
   do D2). Só a exigência do modo foi acrescentada.
7. **O append-only do event log não cobre `TRUNCATE`.** A trava da 0001 é
   `BEFORE UPDATE OR DELETE … FOR EACH ROW`, e `TRUNCATE` não dispara gatilho
   de linha. Provado num banco isolado, criado e apagado: `UPDATE` e `DELETE`
   recusados com `event_log e append-only`; `TRUNCATE` passa calado e leva
   todas as linhas. Foi assim que a pegada deste defeito sumiu do banco
   compartilhado no meio da regressão — `run-backup-restore-tests.ts` faz
   `TRUNCATE platform.event_log` para simular perda. A L3 promete mais do que
   o banco garante. Não corrigido: o event log está no Preservation Set, fechar
   o buraco é DDL nova, e o teste de backup depende dele. Decisão do César.
8. **`MISSION_LEDGER.jsonl` não recebe linha desde a M1A.1 (2026-08-11).** C0
   a Q-017 vivem em `CLAUDE.md` §13 e `docs/etapa-4-8/`. Não alterado.

---

## 8 — Estado final e o que continua aberto

**Q-017 — respondida** (`docs/execution/PERGUNTAS.jsonl`), autoridade do
César, 2026-09-23, marcada só depois das provas acima.

**A propriedade, e por onde ela é garantida.** Pelos caminhos oficiais do
sistema, nenhum fato ganha `source_mode = real` porque ninguém declarou o
modo:

| caminho | o que impede |
|---|---|
| binário crítico sem a variável | `lerModoDaInstancia` → `ConfigError` → exit 78, antes de qualquer efeito (A1–A3, N2) |
| variável vazia, só espaço, inválida | a mesma recusa (B1, C1, N2) |
| composição oficial sem a variável | `:?` — `docker compose config` e `up` recusam (K1, K2, N1) |
| composição oficial com valor inválido | passa pelo compose, e o crítico nunca fica pronto (K5, N3) |
| instância `simulated` ou `control` | o modo declarado chega intacto ao log e à outbox (D/E/F-1) |
| processo novo com outro modo | reenvio de fato antigo é duplicata; o replay usa o modo gravado (G1, G) |
| histórico sem modo | segue `NULL` = UNKNOWN, fora do replay (H1) |

**Continua aberto, e não foi tocado:**

- **Q-015** — o estado próprio da Intelligence Spine não sobrevive a
  reinício. Nenhuma linha desta missão toca a espinha.
- **Q-003 e Q-004** — intocadas; as guardas que as travam passaram na
  regressão.
- **Estratégia de aquisição** — iFood Gestor, Teknisa, Odhen, leitura de tela,
  UI Automation, spooler, API oficial, reconciliação: nada foi decidido nem
  implementado. `source_mode` é natureza da evidência, não mecanismo.

**UNKNOWN materiais que restam:**

1. **Nenhum deploy real declara o modo ainda** — não existe deploy. Quando
   houver, a composição recusa subir sem ele; qual valor cada ambiente
   declara é decisão de quem implanta, e só `real` numa instância que de fato
   recebe a rua é verdadeiro.
2. **O modo é da instância, não do aparelho.** Um aparelho de teste
   cadastrado numa instância `real`, com GPS verdadeiro, produz fato `real`.
   A proteção que existe é o cadastro do aparelho pelo gerente e a recusa de
   `is_mock`. Não é o defeito desta questão — é declaração errada, não
   ausência —, e fica registrado como risco residual, sem pergunta aberta.
3. **Empacotamento continua BLOCKED**, como no PB19: a prova em containers
   usou o estágio `build`. `dumb-init`, `USER node`, `prune --omit=dev` e o
   tamanho final seguem sem prova aqui.
4. **A pegada do defeito no banco compartilhado do sandbox** — 11 GPS
   sintéticos `real`, medidos antes da regressão final — não existe mais: o
   gate de backup faz `TRUNCATE` no log (achado 7). O banco é efêmero e de
   teste; nenhum patrimônio real foi tocado ou alcançado por esta missão.
