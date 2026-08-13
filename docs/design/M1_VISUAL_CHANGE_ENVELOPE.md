---
lifecycle:
  artefato: docs/design/M1_VISUAL_CHANGE_ENVELOPE.md
  status: ACTIVE
  authority_scope: m1_visual_change_authorization
  superseded_by: null
  atualizado_em: "2026-08-11"
  state_basis: f87a36dfd39c9989344f0fed6ebf8db5db1a8c35
  missao: M1A.1 — ponte canônica e estrutural
---

# Envelope de mudança visual M1

> *"Uma prova histórica protege o passado. Não congela legitimamente todo o futuro."*
>
> Este documento existe porque as duas coisas estavam coladas numa asserção só, e a
> segunda estava sendo confundida com a primeira. Ele **não** enfraquece nenhuma
> prova histórica. Ele separa o que a prova realmente afirmou do que ela passou a
> impedir por efeito colateral.
>
> Guarda executável: `npm run test:platform:m1-bridge`.

---

## 1. Identidade

```
BASELINE            = f87a36dfd39c9989344f0fed6ebf8db5db1a8c35
BASELINE_DATE       = 2026-08-07
BRANCH              = feature/m1-copilot-design-code-bridge-v1
MISSION             = M1B — implementação visual da experiência Copiloto na Home `/`
TARGET_SURFACE      = `/` (Home)
HUMAN_APPROVAL_STATE = AWAITING_CESAR_M1B_EXECUTION_APPROVAL
```

Nada neste envelope entra em vigor antes da aprovação. Enquanto ela não existir, o
envelope é **descrição do que M1B poderá fazer**, não licença.

---

## 2. O defeito estrutural que este envelope resolve

Existem **dez** gates de congelamento no repositório, não um. Todos executam a mesma
forma:

```ts
git diff --name-only <BASELINE_DO_GATE> -- <caminhos>   //  precisa ser ""
```

`git diff <base> -- <paths>` compara o baseline com a **árvore de trabalho atual**.
Isso é um intervalo **aberto à direita**: a asserção nunca fecha. Ela afirma
"nada mudou desde então" — para sempre. Consequência: qualquer mudança autorizada em
`src/product/ui/` derruba os dez, e a única saída aparente vira reancorar baseline,
que é exatamente o que o César recusou em letra própria (D83).

**A separação correta são duas asserções diferentes, não uma enfraquecida:**

| Asserção | Forma | O que afirma | Quando falha |
|---|---|---|---|
| **`GATE-H` — histórica** | `git diff --name-only <BASE> <BASELINE_M1> -- <paths>` | o intervalo que a missão original certificou continua íntegro | se alguém **reescrever a história** dentro do intervalo |
| **`GATE-E` — envelope** | `git diff --name-only <BASELINE_M1> HEAD -- <paths>` ⊆ `AUTHORIZED_PATHS` | tudo que mudou **depois** do baseline está autorizado por escrito | se mudança nova sair do envelope |

A primeira é **fechada nos dois lados** e por isso é imune a trabalho futuro. A
segunda é onde o futuro vive. Nenhuma das duas é mais fraca que a asserção original:
juntas elas afirmam **mais**, porque a original não sabia distinguir adulteração de
trabalho autorizado.

Prova executável nos dois sentidos: guardas `C2` (histórico limpo), `C3` (o mesmo
comando **acusa** um intervalo adulterado) e `C5` (mudança pós-baseline fora do
envelope reprova) em `src/platform/run-m1-bridge-tests.ts`.

### Medido, não estimado

Uma linha autorizada acrescentada a `src/product/ui/surfaces/home.css`, commitada
sobre o baseline, e cada gate executado isoladamente:

| | Resultado |
|---|---|
| gates de congelamento vermelhos | **10 de 10** |
| `PF4-H` (intervalo fechado `73f2f0b..f87a36d`) | **verde** |
| `PF4-E` (envelope) | **verde** — `home.css` está em `AUTHORIZED_PATHS` |
| após reverter | 10 de 10 verdes de novo |

É a demonstração inteira em um experimento: o passado continua provado, a mudança
autorizada continua autorizada, e o que quebrava era só a metade que a asserção
nunca deveria ter afirmado.

---

## 3. Inventário dos dez gates de congelamento

Medido em `f87a36d`. Todos os baselines são ancestrais de HEAD — verificado com
`git merge-base --is-ancestor`.

