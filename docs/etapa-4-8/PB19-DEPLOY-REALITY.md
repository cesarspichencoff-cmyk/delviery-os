---
lifecycle:
  artefato: docs/etapa-4-8/PB19-DEPLOY-REALITY.md
  status: ACTIVE
  authority_scope: pb19_deploy_reality
  superseded_by: null
  atualizado_em: "2026-09-22"
  state_basis: d83d414
  question_refs: ["Q-003", "Q-004", "Q-015", "Q-016"]
---

# PB19 — Deploy Reality Closure

> Base: `d83d41412e65f1c3cc522cdbcd98461e898ca6e3` (topo de
> `feature/deliveryos-test-rc-convergence-v1`, C3 fechado).
> Ambiente: Linux, Node v22.22.2, PostgreSQL 16.13 local.
>
> **O objetivo não é produto.** É fazer a composição oficial sustentar, na
> realidade, as promessas que o código já faz. O critério de conclusão é um só:
> a composição precisa perder a capacidade de dizer *"estou pronta"* enquanto
> uma capacidade operacional obrigatória está estruturalmente incapaz de
> funcionar.
>
> **Preservado:** C3 fechado, arquitetura da espinha intocada, espinha
> desligada, `decisao.js` desconectado, `conversation-crm` sem fio, `Q-003`,
> `Q-004`, `Q-015` e `Q-016` **não respondidas**. Sem deploy, sem merge.

---

## Fase 0 — Reconciliação da continuidade do C3

### Os números do PLANO estavam velhos — verificados, não copiados

O `PLANO.md` registrava o estado de um commit intermediário. Os gates foram
**reexecutados nesta sessão**; a expectativa recebida foi tratada como
expectativa, e cada número foi medido:

| Gate | PLANO dizia | Medido agora | |
|---|---|---|---|
| `test:platform:spine` | 26 | **29 passaram** | confere com a expectativa |
| `test:platform:spine:mutacoes` | 25/25 | **31/31 · 0 cegas** | confere |
| `test:platform:cb4b5` | — | **37** | confere |
| `test:platform:copiloto` | — | **40** | confere |
| `test:platform:topology` | — | **TOPOLOGIA OK** | — |

### `data/conference-brain/live_cycle_runs.runtime.jsonl` — classificado

**Veredito: resíduo desnecessário.** Não foi removido em silêncio; a origem
foi provada e a correção é rastreável.

**Origem, por evidência:**

```
git log --follow  →  a6e38ed  (C3.5: suite adversarial da espinha)
git cat-file -e 4974cf5:<arquivo>  →  NÃO EXISTIA na base do C3
git cat-file -e 9e738b1:<arquivo>  →  NÃO EXISTIA
```

Conteúdo: 40 linhas com `collector_version: "intelligence-spine@1.0.0"` —
constante criada pelo próprio C3 — e `run_id: "…:ITAIM:real"`, com carimbos
`2026-07-27T12:00:00.000Z`, que é a constante `AGORA` das suítes. Foi escrito
pela mutação **MS21** (`memoryOnly: false`) antes de a suíte adversarial isolar
o diretório, e entrou no commit por um `git add -A`.

**Por que passou despercebido:** eu conferi *"0 diferenças contra `HEAD`"*
depois de restaurar. Mas o `HEAD` já estava poluído. **Conferir contra `HEAD`
prova que você não piorou — nunca que o `HEAD` está certo.**

**A causa estrutural é maior que o arquivo.** `src/conference-brain/storage/store.js`
linha 11 afirma, em comentário: *"Dados ficam em `data/conference-brain/` —
gitignorado via `*.runtime.jsonl`"*. Medido:

```
grep runtime.jsonl .gitignore                       →  NENHUMA regra
git check-ignore data/teste.jsonl                   →  ignorado (/data/*.jsonl)
git check-ignore data/conference-brain/x.runtime.jsonl → NÃO ignorado
```

Um `/` de diferença. A regra que o código prometia **nunca existiu**, e o store
escreve `<entidade>.runtime.jsonl` naquele diretório por padrão — qualquer
sessão que rodasse o Brain sem `CONFERENCE_BRAIN_DATA_DIR` versionaria saída
sintética com aparência de leitura operacional.

**Tratamento:** a regra que o código promete passou a existir; o resíduo saiu
por `git rm` neste commit; e a propriedade virou gate executável —
**`npm run test:platform:higiene`**, 5/5:

| | |
|---|---|
| H1 | nenhum `*.runtime.jsonl` rastreado pelo Git |
| H2 | a regra prometida existe **de verdade** — caminho derivado de `store.DEFAULT_DIR`, não escrito à mão |
| H3 | CONTROLE POSITIVO: a regra não é ampla demais (seed do cardápio, contrato, `package.json` seguem visíveis) |
| H4 | o seed do cardápio continua **rastreado**, não só não-ignorado |
| H5 | nenhum arquivo versionado em `data/` carrega saída da espinha |

H3 e H4 existem porque uma regra larga (`data/**`) resolveria H1 e H2 e
**esconderia patrimônio** — trocar um defeito por outro maior.

---

## Fase 1 — D3b: asset obrigatório de runtime

### Antes

Reproduzido **no HEAD atual**, contra PostgreSQL totalmente migrado, numa raiz
fiel à imagem (só `dist/`, `node_modules/`, `package.json` — sem `docs/`, sem
`src/`):

```
GET  /ready          →  HTTP 200  {"ready":true,"state":"healthy","summary":"Operando normalmente."}
POST /api/gps/batch  →  HTTP 503  {"classe":"falha_de_persistencia","retentavel":true}
GET  /ready          →  HTTP 200
log do crítico, INTEIRO: 2 linhas — boot e "ouvindo". Nenhuma sobre o 503.
```

