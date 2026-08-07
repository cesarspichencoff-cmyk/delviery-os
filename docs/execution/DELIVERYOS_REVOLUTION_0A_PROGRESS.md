# REVOLUTION 0-A — progresso e verdade do repositório

> Registro de execução da missão REVOLUTION 0-A. Estado medido por Git, não por documento.
> Nenhum push, merge, PR ou deploy nesta missão. Nenhuma escrita fora desta worktree.

---

## 1. Estado inicial — medido em 2026-08-04, antes de qualquer edição

| Campo | Valor |
|---|---|
| Raiz do repositório | `C:/Users/italo/Desktop/Claude/deliveryos-hybrid-platform-foundation-v1` |
| `git rev-parse --git-common-dir` | `C:/Users/italo/Desktop/Claude/delviery-os/.git` — worktree **ligada** |
| Remote `origin` | `https://github.com/cesarspichencoff-cmyk/delviery-os.git` (fetch e push) |
| Branch | `feature/deliveryos-hybrid-platform-foundation-v1` |
| **HEAD inicial** | **`fae35c9`** — *referencias: pastas de tipografia, Kree8 e produto atual* |
| Upstream configurado | **nenhum** (`fatal: no upstream configured`) |
| Branch existe no `origin`? | **não** — `git ls-remote --heads origin <branch>` devolve vazio |
| Working tree | 4 arquivos **untracked**; zero modificados, zero staged |
| `git stash list` | vazio |
| Worktrees | **22** |

### Working tree inicial, literal

```
?? docs/design/references/typography/nyght-reference.jpg.jpeg
?? docs/design/references/typography/redaction-reference.jpg.jpeg
?? docs/design/references/typography/remark-reference.jpg.jpeg
?? docs/design/references/typography/superior-serif-reference.jpg.jpeg
```

### Linha autoritativa — confirmada

A branch atual **é** a linha autoritativa, e nada de código veio depois da auditoria:

```
git log --oneline 0ec944d..HEAD
fae35c9 referencias: pastas de tipografia, Kree8 e produto atual
1c5931b auditoria: o estado canonico de 04/08, e o achado que muda o planejamento
```

As três referências históricas do prompt conferem com o histórico real: `0ec944d` é o commit de
código auditado, `1c5931b` é o commit documental posterior, `fae35c9` é o commit de preparação visual
e é o HEAD. **Nenhuma delas foi assumida — todas foram verificadas por Git.**

---

## 2. Três correções de registro

**2.1 — A sessão não abriu na raiz do repositório.** O diretório de trabalho do agente é
`C:/Users/italo/Desktop/Claude`, que **não é** repositório Git (é a pasta que contém as 22 worktrees).
O prompt da missão supunha a raiz. Todo comando desta missão roda com caminho absoluto ou `cd`
explícito para a worktree autoritativa.

**2.2 — Não existe worktree do Codex.** A missão §3 manda identificar e proteger "a worktree protegida
do Codex". Varridas as 22 worktrees e as 59 branches: **nenhuma se chama Codex, nem tem branch com
esse nome**. A worktree protegida **de registro** é outra, e está em `STATE.json.protegido_nao_tocar`:

```json
"protegido_nao_tocar": {
  "worktree": "deliveryos-conversation-crm-pilot-v0",
  "motivo": "Outra sessão ativa. O branch mudou duas vezes durante esta engenharia."
}
```

Ela e as branches de conversa/CRM ficam **intocadas**. Se "Codex" for apelido de outra sessão, o César
precisa nomeá-la — este documento não adivinha qual é.

**2.3 — Os nomes das imagens divergiam do contrato da própria pasta.** O `README.md` de
`docs/design/references/typography/` contrata `superior-serif-reference.jpeg`, `remark-reference.jpeg`,
`nyght-reference.jpeg` e `redaction-reference.jpeg`. Os arquivos chegaram como `*.jpg.jpeg` (extensão
dupla do download). **Renomeados** para os nomes contratados. Assinatura verificada: os quatro
começam com `ff d8 ff` — são JPEG de verdade. **Nenhum arquivo de fonte foi baixado ou commitado**;
só as imagens de referência, como o próprio README manda.

---

## 3. As 22 worktrees, classificadas

