---
lifecycle:
  artefato: docs/design/M1_CANONICAL_SUCCESSION.md
  status: ACTIVE
  authority_scope: visual_succession_and_provenance
  superseded_by: null
  atualizado_em: "2026-08-11"
  state_basis: f87a36dfd39c9989344f0fed6ebf8db5db1a8c35
  missao: M1A.1 — ponte canônica e estrutural
---

# Sucessão canônica M1 — quem manda, quem é ancestral, quem é história

## 0. Decisões humanas — César, 2026-08-11

Registradas aqui como **canônicas**. Não reabrir sem nova evidência.

### D-M1A1-08 — semântica de `carga_por_praca`

```
CARGA_UNIT        = OPEN_OPERATIONAL_WORK_UNITS
CARGA_GRANULARITY = CALIBRATION_PENDING
```

`carga_por_praca` é o **número de unidades operacionais de trabalho abertas**
registradas para uma praça. Uma unidade é o agrupamento operacional representado
pelo registro atual `pedido × praça × grupo`.

**Não pode ser descrito canonicamente como** contagem de itens físicos **nem**
contagem de pedidos, enquanto uma fonte ou contrato futuro não provar a
equivalência. `quantidade` **não** entra na contagem da projeção e portanto não
pode ser silenciosamente interpretada como quantidade de itens.

**A camada visual não pode rerrotular este valor como "itens" ou "pedidos"** sem
mapeamento provado. Guarda `D4`.

### D-M1A1-09 — Caixa

A Caixa permanece `sem_medicao_automatica`. Não criar medição automática só
porque um README ancestral descreveu a Caixa em pedidos. **Ausência de medição
não é zero e não é saúde.** Promoção futura exige fonte real mais contrato de
ciclo de vida de evento/trabalho. Guarda `D5`.

### D-M1A1-10 — gates históricos de congelamento

**Aprovada** a migração das dez asserções abertas para provas de **intervalo
histórico fechado**, preservando baseline, fim certificado, caminhos,
propriedade, comando de reprodução e mutação de adulteração. Sem reancorar
história, sem apagar evidência, sem enfraquecer a garantia. Aplicada — ver
[M1_VISUAL_CHANGE_ENVELOPE.md](M1_VISUAL_CHANGE_ENVELOPE.md) §7.

### D-M1A1-11 — prova de build

```
FULL_LOCAL_BUILD_PROOF = NOT_PROVEN
```

A worktree M1 não tem instalação de dependências própria; `npm run typecheck` e
`npm run build` **não foram executados aqui**. O `tsc` do worktree vizinho é
evidência de apoio, não prova de build. Não instalar dependências em M1A.1 só
para melhorar o veredito.

### D-M1A1-12 — movimento e estado ao vivo

A Motion North Star continua autoritativa. **Mas o produto não pode simular
causalidade operacional ao vivo enquanto a Home ainda exige recarga para
materializar mudança de estado.** Detalhe em
[M1_MOTION_GRAMMAR.md](M1_MOTION_GRAMMAR.md) §4.

---

> **Escopo próprio.** `VISUAL_REFERENCE_HIERARCHY.md` diz qual **nível** manda.
> `VISUAL_SOURCE_OF_TRUTH.md` diz **o que** o cânone define em prosa.
> `CANONICAL_VISUAL_MANIFEST.json` diz **qual pacote em qual hash**.
> Este arquivo diz **qual artefato sucede qual**, o que sobrevive da sucessão, e
> **de onde veio a aprovação humana** quando o próprio arquivo ainda diz `AWAITING_*`.
>
> Ele não cria autoridade nova. Ele resolve as incompatibilidades que a M1A encontrou.
> Guarda executável: `npm run test:platform:m1-bridge`.

---

## 1. Superfície alvo — a confusão que M1A encontrou

```
M1_TARGET_SURFACE = `/` (Home)
M1_SHADOW_SURFACE = `/copiloto`
```

**A experiência do Copiloto / consciência operacional é a Home `/`.** É lá que vivem
ambientes, praças, pressão, sinais e Foco — `src/product/ui/surfaces/home.js`,
`home.css`, `src/product/viewmodels/home-vm.ts`, `sinais.ts`, `areas.ts`.

**A rota `/copiloto` é outra coisa.** `src/product/viewmodels/modulos.ts` a declara
`estado: "shadow"`, descrição *"Inspeção: propostas em sombra. Nenhuma ação é
executada."* É superfície técnica de inspeção, aprofundamento da Home — não a
experiência aprovada.

