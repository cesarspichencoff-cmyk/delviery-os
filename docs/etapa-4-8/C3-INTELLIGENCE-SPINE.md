---
lifecycle:
  artefato: docs/etapa-4-8/C3-INTELLIGENCE-SPINE.md
  status: ACTIVE
  authority_scope: etapa_4_8_c3_intelligence_spine
  superseded_by: null
  atualizado_em: "2026-09-22"
  state_basis: 4974cf5
---

# C3 — Intelligence Spine

> Base desta etapa: `4974cf55ad4d2a490ccd3c212a416e3b3ed83943` (topo de
> `feature/deliveryos-test-rc-convergence-v1`, commit C2 de 2026-09-02).
> Ambiente: Linux, Node v22.22.2, `npm ci` exit 0.
>
> **Esta é uma reconstrução.** Uma execução anterior do C3 produziu oito commits que nunca
> chegaram ao remoto e se perderam com o container que os hospedava — o remoto nunca saiu de
> `4974cf5`. Nada do relato daquela sessão é tratado aqui como prova: todo número neste documento
> foi medido nesta execução. Onde o relato antigo é citado, é citado como **alegação a reproduzir**,
> e o resultado da reprodução está escrito ao lado.

## 0. O que esta etapa faz

A cadeia alvo é:

```
FONTES / DEVICES → ingestão e persistência canônicas → event log / outbox
  → Operação Viva → Conference Brain → conclusões versionadas → Copiloto Shadow
```

Da Operação Viva para a frente, a cadeia existia **inteira e provada — em teste**. Nenhuma seta
posterior existia no processo que roda. O C3 é a montagem dessas setas no runtime assíncrono, sob a
invariante de que a inteligência é **não crítica e fail-isolated**, e vem **desligada por padrão**.

---

## C3.0 — Baseline fresco

Cada gate rodado **isolado**, com o código intocado em `4974cf5`. Nenhum número de execução
anterior foi reaproveitado.

### PASS (28 gates)

`build` · `typecheck` · `test:platform` · `test:platform:envelope` · `test:platform:deploy` ·
`test:platform:contracts` · `test:platform:skills` · `test:platform:bridge` ·
`test:platform:auth` · `test:platform:ingest` · `test:platform:consumer` ·
`test:platform:wiring` · `test:platform:cb4b1` · `test:platform:cb4b2` · `test:platform:cb4b3` ·
`test:platform:cb4b4` · `test:platform:cb4b5` · `test:platform:copiloto` ·
`test:platform:visual-order` · `test:platform:r1` · `test:platform:home` ·
`test:platform:organismo` · `test:platform:product` · `test:platform:figma-parity` ·
`test:platform:r5` · `test:platform:m1-bridge` · `migrate` · `test:platform:pg` ·
`test:platform:repos` · `test:platform:backup`

### PostgreSQL — real, não pulado

Não havia daemon Docker (`/var/run/docker.sock` ausente), mas os binários do servidor estavam em
`/usr/lib/postgresql/16/bin`. Subiu-se **PostgreSQL 16.13 real** em `127.0.0.1:5433`.

Precondição oficial de migrate, executada antes dos gates:

```
[migrate] aplicada: 0001_platform_foundation
[migrate] aplicada: 0002_event_log_contexto_dispositivo
[migrate] 2 aplicada(s), 0 já estavam          exit 0
```

**Armadilha registrada:** na primeira tentativa os três gates de PG retornaram exit 0 em ~1 s —
com `DELIVERYOS_DATABASE_URL` definida. O log revelava `PULADO: DELIVERYOS_PG_URL não definida`.
Exit 0 ali seria um PASS falso. Com `DELIVERYOS_PG_URL` correta: `pg` 6 s, `repos` 1 s,
`backup` 3 s, **0 pulos**.

### FAIL pré-existente (2 gates) — preservados como estão

**`test:platform:governanca`** — 3 falhas em `4974cf5`, antes de qualquer edição:

| Regra | Falha |
|---|---|
| G6b | `docs/execution/STATE.json`: observa mudou em `9e738b1`, depois da base declarada `274141e` |
| G6c | `docs/execution/PERGUNTAS.jsonl`: declara 2026-08-20, alterado em commit de 2026-08-29 |
| G9 | `Q-014`: estado inválido |

**`test:entregas`** — 2 falhas, todas em `run-persistence-recreate-tests`:

```
4. insere pontos de GPS: {"accepted":0,"rejected":2,"reasons":{"impossible_timestamp":2}}
10. pontos de GPS preservados, sem duplicação
```

Causa provada, não suposta: o teste fixa `AT1 = "2026-07-26T10:00:00.000Z"`
(`run-persistence-recreate-tests.ts:167`) e `src/entregas/gps/validate.ts:139` recusa carimbo com
mais de 30 dias (`diff < -30 * 86400000`). A data de execução é 2026-09-22 — **58 dias**. É
bomba-relógio de data no teste, não regressão de código. **Não corrigida aqui:** está fora do
escopo do C3 e corrigi-la mascararia a natureza do achado.

### BLOCKED por ambiente (1 gate)

**`test:lab`** — `typecheck:lab:v4` e `test:lab:v4` passam; `test:lab:v4:browser` não roda.
Playwright 1.61.1 (pinado e instalado) procura
`/opt/pw-browsers/chromium_headless_shell-1228/...`; a imagem do sandbox traz `1194`. Diferença de
imagem, não de código. `npx playwright install` é proibido neste ambiente.

