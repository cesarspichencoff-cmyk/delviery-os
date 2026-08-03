# Paridade de movimento — organismo operacional

> Escrito **antes** de editar a camada de movimento, em 2026-08-03, sobre HEAD `c055535`.
> Autoridade, nesta ordem: verdade operacional → Sprint Visual V2 → Organismo V3.3 →
> decisões visuais do César → OriginKit (movimento) → `docs/figma/MOTION_SYSTEM.md` →
> frontend aprovado → Design System → protótipos antigos como história.
>
> Não é auditoria nova. É a lista do que existe, do que falta e do que **não pode** existir ainda.

---

## 0. Duas condições que decidem quase tudo desta matriz

**(A) O OriginKit não pôde ser inspecionado nesta sessão.** Ver **PB12**. A navegação abre e o
título chega; toda leitura de conteúdo falha (`Policy check temporarily unavailable` no navegador,
`403` no WebFetch). Nenhuma coluna abaixo foi preenchida por suposição sobre ele, e **nada foi
reconstruído de memória**. O movimento desta sessão deriva do V3.3, das decisões do César e do
`MOTION_SYSTEM.md` — que já é canônico neste repositório e já é autoridade nesta missão.

**(B) A home não tem mudança de estado ao vivo.** Medido: trocar de cena e aproximar-se de uma área
são links `?cena=…#/` e `?area=…#/`, que provocam **carregamento completo da página**. `home.js` não
tem handler, e isso é deliberado — foi assim que a superfície ficou sem controle que executa.

A consequência é dura e vale escrever: **um padrão que anima a passagem de um estado para outro no
mesmo lugar não tem o que animar aqui.** Text Morph, recuperação, confirmação e progresso só
existiriam como encenação — o texto não evolui, ele nasce pronto no HTML seguinte. Implementá-los
agora seria movimento sem mudança, que é exatamente o que a §6 desta missão proíbe.

O que **sobra** e é real: chegada de conteúdo (a superfície nasce), continuidade da aproximação,
presença ambiente (a fonte está viva), e a declaração de transição nas propriedades que mudariam —
para que, no dia em que houver atualização em vigor, a mudança atravesse em vez de saltar.

---

## 1. Matriz de referência OriginKit

| Padrão observado | O que comunica | Aplicação possível no DeliveryOS | Onde não usar |
|---|---|---|---|
| **NÃO INSPECIONADO** | — | — | — |

A tabela fica vazia de propósito. Preenchê-la com nomes vindos da busca (`Click Effects`,
`Particle Sphere`, `Black Hole`, `Coverflow`, `Blur Carousel`) descreveria **títulos de resultado de
busca**, não padrões observados — e os que apareceram são de família decorativa, justamente a que a
§8 restringe a capa e onboarding. Classificar comportamento exige ver o comportamento.

Quando o acesso existir, esta seção é o primeiro trabalho da retomada.

---

## 2. Paridade por cenário — estado medido em `c055535`

Legenda: `alinhado` · `parcial` · `ausente` · `divergente` · `demonstrativo` · `futuro` · `bloqueado`.

