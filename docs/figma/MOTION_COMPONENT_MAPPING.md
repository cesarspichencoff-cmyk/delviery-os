# Motion × componente

> Regras e proibições em `MOTION_SYSTEM.md`. Valores em `MOTION_TOKENS.json`.
> Contratos em `COMPONENT_CONTRACTS.md`.

| Componente | Padrão | Duração · easing | Propriedades | Quando NÃO anima |
|---|---|---|---|---|
| `ds-state` | `state_handoff` | base · standard | `background-color`, `border-color`, `color` | nunca anima glifo nem rótulo — eles trocam instantaneamente |
| `campo` | — | — | — | ausência aparece direto; animar a falta sugeriria que o valor está chegando |
| `metric` | — | — | — | número nunca conta para cima; contagem inventa um trajeto que não houve |
| `cartao` (dimensão, fonte) | `reveal` | base · enter | `opacity`, `translateY(8px)` | listas de viagens, ocorrências e tabelas operacionais |
| `rec-card` | `reveal` + `expiration_fade` | base · enter / slow · exit | `opacity`, `translateY` / `opacity` | o cartão expirado **não some**: fica em `.45` e legível |
| `inspetor` | `expand` | calm · standard | `grid-template-rows: 0fr → 1fr` | — |
| `bloco-evidencia` | — | — | — | evidência não anima, em hipótese nenhuma |
| `bloco-limitacao` | — | — | — | idem |
| `estado-tela` | — | — | — | erro e offline aparecem inteiros, sem travessia |
| `.ds-meter__fill` | `progress_transition` / `confidence_transition` | calm · standard | `width`, `background-color` | não existe barra indeterminada: progresso desconhecido usa o estado `indisponivel` |
| `.ds-pulse` | `pulse_line` | ambient · calm, infinito | `opacity` | `data-vivo="nao"` em degradado, stale e indisponível — pulsar afirmaria vida não observada |
| `.ds-syncing` | `connection_recovery` | ambient · calm, infinito | `opacity` | **offline não pulsa**: ausência de rede é quietude, não agitação |
| `skeleton` | `ds-breathe` | ambient · calm, infinito | `opacity` | nunca mostra valor de exemplo enquanto respira |
| `nav-item` | — | quick · standard | `background-color` | hover apenas; `aria-current` não anima |
| `skip-link` | — | quick · standard | `top` | é `position: absolute`, fora do fluxo — não move layout |
| App Shell / troca de rota | — | — | — | a superfície troca sem transição: atraso entre pedir e ver é custo, não polimento |

## Stagger

Aplicado só em `reveal`, via `data-stagger="1..8"`. Do nono item em diante, entrada simultânea.

## Um por região

`pulse_line` e `connection_recovery` são ambientes e infinitos. A regra de **uma por região visível**
é respeitada por construção: `.ds-pulse` aparece uma única vez, na seção "Integridade do sinal" da
Operação Viva, e `.ds-syncing` só existe enquanto o estado for `sincronizando`.