**Efeito colateral do gate, achado nesta execução (D4):** ao falhar por falta de browser,
`test:lab:v4:browser` deixou **13 arquivos apagados** em `labs/operacao-viva-v4/evidencias/`
(README + 12 PNGs). Ele limpa as evidências antes de regravá-las e não restaura quando morre no
meio. Só apareceu porque CLAUDE.md §10 obriga `git status` depois de todo script que escreve
arquivo. Recuperado com `git checkout --`, conferido: 0 diferenças contra `HEAD`. Registrado como
achado de deploy/ferramental independente — **não corrigido aqui**, por estar fora do escopo do C3.

### Registro metodológico: quatro FAIL que eram clone raso

Na primeira passada, `test:platform:r5`, `test:platform:m1-bridge`, `test:entregas` e `test:lab`
falharam com `fatal: bad revision '4365c61'`, `fatal: bad object fcfc21d…`,
`origin_commit deve ser ancestral válido de HEAD`. O checkout era **shallow**; esses gates
conferem congelamento por histórico git e não tinham os ancestrais.

Depois de `git fetch --depth=1000` (304 commits; os sete SHAs citados passaram a existir):
`r5` e `m1-bridge` passaram a **PASS**. `governanca` perdeu a falha G6a pelo mesmo motivo.

Registrar isso importa: quatro gates verdes foram, por um momento, quatro FAIL falsos. Exit code
sem leitura de log teria produzido um baseline errado nas duas direções.

---

## C3.1 — Topology map

Novo gate executável: **`npm run test:platform:topology`**
(`src/platform/run-topology-audit-tests.ts`).

Não é grep. Calcula o **fecho transitivo de imports** a partir dos binários reais
(`bin/critical.ts`, `bin/async-runtime.ts`), resolvendo `import`/`require` relativos com
comentários removidos, e pergunta de cada nó da cadeia se ele está no fecho.

Medida em `4974cf5` — crítico alcança 17 arquivos, assíncrono alcança 13:

| # | Seta | Onde existe |
|---|---|---|
| 1 | fato/ingestão | RUNTIME (crítico) |
| 2 | persistência | RUNTIME (assíncrono) |
| 3 | outbox | RUNTIME (assíncrono) |
| 4 | Operação Viva | RUNTIME (assíncrono) |
| 5 | adapter Conference | **SÓ TEST HARNESS** |
| 6 | observer | **SÓ TEST HARNESS** |
| 7 | conclusões | **SÓ TEST HARNESS** |
| 8 | bridge Copiloto | **SÓ TEST HARNESS** |
| 9 | recomendação Shadow | **SÓ TEST HARNESS** |

A invariante que já valia antes do C3 **passa**: nenhuma das setas 5–9 é alcançável a partir de
`bin/critical.ts`.

### O que essa medida decide sobre o desenho

O relato perdido alegava uma implementação pequena — um arquivo de runtime e ~35 linhas no
`async-runtime`, sem novo Copiloto, motor, event bus, tabela, migration ou fila. A auditoria
**confirma que esse é o menor desenho correto**, e a confirmação não vem do relato: vem de os cinco
módulos ausentes já existirem, já terem gate verde próprio (`cb4b1`–`cb4b5`, `copiloto`) e já
exporem exatamente os contratos que a montagem exige —

```
ponte.projecao()                                   já no runtime (async-runtime.ts:35)
  → criarFetchOrders({ lerProjecao, source_mode, janelas, now })   adapter, existe
  → createLiveObserver({ store, fetchOrders, runId, … })           observer, existe
  → observer.runCycle()
  → extrairConclusoes({ store, observer, unit_id, source_mode, run_id })   existe
  → recomendarDeConclusoes(conclusoes, { agora, unit_id, source_mode, anteriores })  existe
```

Falta a **montagem**, não a peça. Qualquer desenho maior duplicaria projeção, store ou regra já
provadas — o que a etapa proíbe.

`createStore` aceita `memoryOnly: true`, o que permite operar a espinha sem criar artefato durável
novo: é o que sustenta "sem nova tabela, sem migration".

---

## C3.2 — Minimal shadow wiring

**Um arquivo novo de runtime** (`src/platform/runtime/intelligence-spine.ts`, 345 linhas, a maior
parte comentário de porquê) e **39 linhas** no `async-runtime.ts`. Confirmado por `git diff --numstat`.

Não foi criado: Copiloto, motor, event bus, tabela, migration, fila. Não foi duplicado: projeção,
store, regra, memória ou event log. A espinha **monta** o que já existia.

### Arquitetura — antes e depois

| | antes (`4974cf5`) | depois |
|---|---|---|
| arquivos alcançáveis do crítico | 17 | **17** (inalterado) |
| arquivos alcançáveis do assíncrono | 13 | 36 |
| setas 5–9 | só test harness | **runtime (assíncrono)** |
| inteligência alcançável do crítico | não | **não** |

### Arquivos alterados

| arquivo | o quê |
|---|---|
| `src/platform/runtime/intelligence-spine.ts` | **novo** — a montagem |
| `src/platform/bin/async-runtime.ts` | +39 — monta sob flag, executa depois do tick |
| `src/platform/config/platform-config.ts` | +11 — `spine_enabled`, **falso por padrão** |
| `src/platform/projections/consumidor.ts` | +19 — `MemoriaDaProjecao.escopos()` |
| `src/platform/run-topology-audit-tests.ts` | +22 — enxergar `createRequire` apelidado |
| `tools/copiar_conference_brain.js` | **novo** — módulos do Brain para `dist/` |
| `deploy/Dockerfile.platform` | +8/-3 — o passo acima no build da imagem |
| `src/platform/run-intelligence-spine-tests.ts` | **novo** — C3.3/C3.4, 19 provas |

### Dois defeitos encontrados escrevendo isto — e corrigidos

