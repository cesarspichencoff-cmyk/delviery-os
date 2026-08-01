# Matriz de paridade Figma ↔ código

> Esta matriz existe para impedir cinco coisas: fixture apresentada como dado real · visão futura
> apresentada como funcional · protótipo confundido com runtime · componente Figma sem código
> declarado pronto · código sem representação no Figma ignorado.
>
> Legenda de dado: **R** real observado · **S** simulado · **C** controle positivo sintético ·
> **A** ausente por decisão · **∅** inexistente.

## 1. Telas

| Tela | Figma | Código | Rota | Dado | Contrato | A11y | Responsivo | Motion | Teste |
|---|---|---|---|---|---|---|---|---|---|
| App Shell | `02.x shell/*` | `ui/index.html`, `app.js`, `shell.css` | — | — | — | skip-link, landmarks, `aria-live=polite`, menu com `aria-expanded`+`Escape` | rail ≥905px, lâmina <905px, barra inferior | hover, sem transição de rota | `a11y: o shell tem atalho…`, `responsivo: as tres folhas…` |
| Entregas — desktop | `02.1 Desktop` | `surfaces/entregas.js` | `#/entregas` | S | `UiSnapshot` | badges com `.sr-only` | grade 1→2 col | `reveal` | `Entregas: a identidade da viagem…`, `Entregas: parada removida…` |
| Entregas — mobile | `02.1 Mobile` | idem | idem | S | idem | idem | verificado 375×812 | idem | idem |
| Operação Viva — desktop | `02.2 Desktop` | `surfaces/operacao-viva.js` | `#/operacao-viva` | S | `Projecao` | idem | grade 1→2→3 col; tabela vira lista <600px | `reveal`, `pulse_line` | `Operacao Viva: capacidade desconhecida…`, `…viagem sem posicao…` |
| Operação Viva — mobile | `02.2 Mobile` | idem | idem | S | idem | idem | verificado | idem | idem |
| Conference Brain — desktop | `02.3 Desktop` | `surfaces/conference-brain.js` | `#/conference-brain` | S + **C** | objeto simples | idem | idem | `reveal` | `Brain: a cadeia real devolve ZERO…`, `Brain: linha recusada…` |
| Conference Brain — mobile | `02.3 Mobile` | idem | idem | S + C | idem | idem | verificado | idem | idem |
| Copiloto Shadow — desktop | `02.4 Desktop` | `surfaces/copiloto.js` | `#/copiloto` | S | `ResultadoShadow` | idem | idem | `reveal`, `expiration_fade` | `Copiloto: nada executa…`, `Copiloto: a superficie nao oferece execucao` |
| Copiloto Shadow — mobile | `02.4 Mobile` | idem | idem | S | idem | idem | verificado | idem | idem |
| Estados essenciais (10) | `02.5` | `.estado-tela[data-tipo]` | — | — | — | selo + título + texto | — | nenhum | `estados: cada estado funciona SEM cor` |
| Módulo futuro (×7) | `00.1` cartões | `surfaces/modulo-futuro.js` | `#/caixa` etc. | **∅** | ∅ | selo `PLANEJADO` | fluido | nenhum | `navegacao: modulo futuro nao tem tela de dado` |
| Arquitetura | `00.1` | `viewmodels/modulos.ts` | — | — | — | — | — | — | `navegacao: modulo futuro nunca se apresenta…` |

## 2. Componentes

