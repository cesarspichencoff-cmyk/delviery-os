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

## Fase 2 — D2: segredo dos tokens de aparelho

### Antes

```
grep -c DELIVERYOS_DEVICE_TOKEN_SECRET deploy/compose.platform.yaml  →  0
```

Reproduzido na raiz fiel à imagem: o crítico carrega config, carrega o
contrato, e **sai `78`** — `DELIVERYOS_DEVICE_TOKEN_SECRET ausente`. O
comportamento do código já era certo (falha fechada); o que faltava era a
composição fornecer o valor.

### Depois — o mecanismo mais simples que a composição já usava

Nenhuma infraestrutura de secrets nova. O compose já tinha o padrão `:?` para
`POSTGRES_PASSWORD`; o segredo passou a usá-lo:

```yaml
DELIVERYOS_DEVICE_TOKEN_SECRET: ${DELIVERYOS_DEVICE_TOKEN_SECRET:?segredo dos tokens de aparelho obrigatorio}
```

**Fica só no serviço do crítico, não em `x-ambiente`.** Medido por grafo:
`bin/async-runtime.ts` **não alcança** `auth/device-token.ts`. Espalhar segredo
por serviço que não precisa dele é superfície de graça.

| Exigência | Como fica satisfeita |
|---|---|
| nenhum segredo real commitado | valor vem de `deploy/.env`, que é gitignorado (`.gitignore:65`) |
| compose exige de modo claro | `:?` faz `docker compose config` recusar antes do deploy |
| nunca em log/`describe()` | `describe()` não inclui o campo; provado por D2-6, que injeta uma marca e a procura na saída — inclusive no caminho de ERRO |
| ausência impede prontidão | `exit 78` antes de escutar (D2-4) |
| valor de teste é fixture | `.env.platform.example` traz a chave **vazia**, com instrução de geração (D2-3) |
| rotação sem mudar código | trocar o valor em `deploy/.env` |

**Provas:** D2-1 a D2-6, todas PASS. D2-5 cobre o segredo curto demais
(mínimo 32) — recusado, nunca truncado.

---

## Fase 3 — D1: TLS contra rede privada da composição

### Antes

`loadPlatformConfig` com os valores exatos do compose devolvia
`ConfigError: banco remoto sem TLS`. `isLocalUrl` só aceita `localhost`,
`127.0.0.1` e `::1`; `deliveryos-postgres` é remoto por essa régua. Como
`x-ambiente` é herdado por `migrate`, `critical` e `async`, **a composição
nunca subia**.

### Depois — fronteira DECLARADA, não inferida

A política não foi afrouxada. Continua valendo que banco remoto sem TLS é
recusado. O que mudou é que a fronteira passou a ser **declarada por quem
opera, com nome exato**:

```yaml
DELIVERYOS_DATABASE_SSL: "false"
DELIVERYOS_DATABASE_PRIVATE_HOST: deliveryos-postgres
```

Três decisões que definem o desenho:

1. **Igualdade exata**, nunca sufixo, curinga ou "contém". Regra do tipo
   "hostname sem ponto é local" seria adivinhação — liberaria qualquer nome
   curto digitado por engano.
2. **Dois atos explícitos.** Declarar o host **não desliga TLS sozinho**: o
   padrão continua sendo TLS ligado fora de `localhost`, e a declaração apenas
   torna legítimo um `false` explícito. Quem declara e esquece o `ssl` acaba
   com TLS ligado falando com um container sem certificado — falha alto. O
   contrário, texto claro por omissão, falha calado.
3. **Uma implementação só.** `dispensadoDeTls()` vive em `sql-client.ts` e é
   consumida pela configuração **e** pelo cliente `pg`, que recusavam
   separadamente. Duas noções da mesma fronteira divergem, e a permissiva é a
   que ninguém percebe.

A dispensa aparece no log de boot (`rede_privada_declarada`) — é o **nome** do
host, nunca credencial. Decisão de operação que não aparece no boot é decisão
que ninguém revisa.

### Controles adversariais — D1-1 a D1-7, todos PASS