| Classificação | Worktree | HEAD | Branch |
|---|---|---|---|
| **AUTORITATIVA** | `deliveryos-hybrid-platform-foundation-v1` | `fae35c9` | `feature/deliveryos-hybrid-platform-foundation-v1` |
| **PROTEGIDA** | `deliveryos-conversation-crm-pilot-v0` | `52e56be` | `feature/hospitality-intelligence-final-v1` |
| HISTÓRICA | `delviery-os` | `a441bc7` | `main` |
| HISTÓRICA | `deliveryos-fable` | `e299cbc` | `feature/d4a-cenarios-volume-visual` |
| HISTÓRICA | `deliveryos-grok` | `aa4d554` | `audit/preloja-grok` |
| HISTÓRICA | `deliveryos-copiloto-secure-bind-v1` | `aec9027` | `fix/copiloto-secure-dev-server-bind-v1` |
| HISTÓRICA | `deliveryos-copiloto-secure-bind-audit-v1` | `aec9027` | *(detached)* |
| HISTÓRICA | `deliveryos-copiloto-v33-implementation` | `976fca5` | `feature/ifood-official-foundation-v1` |
| HISTÓRICA | `deliveryos-entregas-android-field-v1` | `81dae23` | `feature/entregas-android-field-v1` |
| HISTÓRICA | `deliveryos-entregas-operational-gps-v1` | `8409a8b` | `feature/entregas-operational-gps-v1` |
| HISTÓRICA | `deliveryos-entregas-v1` | `5a63175` | `feature/entregas-acabamento-visual-v1` |
| HISTÓRICA | `deliveryos-cloud-readiness-v1` | `d67f041` | `feature/deliveryos-cloud-readiness-v1` |
| HISTÓRICA | `deliveryos-grok-copiloto-intelligence` | `a8ea130` | `grok/copiloto-intelligence-pack` |
| AUDITORIA | `deliveryos-audit-conference-brain-v1` | `9c69a45` | `audit/conference-brain-foundation-v1` |
| AUDITORIA | `deliveryos-audit-conference-live-v1` | `c623e8b` | `audit/conference-live-observer-v1` |
| AUDITORIA | `deliveryos-copiloto-audit-celulas-v1` | `a46e69a` | `audit/copiloto-celulas-operacionais-v1` |
| AUDITORIA | `deliveryos-copiloto-recheck-97fd799` | `97fd799` | `audit/recheck-celulas-97fd799` |
| AUDITORIA | `deliveryos-recheck-multidimensional-v1` | `f7529fa` | `audit/recheck-conference-live-multidimensional-v1` |
| AUDITORIA | `deliveryos-recheck-multidimensional-v2` | `e5e8240` | `audit/recheck-conference-live-multidimensional-v2` |
| ATIVA (pesquisa) | `deliveryos-capacidade-viva-calibration` | `076a1cb` | `research/capacidade-viva-calibration` |
| ATIVA (pesquisa) | `deliveryos-proposta-b-claude` | `d762b4d` | `research/proposta-b-claude` |
| ATIVA (pesquisa) | `deliveryos-tata-evolucao` | `6ef9e97` | `research/tata-evolucao-grok` |
| **DESCONHECIDA** | *(nenhuma)* | — | — |

**Nenhum processo ou agente concorrente foi observado atuando** nesta worktree durante a missão: o
working tree inicial tinha só os 4 untracked, e nenhum arquivo mudou sozinho entre as leituras.

### Não executado nesta missão, por proibição explícita

`reset` · `clean` · `stash` de trabalho alheio · `checkout` destrutivo · `rebase` · remoção de
worktree · qualquer escrita fora da worktree autoritativa · `push` · `merge` · PR · `deploy`.

---

## 4. Pathspecs protegidos — lista completa, lida dos gates

Levantada abrindo cada arquivo de gate, como o César exigiu antes de implementar. **Não presumida.**

| Gate | Baseline | Pathspecs congelados |
|---|---|---|
| `run-r5a-temporal-tests.ts:530` | `4365c61` | `src/product/ui/surfaces/home.css` · `src/product/ui/tokens/organismo-tokens.css` · `src/product/viewmodels/areas.ts` |
| `run-r5b-invariant-tests.ts:565` | `bd1ad55` | `src/product/ui/surfaces/home.css` · `src/product/ui/tokens/` · `src/product/viewmodels/areas.ts` · `docs/figma/` |
| `run-r5c-translation-tests.ts:575` | `ad3b1bc` | idem R5-B |
| `run-r5d0-readiness-tests.ts:583` | `27ccfd2` | idem R5-B |
| `run-r5d0-confidence-tests.ts` | `b100943` | idem R5-B |
| `run-r5d0-lineage-tests.ts` | `ced38da` | `src/product/ui/` · `src/product/viewmodels/areas.ts` · `src/perfil-delivery/` · `docs/figma/` |
| `run-r5d0-storage-tests.ts` | `2af52e1` | `src/product/viewmodels/` · `src/product/atencao/politica-temporal.ts` · `src/product/atencao/linhagem-eventos.ts` · `src/product/ui/` · `src/perfil-delivery/` · `docs/figma/` |
| **`run-r5d1-event-lineage-tests.ts:600` — PF4** | **`73f2f0b`** | `src/perfil-delivery/` · **`src/product/viewmodels/`** · `src/product/atencao/politica-temporal.ts` · `src/product/atencao/linhagem-eventos.ts` · `src/platform/copiloto/confianca-duravel.ts` · **`src/product/ui/`** · `docs/figma/` |