**(a) A imagem não levaria os módulos.** `tsc` ignora `.js`; `dist/src/conference-brain/` não
existia. Pior: `deploy/Dockerfile.platform` copia para a imagem apenas `dist/`, `node_modules/` e
`package.json` — `src/` **não vai**. Resolver por `process.cwd()` funcionaria aqui e falharia no
container, e — como a espinha vem desligada — falharia **só no dia em que alguém ligasse a flag**.
Resolvido com resolução relativa ao módulo mais `tools/copiar_conference_brain.js` (26 módulos
copiados), no mesmo molde de `copiar_migrations.js`. Esta é a **mesma classe** do achado D3 do C3
perdido, encontrada por caminho independente.

**(b) A própria auditoria de topologia nasceria cega.** Ela procurava `require(`, e a espinha usa
`const req = createRequire(...)`. Sem correção, o gate reportaria as setas 5–9 como ausentes
**depois** de elas existirem. Corrigido descobrindo o identificador ligado a `createRequire` no
próprio arquivo.

---

## C3.3 — Fail isolation

`npm run test:platform:spine` — **19 provas, 19 passaram**. A falha é injetada **trocando o módulo
por um que lança**, não forjando dado ruim: o que precisa de prova é o tratamento da exceção.

| # | prova | resultado |
|---|---|---|
| C3.3-1 | CONTROLE: sem espinha, tick processa 2/2 e a projeção enche | PASS |
| C3.3-2 | espinha explodindo não muda `outbox_processed`/`failed`, e a outbox fica byte-idêntica | PASS |
| C3.3-3 | `executar()` não lança (sem try/catch no teste, de propósito) | PASS |
| C3.3-4 | projeção da Operação Viva idêntica byte a byte; memória do mesmo tamanho | PASS |
| C3.3-5 | falha observável: `falhas=1`, `passadas=0`, classe e escopo nomeados | PASS |
| C3.3-6 | só a CLASSE atravessa — a mensagem do erro não vaza para o estado | PASS |
| C3.3-7 | escopo que explode não impede o outro de ser percorrido | PASS |
| C3.3-8 | ESTRUTURAL: `bin/critical.ts` não menciona a espinha → `/ready` independente | PASS |
| C3.3-9 | flag **desligada por padrão** em `local`, `pilot` e `production` | PASS |
| C3.3-10 | só a flag liga | PASS |
| C3.3-11 | ESTRUTURAL: worker condiciona à flag e executa **depois** do tick | PASS |

---

## C3.4 — Replay / restart

### Defeito real encontrado e corrigido: recomendação crescendo sem limite

A montagem ingênua — a que o relato perdido descreve — tem um defeito que só aparece na **segunda**
passada. Medido antes de corrigir, com a cadeia real:

```
passada 1: 1 conclusao  [source_health:r1:9bc051c9d8f5]
passada 2: 2 conclusoes [… 9bc051c9d8f5, … 039d811efdc8]
passada 3: 3 conclusoes [… 9bc051c9d8f5, … 039d811efdc8, … a4fac26058ae]
```

`extrairConclusoes` emite uma conclusão `source_health` **por ciclo já rodado** — é o registro dos
ciclos, e está certo que seja. Mas entregar esse histórico inteiro ao Copiloto a cada passada faz
cada ciclo passado valer como condição de agora: na passada N nascem **N recomendações ativas sobre
a mesma fonte**, e o número só cresce. A um tick de 1 s, 3.600 por hora.

A correção **não inventa regra**: `conclusoes.js` já declara a sua, na linha em que calcula
`saudeVigente` — *"a saúde vigente é a do ciclo mais recente desta execução"*. A espinha passou a
respeitá-la do lado de fora. Conclusão de PEDIDO não é tocada: nasce uma por pedido e é atual por
construção.

E o corte é **contável, nunca silencioso**: `conclusoes_lidas` (histórico) e `conclusoes_vigentes`
(o que foi ao Copiloto) são campos separados do estado.

| # | prova | resultado |
|---|---|---|
| C3.4-1 | duas passadas seguidas não duplicam recomendação | PASS |
| C3.4-2 | leitura vigente estável em 3 passadas | PASS |
| C3.4-2b | `lidas [1,2,3]` cresce · `vigentes [1,1,1]` · `ativas [1,1,1]` | PASS |
| C3.4-3 | `source_mode` não cruza: `real`, `simulated` e `control` percorridos sozinhos | PASS |
| C3.4-4 | `run_id` carrega o modo — dois escopos nunca compartilham identidade | PASS |
| C3.4-5 | **LACUNA DECLARADA**: reinício zera a memória da espinha | PASS |
| C3.4-6 | a cadeia real produz `recomendacoes_de_pedido = 0` — viagem não virou pedido | PASS |
| C3.4-7 | `SPINE_VERSION` declarada e estável | PASS |

**C3.4-5 é uma lacuna provada, não escondida.** A espinha guarda `anteriores` no processo; um worker
reiniciado recomeça sem elas. O teste trava a lacuna e quebra no dia em que alguém a fechar,
forçando a decisão a ser tomada em vez de silenciosamente superada. É o território da Q-016.

### Fronteira semântica preservada

`recomendacoes_de_pedido = 0` com a projeção de hoje. A cadeia real gera conclusão sobre **saúde da
fonte** e nenhuma recomendação de pedido — exatamente a fronteira: a Operação Viva trabalha com
VIAGEM, o Conference Brain com PEDIDO, e a projeção não carrega identidade legítima para atravessar.
Nenhuma order fabricada, nenhum `trip_id` usado como `external_id`, ausência continua ausência.

### Regressão nesta fase

24 gates rodados isolados. **22 PASS.** As 2 falhas são as mesmas de `4974cf5`, byte a byte no
motivo: `governanca` (G6b, G6c, G9) e `test:entregas` (2, bomba-relógio de data). Zero regressões.

---

## C3.5 — Adversarial / mutation gate