| Caso | Resultado exigido | Medido |
|---|---|---|
| compose interno legítimo | aceita, `tls=false` | **ACEITA** |
| banco externo **sem** TLS | recusa | **RECUSA** (`DELIVERYOS_DATABASE_SSL`) |
| banco externo **com** TLS | aceita | **ACEITA**, `tls=true` |
| declara host, não declara `ssl=false` | aceita **com TLS ligado** | **tls=true** |
| `ssl=false` sem declaração | recusa | **RECUSA** |
| `mau-deliveryos-postgres` | recusa | **RECUSA** |
| `deliveryos-postgres.exemplo.com` | recusa | **RECUSA** |

D1-7 confere ainda que o host declarado corresponde a um `container_name` da
própria composição e que o PostgreSQL **não publica porta** — privado que
publica porta para o host não é privado.

---

## Fase 4 — D3a: coerência do artefato de build

### Reproduzido em isolamento

Banco com **apenas a migration 0001**, imagem íntegra:

```
GET  /ready          →  200
POST /api/gps/batch  →  503  {"detalhe":"column \"device_id\" of relation \"event_log\" does not exist"}
```

O sintoma existe. A pergunta é outra: **a composição oficial consegue produzir
esse estado?**

### Classificação: impossível na composição oficial — e o risco real é outro

Provado por `D3a-5`, sobre o compose do repositório:

- existe o serviço `deliveryos-migrate`, rodando `dist/src/platform/bin/migrate.js`;
- `deliveryos-critical` **e** `deliveryos-async` declaram
  `deliveryos-migrate: condition: service_completed_successfully`;
- os três herdam `<<: *imagem` — migrate de uma versão com runtime de outra é
  exatamente como o schema fica parcial na vida real, e a âncora impede isso.

Somado a `copiar_migrations.js`, que **falha o build com zero migration**, e ao
`Dockerfile`, que roda `npx tsc` fresco no estágio de build: a imagem oficial
não tem como carregar migrations defasadas em relação ao próprio código.
**Nenhuma correção foi inventada para um estado impossível.**

### O risco real, vivido nesta sessão

O `dist` **local** pode ficar velho em relação a `src`, e os gates leem `dist`.
Aconteceu: corrigi a regra de TLS em `src/`, rodei o gate sem reconstruir, e
ele reprovou `D1-4` — uma propriedade que já estava certa. O falso vermelho foi
barulhento. **O perigo é o inverso:** artefato velho que ainda passa, verde
sobre código que ninguém mais roda.

### Fechado com carimbo de build

`tools/carimbar_build.js` escreve `dist/build-stamp.json` com o **SHA-256 do
conteúdo** das fontes e a **identidade de commit** (`ARG DELIVERYOS_COMMIT` na
imagem, `git rev-parse` fora dela, `null` declarado quando não há nenhum —
nunca inventado).

O que entra no hash é **medido, não listado por nome**: o fecho transitivo de
imports a partir dos três binários que a composição roda, mais os assets
copiados, mais `package.json` e `tsconfig.json`. A primeira versão hasheava
`src/**` inteiro e virou ruído — editar um runner de teste invalidava o build,
embora nenhum runner seja executado a partir de `dist/`. Excluir por nome
(`run-*.ts`) seria a mesma classe de erro que o PB19 corrigiu nas guardas do
C3. **416 → 51 arquivos**, e o grafo usado é o MESMO módulo das guardas.

### Um teste que se consertava sozinho — achado e fechado

A primeira versão de `carimbar_build.js` executava o corpo ao ser **importada**.
O gate importa a ferramenta para recalcular o hash: ele **reescreveria o
carimbo antes de compará-lo**, e `D3a-2` passaria sempre, medindo nada. Fechado
com `require.main === module`, e travado por **`D3a-3b`**, que confere que
importar o carimbador não altera o arquivo.

| # | Prova | Resultado |
|---|---|---|
| D3a-1 | o `dist` carrega carimbo com identidade de commit | PASS |
| D3a-2 | o `dist` é coerente com as fontes de agora | PASS |
| D3a-3b | a checagem não é vazia: importar não reescreve | PASS |
| D3a-3 | ADVERSARIAL: carimbo divergente e carimbo ausente são acusados | PASS |
| D3a-4 | assets do `dist` byte a byte iguais à origem | PASS |
| D3a-5 | a composição impede schema parcial | PASS |

**`npm run test:platform:pb19` — 26/26, `PB19_GREEN`.**

---
