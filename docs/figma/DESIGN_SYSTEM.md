# Design System — DeliveryOS Product System

> Valores em `DESIGN_TOKENS.json` (fonte única). Componentes em `COMPONENT_CONTRACTS.md`.
> Movimento em `MOTION_SYSTEM.md`. Este arquivo explica **as decisões**, não repete os números.

## 1. Origem

A fundação **já existia no Figma** antes desta unidade: 49 variáveis, 9 estilos de texto,
3 de efeito, e as seções `01.1 — Foundations` e `01.2 — Severidade e estados de RUNTIME`
completas. Nada disso foi substituído. A Unidade 6 preencheu `01.3` e `01.4`, que estavam vazias,
e extraiu os 49 valores para `DESIGN_TOKENS.json`.

**Divergência encontrada e corrigida no caminho:** `text/on-dark-muted` e `line/on-dark` existiam
no Figma como cor opaca (`#c9bfa9`, `#4a443a`) e no CSS como alfa sobre o verde profundo
(`rgba(244,239,230,.72)` e `.14`) — cores diferentes, não versões da mesma. O código passou a usar
o valor do Figma. O teste `tokens: um token tem UM lugar de nascimento` impede a volta.

## 2. Grid, densidade e leitura

| Decisão | Valor | Por quê |
|---|---|---|
| Breakpoints | 600 / 905 / 1240 / 1600 | 905 é onde o rail lateral cabe sem espremer o conteúdo |
| Rail | 264px fixo | comporta nome + descrição de uma linha sem truncar |
| Largura de leitura | `68ch` | prosa operacional é lida sob pressão; linha longa é lida errado |
| Conteúdo | `1320px` | acima disso a varredura horizontal custa mais que o espaço ganha |
| Alvo de toque | 48px | o mesmo aparelho é usado com luva e no escuro |
| Espaçamento | 4/8/16/24/40/64 | escala do Figma, sem valores intermediários improvisados |

Densidade: **um cartão por afirmação**. Não há cartão que agrupe dois fatos não relacionados, e não
há métrica sem decisão associada — a régua do CLAUDE.md §5 (*"dashboard mostra tudo e manda procurar"*).

## 3. Estados semânticos — a decisão central

22 espécies em **seis eixos que não compartilham campo**:

| Eixo | Espécies |
|---|---|
| procedência | real · simulado · controle · controle positivo sintético |
| observação | saudável · parcial · degradado · stale · evidência insuficiente · indisponível |
| ciclo de vida | sombra · expirado · retirado · invalidado · decisão humana |
| conexão | offline · sincronizando · conflito |
| erro | recuperável · bloqueante |
| disponibilidade | planejado · somente demonstração |

Um dado pode ser `real` **e** `stale` ao mesmo tempo. Não pode ser `expirado` **e** `retirado`.
Fundir os eixos repetiria o erro que o modelo multidimensional do Brain existe para corrigir (D34).

### Os quatro canais

Todo estado carrega, sempre:

1. **rótulo textual** — o único canal que o leitor de tela consome;
2. **glifo** — canal monocromático, `aria-hidden` porque repete o rótulo;
3. **padrão de borda** — `solid` / `hatch` / `dashed` / `dotted`, sobrevive à impressão;
4. **cor** — canal de varredura rápida, **nunca sozinho**.

Dois estados podem compartilhar cor. **Nenhum par compartilha cor + glifo + padrão** — afirmado
pelo teste `estados: nenhum estado se distingue apenas por verde/amarelo/vermelho`, que reprovou na
primeira execução (`controle` e `planejado` colidiam) e forçou a troca do glifo de `planejado`.

## 4. Cor

- **Institucional:** `brand/deep` estrutura o shell; `brand/action` é ação soberana e confirmação.
- **Sinal (Campo Vivo):** `signal/prep · calm · age · reduce · lost · fail` descrevem o **clima**
  da operação. São **semanticamente independentes da marca**: o verde institucional nunca significa
  "saudável", e `signal/calm` nunca é usado como cor de marca.
- **Ink:** achado desta unidade. `signal/calm` dá **3,72:1** sobre `surface/work` e `text/faint`
  dá **3,77:1** — os dois reprovam em 4,5:1. As cores de sinal servem a ponto, traço e glifo
  grande; **texto pequeno usa `ink/*`**, que passa 4,5:1 sobre as duas superfícies claras.
  O teste tem controle positivo: ele exige que `signal-calm` **continue reprovando**, senão a
  justificativa dos tokens `ink` teria caído sem ninguém perceber.

## 5. Tipografia

Três famílias, cada uma com um trabalho:

- **Spectral** (editorial) — títulos e a voz humana. Itálico é contexto, nunca ênfase.
- **Hanken Grotesk** (interface) — corpo, ação, rótulo de bloco.
- **IBM Plex Mono** (técnico) — identificadores, carimbos de tempo, rótulos meta. Tudo que a
  pessoa pode precisar copiar ou comparar caractere a caractere.

Escala: 44 / 28 / 20 / 16 / 14 / 13 / 11. Nove estilos nomeados no Figma, espelhados no CSS.

## 6. Foco, elevação e borda

- **Foco:** anel de 3px, offset 2px, `rgba(34,86,60,.55)`, **sem transição** — foco não chega
  atrasado. Afirmado por teste que lê o bloco CSS e proíbe `transition` nele.
- **Elevação:** três níveis, e sombra é discreta de propósito. Superfície operacional não precisa
  de profundidade dramática; precisa de hierarquia legível.
- **Borda:** `hairline` 1px estrutura, `emphasis` 1.5px separa, `signal` 3px é a barra lateral que
  indica origem ou espécie.

## 7. Acessibilidade

| Garantia | Como é verificada |
|---|---|
| Contraste de badge ≥ 4,5:1 | conta de luminância no gate, com controle positivo |
| Estado sem cor | rótulo + glifo + padrão, três canais independentes |
| Glifo não é anunciado | `aria-hidden="true"` + `.sr-only` com o texto do estado |
| Teclado alcança tudo | só há links, `<button>` e `<select>` nativos; zero `div` clicável |
| Foco visível | anel próprio, sem transição |
| Região que troca | `aria-live="polite"`; `assertive` é **proibido** por teste |
| Menu mobile | `aria-expanded`, `aria-controls`, foco move para o primeiro item, `Escape` fecha |
| Ícones | `aria-hidden` + `focusable="false"`, sempre com o nome do módulo em texto |
| Impressão monocromática | `@media print` remove cor e mantém rótulo, glifo e padrão |

## 8. Responsividade

Uma linguagem, várias superfícies (CLAUDE.md §7). Abaixo de 905px o rail vira lâmina sobre o
conteúdo e a barra inferior mostra **apenas os quatro módulos implementados** — módulo planejado
não ocupa dedo de quem opera. Abaixo de 600px a tabela vira lista rotulada: cada célula carrega
`data-rotulo`, porque sem isso a célula ficaria órfã quando o cabeçalho some.

Verificado em 375×812: rail oculto, barra com 4 itens, **zero estouro horizontal**, e o único alvo
abaixo de 44px era o skip-link, corrigido para 48px.
