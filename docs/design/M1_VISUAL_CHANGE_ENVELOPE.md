---
lifecycle:
  artefato: docs/design/M1_VISUAL_CHANGE_ENVELOPE.md
  status: ACTIVE
  authority_scope: m1_visual_change_authorization
  superseded_by: null
  atualizado_em: "2026-10-15"
  state_basis: 642fa1e
  missao: M1A.1 — ponte canônica e estrutural · M1B-R1 · M1B-R2 · exceção Cadeia Real (fora de M1B) · exceção leitura da rua (fora de M1B, 2026-10-09)
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

## 3-bis. Procedência do inventário: de dez para onze

> Esta seção **não corrige** a §3 acima. A §3 é o registro do que M1A.1 mediu, e
> ela continua sendo o que M1A.1 sabia. O que entra aqui é a sucessão: a
> afirmação anterior, a evidência que a falsificou, e o estado atual.

```
PREVIOUS_INVENTORY  = 10
PREVIOUS_STATUS     = FALSIFIED_BY_LATER_DISCOVERY
PREVIOUS_SOURCE     = M1A.1 (§3 desta folha) — dez gates, todos em src/platform/

CURRENT_PROVEN_INVENTORY = 11
CURRENT_STATUS           = ACTIVE
CURRENT_SOURCE           = M1B-R1 — o décimo primeiro é G1 do Lab V4, em
                           labs/operacao-viva-v4/testes/run-lab-v4-tests.ts
```

**Como o décimo primeiro apareceu.** Ele tinha o mesmo defeito de intervalo
aberto dos outros dez (`git diff <base> -- <paths>` sem o segundo commit compara
com a árvore ATUAL). Quando M1B tocou `home.css`, `home.js` e `sinais.ts`, essa
guarda passou a acusar o Lab por trabalho que não era dele. Foi a falha que
revelou o gate, não uma busca que o encontrou.

**Por que M1A.1 não o viu.** O inventário procurou onde gates de congelamento
*moram* — `src/platform/` — em vez de procurar pela *propriedade* que os define.
Este é o genoma de falha `EXPECTED_DIRECTORY_INVENTORY_BLINDNESS`.

### Regra de projeto que nasce daqui

> **Inventarie a propriedade, não apenas o lugar onde espera encontrá-la.**
>
> Inventários de invariantes, gates, contratos e mecanismos críticos devem
> procurar pelo COMPORTAMENTO que define a família, e não só nos diretórios onde
> se espera que ela viva. Um inventário estruturalmente estreito produz um número
> que parece completo e não é — e um número que parece completo é pior do que
> nenhum, porque ninguém volta a conferir.

Guarda executável hoje: `C1` em `src/platform/run-m1-bridge-tests.ts` verifica os
dez de `src/platform/` **e** o décimo primeiro POR NOME, fora dele. Uma guarda
que procure por propriedade em toda a árvore ainda **NÃO EXISTE** — está
registrada como pendência em §29 desta missão, e não conto como fechada.

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

### Exceção estreita — César, 2026-09-24 (Cadeia Real) — fora de M1B · confirmada em 2026-09-25

```
src/product/viewmodels/entregas-vm.ts   READ_ONLY_REALITY_BLOCK_ONLY
src/product/ui/surfaces/entregas.js     READ_ONLY_REALITY_BLOCK_ONLY
```

**Não é autorização de M1B.** M1B continua proibido de tocar `Entregas`
(`FORBIDDEN_CHANGE_CLASSES`, abaixo), e nenhum dos dois caminhos entrou em
`AUTHORIZED_PATHS`. O registro mora aqui porque este envelope é o **único**
lugar que o C6 de `test:platform:m1-bridge` lê para decidir se uma mudança
pós-baseline em caminho protegido tem dono.

