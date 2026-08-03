# Motion System

> Valores em `MOTION_TOKENS.json`. Mapa por componente em `MOTION_COMPONENT_MAPPING.md`.
> Acessibilidade em `MOTION_ACCESSIBILITY.md`. Visão por módulo em `MODULE_MOTION_VISION.md`.

## 1. A regra que decide tudo

**Movimento comunica mudança de estado. Movimento que não comunica não entra em superfície
operacional.** Numa sexta-feira de pico, animação ornamental é ruído com custo de atenção.

## 2. Biblioteca: nenhuma

O repositório não tem biblioteca de motion e **nenhuma foi instalada**. Tudo é CSS `transition` e
`@keyframes`. O teste `motion: nenhuma dependencia de biblioteca foi adicionada` verifica
`package.json` contra `originkit`, `framer-motion`, `gsap`, `motion`, `animejs` e `lottie`.

### O organismo operacional (home) — 2026-08-03

A home tinha, até `9f3b115`, **movimento próprio**: `1.6s`, `2.8s` e `0.18s ease` escritos à mão em
`organismo-tokens.css`. Nenhum dos três existia neste sistema. Era um sistema de movimento paralelo
ao do produto — a mesma espécie de erro que **PB9** registrou para a cor.

Hoje os tokens do organismo **derivam** dos daqui:

| Token | Deriva de | Comunica |
|---|---|---|
| `--org-pulso` | `motion-ambient` | a fonte está viva |
| `--org-fluxo` | `calc(motion-ambient / 2)` — derivação declarada no arquivo | a pressão atravessa a relação |
| `--org-troca` | `motion-base` | um estado virou outro no mesmo lugar |
| `--org-chegada` | `motion-base` + `motion-rise` + `motion-ease-enter` | chegada de conteúdo (`reveal`) |
| `--org-resposta` | `motion-quick` | resposta ao ponteiro e ao foco |

**Três regras próprias do organismo**, todas com guarda:

1. **Fluxo ≠ espera** (**D55**). `ativa` é tracejado **parado**; `carregada` é tracejado **em
   movimento**. V3.3 prancha 13. Guarda O20.
2. **Estado crítico vence movimento.** No Foco, o pulso de vida do cabeçalho para — as áreas em
   pressão já respiram, e somar as duas coisas faz a superfície parecer agitada quando ela precisa
   parecer grave. Guarda O22, com par simétrico. Contagem medida: Calmo 1 · Ambiente 1 · Foco 5 ·
   Degradado 0.
3. **Falha técnica não anima.** Nem pulsa, nem cresce, nem usa âmbar. O ponto de vida em falha para
   explicitamente, porque herdaria a regra do estado vivo. Guarda O21.

### Sobre o OriginKit

**Decisão permanente — D54.** O OriginKit é **referência externa de movimento e microinteração**.
Não é dependência, não governa a identidade e **não prevalece sobre o V2/V3.3**. Referência de
ritmo, continuidade, suavidade, feedback, transição e clareza de estado — nunca de arquitetura,
taxonomia, conteúdo, regras, dados, identidade ou estrutura operacional.

Nada foi instalado, importado por MCP ou copiado. Os padrões deste sistema — reveal, linha
pulsante, fade de expiração, handoff de estado — foram reinterpretados para o vocabulário do
DeliveryOS, e cada um ganhou uma regra que a referência não tem: *o que ele afirma sobre a
operação*. Exemplo: a linha pulsante do OriginKit é decorativa; aqui ela só pulsa quando a fonte
foi **observada viva**, porque pulsar sobre um sinal degradado afirmaria vida que ninguém observou.

> ⚠ **O OriginKit NÃO foi inspecionado na sessão de 2026-08-03.** Ver **PB12**: a navegação abre e o
> título chega, mas toda leitura de conteúdo falha (`Policy check temporarily unavailable` no
> navegador, `403` no WebFetch). O trabalho de movimento daquela sessão derivou **deste documento**,
> do Organismo V3.3 e das decisões visuais do César — não dele. A matriz de referência OriginKit em
> `docs/design/CANONICAL_MOTION_PARITY.md` §1 está **deliberadamente vazia**.
>
> ✅ **Reclassificado no mesmo dia — `OriginKit external review deferred — non-blocking` (D57).**
> A evidência de indisponibilidade continua registrada; o que caiu foi o **bloqueio**. O OriginKit é
> referência externa **opcional** de qualidade: não é autoridade visual, não é dependência, não
> prevalece sobre V2/V3.3, e não trava Figma, paridade nem fechamento visual. A revisão vira
> refinamento futuro, nunca reconstrução obrigatória. **A etapa de movimento não depende dele.**