| Componente | Figma | Variantes | Código | Teste |
|---|---|---|---|---|
| `ds-state` | `01.4` variant set | `padrao = solid\|hatch\|dashed\|dotted` | `selo()` · `.ds-state` | `estados: nenhum estado se distingue apenas por…` |
| `campo` | `01.4` variant set | `estado = observado\|ausente` | `campo()` · `.campo` | `null nao vira zero`, mutação **M2** |
| `metric` | `01.4` variant set | `estado = observado\|ausente` | `metric()` · `.metric` | idem |
| `estado-tela` | `01.4` variant set | `tipo = vazio\|degradado\|offline\|futuro` | `estadoTela()` | `estados: cada estado funciona SEM cor` |
| `bloco-evidencia` | `01.4` componente | — | `blocoEvidencia()` | `confianca sem evidencia nao e apresentada` |
| `bloco-limitacao` | `01.4` componente | — | `blocoLimitacao()` | — |
| `cartao` | `02.x` (frame) | — | `.cartao` | — |
| `metric-strip` | `02.x` (frame) | — | `.metric-strip` | — |
| `rec-card` | `02.4` (frame) | ativa / fora | `recomendacao()` · `.rec-card` | `Copiloto: a superficie nao oferece execucao`, **M1** |
| `fonte-linha` | `02.3` (frame) | — | `fonte()` · `.fonte-linha` | `Brain: parcial nao e apresentado como saudavel` |
| `inspetor` | — | — | `inspetor()` · `.inspetor` | — |
| `tabela` | — | — | `tabela()` · `.tabela` | `responsivo: as tres folhas…` |
| `skeleton` | — | — | `skeleton()` · `.skeleton` | — |
| `nav-item` | `02.x shell/nav` | atual / normal / futuro | `.nav-item` | — |

## 3. Tokens

| Família | Figma | Código | Paridade |
|---|---|---|---|
| cor, espaço, raio, traço, tipo, fonte, alvo (49) | coleção `DeliveryOS` | `tokens.css` + `product-tokens.css` | **verificada por teste**, valor a valor |
| `ink/*` (7) | **criadas nesta unidade** | `product-tokens.css` | idem |
| `wash/*` (8) | ∅ | `product-tokens.css` | **divergência declarada** — ver §5 |
| grid, foco (10) | ∅ | `product-tokens.css` | idem |
| motion (18) | ∅ | `product-tokens.css` | idem |
| estilos de texto (9) | 9 estilos | classes CSS equivalentes | por nome, não por teste |

## 4. Divergências ABERTAS

| # | Divergência | Estado |
|---|---|---|
| D-1 | `wash/*`, grid, foco e motion existem no **código** e não como variável no Figma | **aberta**. Figma Starter não tem modo de variável por breakpoint, e `rgba` com alfa não é expressável como variável de cor sem perder o alfa. Documentadas em `DESIGN_TOKENS.json` e `MOTION_TOKENS.json`. |
| D-2 | Sem protótipo interativo no Figma | **aberta, por decisão**. O comportamento vive no código e foi verificado no navegador; um protótipo de cliques duplicaria a verdade. |
| D-3 | Sem Code Connect | **aberta**. Exige configuração de projeto; a paridade hoje é por nomenclatura + esta matriz. |
| D-4 | `inspetor`, `tabela` e `skeleton` existem no código e **não** no Figma | **aberta**. São componentes de comportamento; representá-los estaticamente diria pouco. Registrados aqui para não passarem por esquecimento. |

## 5. Divergências FECHADAS nesta unidade

| # | Divergência | Como fechou |
|---|---|---|
| F-1 | `text/on-dark-muted` e `line/on-dark`: hex opaco no Figma, `rgba` no CSS — **cores diferentes** | o código adotou o valor do Figma; teste `um token tem UM lugar de nascimento` impede a volta |
| F-2 | `controle` e `planejado` com glifo, padrão e cor idênticos | glifo de `planejado` virou `▷`, nos dois lados |
| F-3 | `signal/*` usado como cor de texto, reprovando em 4,5:1 | criados os 7 `ink/*` no Figma e no CSS; teste com controle positivo |
| F-4 | Registro em `STATE.json` dizia Figma vazio, com 0 variáveis | corrigido; ver `FIGMA_IMPLEMENTATION_PLAN.md` §1 |

## 6. O que esta matriz proíbe afirmar

- Que qualquer tela desta unidade mostra **dado real de operação**. Nenhuma mostra: a coluna
  "Dado" não tem um único **R**.
- Que os módulos futuros estão parcialmente prontos. Eles são **∅**.
- Que a implementação no Figma é um protótipo navegável. Não é (D-2).
- Que a paridade é automática. Ela é por nomenclatura, matriz e teste (D-3).