**A autorização é do César, na missão Cadeia Real** (2026-09-24). Item 8:
*"ENTREGAS PASSA A LER REALIDADE (…) Crie a menor porta READ-ONLY possível para
a superfície conseguir mostrar alguma realidade sustentada pela vertical
slice."* Item 12: *"Você tem permissão para fazer uma revisão visual focada nas
superfícies diretamente tocadas por esta missão: rider mobile; Entregas;
estados reais/parciais/unknown introduzidos pela integração."*

**O que a classe cobre, e só isso:** o bloco de REALIDADE somente-leitura da
superfície Entregas. No view model, tipos e funções de apresentação sobre a
porta `src/platform/leitura/realidade-de-entregas.ts`, e um parâmetro novo em
`entregasVM()` cujo padrão (`integracao_pendente`, nenhum banco consultado)
preserva o comportamento anterior. Na superfície, a seção "Realidade" e o
título da seção de demonstração, que passou a dizer "(demonstracao)".

**Registrado depois, não antes.** Os commits `1de5b28` e `5effdbe` tocaram os
dois arquivos sem este registro, e o C6 reprovou: FAIL_NOVO, reproduzido na
certificação de 2026-09-25 (`docs/etapa-4-8/CADEIA-REAL.md`). O registro
documenta uma decisão que o César já tinha tomado; não toma decisão nova.

**Confirmada pelo César em 2026-09-25**, explicitamente, e **só** para os dois
arquivos acima e a classe já executada:

- porta READ-ONLY de realidade de Entregas;
- separação explícita demo × realidade;
- apresentação dos estados real/parcial/unknown;
- refinamento visual diretamente necessário dessa superfície.

A confirmação formaliza o trabalho da Cadeia Real. Ela **não** amplia este
envelope nem M1B; **não** libera nenhum outro arquivo de `src/product/ui/` ou
`src/product/viewmodels/`; **não** autoriza redesenho da Home; **não** altera
Calmo, Ambiente ou Foco; e **não** autoriza mudança futura nesses dois arquivos
fora dessa classe.

**O limite da guarda, declarado:** o C6 é por CAMINHO. Ele reprova qualquer
outro arquivo protegido e qualquer registro sem a linha exata (C6c), mas não lê
a CLASSE de uma mudança dentro destes dois arquivos — igual à exceção de
`sinais.ts`. Mudança futura aqui, fora da classe, é barrada por revisão e por
registro novo neste envelope, não pelo gate.

**Não mudaram:** Home, `home-vm.ts`, `sinais.ts`, `areas.ts`, `copiloto-vm.ts`,
o domínio `src/entregas/**`, os selos da demonstração (`somente_demonstracao` e
`simulado` continuam no cabeçalho) e nenhum gate de congelamento.

**Rollback:** reverter o commit que registrou esta exceção (este bloco, e
`EXCECAO_REALIDADE` com o C6c em `run-m1-bridge-tests.ts`), e depois:

```bash
git checkout 0b8803c -- src/product/viewmodels/entregas-vm.ts src/product/ui/surfaces/entregas.js
```

### Exceção estreita — César, 2026-10-09 (missão Product UX solo) — fora de M1B · aguardando confirmação (`Q-022`)

```
src/product/viewmodels/entregas-vm.ts   ENTREGAS_STREET_READING_ONLY
src/product/ui/surfaces/entregas.js     ENTREGAS_STREET_READING_ONLY
src/product/ui/surfaces/entregas.css    ENTREGAS_STREET_READING_ONLY
```

**Não é autorização de M1B**, e nenhum dos três entrou em `AUTHORIZED_PATHS`.
O registro mora aqui pelo mesmo motivo da exceção Cadeia Real: este envelope é
o único lugar que o C6 lê. `entregas.css` é arquivo **novo** num caminho
protegido — sem esta linha, ele derrubaria o C6 no primeiro commit.

**A autorização é do César, na missão de 2026-10-09**
(`docs/execution/CLAUDE_PRODUCT_UX_SOLO_MISSION_2026-10-09.md`, commit
`2782b31`, autoria do César): *"Arquivos de SUA responsabilidade preferencial:
`src/product/ui/**` · `src/product/viewmodels/**` …"* e *"Priorize tela
Entregas, leitura operacional mobile, hierarquia de estados, carga, vazio, erro
e evidência real/antiga."* O registro documenta a decisão; não toma decisão
nova. A confirmação explícita, como a da Cadeia Real em 2026-09-25, fica em
`Q-022`.