**Os dois nomes não se fundem, e nenhuma rota de runtime é renomeada** para deixar a
terminologia mais bonita. O que muda é que a distinção passa a estar escrita.

Medido em `f87a36d`:

| Fato | Evidência |
|---|---|
| `/` é a home operacional | `src/product/ui/app.js` — `"/": { api: "/api/home", tela: telaHome }` |
| `/copiloto` é shadow | `src/product/viewmodels/modulos.ts` — `id: "copiloto"`, `estado: "shadow"` |
| a Home aponta para 4 aprofundamentos | guarda `H31` em `run-home-signals-tests.ts` |

Mutação **M-A** protegida por `A2` na guarda desta ponte.

---

## 2. Autoridade reconstruída — N0 a N7

Reconstruída por inspeção, não por recência de nome de arquivo.

| Nível | O que é | Artefatos reais |
|---|---|---|
| **N0** | realidade e decisão humana aprovada | operação da TATÁ · decisões do César em `DECISIONS.md` · aprovação registrada em Family System Foundation §08 |
| **N1** | artefatos visuais **atuais** aprovados | **De-Mechanization** (estático) · **Motion North Star** (temporal) |
| **N2** | constituições de produto/domínio | `DELIVERYOS_PRODUCT_CONSTITUTION.md` · `DELIVERYOS_CANONICAL_SOURCE_INDEX.md` · `CONTRATO_*` · `areas.ts` como contrato executável |
| **N3** | implementação e evidência | `src/product/**` · gates R5 · `EVIDENCE.jsonl` · `STATE.json` |
| **N4** | design system / Figma | `docs/figma/**` · Figma `IMWH8ZKMF5ra3QJYiR6vGa` |
| **N5** | leis especializadas / gates | `MOTION_SYSTEM.md` · `MOTION_ACCESSIBILITY.md` · guardas O*/H*/R5* |
| **N6** | histórico | Sprint V2 extract · Signature System V1 · North Star Materiality/Final/Convergente · `app-v1` |
| **N7** | referência externa | OriginKit · Kree8 · Jay · Elaya · Impeccable · Emil Kowalski · transitions.dev · GSAP |

**Sprint Visual DeliveryOS V2 não cabe em uma linha só.** Ele é a **raiz** da qual
N1 desce, e continua sendo o Nível 1 de `VISUAL_REFERENCE_HIERARCHY.md`. Aqui ele é
classificado `ACTIVE_ANCESTOR`: governa princípio e linguagem, não a forma atual das
câmaras. A hierarquia de níveis não foi alterada por esta missão.

---

## 3. Árvore de sucessão

Pacote inspecionado nesta missão:

```
PACKAGE_FILE   = Sprint Visual DeliveryOS V2.zip  (Downloads, 9 640 636 bytes)
PACKAGE_SHA256 = 35034aaaf4e2a9dc73a3dca8ef17de7731c22f722033e910940ff494a9fc01d3
INSPECTED_ARTIFACTS = 13
```

> **O nome do arquivo mente.** O ZIP se chama `Sprint Visual DeliveryOS V2.zip`, mas
> **não é** o pacote canônico registrado com esse nome. O canônico é
> `Sprint Visual DeliveryOS V2 (1).zip`, 484 664 bytes,
> `2755573bbe624f4ce0dba992d006e6e5b8e2b6dea87b7d6a2050e55fd9834101`, e continua
> **íntegro e imutável** no repositório — verificado byte a byte nesta missão.
> O pacote novo **contém** o antigo, inteiro, e acrescenta a sucessão. Sucessão não é
> apagamento: nada do acervo registrado foi substituído.