| Movimento ou cenário | Fonte | Frontend atual | Figma atual | Estado | Ação |
|---|---|---|---|---|---|
| **Pulso de vida** | V3.3 `dosPulse`; `pulse_line` do Motion System | ponto do cabeçalho pulsa quando não degradado; **e** cada área em degrau 3 pulsa | ausente | **divergente** | adotar token canônico; **uma ambiente por região** — o anel de pressão deixa de ser pulso ambiente |
| **Mudança de degrau** | V3.3 prancha 13; `state_handoff` | nenhuma transição declarada; a cor troca no carregamento | ausente | **ausente** | declarar `transition` nas propriedades que mudam, com tokens canônicos |
| **Linha ativa** | V3.3 prancha 13; `dosFlow` | `orgFluxo` roda em `ativa` e `carregada`; inerte não anima | ausente | **parcial** | trocar duração ad hoc por token; declarar transição de `stroke` |
| **Propagação** | V3.3 "a pressão se espalha" | a intensidade já percorre o caminho; sem movimento próprio | ausente | **alinhado** | nenhuma — a propagação é estrutural, não animada |
| **Entrada do Foco** | V3.3 painel que emerge; `reveal` | painel aparece pronto | ausente | **ausente** | `reveal` no painel e nas evidências, com stagger ≤ 8 |
| **Saída do Foco** | decisões §7.4 | não existe — o Foco some com a leitura | ausente | **futuro** | exige atualização em vigor |
| **Aproximação** | decisões §7.5 | troca de página completa | ausente | **parcial** | `reveal` na área aproximada e no minimapa, preservando o contexto |
| **Retorno** | decisões §7.5 | link `← Visão geral` | ausente | **parcial** | mesma entrada da superfície geral |
| **Text Morph** | decisões §7.6 | ausente | ausente | **bloqueado** | não há evolução de texto ao vivo — ver §0(B) |
| **Confirmação** | decisões §7.7 | ausente | ausente | **futuro** | não existe ação a confirmar; nada executa |
| **Recuperação** | decisões §7.8 | ausente | ausente | **bloqueado** | exige duas leituras em sequência na mesma sessão |
| **Expiration fade** | `expiration_fade`; contrato dos estados técnicos | ausente no organismo; existe no Design System (`.ds-expired`) | ausente | **ausente** | a faixa técnica já **declara** idade em texto e hora; o fade entra quando houver envelhecimento em vigor |
| **Progress** | decisões §7.10 | ausente | ausente | **futuro** | representação demonstrativa; não virar função nesta missão |
| **Falha técnica** | contrato dos estados técnicos | cinza-ardósia, sem crescimento, sem âmbar, ponto **não** pulsa | ausente | **alinhado** | preservar, e provar por guarda |
| **Reduced motion** | `MOTION_ACCESSIBILITY.md` | bloco existe; anel de pressão vira anel fixo | ausente | **alinhado** | estender às animações novas |
| **Mobile** | decisões §5.7 | mesma verdade, sem overflow | ausente | **alinhado** | preservar |

---

## 3. Divergência de token — a mais importante

O organismo declarou movimento próprio:

```css
--org-fluxo: 1.6s;    /* ad hoc */
--org-pulso: 2.8s;    /* ad hoc */
transition: transform 0.18s ease;   /* ad hoc, na área */
```

O `MOTION_TOKENS.json` é canônico e já traz `motion-quick 120ms`, `motion-base 200ms`,
`motion-calm 320ms`, `motion-slow 520ms`, `motion-ambient 2400ms` e quatro easings. **Nenhum dos
três valores acima existe no cânone.** Não é uma diferença de gosto: é a home tendo um sistema de
movimento paralelo ao do produto, que é a mesma espécie de erro que PB9 registrou para a cor.

**Correção:** os tokens do organismo passam a derivar dos canônicos. Onde o cânone não tem valor —
o fluxo contínuo do fio — a derivação é declarada e justificada no próprio arquivo, nunca inventada
em silêncio.

---

## 4. O que esta missão NÃO vai fazer, e por quê

- **Não instala OriginKit**, não adiciona MCP dele, não copia componente. Já havia guarda
  (`motion: nenhuma dependencia de biblioteca foi adicionada`); ela continua.
- **Não anima evidência, sinal, ocorrência nem erro** — proibição do `MOTION_SYSTEM.md` §4.
- **Não anima o glifo nem o rótulo de estado.** O canal textual troca instantaneamente, para não
  existir instante em que o rótulo minta.
- **Não põe partícula, 3D ou fundo reativo em superfície operacional.** §8 desta missão.
- **Não transforma voz, previsão, progresso ou fechamento em função real.**