**O que a classe cobre, e só isso:** a **leitura da rua** da superfície
Entregas — apresentação pura da porta de realidade que já existia
(`src/platform/leitura/realidade-de-entregas.ts`, intocada):

- frase de abertura, linha de sinal (confiança = solidez), idade de cada fato
  contra o instante da leitura, hora local declarada;
- filtro por unidade **derivado da própria leitura** (link, não estado escondido);
- grupos pelo ciclo de vida já projetado (`projetar()`, intocada) e a lista do
  que pede conferência — sem botão, sem Foco, sem ação;
- a demonstração numa faixa própria, recolhida quando há leitura;
- texto do aparelho da demonstração corrigido: ele afirmava que "não existe
  rota de leitura" enquanto a mesma tela mostrava o aparelho lido do banco.

Também tocados por esta missão, **já** em `AUTHORIZED_PATHS` (registrados aqui
para que a classe fique escrita, não porque o C6 precise):

- `src/product/ui/app.js` — consulta no hash (`#/entregas?unidade=`), botão de
  reler (GET), idade da leitura medida desde a chegada (`performance.now()`),
  foco devolvido ao filtro escolhido;
- `src/product/ui/index.html` — uma linha: a folha `entregas.css`;
- `src/product/ui/shell/shell.css` — `position: relative` em
  `.shell__conteudo`: o `.sr-only` dos selos escapava do recorte e esticava o
  documento (1034 px de largura a 768 px; medido);
- `src/product/ui/components/components.css` — inspetor recolhido sem
  vazamento de 24 px e fora da ordem de tabulação (medido).

- `src/product/ui/surfaces/home.css` (`6f52755`) — duas regras locais para contraste AA da barra inferior da Home no celular (N7c, axe-core); mesmas cores/tokens da lateral, sem novo Foco ou alteracao de funcionalidade. Q-025 expressamente aprovada em 09/10 para branch de testes.
**Não mudaram:** Home, `home-vm.ts`, `sinais.ts`, `areas.ts`,
`copiloto-vm.ts`, `estados.ts`, os tokens, `src/platform/**` de domínio e de
leitura, `src/entregas/**`, Calmo/Ambiente/Foco, e nenhum gate de congelamento.
Os doze caminhos da `Q-019` continuam fora do envelope — esta exceção não os
registra.

**Limite da guarda:** igual às duas exceções acima — o C6 é por CAMINHO e
reprova registro sem a linha exata (C6d); a CLASSE é barrada por revisão. **No
C6, só `entregas.css` depende desta linha.** `entregas-vm.ts` e `entregas.js`
continuam cobertos pela linha da Cadeia Real; contá-los duas vezes deixou o
controle C6c cego (medido em 2026-10-09: sem o registro da Cadeia Real, os dois
continuavam passando). As linhas deles nesta classe existem para que a mudança
fique escrita no envelope — não para o gate.

**Rollback:** reverter os commits da missão Product UX de 2026-10-09 na branch
`feat/claude-product-ux-autonomous-20261009` (este bloco, `EXCECAO_LEITURA_DA_RUA`
e o C6d em `run-m1-bridge-tests.ts`), ou:

```bash
git checkout 2782b31 -- src/product/viewmodels/entregas-vm.ts src/product/ui/surfaces/entregas.js \
  src/product/ui/app.js src/product/ui/index.html src/product/ui/shell/shell.css \
  src/product/ui/components/components.css tools/product_system_server.ts
git rm src/product/ui/surfaces/entregas.css
```

### Q-020 e Q-023 — autorização expressa de César em 20/10/2026 (Preview READ-ONLY)