| ARTIFACT | HASH (sha256, 16) | LOCATION | ROLE | STATUS | SUPERSEDES | SUPERSEDED_BY | WHAT_REMAINS_VALID | WHAT_NO_LONGER_GOVERNS | APPROVAL_PROVENANCE |
|---|---|---|---|---|---|---|---|---|---|
| **Sprint Visual DeliveryOS V2** (ZIP) | `2755573bbe624f4c` | `docs/design/canonical/deliveryos-visual-v2/` | raiz da linguagem | **ACTIVE_ANCESTOR** | — | — | tipografia · confiança=solidez · foco único · silêncio visual · antipadrões PRESERVAR/REMOVER | a forma das telas de 2026-07 | registrado 2026-07-20, `459c5f5` |
| **Organismo Operacional V3.3** (extract) | `434294036f86ff69` | `…/extracted/…Organismo Operacional.dc.html` | piso de presença | **ACTIVE_ANCESTOR** | — | — | presença, beleza, fluidez; prova de aplicação | círculos iguais; pressão só na cor | Nível 2 da hierarquia; README do pacote o chama "piso histórico" |
| V3.3 — variante do pacote | `f76eeca83bdc7693` | `…FINAL_PACKAGE/02_CANONICAL_ANCHORS/…V3.3.dc.html` | cópia derivada | **HISTORICAL** | — | — | nada de próprio | não governa: não é o extract do ZIP registrado | sem registro de aprovação própria |
| Signature System V1 | `444e656d6f93cde4` | pacote `03_EVOLUTION/` | geração anterior | **SUPERSEDED** | V3.3 (expressão) | Signature North Star | "geometria estável, trabalho contável" | objetos pequenos, tela tímida | — |
| **Copiloto Signature North Star** | `9432fc51c83af75b` | pacote raiz | geração *Silent Gravity* | **SUPERSEDED** | Signature System V1 | De-Mechanization | massa única atravessando o quadro; compressão contra a saída; mobile com composição própria | a forma da massa como lei estática final | `AWAITING_CESAR_COPILOT_SIGNATURE_NORTH_STAR_REVIEW` no arquivo |
| Sculpted Operation | `5dfa90bca01a6519` | pacote raiz | *Truth & Topology* | **SUPERSEDED** | Signature North Star (mobile empilhado) | Form Language Convergence | topologia: Caixa → 3 ramos → Conferência → Motoboy; "quantidade nunca diz quanto cabe" | a composição de câmaras daquela prancha | — |
| Form Language Convergence | `95a98d8c1f23137a` | pacote raiz | *superfície escavada* | **SUPERSEDED** | Sculpted Operation | De-Mechanization | escavação; topologia preservada em retrato | — | — |
| **De-Mechanization** | `e43a0a910ce1703d` | pacote raiz | *Static North Star Closure* | **ACTIVE** | Signature North Star · Form Language Convergence | — | campo escavado · câmaras de silhueta funcional · carga como condição **uniforme** do território · passagem carregada só com evidência · Foco reorganiza a superfície · posições derivadas da geometria com limite de leitura em 3 camadas | — | Family Foundation §01: "Decisão canônica … Congelada"; §08 `CANONICAL_DESIGN` |
| **Motion North Star** | `ba520ad5f8060290` | pacote raiz | lei temporal | **ACTIVE** | canon de movimento anterior (expressão) | — | H3 propagação causal + pausa da H2 · ordem carga→passagem→efeito · alívio em cadeia · retarget do quadro atual | as porcentagens como relógio de parede | `AWAITING_CESAR_MOTION_NORTH_STAR_DECISION` no arquivo; aprovado depois — §4 |
| **Family System Foundation** | `ee0c510f8ffea9a6` | pacote raiz | guardrail de família | **GUARDRAIL** | — | — | 12 universais · 5 heranças condicionais · 6 proibições · Family Recognition Test · roadmap M0–M14 | não governa forma do Copiloto | `DELIVERYOS_FAMILY_SYSTEM_M0_COMPLETE` no próprio arquivo |
| Pacote Visual V2 · Contrato Estados Técnicos · TATA OS · EstadoTecnico · Fase 0 Anchors | ver `extract_hashes.txt` | repo + pacote (idênticos após EOL) | acervo da raiz | **ACTIVE_ANCESTOR** | — | — | tudo que o Sprint V2 define | — | registrado 2026-07-20 |
| North Star Materiality · Materiality Polish · North Star Final · North Star Convergente · Visual North Star V2.1 · Arquitetura Operacional | ver manifesto do pacote | pacote `03_EVOLUTION/` | evolução | **HISTORICAL** | — | — | evidência do que foi aprendido e rejeitado | nenhuma governa | pasta declarada "evolução" pelo README do pacote |
| `app-v1`, protótipos antigos | — | repo | história | **HISTORICAL** | — | — | regressões e funcionalidades | **não pode definir direção visual** | Nível 5 |
| Impeccable · Emil Kowalski · transitions.dev · GSAP · OriginKit · Kree8 · Jay · Elaya | — | externo | referência | **REFERENCE_ONLY** | — | — | elevam a régua | não emprestam identidade | — |