### Reduced motion — exercitado com a preferência real, 2026-08-03

O checkpoint anterior mediu **cobertura pelo CSSOM**: 21 elementos animam, 0 descobertos. Isso prova
que a regra alcança tudo — não prova o que a pessoa vê quando liga a preferência.

Esta sessão exercitou a preferência de verdade, nos dois valores, com Chromium 1228 dirigido por
Playwright 1.61.1 (`Emulation.setEmulatedMedia`, no nível do navegador — não CSS injetado, não
classe aplicada à mão). `matchMedia("(prefers-reduced-motion: reduce)")` devolveu `true` nas seis
cenas do segundo passe e `false` nas seis do primeiro.

| Cena | `no-preference` → `reduce` (animando / infinitas) | Texto | Áreas visíveis |
|---|---|---|---|
| Calmo | 1 / 1 → **0 / 0** | 8524 = 8524 | 5 = 5 |
| Ambiente | 1 / 1 → **0 / 0** | 10947 = 10947 | 5 = 5 |
| Foco | 4 / 3 → **0 / 0** | 12133 = 12133 | 5 = 5 |
| Degradado | 0 / 0 → **0 / 0** | 8474 = 8474 | 5 = 5 |
| Aproximação Sushi | 3 / 1 → **0 / 0** | 11244 = 11244 | 1 = 1 |
| Aproximação Cozinha | 3 / 1 → **0 / 0** | 10882 = 10882 | 1 = 1 |

Pulsos repetidos cessam · o fluxo do fio vira tracejado estático · a contagem de caracteres é
**idêntica** nos dois passes, então nenhuma informação vive só no movimento · nenhuma área
desaparece · o Foco continua presente e legível · a pressão continua identificável, porque o degrau
é atributo do elemento e não animação. **Falha técnica mede 0 nos dois passes** — ela já não animava.

Detalhe da matriz: `docs/figma/FIGMA_ORGANISMO_PARITY_MATRIX.md` §7.

## 3. Padrões implementados

| Padrão | Comunica | Onde |
|---|---|---|
| `reveal` | chegada de conteúdo | cartões de dimensão, fontes, recomendações |
| `expand` | abertura de detalhe | inspetores |
| `state_handoff` | um estado virou outro no mesmo lugar | `ds-state` |
| `expiration_fade` | a validade venceu | `.ds-expired` |
| `progress_transition` | progresso mensurável | `.ds-meter__fill` |
| `connection_recovery` | rede voltou, fila drenando | `.ds-syncing` |
| `pulse_line` | a fonte está viva | `.ds-pulse` |
| `confidence_transition` | confiança mudou de faixa | barra de confiança |

## 4. Proibições

Movimento decorativo é **proibido** em: listas de viagens · alertas críticos · ocorrências ·
evidências · erros · estados offline · comandos urgentes · tabelas operacionais.

Partículas, 3D e efeito decorativo ficam restritos a overview institucional, onboarding, landing e
demonstração controlada — **nenhum deles existe nesta unidade**, então nenhum efeito desse tipo foi
implementado.

## 5. Regras estruturais

- **Layout shift:** só `opacity`, `transform`, cor, `grid-template-rows` e `width` de barra em
  caixa fixa. Nunca `height`, `margin`, `padding`, `font-size` ou `top/left` em fluxo. Afirmado
  pelo teste `motion: nenhuma animacao move layout`, que lê cada `@keyframes`.
- **Concorrência:** no máximo **uma** animação ambiente por região visível.
- **Prioridade:** estado crítico vence movimento. Em `erro_bloqueante`, `conflito` ou
  `acao_humana_necessaria`, a animação ambiente da região para.
- **Interrupção:** trocar de estado durante a transição **não enfileira** — a nova transição parte
  do valor corrente (comportamento nativo de CSS).
- **Stagger:** 40ms até o oitavo item; do nono em diante, todos entram juntos. Uma lista
  operacional longa nunca deve levar segundos para aparecer.
- **Performance:** nenhum timer de JS conduz animação.
- **Fallback:** o estado final é o estado padrão no CSS. A interface nasce correta e a animação
  apenas a atravessa — sem suporte a `@keyframes`, nada se perde.

## 6. `expiration_fade` nunca remove

Item expirado fica em `opacity: .45` e **continua no DOM, legível**. Sumir esconderia que ele
existiu — e o histórico de uma recomendação retirada é justamente o que um humano precisa ver
para confiar no sistema.