### União protegida

```
src/perfil-delivery/
src/product/viewmodels/
src/product/ui/
src/product/atencao/politica-temporal.ts
src/product/atencao/linhagem-eventos.ts
src/platform/copiloto/confianca-duravel.ts
docs/figma/
```

### O achado que decidiu a arquitetura do Lab

Os gates congelam por **`git diff --name-only <baseline> -- <pathspecs>`**, exigindo saída vazia.
Isso não protege só edição: um **arquivo novo** commitado dentro de `src/product/ui/` ou
`src/product/viewmodels/` passa a aparecer nesse `diff` e **derruba `npm run test:platform:r5`**.

Logo o Lab **não pode nascer dentro do produto**. Ele nasce isolado e reutiliza o produto por
importação. Medido antes de começar, e é o estado que precisa continuar valendo no fim:

```
git diff --name-only 73f2f0b -- src/perfil-delivery/ src/product/viewmodels/ \
  src/product/atencao/politica-temporal.ts src/product/atencao/linhagem-eventos.ts \
  src/platform/copiloto/confianca-duravel.ts src/product/ui/ docs/figma/
(vazio)
```

**Nenhum baseline é alterado. Nenhum gate é afrouxado. Nenhuma exceção é criada para acomodar o Lab.**

### Dois guardas adicionais, respeitados sem serem tocados

- **`run-visual-order-tests.ts`** — a lista numerada de `CLAUDE.md` §11 precisa continuar citando
  `docs/design/VISUAL_REFERENCE_HIERARCHY.md`, e "Sprint Visual DeliveryOS V2" → "V3.3" → "Design
  System" precisam aparecer **nessa ordem** em `CLAUDE.md` e no índice canônico. A referência à
  Constituição entra no cabeçalho, sem mexer na lista numerada.
- **`run-home-signals-tests.ts` e `run-organismo-visual-tests.ts`** iteram `Object.keys(CENAS)` de
  `src/product/demo/seed-home-demonstracao.ts`. **Nenhuma cena nova entra ali** — as 18 cenas do Lab
  moram no Lab.

---

## 5. Onde o Lab mora, e por quê

César pediu `apps/deliveryos-experience-lab/`, com `labs/operacao-viva-v4/` como segunda opção
**caso o repositório não use `apps/`**, documentando a razão.

**Medido:** não existe `apps/` neste repositório. A raiz tem `android`, `app-v1`, `config`, `data`,
`demo`, `deploy`, `dist`, `docs`, `prototipos`, `src`, `tests`, `tools`. Criar `apps/` para um único
laboratório inventaria uma convenção de monorepo que o repositório não pratica.

**Segunda opção aplicada:** `labs/operacao-viva-v4/`.

O Lab é uma aplicação experimental isolada, com entrypoint e base path próprios, fixtures,
adaptadores, componentes e testes **dentro dela**. Ele reutiliza apenas contratos públicos e estáveis
do DeliveryOS, **por importação**, e não altera nenhum caminho protegido pelo PF4.

**Isolamento de compilação:** o `tsconfig.json` raiz **não é alterado**. O Lab tem
`labs/operacao-viva-v4/tsconfig.json`, estendendo o raiz, com `include` limitado ao Lab e aos
contratos realmente importados, e script próprio `typecheck:lab:v4`.

A promoção do Lab para Home oficial é **missão separada**, depois de aprovação humana, replay e nova
auditoria de linhagem.

---

## 6. Ferramental — nada foi instalado

| Item | Estado medido |
|---|---|
| `playwright` | `1.61.1`, já em `node_modules` (devDependency) |
| Navegador | `chromium-1228` e `chromium_headless_shell-1228` já em `C:/Users/italo/AppData/Local/ms-playwright` |
| `tsx` | **não está em `node_modules`**; resolve do cache do npx — `npx --offline tsx --version` devolveu `tsx v4.23.5` |
| Node | `v24.18.0` · npm `11.16.0` |

**Registro honesto:** todos os scripts `test:platform:*` e `ui:product` chamam `npx tsx`. Ele funciona
hoje **porque está no cache do npx**, não porque é dependência declarada. Se o cache for limpo sem
rede, esses gates param. O fato fica registrado; **nada foi instalado nesta missão**.

---

## 7. Andamento