**`npm run test:platform:spine:mutacoes` — 25/25, ZERO mutações cegas, `SPINE_MUTATIONS_GREEN`.**

O relato perdido citava 23/23 num relatório intermediário e 25/25 no fechamento. O número aqui é
**25/25 medido nesta execução**; a coincidência com o fechamento antigo não é confirmação de nada e
não está sendo tratada como tal.

### O método, e as três recusas que ele herda

Um gate verde prova que o código passa nos próprios testes. Não prova que os testes veriam o código
ficar errado. Esta suíte mede a segunda coisa: quebra a propriedade **no disco** e exige que a
guarda certa acuse.

1. **Mutação que não entrou no disco não conta** — `aplicar` relê o arquivo e compara SHA-256.
2. **Guarda que nem rodou não conta** — spawn sem saída vira `__SPAWN_FALHOU__` e grita.
3. **Reprovar não basta: tem que ser pela ASSINATURA esperada** — quebrar por outro motivo
   significa que aquela propriedade não estava sendo defendida.

Restauração byte a byte em `finally`, conferida por hash. Prova independente: depois da suíte,
`git status` não lista **nenhum** dos seis arquivos mutados.

### As 25 mutações

| # | Propriedade quebrada | Acusada por |
|---|---|---|
| MS1 | exceção da espinha escapa do laço de escopos | C3.3-5/7 |
| MS2 | o anteparo externo deixa de conter | C3.3-12 |
| MS3 | passada que quebrou é contada como boa | C3.3-5 |
| MS4 | a mensagem do erro vaza no lugar da classe | C3.3-5/6 |
| MS5 | um escopo que quebra interrompe os outros | C3.3-7 |
| MS6 | a flag passa a vir LIGADA por padrão | C3.3-9 |
| MS7 | a espinha é montada sem a flag | C3.3-11 |
| MS8 | inteligência entra no caminho crítico | topologia: `INTELIGÊNCIA NO CAMINHO CRÍTICO` |
| MS9 | o crítico passa a conhecer a espinha | C3.3-8 |
| MS10 | o escopo recebe `source_mode` fixo | C3.4-3 |
| MS11 | a memória perde o modo no escopo | C3.4-3/4 |
| MS12 | o `run_id` deixa de separar modos | C3.4-4 |
| MS13 | conclusão sem evidência vira sustentada | copiloto shadow |
| MS14 | pedido sem `pode_afirmar` vira sustentado | C3.4-9 |
| MS15 | o contador de recomendação de pedido para de contar | C3.4-8 |
| MS16 | o histórico inteiro volta a valer como condição de agora | C3.4-1/2/2b |
| MS17 | `conclusoes_vigentes` mente sobre o corte | C3.4-2b |
| MS18 | Q-003: a espinha conhece o motor de decisão | C3.5-G1 |
| MS19 | Q-004: `conversation-crm` ganha wiring | C3.5-G2 |
| MS20 | a sombra ganha meio de executar (`child_process`) | C3.5-G3 |
| MS21 | a espinha cria artefato durável (`memoryOnly: false`) | C3.5-G4 |
| MS22 | **a própria auditoria de topologia fica cega** | `SÓ TEST HARNESS` |
| — | 3 controles positivos: as guardas verdes ANTES de qualquer mutação | — |

**MS22 é a mutação da MEDIDA, não da propriedade.** Se a auditoria continuasse verde depois de a
espinha ser desligada do worker, ela não estaria medindo nada — seria decoração com cara de prova.

### O que a suíte encontrou — três cegueiras reais nos MEUS testes

A primeira execução deu **20/25 com 3 mutações cegas**. As três eram buracos de verdade:

**(1) MS2 — o anteparo externo nunca era exercido.** Todas as falhas quebravam dentro do laço e
eram contidas lá; o `catch` externo era código que nenhum teste atravessava. Fechado por C3.3-12.

**(2) MS15 — `recomendacoes_de_pedido === 0` era afirmação vazia.** Trocar o filtro de `"pedido"`
por `"nao_existe"` mantinha o gate verde: **um contador quebrado dá zero do mesmo jeito**. Fechado
com um CONTROLE POSITIVO (C3.4-8): uma conclusão de pedido legítima, injetada, precisa fazer o
contador contar. Só com ele o zero da cadeia real passa a significar alguma coisa.

**(3) MS14 — a exigência de `pode_afirmar` não tinha guarda desta etapa.** Fechado por C3.4-9: a
mesma conclusão, sem autorização para afirmar, não pode virar recomendação.

Duas correções foram na própria suíte, não no código: MS1 e MS5 reprovavam pela assinatura errada,
e MS5 na primeira versão removia um `try` deixando `catch` órfão — o guarda morria de **erro de
sintaxe**, que é o mesmo falso verde que `__SPAWN_FALHOU__` existe para pegar, com outra roupa.

Sem esta suíte, os três buracos teriam ido para o remoto com 26 testes verdes em cima deles.

---

## C3.6 — PostgreSQL e processos reais

**`npm run test:platform:spine:processos` — 7/7, `SPINE_PROCESS_GREEN`.**

O relato perdido citava 6/6. O número aqui é **7/7 medido nesta execução**, contra
**PostgreSQL 16.13 real** em `127.0.0.1:5433`. Sem `DELIVERYOS_PG_URL`, a suíte **PULA EM VOZ
ALTA** (CLAUDE.md §10).

Esta suíte **não importa nada do runtime**. Ela sobe `node dist/src/platform/bin/*.js` — os
binários compilados — e lê o que eles escrevem. É a única camada que pode pegar um defeito de
empacotamento, e é onde a classe D3 vive.