**Autoridade:** César aprovou explicitamente o encaminhamento de exibir a origem da fila como
**não declarada** quando `source_mode` não existe (Q-023), e apresentar o histórico agregado
TATÁ e a saúde de seu leitor **na Operação Viva, somente em Preview e somente leitura** (Q-020).
Essa aprovação NÃO implica aceite visual final, fonte viva na Home ou instalação na CAIXA.

**Limite por arquivo, sem alargar `AUTHORIZED_PATHS` ou revogar Q-019:**

```
src/product/ui/surfaces/entregas.js     READ_ONLY_REALITY_BLOCK_ONLY (Q-023, rotulo da fila)
src/product/ui/app.js                   AUTHORIZED_PATHS (Q-020, GET para APIs existentes)
tests/product/run-b5-freshness-render-smoke.ts  Q023_TEST_ONLY
tests/product/run-q020-preview-readonly-tests.ts Q020_TEST_ONLY
```

O HTML de Operação Viva é composto no `app.js` como **bloco auxiliar** e não modifica
`operacao-viva.js`, cujo conteúdo histórico Q-019 continua congelado por hash. As chamadas
já existentes `/api/historico` e `/api/fontes` são GET, com erro isolado em cada fonte.
O histórico exige `ao_vivo:false`, privacidade explícita e contagem validada; **nunca**
vira leitura atual. Sem fonte/credencial, a UI declara indisponibilidade, não zero.
A fila B5 pode medir contagens com procedência do relato sem declarar a origem dos itens.

**Bloqueios intocados:** nenhuma mudança em leitor TATÁ, PostgreSQL, watcher, reconciliador,
Academia, Comandas PR #107, permissões/SEFAZ/impressora ou contratos do Android. Não usar
este registro como autorização de merge, deploy, cutover, edição de turno ou leitura
operacional na CAIXA. Os gates M1/R5 e as proteções da Q-019 continuam aplicáveis.

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

### Exceções específicas da entrega unificada — 2026-10-12 — fora de M1B, sem decidir Q-019

