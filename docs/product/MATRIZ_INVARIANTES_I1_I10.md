# Matriz dos invariantes I1–I10 — executáveis

> **R5-B.** O contrato da consciência (`CONTRATO_CONSCIENCIA_COPILOTO.md` §6) dizia, em letra
> própria: *"Nenhuma destas foi testada ainda."* Esta matriz registra o texto canônico **transcrito**,
> o dono, o código que sustenta, a lacuna e a mutação que a exercita.
> Guarda: `npm run test:platform:r5b` · agregador: `npm run test:platform:r5` (R5-A + R5-B).
>
> **Regra que governa toda linha desta matriz:** comentário, nome de variável ou presença de uma
> palavra **não constitui prova** de invariante. O gate verifica **comportamento**, estrutura
> executável ou contrato de tipo real.

---

## 1. Texto canônico — transcrito, não reconstituído

Fonte: `docs/product/CONTRATO_CONSCIENCIA_COPILOTO.md` §6, linhas 147–158.

| # | Invariante | Como se prova (texto do contrato) |
|---|---|---|
| I1 | A ação nunca troca a causa raiz do foco | mutação: remover `dentroDoEscopo()` → o gate cai |
| I2 | Sem candidato no escopo, sai foco puro (nunca ação de outra causa) | fixture com foco sem candidato compatível |
| I3 | Calmo devolve `null` de orientação | fixture sem situação acima do piso |
| I4 | Ambiente nunca carrega bloco de ação | asserção estrutural na view model |
| I5 | Um ambiente vermelho nunca fica oculto | fixture com 2 vermelhos simultâneos |
| I6 | Área sem fonte nunca aparece verde | fixture Caixa/Conferência sem dado |
| I7 | Exclusividade de slot: nunca dois focos | fixture com duas situações severas |
| I8 | Nenhuma orientação executa ação | asserção sobre vocabulário e ausência de controle |
| I9 | Confiança sem evidência não é apresentada | já provado na Unidade 6; reaplicar aqui |
| I10 | Procedência declarada em toda orientação | real × simulado × controle distinguíveis |

---

## 2. A matriz

| Invariante | Dono | Código que o sustenta | Gate atual | Classificação | Lacuna fechada | Mutação |
|---|---|---|---|---|---|---|
| **I1** | motor original | `decisao.js:46` `dentroDoEscopo()` · `:175` filtro | **R5-B** (harness isolado) | **comprovado no domínio** | era **sem gate** | neutralizar `dentroDoEscopo()` → `return true` |
| **I2** | motor original | `decisao.js:177` `if (!elegiveis.length) return null` | **R5-B** (harness isolado) | **comprovado no domínio** | era **sem gate** | `elegiveis = cands` quando o escopo esvazia |
| **I3** | política temporal + view model | `politica-temporal.ts` `orientacao_permitida` · `home-vm.ts` `foco` | **R5-B** + R5-A | comprovado no domínio | era comprovado **só na superfície** | Calmo passa a liberar orientação |
| **I4** | view model (estrutura) + política (tipo) | `home-vm.ts` `FocoVM.orientacao` · `orientacao_permitida` | **R5-B** + R5-A | comprovado no domínio **e** por tipo | era comprovado só na superfície | Ambiente passa a carregar foco |
| **I5** | view model / sinais | `home-vm.ts` `ambientes` (todos os 5, sempre) | **R5-B** + home 44 | comprovado no domínio | reforçado | truncar a lista de ambientes |
| **I6** | `areas.ts` (contrato) + view model | `AMBIENTES[].medicao` · `Campo<T>` | **R5-B** + organismo 27 | comprovado no domínio | reforçado | Caixa declara `carga_por_praca` |
| **I7** | **política temporal** (R5-A) | `EstadoTemporal.foco: FocoAtivo \| null` · guarda de slot livre | **R5-B** + R5-A | comprovado no domínio | era comprovado **só na superfície** | permitir preempção |
| **I8** | view model + Shadow | `OrientacaoVM.executa` · `RecommendationStatus` sem `executed` | **R5-B** + copiloto 39 | comprovado no domínio **e** no Shadow | reforçado | `executa: true` |
| **I9** | view model / `estados.ts` | `Campo<T>` sem `valor` quando `observado === false` | **R5-B** + Product System 44 | comprovado por **tipo** e comportamento | reaplicado aqui | sinal sem nenhuma evidência |
| **I10** | view model | `OrientacaoVM.procedencia` · `HomeVM.demonstracao` | **R5-B** + home 44 | comprovado no domínio | reforçado | procedência fixada em `demonstracao` |

**Nenhum invariante ficou `sem gate`, `inaplicável antes de R5-C` ou `bloqueado por contrato ausente`.**
I1 e I2 exigiam o motor original, e ele **existe neste repositório** — bastou um harness isolado.

---

## 3. Prova positiva e prova negativa — por que as duas

Metade destes invariantes é uma **ausência** (`null` de orientação, nenhuma ação, nenhum segundo
foco). Um cano entupido devolve a mesma ausência que a recusa deliberada. Por isso cada invariante
tem, ao lado, o caso em que a mesma via **entrega**:

| Invariante | Positiva | Negativa (o par que dá sentido) |
|---|---|---|
| I1 | com foco ativo, vence `combinados` (a causa do foco) | **sem** foco ativo, vence `enrolados` — a mais forte. Sem isso, I1 passaria com um motor que só sabe devolver `combinados` |
| I2 | foco de conferência sem candidato → `null` | o **mesmo snapshot** com foco de praça → devolve ação |
| I3 | Calmo não tem orientação | o Foco **tem** |
| I4 | Ambiente não tem caminho até a orientação | o mesmo caminho **entrega** no Foco |
| I5 | duas áreas pressionadas continuam visíveis | uma operação calma **não** pinta área |
| I6 | Caixa nunca verde | uma área **com** fonte fica verde quando calma |
| I7 | duas causas severas → **um** foco | o slot **libera** e aceita outra causa depois |
| I8 | a orientação declara `executa: false` | a superfície **tem** controle de navegação — a ausência é de execução, não de interatividade |
| I9 | confiança apresentada tem evidência | confiança ausente **se declara** ausente, sem virar zero |
| I10 | fixture declara procedência não-real | leitura real declara `real` |

---

## 4. As dez mutações — e a prova de que o mutante foi carregado

`ARTEFATOS {…}` é impresso pelo gate com o sha256 curto de cada arquivo que ele **leu**. O harness
compara com o do original: marca igual = o gate rodou uma cópia limpa e a mutação **não conta**.

| # | Invariante | Mutação semântica | Arquivo | Acusou | Mutante carregado | Restauração |
|---|---|---|---|---|---|---|
| 1 | I1 | neutralizar `dentroDoEscopo()` | `decisao.js` | **I1, I2** | sim | byte a byte |
| 2 | I2 | escopo vazio cai para candidatos de outra causa | `decisao.js` | **I2** | sim | byte a byte |
| 3 | I3 | Calmo libera orientação | `politica-temporal.ts` | **I3** | sim | byte a byte |
| 4 | I4 | Ambiente carrega foco | `home-vm.ts` | **I4, BYPASS** | sim | byte a byte |
| 5 | I5 | esconder pressões secundárias | `home-vm.ts` | **I5, I6** | sim | byte a byte |
| 6 | I6 | Caixa declara medição inexistente | `areas.ts` | **I6, VISUAL** | sim | byte a byte |
| 7 | I7 | permitir preempção | `politica-temporal.ts` | **I7** | sim | byte a byte |
| 8 | I8 | `executa: true` | `home-vm.ts` | **I8** | sim | byte a byte |
| 9 | I9 | sinal sem evidência | `sinais.ts` | **I9, VISUAL** | sim | byte a byte |
| 10 | I10 | procedência fixada | `home-vm.ts` | **I10** | sim | byte a byte |
| — | BYPASS | chamador real omite a eleição temporal | `home-vm.ts` | **BYPASS** | sim | byte a byte |

**10/10 invariantes com mutação acusada · 0 cegas · 0 não aplicadas · 0 mutantes não carregados.**

A mutação de **BYPASS** não é contada como substituta de nenhum dos dez.

**Uma mutação nasceu inútil, e vale registrar:** a primeira versão de I1 **não aplicou** — `decisao.js`
está no disco em **CRLF** e a âncora usava `\n`. O harness acusou como `nao_aplicada` e
`mutante_nao_carregado`, e não como "invariante verde". **Uma mutação que não altera a execução não
conta como acusada** — foi exatamente para pegar isto que a marca do mutante existe.

---

## 5. Bypass da política temporal — fronteira executável

R5-A deixou a eleição temporal **opcional** porque as cenas de demonstração são instantes isolados.
Isso resolvia a fixture e abria uma porta: um chamador real poderia simplesmente não passar o
resultado da política e voltar a eleger por fotografia.

```text
fallback instantâneo → só em fixture ou demonstração EXPLICITAMENTE identificada
caminho real         → obrigado a fornecer a eleição temporal
```

Executável por tipo discriminado em `home-vm.ts`:

```ts
type OrigemDaLeitura =
  | { tipo: "demonstracao"; motivo: string }
  | { tipo: "real"; temporal: EleicaoTemporal };
```

E por comportamento: uma leitura com `procedencia === "real"` que chegue **sem** `origem.tipo ===
"real"` **lança**. Omitir não passa; disfarçar de demonstração não passa. `motivo` é obrigatório no
tipo — uma demonstração precisa **dizer** por que pode pular a política; "não passei" é omissão, não
motivo.

**Nenhum runtime foi conectado.** A fronteira vale para quem ainda nem foi escrito.

---

## 6. D29 — preservado, não resolvido

```text
sem order_id real → não existe recomendação de pedido
```

O gate recusa número visual, índice, posição, texto ou hash improvisado como identidade de pedido
(`identidadeDaCausa` compõe `codigo|ambiente|subarea|pedido|fonte`, e `pedido` vira `-` quando não há
observação). Recomendação de **fonte, ambiente, subárea e causa** continua permitida quando
sustentada. **D29 não foi resolvida nesta missão.**

---

## 7. Observações registradas, não corrigidas

- **A Caixa pode aparecer em âmbar.** O texto canônico de I6 é *"nunca aparece **verde**"*, e é isso
  que o gate exige. Um sinal pode apontar para a Caixa e deixá-la em âmbar sem que ninguém afirme
  saúde — a pressão dela continua `observado: false`. Exigir sempre `sem_medicao` seria inventar
  regra além do contrato.
- **Verde visual não substitui garantia de domínio.** I3, I4 e I7 estavam verdes na superfície desde
  R2 e **não** estavam provados no domínio. Passaram a estar.
- **Presença textual não prova código.** Três guardas deste gate nasceram erradas por isso — uma
  reprovou porque `rota: "/conference-brain"` contém a palavra `conference-brain`. Ver **L36**.