| # | Prova | Resultado |
|---|---|---|
| P0 | binários existem e `dist/src/conference-brain` está lá | PASS |
| P1 | worker real com a flag consome a outbox (`state = done`) **e** roda a espinha | PASS |
| P2 | sem a flag: boot declara `"espinha":false`, nenhuma execução, outbox consumida igual | PASS |
| P3 | **espinha quebrada** (módulos removidos do `dist/`) não impede o consumo; falha fica observável; `attempts` idêntico à passada sã | PASS |
| P4 | crítico real sobe e `/ready` responde **200 com a espinha quebrada** | PASS |
| P5 | `real` e `simulated` convivem no processo real — `"escopos":2`, sem falha | PASS |
| P6 | nenhuma tabela nova; `event_log` e `entregas.trip` com a contagem inalterada | PASS |

**P3 é a reprodução deliberada da classe D3**, provocada em laboratório: a imagem sem o artefato
que o código precisa. O que se mede é que a rua não sente — a outbox é consumida, a mensagem vai a
`done`, e `attempts` fica **igual ao da passada saudável** (comparado, não presumido).

### Quatro falsos vermelhos que esta suíte produziu antes de ficar honesta

Todos meus, nenhum do código — e cada um é a mesma armadilha: **baseline inventado em vez de
medido**.

1. **P2** exigia que a palavra "espinha" não aparecesse. Mas o boot sempre publica a flag
   (`"espinha":false`) — e é bom que publique. Passou a medir **execução**, não a palavra.
2. **P3** exigia `attempts = 1`. O valor certo é o da passada sã, que agora é **medido no P1** e
   comparado.
3. **P6** consultava `platform.event_log.source_mode` — coluna que **não existe** (o modo viaja no
   envelope). Passou a medir a contagem, que é a propriedade do limite L8: projeção não grava fato.
4. **P6** presumia `entregas.trip = 0`. Havia 1 linha de outra suíte. Passou a medir antes.

### Resíduo da própria suíte adversarial — achado e fechado

Depois de rodar o mutation gate, `git status` acusou
`data/conference-brain/live_cycle_runs.runtime.jsonl` **modificado (+10 linhas)**.

Causa: MS21 troca `memoryOnly: true` por `false` — é essa a mutação. Sem isolamento, o store real
passa a gravar em `data/conference-brain/`, que é patrimônio versionado. A suíte restaurava o
CÓDIGO byte a byte e deixava resíduo nos DADOS.

Restaurado com `git checkout -- data/` (0 diferenças contra `HEAD`), e fechado na origem: os
guardas agora rodam com `CONFERENCE_BRAIN_DATA_DIR` apontando para um diretório temporário,
removido no fim. Reexecutado: 25/25, `git status` limpo.

Só apareceu porque CLAUDE.md §9 obriga `git status` depois de todo script que escreve arquivo. É a
segunda vez nesta etapa que essa regra pega algo (a primeira foram as 13 evidências do Lab).

---

## Achados PB19 (D1–D3) — reproduzidos, não presumidos

O C3 perdido relatou três possíveis defeitos preexistentes de deploy. A instrução foi **tentar
reproduzir cada um** e **não corrigir nenhum dentro do C3**. Os três foram reproduzidos. Nenhum foi
corrigido.

### D1 — compose sem TLS contra código que recusa remoto sem TLS · **REPRODUZIDO**

`loadPlatformConfig` rodado com os valores **exatos** de `deploy/compose.platform.yaml`:

```
DELIVERYOS_DATABASE_URL: postgres://deliveryos:senha@deliveryos-postgres:5432/deliveryos
DELIVERYOS_DATABASE_SSL: "false"
  →  ConfigError: banco remoto sem TLS: defina DELIVERYOS_DATABASE_SSL=true
     variavel: DELIVERYOS_DATABASE_SSL
```

Mecanismo: `isLocalUrl` (`persistence/sql-client.ts:104`) só aceita `localhost`, `127.0.0.1` e
`::1`. O hostname do compose é `deliveryos-postgres` — **remoto** para essa regra. O comentário do
compose (linhas 33-35) afirma que TLS está desligado "apenas aqui dentro" porque o tráfego não sai
da rede do Docker; o código não conhece essa distinção.

**Gravidade:** `x-ambiente` é herdado por `migrate`, `critical` e `async`. Os três saem com
`exit 78` no boot. A composição **nunca sobe**.

### D2 — o crítico não recebe o segredo dos tokens pelo compose · **REPRODUZIDO**

Contado no arquivo:

| bloco | variáveis `DELIVERYOS_*` |
|---|---|
| `x-ambiente` | COMMIT, DATABASE_SSL, DATABASE_URL, ENV, MIGRATE_ON_BOOT, VERSION |
| `deliveryos-critical` acrescenta | HOST, PORT |
| `DELIVERYOS_DEVICE_TOKEN_SECRET` no arquivo inteiro | **ausente** |

**Gravidade:** `bin/critical.ts` falha fechada — lê o segredo, não acha, e sai com `exit 78`. O
container do crítico **não sobe**. (Falhar fechado aqui é o comportamento certo: subir sem segredo
daria a impressão de um servidor pronto que recusa todo aparelho em campo.)

D1 dispara antes de D2 na ordem do boot, então D2 só apareceria depois que D1 fosse resolvido.

### D3 — schema parcial: GPS 503 com `/ready` 200 e nenhuma linha de erro · **REPRODUZIDO**

Reproduzido com PostgreSQL real, banco novo, aplicando **apenas a migration 0001**:

```
GET  /ready            → HTTP 200  {"ready":true,"state":"healthy","summary":"Operando normalmente."}
POST /api/gps/batch    → HTTP 503  {"classe":"falha_de_persistencia","retentavel":true,
                                    "detalhe":"column \"device_id\" of relation \"event_log\" does not exist"}
GET  /ready (depois)   → HTTP 200

log do crítico, INTEIRO:
  [critico] iniciando {...}
  [critico] ouvindo em 127.0.0.1:8199
```