**A cadeia não é linear e não foi forçada a ser.** Signature North Star e Sculpted
Operation são ramos que convergiram em De-Mechanization; Motion North Star corre num
eixo próprio (temporal) que não sucede nenhum dos estáticos.

### NOT_INSPECTED nesta missão

Conteúdo **não** lido, apenas hash-verificado ou não aberto — nada foi atribuído a eles:

`VERTICE_CORE_CESAR_Portable_Intelligence_System.pdf` ·
`Copiloto_Signature_North_Star_CURRENT.pdf` · `PROMPT_SCULPTED_OPERATION_FINAL.md`
(lido por busca, não integralmente) · os 8 arquivos de `03_EVOLUTION/` ·
`north_star_v22.pdf` · `north_star_v24.pdf` · `VERTICE_2_Curso_Integrado.pdf` ·
`DeliveryOS_Visual_North_Star_V2_2_Gate_Visual_Claude_Design (1).pdf` ·
anchors PNG · capturas de tela · Kree8 · Jay · Elaya · OriginKit · Impeccable ·
Emil Kowalski · transitions.dev · GSAP.

---

## 4. Procedência de aprovação — marcador obsoleto × decisão posterior

Três artefatos **ativos** ainda carregam, no próprio corpo, um marcador de espera.
Apagá-lo seria reescrever história para deixar a narrativa limpa. Registrar a
divergência é o que a §9 da missão exige.

| Artefato | FILE_INTERNAL_STATE | LATER_HUMAN_DECISION | CURRENT_AUTHORITY_EFFECT |
|---|---|---|---|
| Motion North Star | `AWAITING_CESAR_MOTION_NORTH_STAR_DECISION` | Family Foundation §08 `CURRENT_STATE`: *"Static North Star e Motion North Star **aprovadas por César**"*; §01 lista "Motion North Star" como **Decisão canônica**; prompt M1A.1 D-M1-06 reafirma H3+pausa H2 | **ACTIVE** como lei temporal. O marcador é obsoleto e fica onde está. |
| De-Mechanization | `AWAITING_CESAR_STATIC_NORTH_STAR_CLOSURE_REVIEW` | mesma fonte; §01 "Decisão canônica … Congelada"; §08 `CANONICAL_DESIGN` | **ACTIVE** como lei estática. |
| Copiloto Signature North Star | `AWAITING_CESAR_COPILOT_SIGNATURE_NORTH_STAR_REVIEW` | não aparece entre as decisões canônicas de §01; a própria Signature se declara superada pela comparação de quatro gerações que ela abre | **SUPERSEDED**. Nunca foi promovida; foi ultrapassada. |

**Regra registrada:** aprovação humana posterior vence marcador de arquivo obsoleto,
**e o override precisa estar escrito** — está, aqui. Mutação **M-O**, guarda `E7`.

---

## 5. V3.3 — comparação semântica, não comparação de hash

```
V33_VERDICT = FORMAT_VARIANT_PLUS_ONE_EDITORIAL_STRING
```

| Campo | Resultado medido |
|---|---|
| BYTE_RELATION | repo 105 694 B (CRLF) · pacote 104 772 B (LF) · primeira divergência no byte 16, linha 1 |
| STRUCTURAL_RELATION | 925 linhas em ambos; mesma árvore, mesmos blocos, mesmas `<section>` |
| TEXTUAL_DIFFERENCES | após normalizar EOL: **exatamente uma linha**, a 43 |
| — repo / ZIP imutável | `A mesma superfície em onze cenários` |
| — variante do pacote | `A mesma superfície, cenário a cenário` |
| SEMANTIC_DIFFERENCES | nenhuma: o comentário HTML `<!-- SUPERFÍCIE (cenários 01-11) -->` é idêntico nos dois; a variante do pacote apenas deixa de afirmar a contagem no título |
| VISUAL_LAW_DIFFERENCES | **nenhuma** — nenhum token, cor, tipografia, cenário, estado, keyframe ou regra difere |
| WHICH_ONE_WAS_USED_BY_WHAT | o **repo** é o extract do ZIP imutável (`extract_hashes.txt` registra `434294036F86…`) e é o que `run-visual-order-tests.ts` V5 verifica; a variante do pacote circulou como âncora de leitura no `FINAL_PACKAGE` |
| SUCCESSION_IMPACT | **nenhum**. A variante do pacote não sucede nada. |
| VERDICT | classificando pelas cinco opções da missão: **não** é `IDENTICAL_SEMANTICS` (uma string difere), **não** é `MEANINGFUL_DIVERGENCE` (nenhuma lei muda), **não** é `UNKNOWN`. É `FORMAT_VARIANT` (EOL) somado a **uma** edição editorial. |