A missão de César em 12/10/2026, registrada na [issue #103](https://github.com/cesarspichencoff-cmyk/delviery-os/issues/103), é conectar Copiloto e Entregas no mesmo produto, em branch DRAFT/HOLD e sem depender das Comandas. Este registro reconhece apenas as alterações de apresentação de código já realizadas no [PR #106](https://github.com/cesarspichencoff-cmyk/delviery-os/pull/106), com provas locais. **Não aprova M1B, Q-019, produção, fonte real ou ativação operacional.**

**Classe A — Q026 HTTP 503: apenas um arquivo.**

```text
src/product/ui/http-leitura.js Q026_HTTP_503_PRESENTATION_ONLY
```

Exclusivamente interpretação de status HTTP 503, Retry-After limitado e mensagem de falha na interface. Não altera banco, origem de dados, write path, comandos nem credenciais. A falha do teste N13b foi corrigida no PR #106 mantendo a leitura anterior e declarando o 503. Prova local em `acca4a53f6787be4cdc479daff81bd4f3e7584d5`: `ENTREGAS_BROWSER: 18/18 PASS`.

**Classe B — ponte e mapa de cobertura de seis células, somente leitura: quatro arquivos.**

```text
src/product/viewmodels/copiloto-entregas-leitura.ts COPILOTO_ENTREGAS_SHADOW_READ_ONLY
src/product/viewmodels/run-copiloto-entregas-leitura-tests.ts COPILOTO_ENTREGAS_SHADOW_READ_ONLY
src/product/viewmodels/copiloto-celulas-v33.ts COPILOTO_ENTREGAS_SHADOW_READ_ONLY
src/product/viewmodels/run-copiloto-celulas-v33-tests.ts COPILOTO_ENTREGAS_SHADOW_READ_ONLY
```

Esses arquivos reutilizam a porta de realidade de Entregas já existente e mostram apenas cobertura de Caixa, Sushi, Quentes, Cozinha, Conferência e Entregas. Dados ausentes nunca viram saúde, fila, pressão, cores ou números inventados. Histórico real não demonstra viagens ativas, GPS ou atraso; modo simulado não se torna real. **V3.3 parcial**, sem motor operacional LIVE ou ação. Provas locais: células `7/7`, leitura `6/6`, HTTP e Chromium 390 px PASS. Nenhum novo SQL/collector/consumer.

**Fronteira da exceção:** C6e/C6f devem aceitar SOMENTE as cinco linhas acima com caminho e classe exatos, e demonstrar controles negativos de linha ausente, classe errada e caminho alheio. Nenhuma exceção de diretório ou prefixo, nenhuma ampliação de `AUTHORIZED_PATHS`. A exceção de HTTP não serve para um view model; a do Copiloto não serve para HTTP. Os **12 caminhos antigos de Q-019 permanecem fora dessas classes**, no estado aberto, sem reancorar baseline, sem alterar o classificador `run-sem-fail-novo.ts` e sem declarar aprovação humana inexistente.

A continuidade genérica da missão autoriza execução reversível em DRAFT, **não é aceite final de alteração visual, Q-019, M1B, merge, deploy, Android físico ou operação**. Rollback: remover este registro e seus controles C6e/C6f; o código permanece isolado no PR até revisão.

### Q-019 — autorizacao expressa de Cesar em 13/10/2026: excecoes historicas CONGELADAS (fora de M1B)

**Autorizacao humana:** Cesar respondeu "**Sim autorizo**" ao pedido explicito de **regularizar Q-019 por excecoes estritas, vinculadas a cada alteracao comprovada, mantendo os testes de protecao e SEM liberar merge/producao** (conversa de continuidade de 2026-10-13). Esta resposta NAO autoriza reescrever o baseline, redesenhar a Home/Entregas, liberar M1B, ativar produtor/gate LIVE, instalar Android, GPS ou publicar.

**Commit de referencia dos bytes:** `33f267c0de128674c7439286f1c56054c5b21b53` (continuacao da PR #106; unica mudanca entre `7dddd9f5` e ele e um teste PG, fora dos 12 caminhos). Cada linha abaixo e `PATH CLASS GIT_BLOB_SHA`, nao uma permissao por caminho futuro.

```text
src/perfil-delivery/decisao.js Q019_Q003_CANONICAL_FOCUS_NO_AUTOMATION 050b8cbf62d2067d054962f79a3b7d4c69c0d722
src/platform/copiloto/attention-authority.ts Q019_Q003_CANONICAL_FOCUS_NO_AUTOMATION 3fc99a02244d9244f0ca3b0ecee602136dedf5ec
src/platform/copiloto/causal-attention-orchestrator.ts Q019_Q003_CANONICAL_FOCUS_NO_AUTOMATION 77d73eeae76393492d7756b1bf32102d5f123652
src/platform/copiloto/causal-identity-bridge.ts Q019_Q003_CANONICAL_FOCUS_NO_AUTOMATION c036a40dec650214fe42a75eebecfebbb0ecbefb
src/platform/copiloto/conference-bridge.ts Q019_Q015_TERMINAL_RETENTION_CONTRACT 57adceadf606caff42d6c7de99514797ff58965d
src/platform/copiloto/shadow.ts Q019_Q003_CANONICAL_FOCUS_NO_AUTOMATION b65378c2ab9fcc45809726e9932013e3b0ca66c2
src/product/ui/surfaces/copiloto.js Q019_SHADOW_SHARED_SOURCE_COVERAGE_READONLY eb22f1be10baed3413792f87089ac204ae3c7dcc
src/product/ui/surfaces/operacao-viva.js Q019_B6_HISTORICAL_OPERACAO_VIVA_READONLY ad6cccf0d1901a97a7c26153927da6909ed09515
src/product/viewmodels/copiloto-vm.ts Q019_B6_B7_HISTORICAL_SHADOW_READONLY 96cb5115cf734e692678b79ee929a77b13f66bd7
src/product/viewmodels/historico-vm.ts Q019_B6_TATA_HISTORICAL_READONLY 5323f05511f1cbec247faae485d4acddf29c23fd
src/product/viewmodels/operacao-viva-vm.ts Q019_B6_HISTORICAL_OPERACAO_VIVA_READONLY a7bd674dda0db4cde9f9cac36a290d9289bca280
src/product/viewmodels/tata-comanda-vm.ts Q019_TATA_HISTORICAL_ADAPTER_READONLY 7974e633483805c52f8a353ab1e10779e5cdc17f
```

**Procedencia e limite por arquivo:**

| Caminho | Commits mapeados | Proposito estrito — sem acao automatica |
|---|---|---|
| `src/perfil-delivery/decisao.js` | `d326c5d` | `Q019_Q003_CANONICAL_FOCUS_NO_AUTOMATION` |
| `src/platform/copiloto/attention-authority.ts` | `d326c5d` | `Q019_Q003_CANONICAL_FOCUS_NO_AUTOMATION` |
| `src/platform/copiloto/causal-attention-orchestrator.ts` | `f23006a` | `Q019_Q003_CANONICAL_FOCUS_NO_AUTOMATION` |
| `src/platform/copiloto/causal-identity-bridge.ts` | `91e766c` | `Q019_Q003_CANONICAL_FOCUS_NO_AUTOMATION` |
| `src/platform/copiloto/conference-bridge.ts` | `2a3b8f8` | `Q019_Q015_TERMINAL_RETENTION_CONTRACT` |
| `src/platform/copiloto/shadow.ts` | `d326c5d` | `Q019_Q003_CANONICAL_FOCUS_NO_AUTOMATION` |
| `src/product/ui/surfaces/copiloto.js` | `f24ff62,a117c43,20151b0,e93faf9,e583b61,081e54c` | `Q019_SHADOW_SHARED_SOURCE_COVERAGE_READONLY` |
| `src/product/ui/surfaces/operacao-viva.js` | `f24ff62` | `Q019_B6_HISTORICAL_OPERACAO_VIVA_READONLY` |
| `src/product/viewmodels/copiloto-vm.ts` | `f24ff62,a117c43` | `Q019_B6_B7_HISTORICAL_SHADOW_READONLY` |
| `src/product/viewmodels/historico-vm.ts` | `f24ff62,39a9a9c` | `Q019_B6_TATA_HISTORICAL_READONLY` |
| `src/product/viewmodels/operacao-viva-vm.ts` | `f24ff62` | `Q019_B6_HISTORICAL_OPERACAO_VIVA_READONLY` |
| `src/product/viewmodels/tata-comanda-vm.ts` | `39a9a9c` | `Q019_TATA_HISTORICAL_ADAPTER_READONLY` |

**Controles:** C6 continua comparando mudanças desde `f87a36d`; C6g exige o triplo exato caminho/classe/blob, confere o blob do commit de referencia e o conteudo atual, e demonstra que remover linha, trocar classe, adulterar hash ou alterar bytes REPROVA; C6h proibe transpor qualquer classe a caminho alheio. Uma futura edicao destes arquivos exige NOVO registro de mudanca e nova autorizacao, nao herda Q-019. Nao adicionar estes caminhos a `AUTHORIZED_PATHS`. C6b-f, C2-C5 e os gates historicos seguem obrigatorios.

**Fronteira:** autorizacao exclusivamente da REGULARIZACAO HISTORICA Q-019. Nao e homologacao funcional/visual; `HUMAN_APPROVAL_STATE = AWAITING_CESAR_M1B_EXECUTION_APPROVAL` fica intacto. Validacoes de segurança causal, retencao, historico read-only, comparacao visual, Android e Neemo/Teknisa continuam independentes. `Q-020` nao esta autorizada por esta decisao.

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


---

## Revisao temporal de 15/10/2026 (sem ampliar autoridade)

O commit 5ba2339 de 13/10 registrou o recorte historico da Q-019; o lifecycle ainda dizia 12/10. Esta revisao reconcilia a data documental sem alterar a janela historica, os baselines, a autorizacao de M1B ou a fronteira entre prova e producao.