**Duas linhas. Nenhuma corresponde ao 503.** É exatamente o sintoma relatado.

Mecanismo, agora nomeado: a sonda do `/ready` **escreve em `platform.schema_migration`**, tabela da
migration **0001**. A ingestão de GPS grava `event_log.device_id` e `sequence_local`, colunas da
migration **0002**. Com schema parcial, a sonda continua verde e a rua quebra. O detalhe chega ao
aparelho na resposta; ao operador que olha log, nada.

Como o `dist/` chega à imagem sem `.sql` se ninguém copiar (é para isso que
`tools/copiar_migrations.js` existe e falha alto com zero), uma imagem com `dist/` velho aplica
menos migrations do que o código exige, o `migrate` termina "com sucesso", e o resultado é este.

**Nenhum dos três foi corrigido aqui.** São bloco independente.

### Achados adicionais desta execução

| | |
|---|---|
| **D4** | `test:lab:v4:browser` apaga 13 evidências de `labs/operacao-viva-v4/evidencias/` e não restaura quando morre por falta de browser |
| **D5** | `platform.event_log` **não tem** coluna `source_mode` (o modo viaja no envelope) — relevante para quem for auditar isolamento de modo por SQL |

---

## Crescimento do histórico — medido, e diferente do relato

O C3 perdido observou ~**3,1 KB por passada**, sem retenção. **Medido nesta execução**, com a
cadeia real e `store` `memoryOnly`, somando `live_cycle_runs` + `live_observations` +
`conference_clock_events` serializados:

```
retido após  0 passadas:      6 B
retido após 20 passadas:  6 905 B
crescimento por passada:   344 B   (~0,34 KB)
extrapolado a 1 tick/s:    ~1,2 MB/hora por escopo
```

**~0,34 KB, não ~3,1 KB — cerca de 9× menos.** O número desta execução é o que vale; o antigo não
foi reconciliado nem ajustado para caber, porque não há como saber o que ele mediu.

O que a medida mostra e importa: a **leitura vigente é limitada** (`conclusoes_vigentes` fica em 1),
mas o **log de ciclos cresce sem teto** (`conclusoes_lidas` 1, 2, 3…). Nada disso sobrevive a
reinício — o store é `memoryOnly` de propósito, porque criar tabela sem decisão humana responderia
a Q-015 por código.

---

## Q-015 e Q-016 — lacunas confirmadas antes de serem escritas

As duas foram **confirmadas por medida** antes de virarem linha em `docs/execution/PERGUNTAS.jsonl`.

**Q-015 — retenção.** Confirmada pela medida acima: crescimento real, constante, sem teto e sem
descarte, e sem lugar durável decidido.

**Q-016 — replay após restart.** Confirmada assim:

```
reconstruirPorReplay  definido em  src/platform/projections/consumidor.ts:251
                      chamado por  src/platform/run-bridge-consumer-tests.ts  (só testes)
                      em bin/async-runtime.ts: aparece na LINHA 33, DENTRO DE UM COMENTÁRIO
                      contagem fora de comentário: 0
```

O comentário do worker afirma que a memória "é descartável — o event log é a verdade, e
`reconstruirPorReplay` a recompõe". **Nenhum código faz isso no boot.** O worker reiniciado começa
com a projeção vazia. O teste C3.4-5 trava a consequência do lado da espinha.

### Efeito colateral declarado na governança

Acrescentar Q-015 e Q-016 exigiu editar `docs/execution/PERGUNTAS.jsonl`, e o lifecycle dele (a
primeira linha do arquivo) passou a declarar `atualizado_em: 2026-09-22`, que é a verdade.

Consequência: a falha pré-existente **G6c some** — ela dizia justamente que o arquivo declarava
2026-08-20 e tinha commit de 2026-08-29. **Isso não é a guarda sendo silenciada:** o arquivo foi
mudado de verdade, e a data nova é o registro correto dessa mudança. Deixar `2026-08-20` num
arquivo alterado hoje seria a maquiagem.

`STATE.json` **não foi tocado**. G6b e G9 continuam falhando, com o mesmo texto do baseline. G9
(`Q-014: estado invalido`) tem causa identificada e **não corrigida**: o cabeçalho do arquivo
declara `enum_estado: ["open","answered"]` e a Q-014 usa `"respondida"`.

---

## C3.7 — Container e regressão integral

### Container — **BLOCKED**, com a razão medida

```
$ docker --version   →  Docker version 29.3.1, build c2be9cc
$ docker info        →  failed to connect to the docker API at unix:///var/run/docker.sock
                        dial unix /var/run/docker.sock: connect: no such file or directory
```

O CLI existe, o **daemon não**. `docker build` e `docker compose` não rodaram.

O relato perdido dizia ter construído o container a partir do `Dockerfile`, com adaptação apenas da
CA do sandbox para instalar dependências. **Aqui isso não foi possível e não está sendo afirmado.**
Diferença registrada em vez de contornada.

O que cobre parte do risco, sem substituir o container: **C3.6 sobe os binários reais de `dist/`**,
que é o mesmo artefato que a imagem copia (`Dockerfile.platform` leva `dist/`, `node_modules/` e
`package.json`). A P3 chega a **remover `dist/src/conference-brain` de propósito** e provar que a
rua não sente. O que continua NÃO comprovado é a construção da imagem em si — camadas, `npm prune
--omit=dev`, `dumb-init` no PID 1 e o encaminhamento de sinais.