**Decisão:** o repositório **não** adota a variante do pacote. Substituir o extract
quebraria a correspondência com `archive_sha256` e com `immutable_original: true` — e
seria exatamente a mutação **M-E**, escolher variante por recência. Guarda `B4`.

**Nota factual, não correção:** a contagem "onze" no título do ZIP imutável não foi
verificada contra o número de cenários renderizados nesta missão. Isso é *unknown*,
não erro provado, e não muda o veredito: um título mais preciso não é autoridade
maior que o acervo registrado.

---

## 6. `carga_por_praca` — linhagem medida ponta a ponta

```
CARGA_UNIT_VERDICT        = PROVEN_OTHER
CARGA_UNIT                = OPEN_OPERATIONAL_WORK_UNITS      (D-M1A1-08)
CARGA_GRANULARITY_VERDICT = CALIBRATION_PENDING
CARGA_DOMAIN_DIVERGENCE   = REGISTRADA, NAO RESOLVIDA
```

### 6.1 O nome carrega três significados diferentes

| Onde | Tipo | Significado |
|---|---|---|
| `areas.ts:48` | valor de `ModoDeMedicao` | **como** a área é medida |
| `projetar-leitura.ts:108` | `readonly CargaDaPraca[]` | projeção de eventos: `{praca_id, abertos, aguardando, iniciados, idade_do_mais_antigo_min}` |
| `sinais.ts:100` | `Partial<Record<PracaId, number>>` | o que a Home consome hoje |

Três coisas com o mesmo nome. Isso sozinho já explica boa parte da confusão de M1A.

### 6.2 A cadeia, transição a transição

| Etapa | Campo | Tipo | Unidade | Transformação | Dono | Teste |
|---|---|---|---|---|---|---|
| fonte | `RegistroDeTrabalho` | registro da bancada | 1 registro = 1 (pedido × grupo) numa praça | `trabalhoId = w:{unidade}:{praca}:{pedido}:{grupo}` | `produtor-trabalho-praca.ts` | R5-D3 |
| evento | `PayloadTrabalhoPraca` | envelope@1 | `referencia` = "item **ou agrupamento**"; `quantidade: number \| null` | validação de catálogo | `catalogo-operacional.ts` | R5-D1 E01 |
| projeção | `CargaDaPraca.abertos` | inteiro | **contagem de trabalhos abertos** | `abertos: lista.length` — `quantidade` **não é somada** | `projetar-leitura.ts:428` | R5-D1 · `D1`/`D2` |
| leitura | `LeituraOperacional.carga_por_praca` | `Partial<Record<PracaId, number>>` | mesma unidade da fonte que a produziu | praça ausente = **não medida**, nunca zero | `sinais.ts:100` | `D7` |
| sinal | evidência textual | string | `Enrolados=5` | `ev("carga_por_praca", …)` | `sinais.ts:450` | R5-B |
| view model | `pressao: Campo<number>` | **0–100, adimensional** | `round(carga / baseline * 50)`, saturando em 100 | `home-vm.ts:253` | `D6` |
| display | cor + pressão + evidência | — | a unidade **cancela** na razão; o número cru aparece na evidência | `home.js` | O-gates |

**UNKNOWN, declarado:** não existe contrato dizendo qual granularidade de `grupo` um
produtor deve emitir, nem contrato exigindo que `carga` e `baseline_por_praca` sejam
medidos na **mesma** unidade. A razão do view model só tem sentido se forem — e isso
hoje é convenção, não contrato.

### 6.3 Experimento controlado — 1 pedido / 5 itens

Executado pelo caminho real (ledger JSONL em disco → `projetarLeitura`), guardas
`D1`–`D3`:

| Registro da bancada | SOURCE_VALUE | PROJECTION_VALUE | SIGNAL_VALUE | VM_VALUE | DISPLAY_VALUE |
|---|---|---|---|---|---|
| 5 trabalhos, `quantidade: 1` cada | 1 pedido / 5 itens | `abertos = 5` | `Enrolados=5` | pressão **83** (baseline 3) | vermelho/âmbar conforme sinal |
| 1 trabalho, `quantidade: 5` | 1 pedido / 5 itens | `abertos = 1` | `Enrolados=1` | pressão **17** | ritmo normal |

