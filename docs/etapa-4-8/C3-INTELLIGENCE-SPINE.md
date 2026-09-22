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
