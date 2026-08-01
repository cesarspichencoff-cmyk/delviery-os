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

### Sobre o OriginKit

Usado como **referência conceitual** de padrões — reveal, linha pulsante, fade de expiração,
handoff de estado. Nada foi instalado, importado por MCP ou copiado. Os padrões foram
reinterpretados para o vocabulário do DeliveryOS, e cada um ganhou uma regra que a referência não
tem: *o que ele afirma sobre a operação*. Exemplo: a linha pulsante do OriginKit é decorativa;
aqui ela só pulsa quando a fonte foi **observada viva**, porque pulsar sobre um sinal degradado
afirmaria vida que ninguém observou.

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
