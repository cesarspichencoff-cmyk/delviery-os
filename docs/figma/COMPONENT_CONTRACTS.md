# Contratos de componente

> Cada componente declara: propósito · conteúdo obrigatório · conteúdo proibido · variantes ·
> estados · comportamento responsivo · acessibilidade · motion permitido · par Figma ↔ código.
> Tokens em `DESIGN_TOKENS.json`. Movimento em `MOTION_COMPONENT_MAPPING.md`.

## Convenção

O nome no Figma **é** o nome no código. `ds-state` no Figma é `.ds-state` no CSS. Componente sem
par é registrado como divergência em `FIGMA_CODE_PARITY_MATRIX.md`, nunca declarado pronto.

---

## `ds-state` — badge semântico

**Propósito.** Dizer, em qualquer contexto, em que estado uma informação está.

- **Obrigatório:** rótulo textual, glifo, padrão de borda, texto acessível.
- **Proibido:** distinguir estado apenas por cor; usar o glifo sem o rótulo; omitir `aria-hidden`
  do glifo (o leitor de tela diria "círculo REAL").
- **Variantes (Figma):** `padrao = solid | hatch | dashed | dotted`.
- **Estados:** as 22 espécies, por `data-estado`.
- **Responsivo:** `white-space: nowrap`; a linha de selos usa `flex-wrap`.
- **A11y:** `.sr-only` carrega `texto_acessivel` do dicionário; `title` carrega a descrição curta.
- **Motion:** apenas `state_handoff` — cor transiciona, **rótulo e glifo trocam instantaneamente**,
  para não existir instante em que o rótulo mente.
- **Código:** `selo()` em `src/product/ui/components/ui.js` · `.ds-state` em `product-tokens.css`.

## `campo` — valor observado ou ausência declarada

**Propósito.** A trava visual contra `null` virar zero.

- **Obrigatório:** rótulo; e, na ausência, o **motivo escrito por extenso** + selo do motivo.
- **Proibido:** traço, `0`, `—`, `N/A` ou string vazia no lugar do valor.
- **Variantes:** `estado = observado | ausente`.
- **A11y:** a ausência é texto normal, não `title` — quem usa leitor de tela recebe o motivo inteiro.
- **Motion:** nenhum.
- **Código:** `campo()` · `.campo`, `.campo__ausencia`.
- **Guarda:** mutação M2 (transformar ausência em `0`) derruba o gate.

## `metric` — número de destaque

**Propósito.** O número que a pessoa procura primeiro.

- **Obrigatório:** rótulo em maiúsculas técnicas; valor **ou** explicação da ausência.
- **Proibido:** ausência com a **mesma tipografia do número** — na mesma caixa e no mesmo tamanho,
  o olho lê a falta como um valor. A ausência usa `Human / Contexto` em `ink/faint`.
- **Variantes:** `estado = observado | ausente`.
- **Nota:** zero **medido** continua sendo zero. `0` observações de pedido é um fato, e aparece
  como número; `capacidade desconhecida` é ausência, e aparece como frase.
- **Código:** `metric()` · `.metric`, `.metric__valor`, `.metric__ausente`.

## `bloco-evidencia`

- **Obrigatório:** ao menos uma referência rastreável (`tipo · referência`).
- **Proibido:** existir vazio. Sem evidência, o bloco vira o selo `evidencia_insuficiente`.
- **Motion:** nenhum. Evidência não anima.
- **Código:** `blocoEvidencia()` · `.bloco-evidencia`.

## `bloco-limitacao`

- **Obrigatório:** título afirmativo + o que a tela **não** prova.
- **Proibido:** linguagem de desculpa ("infelizmente", "ainda não conseguimos").
- **Código:** `blocoLimitacao()` · `.bloco-limitacao`.

## `estado-tela` — estado de tela inteira

- **Obrigatório:** selo + título que **nomeia** o estado + o que ele significa.
- **Proibido:** ícone triste sozinho; confundir "não há nada" com "não consegui perguntar".
- **Variantes:** `tipo = vazio | degradado | offline | futuro` (Figma) · dez frames em `02.5`.
- **Código:** `estadoTela()` · `.estado-tela[data-tipo]`.

## `rec-card` — recomendação em sombra

**Propósito.** Mostrar uma proposta sem oferecer como executá-la.

- **Obrigatório:** selo de ciclo de vida, selo de evidência, selo de procedência, selo de decisão
  humana, motivo, evidência, validade, e **a frase de sombra por extenso no rodapé de cada cartão**
  — porque ler metade de um cartão é o modo normal de ler sob pressão.
- **Proibido:** qualquer `<button>` que não seja inspetor; `<form>`; `<input>`; rótulo de ação
  operacional (Executar, Aplicar, Aceitar, Despachar, Mover, Retirar). Afirmado por teste.
- **Variantes:** `ativa = sim | nao`.
- **Código:** `recomendacao()` em `surfaces/copiloto.js` · `.rec-card`.
- **Guarda:** mutação M1 (trocar o selo de sombra) derruba o gate.

## `fonte-linha` — source health row

- **Obrigatório:** selo de saúde + selo de procedência + identificador de execução e ciclo.
- **Proibido:** apresentar `partial` com o mesmo tratamento de `saudavel`.
- **Código:** `fonte()` em `surfaces/conference-brain.js` · `.fonte-linha`.

## `inspetor` — evidence inspector

- **Propósito:** mostrar **mais texto** sob demanda. Não muda estado de domínio.
- **Obrigatório:** `<button aria-expanded aria-controls>`; conteúdo no DOM antes de abrir.
- **Motion:** `expand` (`grid-template-rows: 0fr → 1fr`), que não mede altura em JS e não empurra
  o vizinho.
- **Código:** `inspetor()` + `ligarInspetores()` · `.inspetor`, `.ds-expand`.

## `tabela` — tabela responsiva

- **Obrigatório:** `data-rotulo` em cada `td`. Abaixo de 600px o cabeçalho some e a célula ficaria
  órfã sem ele.
- **Proibido:** scroll horizontal da **página** (o scroll vive no `.tabela-wrap`).
- **Código:** `tabela()` · `.tabela`, `.tabela-wrap`.

## `App Shell` — `shell/topo`, `shell/nav`, `shell/nav-mobile`, `seletor-unidade`

- **Obrigatório:** faixa de ambiente sempre visível; unidade ativa visível **fora** do select;
  trilha de contexto; retorno ao contexto anterior quando houver.
- **Proibido:** módulo planejado na barra mobile; navegação que espelhe a árvore de pastas.
- **A11y:** skip-link 48px; `<nav aria-label>`; `aria-current="page"`; menu com `aria-expanded`,
  foco no primeiro item e `Escape`.
- **Código:** `index.html` + `app.js` + `shell/shell.css`.

## `skeleton`

- **Obrigatório:** forma sem conteúdo.
- **Proibido:** valor de exemplo enquanto carrega — um número falso por 200ms é um número falso.
- **Motion:** `ds-breathe`, desligado em `prefers-reduced-motion`.

---

## Componentes previstos e **não** construídos nesta unidade

Registrados aqui para não parecerem esquecimento: `command/search surface`, `drawer`, `modal`,
`toast`, `tooltip` (há `title`, não componente), `timeline`, `activity feed`, `filtros`, `tabs`,
`confirmação`, `bloqueio`. Todos pressupõem **ação** ou **volume de dados** que esta unidade não
tem. Construir a casca de um filtro que não filtra seria exatamente o que o bloco proíbe.