| # | Gate | Arquivo | BASE | Caminhos congelados |
|---|---|---|---|---|
| 1 | `R5A-30` | `run-r5a-temporal-tests.ts` | `4365c61` | `home.css` · `organismo-tokens.css` · `areas.ts` |
| 2 | `R5B VISUAL` | `run-r5b-invariant-tests.ts` | `bd1ad55` | `home.css` · `ui/tokens/` · `areas.ts` · `docs/figma/` |
| 3 | `R5C VISUAL` | `run-r5c-translation-tests.ts` | `ad3b1bc` | idem 2 |
| 4 | `R5D0-C VISUAL` | `run-r5d0-readiness-tests.ts` | `27ccfd2` | idem 2 |
| 5 | `R5D0 confiança` | `run-r5d0-confidence-tests.ts` | `b100943` | idem 2 |
| 6 | `R5D0 linhagem` | `run-r5d0-lineage-tests.ts` | `ced38da` | `src/product/ui/` · `areas.ts` · `perfil-delivery/` · `docs/figma/` |
| 7 | `R5D0 storage` | `run-r5d0-storage-tests.ts` | `2af52e1` | `viewmodels/` · `politica-temporal.ts` · `linhagem-eventos.ts` · `src/product/ui/` · `perfil-delivery/` · `docs/figma/` |
| 8 | **`PF4`** | `run-r5d1-event-lineage-tests.ts` | `73f2f0b` | `perfil-delivery/` · `viewmodels/` · `politica-temporal.ts` · `linhagem-eventos.ts` · `confianca-duravel.ts` · `src/product/ui/` · `docs/figma/` |
| 9 | `Q17` | `run-r5d2-producer-qualification-tests.ts` | `f1fe480` | idem 8 + `projetar-leitura.ts` · `catalogo-operacional.ts` |
| 10 | `S11` | `run-r5d3-shadow-path-tests.ts` | `1a35ebe` | `perfil-delivery/` · `viewmodels/` · `atencao/` · `platform/copiloto/` · `eventos/*` · `src/product/ui/` · `docs/figma/` |

**M1A tratou o PF4 como caso único. Ele não é.** Nove irmãos congelam os mesmos
caminhos. Um envelope que resolvesse só o PF4 deixaria M1B esbarrando em nove muros
invisíveis no primeiro commit. Guarda `C6` reprova se o inventário perder um deles ou
copiar baseline errado.

---

## 4. Reconstrução histórica do PF4

| Campo | Valor |
|---|---|
| `PF4_HISTORICAL_BASELINE` | `73f2f0b` — *"memoria: compatibilidade duravel fechada, e o ultimo bloqueio tem nome"*, 2026-08-04 |
| `PF4_HISTORICAL_END_OR_MISSION_SCOPE` | R5-D1 — fundação de linhagem operacional. Fim do intervalo certificado por esta missão: `f87a36d`. |
| `PF4_PROTECTED_PATHS` | `src/perfil-delivery/` · `src/product/viewmodels/` · `src/product/atencao/politica-temporal.ts` · `src/product/atencao/linhagem-eventos.ts` · `src/platform/copiloto/confianca-duravel.ts` · `src/product/ui/` · `docs/figma/` |
| `PF4_PROTECTED_PROPERTY` | diff de nomes **vazio** nesses caminhos — nenhuma edição **e nenhum arquivo novo** |
| `PF4_REPRO_COMMAND` | `npm run test:platform:r5d1-event-lineage` · isolado: `git diff --name-only 73f2f0b -- <paths>` |
| `PF4_HISTORICAL_MUTATION` | `git diff --name-only 4365c61 f87a36d -- <paths>` devolve conteúdo → a asserção **acusa**. Guarda `C3`. |

**Por que ele existe.** R5-D1 construiu a fundação de linhagem de eventos enquanto o
Copiloto e a Home já estavam de pé. O congelamento garante que a fundação nova **não
tocou** no que já era verdade: nem view model, nem UI, nem confiança, nem política
temporal, nem o handoff de Figma. Sem ele, "a fundação não mudou o produto" seria
afirmação, não medição.

**O que ele nunca afirmou:** que aqueles caminhos estejam corretos, bonitos,
completos ou aprovados. Nem que devam permanecer imutáveis para sempre. Ele afirma
**ausência de alteração dentro de uma janela**. A leitura "portanto nada pode mudar"
é interpretação, não conteúdo da prova.