| origem | estado |
|---|---|
| `deploy/Dockerfile.platform` | alterado nesta etapa: o passo de build agora também roda `tools/copiar_conference_brain.js`. **Não construído.** |
| adaptação exclusiva do ambiente | **nenhuma.** Nenhum arquivo de deploy foi alterado para caber neste sandbox |
| `deploy/compose.platform.yaml` | **intocado.** D1 e D2 foram reproduzidos contra ele e deixados como estão |

### Regressão integral no HEAD reconstruído

**29 gates rodados isolados: 26 PASS, 3 conhecidos.**

| Gate | Estado | Por quê |
|---|---|---|
| `test:platform:governanca` | FAIL pré-existente | G6b (`STATE.json`) e G9 (`Q-014`), idênticos ao baseline. G6c saiu pela edição legítima do `PERGUNTAS.jsonl` |
| `test:entregas` | FAIL pré-existente | 2 falhas, bomba-relógio de data (`AT1` de 2026-07-26 vs. regra de 30 dias) |
| `test:lab` | BLOCKED (ambiente) | Playwright quer `chromium_headless_shell-1228`, imagem traz `1194` |

Os 26 PASS incluem `spine` (26), `spine:mutacoes` (25/25, zero cegas), `spine:processos` (7/7 com
PostgreSQL real), `topology`, `conference`, `r5`, `m1b-mutations`, e `pg`/`repos`/`backup` com
**0 pulos**.

**Zero regressões.** Nenhum gate que passava em `4974cf5` passou a falhar.

**D4 reproduzido de novo:** a execução do `test:lab` apagou outra vez as 13 evidências do Lab
(2 de 2 — é determinístico). Restauradas com `git checkout --`, 0 diferenças contra `HEAD`.

---

## Critério de conclusão — o que foi reproduzido e o que não foi

| Propriedade do C3 perdido | Estado nesta reconstrução |
|---|---|
| setas posteriores à Operação Viva existem no runtime assíncrono | **reproduzida**, medida por gate executável |
| implementação pequena: 1 arquivo + ~35 linhas no async-runtime | **reproduzida** — 1 arquivo + **39** linhas |
| sem Copiloto, motor, event bus, tabela, migration ou fila novos | **reproduzida**, travada por mutação |
| não crítica e fail-isolated | **reproduzida**, provada em processo real |
| desligada por padrão | **reproduzida** |
| mutation gate forte | **reproduzida** — 25/25, zero cegas (o 23/23 e o 25/25 antigos não foram usados como prova) |
| prova 6/6 com PostgreSQL real | **superada** — 7/7, número novo |
| D1, D2, D3 | **reproduzidos os três**, não corrigidos |
| ~3,1 KB por passada | **NÃO reproduzido** — medido ~0,34 KB, ~9× menos |
| container construído a partir do Dockerfile | **NÃO reproduzido** — sem daemon Docker |
| Q-015 e Q-016 | lacunas **confirmadas por medida** antes de serem escritas |

**Dois defeitos que o desenho antigo tinha e este não tem**, ambos achados por medida própria: a
imagem sem os módulos do Conference Brain, e a recomendação crescendo sem limite a cada passada.

---

## Apêndice — o documento do C3 perdido apareceu

Depois desta reconstrução estar empurrada, o relatório da sessão perdida foi recuperado (HEAD de
código que ele declara: `9fc3a8d`; espinha em `runtime/espinha-inteligencia.ts`, 887 linhas).

Ele **continua sendo relato, não prova**. O que se fez foi outra coisa: ele contém **afirmações
concretas e testáveis sobre esta árvore**, e cada uma foi testada. Três se sustentaram — duas
delas apontando defeito no que eu havia entregado.

### 1. Guardas cegas por nomenclatura — CONFIRMADO, era defeito meu

O §3 achado 6 dele diz que três guardas varriam o **texto** de `async-runtime.ts` atrás de
"copiloto", "shadow" e "conference-brain", e que a espinha passaria verde por acaso de nome.

Medido nesta árvore, nos dois sentidos:

| Situação | `cb4b5` e `copiloto` |
|---|---|
| dependência REAL montada (grafo confirma Brain, ponte e Shadow alcançáveis do worker) | **exit 0 — VERDE** |
| só a string `"conference-brain"` numa constante inerte, zero dependência nova | **exit 1 — VERMELHO** |

Meu import diz `from "../runtime/intelligence-spine"`. Nenhuma das três palavras. **Passei por
acaso de nomenclatura**, e as guardas afirmavam duas coisas que tinham deixado de ser verdade.

**Corrigido**, e a correção é estritamente mais forte que a anterior:

- `src/platform/grafo-de-imports.ts` (novo) — alcançabilidade por grafo, **uma implementação só**,
  usada pela auditoria de topologia e pelas guardas. Entende `createRequire` apelidado, que é como
  a espinha carrega o Brain — sem isso o grafo ficaria cego no ponto que importa.
- `15b` (4b5) e `18` (copiloto) deixaram de listar `async-runtime.ts`; `G1` deixou de somar o texto
  dele. Os demais arquivos continuam na varredura, porque para eles a resposta certa é zero e aí
  texto e grafo concordam.
- Entraram `15c` e `18c`, que exigem três coisas: a porta **existe** (controle positivo), a porta é
  **única** (cortando a espinha do grafo, Brain e Copiloto ficam inalcançáveis), e o crítico não tem
  nenhuma. `G1` passou a medir o crítico por grafo.

Contagens: `cb4b5` 36 → **37**, `copiloto` 39 → **40**.

Três mutações novas provam que as guardas novas mordem — e que o controle positivo não é
decorativo: **MS23** (segunda porta até o Copiloto), **MS24** (segunda porta até o Brain),
**MS25** (espinha fora do worker → a asserção "a porta existe" tem de acusar).

### 2. Passada PRESA segurava o laço do worker — CONFIRMADO, era defeito meu