| Etapa | Estado | Commit |
|---|---|---|
| 1. Estado inicial + referências tipográficas | **concluída** | `cfd35d8` |
| 2. Constituição + índice canônico + `CLAUDE.md` | **concluída** | `665d359` |
| 3. Domínio do Lab V4 | **concluída** | `2b64881` |
| 4. 18 cenários de fixture | **concluída** | `79dc94c` |
| 5. Superfície V4 + servidor | **concluída** | `2fa67ad` |
| 6. Modo de Validação (IndexedDB) | **concluída** | `2fa67ad` |
| 7. Gate determinístico com mutações | **concluída** | `a80f62c` |
| 8. Playwright em 3 viewports + evidências | **concluída** | `f29b0ff` |
| 9. Brief + proposta de evolução + plano | **concluída** | `f164520` |
| 10. Registros canônicos + auditoria do construtor | **concluída** | `f28fcf1`, `5306074` |
| 11. Avaliação independente | *(ver §8)* | |

---

## 8. Gates ao fim da construção

Todos executados nesta worktree, nesta ordem, antes da avaliação independente.

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` (raiz) | exit **0** |
| `npm run typecheck:lab:v4` | exit **0** |
| `npm run test:lab:v4` | **46 guardas, 8 mutações, 8 acusadas, 0 cegas** · `LAB_V4_GATE_GREEN` |
| `npm run test:lab:v4:browser` | **28 testes, 3 viewports, 12 capturas** · `LAB_V4_BROWSER_GATE_GREEN` |
| `npm run test:platform:r5` | **10 gates verdes** — o congelamento aguentou |
| `npm run test:platform:recuperacao` | visual-order 6 · R1 24 · home 44 · organismo 27 · Product System |
| `npm run test:platform:figma-parity` | 23 verdes |
| `npm run test:platform:copiloto` | 39 verdes |
| `npm run test:platform:bridge` | 45 verdes |

**A verificação que mais importa**, repetida ao fim:

```
git diff --name-only 73f2f0b -- src/perfil-delivery/ src/product/viewmodels/ \
  src/product/atencao/politica-temporal.ts src/product/atencao/linhagem-eventos.ts \
  src/platform/copiloto/confianca-duravel.ts src/product/ui/ docs/figma/
(vazio)
```

**Nenhum baseline foi alterado. Nenhum gate foi afrouxado. Nenhuma exceção foi criada.**

---

## 9. Fechamento

| Campo | Valor |
|---|---|
| **HEAD inicial** | **`fae35c9`** |
| **HEAD final** | *(o commit de fechamento; ver `git log -1`)* |
| Working tree final | **limpo** |
| Push / merge / PR / deploy | **nenhum** |
| Outras worktrees | **nenhuma tocada** |

### O ciclo da avaliação independente, nos dois momentos

**A. Primeira avaliação — concluída**

| | |
|---|---|
| Commit de código avaliado | **`f164520`** |
| Avaliador | Sonnet 5, contexto novo e mínimo, read-only |
| Veredito | **`APPROVED_WITH_RESERVATIONS`** |
| Achado material | 5.1 · **alta** · Motoboy verde em 15/18 sem medição |
| Desvio read-only | 4 PNGs versionados regravados pelo gate que o construtor autorizou |
| Medição do desvio | 136–182 px de milhões, delta máx. **2/255** — `evidencias-0a/desvio-readonly-png.json` |
| Restauração | por caminho nomeado, sem `reset` nem `clean`; 4 SHA-256 conferidos |
| Registro do veredito | commit **`cfa2fdb`**, **antes** de qualquer correção |

**B. Reverificação — tentada e NÃO concluída**

| | |
|---|---|
| Commit corrigido | **`0f1dd50`** |
| Mesmo avaliador retomado | **sim** |
| Avaliador novo criado | **não** |
| Resultado | **nenhum** — terminou por limite de API antes de executar |
| Prova de que nada rodou | diretório redirecionado nunca criado; `git status` limpo |
| Veredito delta | **NÃO EXISTE**, e não é inferido |
| Destrava | retomar o mesmo avaliador após **2026-08-06 23h** (America/Sao_Paulo) |

### Estado declarado

**`FUNCTIONAL_SUBSTRATE_LOCKED_WITH_RESERVATIONS`**

A reserva é uma só e está nomeada: **a correção `0f1dd50` não passou por auditoria independente.**
Ela tem 48 guardas, 9 mutações e medição direta do construtor — e nada disso é auditoria
independente.

**`VISUAL_EXPRESSION_REJECTED_BY_CESAR`** — declaração do César em 2026-08-05. O que está fechado
aqui é o **substrato funcional**. A direção visual volta para missão própria, e nenhum redesenho foi
feito nesta missão.