**D83 registra o preço já pago por essa confusão:** o Lab `operacao-viva-v4` nasceu
fora de `src/product/ui/` porque um arquivo **novo** naqueles caminhos derrubaria o
PF4. A alternativa recusada foi reancorar o baseline. Este envelope é a terceira via
que faltava.

---

## 5. Envelope autorizado

### `AUTHORIZED_PATHS`

Implementação visual da experiência Copiloto na Home:

```
src/product/ui/surfaces/home.js
src/product/ui/surfaces/home.css
src/product/ui/tokens/organismo-tokens.css
src/product/ui/tokens/product-tokens.css
src/product/ui/components/components.css
src/product/ui/components/icons.js
src/product/ui/components/ui.js
src/product/ui/shell/shell.css
src/product/ui/index.html
src/product/ui/app.js
```

Suporte visual diretamente necessário, **com portão**:

```
docs/figma/                        AUTHORIZED_WITH_GATE
src/product/viewmodels/home-vm.ts  AUTHORIZED_WITH_GATE
```

`AUTHORIZED_WITH_GATE` significa: permitido **somente** se a mudança for de
apresentação e não alterar semântica de domínio, e **somente** com a migração da §7
aplicada e aprovada.

### `AUTHORIZED_CHANGE_CLASSES`

- composição, geometria, espaço, tipografia, cor, profundidade, materialidade;
- tokens visuais e de movimento **derivados** do cânone;
- estrutura de marcação a serviço da nova expressão;
- transição e keyframe que correspondam a mudança de estado real;
- variantes mobile com composição própria;
- acessibilidade: contraste, foco, `prefers-reduced-motion`, ordem de leitura;
- **novos campos de apresentação** no view model da Home que sejam função pura de
  dado já existente — nunca fonte nova de verdade.

### Exceção estreita — César, 2026-08-11 (M1B-R1)

```
src/product/viewmodels/sinais.ts   TEXTUAL_SEMANTIC_TRUTH_CORRECTION_ONLY
```

Autorizada **uma** correção, e só ela: a frase do sinal S5 dizia
*"com N pedidos"* para `carga_por_praca`, o que D-M1A1-08 provou falso.
`"N pedidos"` → `"N trabalhos abertos"`.

**Raio de alcance provado antes da edição.** Consumidores de `.resumo`:
`home.js` (4 sítios de exibição), `home-vm.ts`, o Lab V4 (exibição e uma
comparação de `resumo` consigo mesmo) e duas varreduras de texto. **Nenhum
depende do literal "pedidos"** — `run-r5c-translation-tests.ts:84` e
`run-r5d0-confidence-tests.ts:107` constroem fixtures de entrada, e
`run-home-signals-tests.ts:405` asserta a frase de outro sinal.

Não mudaram: o número, a razão, a severidade, a elegibilidade, a projeção, o
tratamento de `quantidade`, o agrupamento, a evidência, a confiança, a
propriedade de área nem a lógica de estado do sinal.

**Consequência:** a compensação `fraseDoSinal()` que M1B tinha posto em
`home-vm.ts` foi **removida**. Uma verdade só, na fonte, em vez de duas.

### `FORBIDDEN_PATHS`

```
src/product/viewmodels/areas.ts            (contrato de domínio)
src/product/viewmodels/sinais.ts           (regra de sinal — exige o César;
                                            exceção textual acima é a única
                                            aberta, e não se estende)
src/product/viewmodels/copiloto-vm.ts
src/product/atencao/**
src/product/eventos/**
src/perfil-delivery/**
src/platform/copiloto/**
src/entregas/**
src/conference-brain/**
android/**  ·  deploy/**  ·  config/**
```

### `FORBIDDEN_CHANGE_CLASSES`

- mudar significado de domínio, unidade, confiança, linhagem ou evento;
- mudar aquisição de fonte ou adaptador de produção;
- fazer ausência virar zero, ou "sem medição" virar verde;
- animar evidência, sinal, ocorrência, erro ou falha técnica;
- transformar dado de demonstração em dado real, ou fixture sem carimbo;
- instalar biblioteca de design ou motion sem necessidade provada;
- renomear rota de runtime por estética de terminologia;
- promover `/copiloto` a superfície aprovada;
- reancorar, suspender, apagar ou enfraquecer qualquer gate de congelamento;
- tocar em `Entregas`, `CRM`, primos futuros ou credencial de produção.