O documento tem `E3` ("passada presa não segura o laço") e `C4` (sem sobreposição). Eu não tinha
nenhum dos dois: meu `async-runtime` fazia `await espinha.executar()` direto.

Medido antes de corrigir, com um `runCycle()` que **não lança — trava**:

```
RESULTADO: TIMEOUT 4s — A PASSADA NAO VOLTOU
```

`executar()` não voltava. Como o laço do worker faz `await` nele, **a outbox parava de ser
consumida**. Minhas 26 provas cobriam contenção de *exceção*; nenhuma cobria contenção de
*travamento* — e a invariante fala das duas.

**Corrigido:** prazo por passada (padrão 30 s, injetável) e guarda de sobreposição — a passada
seguinte não começa enquanto a abandonada não voltar. Estado ganhou `prazos_vencidos` e
`sobreposicoes`.

Um erro meu no meio do caminho, registrado: a primeira versão do prazo usava `unref()` no timer.
Com o laço de eventos vazio, o processo **saía antes de o prazo disparar** — a suíte terminou com
código 0 e sem imprimir resultado nenhum. Trocado por timer real, limpo assim que a passada volta.

Provas novas: **C3.3-13** (passada presa volta em <3 s e conta o prazo), **C3.3-14** (a seguinte
não começa), **C3.3-15** (controle: cadeia sã não vence prazo nem acusa sobreposição). Mutações
**MS26** e **MS27**. O `execFileSync` das mutações ganhou teto de 180 s: mutação que trava não pode
enforcar a suíte.

**MS2 ficou cega e foi retargetada, não removida.** A mutação antiga acrescentava `throw e` ao
anteparo externo; com a passada correndo contra prazo, o estado já foi registrado antes do throw e
a corrida absorve a rejeição — a propriedade virou **estrutural** e a mutação, inócua. A nova apaga
o **registro**: anteparo que contém sem registrar é falha silenciosa com outro nome. No mesmo
movimento, o `.catch` externo deixou de ser vazio e passou a registrar
(`escopo: "passada-nao-prevista"`).

Mutações: 25 → **31**, zero cegas. Provas da espinha: 26 → **29**.

### 3. D3 tem DUAS causas independentes — a dele é pior, e é a que acontece

Eu reproduzi D3 como **schema parcial** (migration 0002 ausente). O documento aponta outra coisa:
`docs/contracts/eventos.schema.json` não entra na imagem.

Verificado: `src/platform/contracts/event-schema.ts:30` lê esse arquivo em runtime,
`ingest/ingest-service.ts:31` o importa, e o grafo confirma que **`bin/critical.ts` o alcança**. O
`Dockerfile.platform` copia `src`, `tools`, `demo` para o build e `dist`, `node_modules`,
`package.json` para o runtime — **`docs/` nunca entra**.

Reproduzido com o banco **totalmente migrado** (2 colunas da 0002 confirmadas, para isolar da minha
causa), escondendo só `docs/contracts`:

```
GET  /ready          → HTTP 200  {"ready":true,"state":"healthy"}
POST /api/gps/batch  → HTTP 503  {"classe":"falha_de_persistencia","retentavel":true}
GET  /ready (depois) → HTTP 200
log do crítico: duas linhas, nenhuma de erro
```

| | D3a (minha) | D3b (do documento) |
|---|---|---|
| causa | schema parcial no banco | `docs/contracts/` ausente da imagem |
| resposta ao aparelho | 503 **com** `detalhe` nomeando a coluna | 503 **sem detalhe nenhum** |
| acontece com o Dockerfile como está? | só com `dist/` velho | **sim, sempre** |

**D3b é estritamente pior** e é a que um piloto encontraria: a imagem construída do repositório
recusa todo GPS, com `/ready` verde e zero diagnóstico. Registrada, **não corrigida** — corrigir
D1–D3 continua fora do C3, e por isso `docs/contracts` não foi acrescentado ao Dockerfile mesmo
tendo eu mexido nele para a espinha.

### 4. O 3,1 KB por passada — a diferença agora tem explicação

Medi ~0,34 KB; ele mediu ~3,1 KB. Lendo o desenho dele, a diferença deixa de ser mistério: **a
espinha dele PERSISTE as recomendações em disco** (`copilot_recommendations` no store do Brain,
JSONL, diretório configurado por `DELIVERYOS_INTELIGENCIA_DIR`), enquanto a minha usa
`memoryOnly: true` e não cria artefato durável.

São medidas de **coisas diferentes, de desenhos diferentes**. Nenhum dos dois números está errado;
o meu continua valendo para esta árvore. A Q-015 fica ainda mais necessária: a escolha entre os
dois desenhos **é** a pergunta dela.

### 5. O que o desenho dele tem e o meu não — e continua sem ter

Registrado como diferença consciente, não como pendência silenciosa:

| | dele | meu |
|---|---|---|
| intervalo próprio, separado do tick | sim (padrão 60 s) | **não** — roda a cada tick |
| recomendação persistida em disco | sim | não (`memoryOnly`) |
| escopos declarados em configuração | sim (`UNIDADE:modo,...`) | derivados do fato observado |
| configuração que **desliga com motivo** em vez de falhar fechada | sim | **não** — valor inválido em `DELIVERYOS_INTELLIGENCE_SPINE` derruba o boot do worker por `ConfigError` |

As duas últimas linhas da minha coluna são fraquezas reais, não escolhas superiores. A do
intervalo tem efeito medido: a 1 tick/s o histórico cresce ~1,2 MB/hora por escopo, contra
~4,5 MB/dia no desenho dele. **Nenhuma foi corrigida aqui** — mexer em intervalo e em política de
desligamento é exatamente o território da Q-015, e responder por código seria o oposto do que esta
etapa faz.