**A mesma realidade operacional produz 5 ou 1.** A diferença não está no projetor, no
sinal nem no desenho: está no **grânulo com que a bancada registra**. Logo:

- não é `PROVEN_ITEMS` — o projetor lê `quantidade` e a descarta;
- não é `PROVEN_ORDERS` — dois grupos do mesmo pedido contam duas vezes;
- é `PROVEN_OTHER`: **unidades de trabalho abertas (pedido × grupo) por praça**;
- e a tradução "itens → número" é `CALIBRATION_PENDING`, porque falta contrato de granularidade.

### 6.4 Divergência com o pacote visual — registrada, não resolvida

`README_FIRST.md` do pacote declara: *"Sushi / Sushi Quentes / Cozinha / Conferência:
magnitude principal = número de itens. Caixa / Motoboy: magnitude principal = número
de pedidos."* O domínio, em `areas.ts`, diz outra coisa:

| Ambiente | Pacote visual | `AMBIENTES[].medicao` no runtime |
|---|---|---|
| Sushi · Cozinha | itens | `carga_por_praca` (trabalhos abertos) |
| Conferência | itens | `sinal_por_pedido` |
| Caixa | pedidos | **`sem_medicao_automatica`** — nenhuma fonte mede a fila da Caixa |
| Motoboy | pedidos | `expedicao` |

**O domínio não cedeu, e não pode ceder por conveniência visual** (D-M1-05).
`areas.ts` está congelado por sete gates e mudar regra de área exige o César
(índice canônico §6). Guarda `D5` reprova se a Caixa ganhar medição automática sem
decisão registrada.

**Decidida por César em 2026-08-11 — D-M1A1-08 e D-M1A1-09, §0.** A unidade
canônica é `OPEN_OPERATIONAL_WORK_UNITS`; a Caixa continua sem medição
automática; a granularidade segue `CALIBRATION_PENDING` até que uma fonte real
prove a equivalência. `Q-013` fica **respondida em parte**: a semântica está
fechada, o contrato de granularidade não.

---

## 7. Auditoria das skills internas — lidas por inteiro

Sete skills em `.claude/skills/`. **Cada uma foi lida integralmente**, não pelo
frontmatter. A contagem de linhas abaixo é a prova de leitura exigida pela mutação
**M-J**, verificada por `E1` contra o arquivo real.

| Skill | Tamanho | Propósito | Relevância M1A.1 | Relevância M1B | Conflito com o cânone atual | Veredito |
|---|---|---|---|---|---|---|
| `deliveryos-adversarial-review` — **136 linhas** | 5 295 B | remover a garantia e exigir a falha | **alta** — todo gate desta ponte tem controle positivo | alta | nenhum | **MANTER** |
| `deliveryos-architecture-guardrails` — **163 linhas** | 5 873 B | L1–L10 inegociáveis; tecnologias proibidas | média — L9/L10 governam ausência e simulado | **alta** — proíbe Figma como fonte de verdade do domínio | nenhum | **MANTER** |
| `deliveryos-evidence-gate` — **151 linhas** | 5 154 B | R1–R10; PULADO em voz alta | **alta** — R3, R7, R8 aplicados aqui | alta | nenhum | **MANTER** |
| `deliveryos-execution-loop` — **128 linhas** | 4 352 B | reproduzir antes de corrigir | média | alta | nenhum | **MANTER** |
| `deliveryos-figma-code-sync` — **154 linhas** | 6 167 B | Figma ↔ código; 3 páginas; Code Connect | média | **alta** | **SIM — ver §8** | **MANTER COM RESSALVA** |
| `deliveryos-release-readiness` — **142 linhas** | 5 083 B | veredito único; Gate 3/4 de custo | média — o veredito desta missão segue o formato | alta | nenhum | **MANTER** |
| `tata-product-system` — **114 linhas** | 4 706 B | Sprint V2 como fonte canônica global | **alta** — protocolo antes de implementar UI | **alta** | **SIM — ver §8** | **MANTER COM CORREÇÃO** |

Nenhuma skill foi inventada. As sete existem e batem com o inventário de M1A.

---

## 8. Conflitos de skill × autoridade mais nova

### 8.1 `deliveryos-figma-code-sync` × os dez gates de congelamento