**Método, e por que mudou:** a reprodução do C3 escondia `docs/contracts` com
`mv` dentro do repositório, e numa das execuções o shell morreu antes de
devolver. Agora nada no repositório é tocado: a raiz de teste é construída
**por cópia**, exatamente com o que o `Dockerfile` leva para `/app`.

### Mecanismo causal

| | |
|---|---|
| quem lê | `src/platform/contracts/event-schema.ts` → `readFileSync(join(raiz, "docs/contracts/eventos.schema.json"))` |
| com que raiz | `raiz = process.cwd()` — e `ingest-service.ts:152` também caía em `process.cwd()` |
| quem alcança | `bin/critical.ts` → rota de ingestão → `ingest-service.ts:31` (confirmado por grafo de imports) |
| o que a imagem leva | `dist/`, `node_modules/`, `package.json`. **`docs/` não entra** |
| por que `/ready` mente | a sonda escreve em `platform.schema_migration` — o banco está são; o contrato é outro eixo |

### Depois — a CLASSE fechada, não o arquivo

**1. O asset entra no artefato de forma determinística.**
`tools/copiar_contratos.js` copia `docs/contracts/*.json` → `dist/docs/contracts/`,
**falha alto com zero arquivo** e **valida o JSON na origem** (contrato ilegível
não pode virar contrato ilegível na imagem). Ligado a `build:platform` e ao
`Dockerfile`. Terceiro irmão de `copiar_migrations.js` e
`copiar_conference_brain.js`.

**2. O runtime deixou de depender do layout do checkout.**
`RAIZ_DOS_CONTRATOS` é **relativa ao módulo**, e o destino no `dist` foi
escolhido para que a expressão seja a MESMA nos dois mundos:

```
src/platform/contracts/       + ../../../docs/contracts/  → repositório
dist/src/platform/contracts/  + ../../../docs/contracts/  → imagem
```

Sem ramo por ambiente — ramo por ambiente é como um dos lados deixa de ser
exercitado e apodrece. `ingest-service.ts` parou de inventar raiz própria.

**3. Ausente, corrompido ou incompatível → falha fechada no boot.**
`carregarCatalogo` passou a distinguir três motivos e lançar
`ContratoIndisponivel`; `bin/critical.ts` carrega o catálogo **antes de
escutar** e sai `78` com o motivo no log. O carregamento também aquece o cache:
o primeiro lote em campo não paga leitura de disco.

**4. Só os contratos entram na imagem** — `COPY docs/contracts ./docs/contracts`,
nunca `COPY docs`. Travado por `D3b-5`.

### Provas — `npm run test:platform:pb19`, 7/7, `PB19_GREEN`

| # | Prova | Resultado |
|---|---|---|
| D3b-1 | o contrato está no artefato de build | PASS |
| D3b-2 | raiz sem `docs/` nem `src/` resolve o contrato a partir do módulo | PASS |
| D3b-3 | **CONTROLE POSITIVO**: imagem íntegra sobe e **aceita** lote de GPS | PASS |
| D3b-4 | contrato **ausente** → exit 78, nunca escuta | PASS |
| D3b-4 | contrato **corrompido** → exit 78, nunca escuta | PASS |
| D3b-4 | contrato **incompatível** (`@2.0.0`) → exit 78, nunca escuta | PASS |
| D3b-5 | a imagem não carrega `docs/` inteiro | PASS |

Controle positivo, medido no banco e não na resposta HTTP:

```
READY=200 · GPS=200 · GPS_REPETIDO=200 · GPS_INVALIDO=200
GPS_INVALIDO_RECUSADO=sim · ACEITOS=1 · READY_FINAL=200
```

Adversarial, cada caso com o motivo conferido no log:

```
ausente       exit=78  /ready=sem-resposta  "contrato de eventos ausente"
corrompido    exit=78  /ready=sem-resposta  "contrato de eventos ilegível"
incompatível  exit=78  /ready=sem-resposta  "contrato de eventos incompativel"
```

### Dois falsos resultados que esta fase produziu antes de ficar honesta

1. **`DELIVERYOS_PORT: "0"`** nos casos adversariais fazia o crítico sair **78
   pelo motivo errado** (config recusada). Um teste que só conferisse o código
   de saída teria passado ali com o defeito intacto. Só não passou porque a
   asserção exige a **assinatura** no log.
2. **`ACEITOS=0` com o lote aceito**: eu contava em `entregas.gps_point`, e um
   lote aceito vira linha em `platform.event_log` (`gps_batch_received`) mais
   uma na outbox. Falso vermelho pronto para virar falso verde no dia em que
   alguém "consertasse" a asserção em vez da consulta.

### Arquivos alterados nesta fase

| arquivo | o quê |
|---|---|
| `src/platform/contracts/event-schema.ts` | +103/−15 — `RAIZ_DOS_CONTRATOS`, `ContratoIndisponivel`, validação de presença/forma/versão |
| `src/platform/bin/critical.ts` | +26 — carga do contrato no boot, `exit 78` com motivo |
| `src/platform/ingest/ingest-service.ts` | +6/−1 — parou de cair em `process.cwd()` |
| `tools/copiar_contratos.js` | **novo** |
| `deploy/Dockerfile.platform` | `COPY docs/contracts` + passo de cópia |
| `package.json` | `build:platform`, gates `pb19` e `higiene` |
| `src/platform/run-pb19-deploy-tests.ts` | **novo** — gate |
| `tools/pb19_ingestao_real.js` | **novo** — controle positivo com processo real |
| `src/platform/run-higiene-dados-tests.ts` | **novo** — gate da Fase 0 |
| `.gitignore` | a regra que `store.js` já prometia |

---
