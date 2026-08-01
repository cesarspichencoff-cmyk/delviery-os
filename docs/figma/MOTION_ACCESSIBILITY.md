# Motion e acessibilidade

> Complementa `MOTION_SYSTEM.md` §5. Verificações em `src/platform/run-product-system-tests.ts`.

## 1. Nenhuma informação vive só no movimento

A regra estruturante: **todo estado que anima já está escrito em texto no DOM antes de a animação
começar.** Desligar toda animação não remove um único fato da tela — remove apenas a travessia até
ele.

Consequência prática: `reveal` anima um cartão que já tem seu texto; `state_handoff` anima a cor de
um badge cujo rótulo já trocou; `expiration_fade` reduz a opacidade de um cartão que continua
legível e continua no DOM.

## 2. `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
  .ds-reveal, .ds-pulse, .ds-syncing { animation: none !important; }
  .ds-reveal { opacity: 1; transform: none; }
  .ds-state, .ds-expired, .ds-expand, .ds-meter__fill {
    transition-duration: var(--motion-instant) !important;
  }
}
```

Duas metades, ambas necessárias: parar as animações **e** zerar as transições. Parar só a primeira
deixaria o badge levando 200ms para trocar de cor, e o inspetor levando 320ms para abrir.

`.ds-reveal` recebe `opacity: 1; transform: none` explicitamente porque `animation-fill-mode: both`
deixaria o elemento no estado inicial (invisível) se a animação fosse cancelada.

**Guarda:** a mutação adversarial M3 trocou a media query por uma que nunca casa. O teste
`motion: reduced motion existe e nada informativo vive so no movimento` caiu.

## 3. Teclado

- Nenhuma animação atrasa foco. O anel de `:focus-visible` é declarado **sem `transition`**, e um
  teste lê o bloco CSS e reprova se `transition` aparecer nele.
- O skip-link usa `top` (elemento `position: absolute`, fora do fluxo) com 120ms — ele precisa ser
  percebido chegando, e não desloca nada.
- Abrir o menu mobile move o foco para o primeiro item **imediatamente**; a lâmina aparece sem
  transição de largura.

## 4. Leitor de tela

- Movimento não carrega significado, então **nada é anunciado por causa dele**.
- A região que troca ao navegar usa `aria-live="polite"`. `assertive` é **proibido** e verificado
  por teste: nada nesta aplicação é urgente a ponto de interromper quem está lendo outra coisa.
- `aria-busy` marca a superfície enquanto ela carrega, e volta a `false` no `finally`.
- O glifo do badge é `aria-hidden`; o `.sr-only` carrega o texto do estado por extenso.
- Ícones de módulo são `aria-hidden` + `focusable="false"`, sempre acompanhados do nome em texto.

## 5. Vestibular e fotossensibilidade

As duas animações infinitas (`ds-breathe` em `.ds-pulse` e `.ds-syncing`) variam **apenas
opacidade**, entre 0.35 e 1, em 2400ms — cerca de 0,4 Hz, muito abaixo do limiar de 3 Hz para risco
fotossensível. Não há flash, não há deslocamento, não há mudança de cor durante o ciclo.

## 6. Impressão e captura monocromática

`@media print` remove fundo e cor do badge e força preto. Restam rótulo, glifo e padrão de borda —
os três canais que não dependem de cor. Animação não existe em impressão, e como nenhuma informação
vive no movimento, nada se perde.