| Campo | Conteúdo |
|---|---|
| SKILL | `deliveryos-figma-code-sync` |
| CONFLICT | a skill manda **produzir** `docs/figma/SCREEN_INVENTORY.md`, `COMPONENT_MAPPING.md`, `DESIGN_TOKENS.json`, `FIGMA_SYNC_MANIFEST.json`. Sete gates R5 congelam `docs/figma/` com diff vazio. Obedecer a skill hoje **derruba** `npm run test:platform:r5`. |
| OLDER_AUTHORITY | a skill (escrita antes dos gates de R5-A a R5-D3) |
| NEWER_AUTHORITY | os gates R5, com baselines de 2026-08-03/04 |
| RECOMMENDED_RESOLUTION | a skill **não** é obedecida em `docs/figma/` até que o envelope M1 seja aprovado e os gates migrem para intervalo fechado. Até lá vale a própria "condição de parada" dela: produzir o handoff **fora** de `docs/figma/` e seguir. |
| RUNTIME_IMPACT | nenhum |
| DOC_IMPACT | o envelope M1 (`M1_VISUAL_CHANGE_ENVELOPE.md`) declara `docs/figma/` como caminho **AUTHORIZED_WITH_GATE** |

### 8.2 `tata-product-system` — caminho obsoleto

| Campo | Conteúdo |
|---|---|
| SKILL | `tata-product-system` |
| CONFLICT | aponta `docs/PRODUCT_CONSTITUTION.md`; o arquivo vinculante é `docs/product/DELIVERYOS_PRODUCT_CONSTITUTION.md` (nível 4 do índice canônico, entrou em 2026-08-04) |
| OLDER_AUTHORITY | a skill |
| NEWER_AUTHORITY | índice canônico §2 |
| RECOMMENDED_RESOLUTION | correção de ponteiro, sem mudar o conteúdo da skill. **Não aplicada nesta missão** — editar skill é mudança de contrato de trabalho, e a missão M1A.1 não a autoriza. Fica registrada aqui e no envelope. |
| RUNTIME_IMPACT | nenhum |
| DOC_IMPACT | uma linha, quando autorizado |

### 8.3 Contradição interna do cânone de movimento (pré-existente)

`MOTION_TOKENS.json` lista `bloco de evidencia` em `reveal.permitido_em`;
`MOTION_COMPONENT_MAPPING.md` diz *"evidência não anima, em hipótese nenhuma"*. Os
dois são canônicos e discordam — registrado em `CANONICAL_MOTION_PARITY.md` §4, D56,
e **ainda aberto**. Resolvido na gramática nova: ver `M1_MOTION_GRAMMAR.md` §3.

---

## 9. Matriz de capacidade Figma — medida, não inferida

```
FIGMA_CONNECTOR_PRESENT   = VERIFIED
FIGMA_READ_CAPABILITY     = VERIFIED
FIGMA_WRITE_CAPABILITY    = NOT_PROVEN
```

| Dimensão | Estado | Como foi determinado |
|---|---|---|
| ACCOUNT/IDENTITY | `VERIFIED` — handle *Cesar Spichencoff*, `cesar.spichencoff@gmail.com` | `whoami` |
| SEAT | `View`, tier `starter`, plano `team::1663442695934905944` | `whoami` — **registrado como dado, não usado como base de veredito** |
| READ | **`VERIFIED`** | `get_metadata(IMWH8ZKMF5ra3QJYiR6vGa, 2:2)` devolveu a página `01 — Design System` inteira: 4 sections, foundations, 5 estados de runtime, 6 eixos semânticos, 5 blocos de componente |
| enumeração de páginas | `PARCIAL` | sem `nodeId` a ferramenta lista **1** página (`0:1`); o repositório declara 3. `2:2` existe e responde. `2:3` não foi consultado. A própria skill documenta que a listagem cobre só a página carregada. |
| WRITE / CREATE / UPDATE / DELETE | **`NOT_PROVEN`** | **probe não executado** — motivo abaixo |
| DEV MODE · CODE CONNECT | `EXPOSED`, não exercitado | ferramentas presentes no conector |
| QUOTA / RATE LIMIT | `UNKNOWN` | nenhum limite atingido; recurso `rate-limits-access.md` oferecido pelo servidor, não lido |
| SCREENSHOT / IMAGE | `EXPOSED`, não exercitado | `get_screenshot` presente |

**Por que o probe reversível não foi executado — e o motivo não é o assento.**