### `INVARIANTS`

1. ausência é estado declarado, nunca zero e nunca verde;
2. procedência e horário sempre visíveis onde houver afirmação;
3. um Foco soberano por contexto de decisão;
4. movimento corresponde a mudança de estado real; espera não finge fluxo;
5. `prefers-reduced-motion` preserva **toda** a informação;
6. a topologia da operação não muda para caber na tela;
7. o domínio decide o que o dado significa — o desenho decide como torná-lo perceptível;
8. fixture simulada se identifica como simulada.

### `REQUIRED_TESTS`

```bash
npm run test:platform:m1-bridge
npm run test:platform:visual-order
npm run test:platform:governanca
npm run test:platform:home
npm run test:platform:organismo
npm run test:platform:r5
npm run build && npm run typecheck
```

### `MUTATIONS` que M1B precisa manter vivas

`M-A` alvo trocado · `M-B` adulteração histórica · `M-C` mudança futura legítima ·
`M-F` unidade fabricada pelo rótulo · `M-H` duas autoridades de movimento ·
`M-I` timing de demo virando constante · `M-M` dependência por curiosidade.

### `ROLLBACK`

```bash
git -C <worktree-m1> reset --hard f87a36dfd39c9989344f0fed6ebf8db5db1a8c35
```

A worktree é dedicada e não tem upstream. Nada foi enviado, mesclado nem publicado.
Descartar a worktree inteira também é rollback completo: a worktree original
`deliveryos-hybrid-platform-foundation-v1` é independente e não foi tocada.

---

## 6. O que M1B **não** decide sozinho

Se a implementação visual exigir qualquer um destes, o veredito é
`M1_STRUCTURAL_DECISION_REQUIRED` e a missão para:

- granularidade de `carga_por_praca` (o `grupo` do registro de trabalho);
- medição automática para a Caixa;
- mudar `sinais.ts` — inclusive S12 "só quentes" (D84);
- migrar Sushi Quentes para unidade operacional própria;
- conectar fonte viva;
- qualquer alteração em `areas.ts`.

---

## 7. Migração dos gates — **APLICADA** em 2026-08-11 (D-M1A1-10)

Autorizada por César. Cada gate recebeu **uma** mudança, mecânica e idêntica: o
segundo argumento de commit passou a existir, fechando o intervalo.

```diff
- git diff --name-only 73f2f0b -- <paths>
+ git diff --name-only 73f2f0b FIM_HISTORICO -- <paths>
```

```
FIM_HISTORICO = f87a36dfd39c9989344f0fed6ebf8db5db1a8c35
```

**Por que este fim, e não o commit em que cada missão terminou.** O fim
certificado é o **último commit em que a propriedade foi verificada verde**. Todos
os dez estavam verdes em `f87a36d`. Escolher o encerramento de cada missão
encurtaria o intervalo provado — e encurtar a janela é enfraquecer a garantia,
que D-M1A1-10 proíbe. Cada gate mantém o **seu** baseline; o que passou a ser
comum é o fim.

**Preservado, item por item:**

| Requisito de D-M1A1-10 | Como |
|---|---|
| preservar cada baseline | `C2` compara com a tabela dos dez originais e reprova reancoragem |
| identificar o fim certificado | `FIM_HISTORICO` declarado em cada gate, com a razão no comentário |
| preservar caminhos e propriedade | pathspecs intocados; `--name-only` intocado; arquivo **novo** continua derrubando |
| preservar o comando de reprodução | `npm run test:platform:r5` e cada `run-r5*-tests.ts` continuam valendo |
| mutação de adulteração | `C4` executa o mesmo comando sobre `fcfc21d..f87a36d` e **exige** saída não vazia, gate a gate |
| não reancorar história | nenhum baseline mudou |
| não apagar evidência | nenhum teste removido; os dez continuam onde estavam |
| não enfraquecer o passado | a janela provada não encolheu |

**Como o controle não pode envelhecer:** a família C **lê os pathspecs da fonte
dos próprios gates** (`lerGate`), com os comentários removidos antes da leitura.
Se um gate mudar de baseline, de fim ou de caminho, a guarda lê a mudança — não
existe cópia paralela para divergir em silêncio.

**A metade do futuro** é afirmada uma vez só, em `C6`: a união de todos os
caminhos protegidos, comparada com HEAD, precisa caber em `AUTHORIZED_PATHS`.