O probe da §26 exige objeto **isolado e não-produtivo**, que não altere frames
aprovados nem sobrescreva componentes. As duas únicas superfícies de escrita
disponíveis falham esse requisito:

1. **criar arquivo novo** — `deliveryos-figma-code-sync`, seção *Ações proibidas*:
   *"Criar página nova · criar arquivo novo"*. Proibição explícita do repositório.
2. **escrever dentro de `IMWH8ZKMF5ra3QJYiR6vGa`** — é o Product System de produção,
   com frames aprovados. Não é superfície não-produtiva.

Não existe terceira superfície. Logo o probe não é executável **sem violar o cânone
interno ou o próprio requisito do probe**. `M1_CAPABILITY_PROBE_DO_NOT_KEEP` **não
foi criado**, e portanto não há resíduo:

```
CREATE_RESULT   = NOT_RUN (nenhuma superfície não-produtiva permitida)
READBACK_RESULT = NOT_RUN
DELETE_RESULT   = NOT_RUN
RESIDUE_CHECK   = LIMPO — nenhum objeto criado
```

**O que César pode autorizar**, se quiser o dado empírico: um arquivo Figma
descartável, fora do team do Product System, onde o probe roda uma vez e é apagado.
Isso é decisão dele — e o assento continua sem valer como prova em nenhuma direção.

---

## 10. Papel do Figma em M1B

| Pergunta | Resposta |
|---|---|
| WHAT NEEDS FIGMA PARITY | os estados semânticos (`ds-state`, eixos procedência/observação/ciclo/conexão/erro/disponibilidade) — eles já existem no Figma e no código, e divergir é criar duas verdades |
| WHAT CAN BE CODE-FIRST | a expressão nova do Copiloto: campo escavado, câmaras, massa, compressão, Foco espacial. Nada disso existe no Figma hoje. |
| WHAT MUST NOT BLOCK M1B | qualquer sincronização de `docs/figma/**` — está congelada por sete gates e não é pré-requisito de implementação |
| WHAT WOULD REQUIRE HUMAN VISUAL REVIEW | a primeira composição real do campo escavado na Home, e a densidade das marcas quando a operação real definir o grânulo |

> *"O Figma não inventa a experiência. Ele consolida a experiência aprovada."*

---

## 11. Radar de referências — registro, não pesquisa

Nenhuma foi pesquisada nesta missão. Orçamento de inteligência acima de curiosidade.

| Referência | INSPECTED | Hipótese de papel | Melhor estágio | Veredito |
|---|---|---|---|---|
| Impeccable | **NÃO** | crítica visual adversarial · polimento final | depois da primeira composição de M1B | avaliar em M1B, não instalar |
| Emil Kowalski | **NÃO** | craft de motion: timing, easing, interrupção | depois da gramática implementada | avaliar; **não** pode sobrepor H3, wait≠fluxo, evidência estática |
| transitions.dev | **NÃO** | microtransição e estado de elemento | polimento | referência apenas; nunca autoridade de sistema |
| GSAP | **NÃO** | capacidade técnica condicional | só se CSS/SVG falhar em propriedade provada | **NATIVE_FIRST** — guarda `E3` reprova instalação |
| OriginKit | **NÃO** (PB12, reclassificado D57) | craft/referência | refinamento futuro | `REFERENCE_ONLY`, não bloqueia |
| Dot Matrix | **NÃO** | micromovimento técnico verdadeiro | só se surgir estado semântico real de processamento | adiado; **wait nunca anima para sugerir atividade** |
| VibeHub glossary | **NÃO** | vocabulário de design | tradução de intenção humana | adiado |
| MotionSites | **NÃO** | divergência composicional | futuros primos / nova North Star | **não** relevante ao Copiloto aprovado |
| Border Beam | **NÃO** | — | — | **ANTI-REFERÊNCIA** para foco operacional: prioridade não se fabrica com anel luminoso |
| Kree8 · Jay · Elaya | **NÃO** | — | — | `NOT_INSPECTED`; nada atribuído |

---

## 12. O que esta ponte **não** é

Esta é revisão do construtor sobre o próprio trabalho. **Não é auditoria
independente** e não deve ser citada como tal — o construtor não certifica a si
mesmo. O que existe aqui é: medição reproduzível, controle positivo em cada família
de guarda, e a lista explícita do que continua desconhecido.

Nenhuma linha de runtime de produto foi alterada por esta missão.
