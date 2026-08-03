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

## 1. Matriz de referência OriginKit — `OriginKit external review deferred — non-blocking`

| Padrão observado | O que comunica | Aplicação possível no DeliveryOS | Onde não usar |
|---|---|---|---|
| **NÃO INSPECIONADO** | — | — | — |

A tabela fica vazia de propósito. Preenchê-la com nomes vindos da busca (`Click Effects`,
`Particle Sphere`, `Black Hole`, `Coverflow`, `Blur Carousel`) descreveria **títulos de resultado de
busca**, não padrões observados — e os que apareceram são de família decorativa, justamente a que a
§8 restringe a capa e onboarding. Classificar comportamento exige ver o comportamento.

### PB12 reclassificado em 2026-08-03 — o OriginKit **não bloqueia** nada

A evidência de indisponibilidade continua registrada, inteira, em `docs/execution/BLOCKERS.md`
(PB12) e não foi apagada. O que mudou é a **classificação**, e ela é definitiva:

O OriginKit é **referência externa opcional de qualidade**. Ele **não** é autoridade visual, **não**
é dependência, **não** prevalece sobre V2/V3.3, **não** bloqueia o Figma, **não** bloqueia a
paridade e **não** bloqueia o fechamento visual. A revisão poderá acontecer depois como
**refinamento**, nunca como reconstrução obrigatória.

Consequência prática: a etapa de movimento deixa de depender desta seção. O movimento do organismo
deriva — e sempre derivou — de `docs/figma/MOTION_SYSTEM.md`, do Organismo V3.3 e das decisões
visuais do César. Ver **D57**.

**O que continua proibido:** declarar que o OriginKit foi analisado, reconstruir componentes de
memória, ou inventar uma matriz de referência. Se a tabela acima for preenchida um dia, será porque
alguém viu o comportamento.

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

**Contradição registrada, não resolvida.** `MOTION_TOKENS.json` lista `bloco de evidencia` em
`reveal.permitido_em`; `MOTION_COMPONENT_MAPPING.md` diz *"evidência não anima, em hipótese
nenhuma"*. Os dois são canônicos e discordam. Aqui prevaleceu **não animar** — ver **D56**. Os dois
documentos precisam concordar, e decidir qual cede é decisão de produto, não de sincronização.

---

## 5. Estado DEPOIS da sincronização — medido em `d9a7438`

Medições feitas no navegador, em `http://localhost:5290`, com o servidor real.

### 5.1 Animação ambiente por cena

| Cena | Pulso de vida | Anéis de pressão | Fios em movimento | **Total ambiente** |
|---|---|---|---|---|
| Calmo | 1 | 0 | 0 | **1** |
| Ambiente | 1 | 0 | 0 | **1** |
| Foco | 0 (estado crítico vence) | 2 | 3 | **5** |
| Degradado | 0 (fonte parada não pulsa) | 0 | 0 | **0** |

Antes desta sessão o Foco tinha **8**. A queda não veio de apagar movimento: veio de separar
fluxo de espera (**D55**) e de parar o pulso ambiente quando a pressão já respira (**D22/O22**).

### 5.2 Tokens — todos resolvidos do cânone

| Token do organismo | Resolve para | Origem |
|---|---|---|
| `--org-pulso` | `2400ms` | `motion-ambient` |
| `--org-fluxo` | `calc(2400ms / 2)` | derivado, declarado no arquivo |
| `--org-troca` | `200ms` | `motion-base` |
| `--org-chegada` | `200ms` | `motion-base` |
| `--org-resposta` | `120ms` | `motion-quick` |

Nenhuma duração literal restou no CSS da home. Guarda **O19**.

### 5.3 Reduced motion

Cobertura medida pelo CSSOM no navegador: **21 elementos animam ou transicionam · 0 descobertos**.
O bloco não usa `display: none` nem zera opacidade. O anel de pressão vira anel fixo em `0.55` em
vez de sumir, porque ele carrega degrau.

**Não exercitado com a preferência real do sistema operacional** — a verificação é estrutural
(CSSOM + guardas O14 e O24), não comportamental.

---

## 6. Matriz Figma ↔ código ↔ motion

| Cenário | Node ID | Rota/estado | Componente | Origem | Real/demonstração | Movimento | Token | Reduced motion | Teste | Divergência |
|---|---|---|---|---|---|---|---|---|---|---|
| Calmo desktop | — | `?cena=calmo#/` | `.org` | fixture | **demonstração** | pulso de vida | `--org-pulso` | para | O15, O24 | **Figma não sincronizado** |
| Ambiente desktop | — | `?cena=ambiente#/` | `.org` | fixture | **demonstração** | pulso de vida; linhas de espera paradas | `--org-pulso` | para | O20, O22 | **Figma não sincronizado** |
| Foco desktop | — | `?cena=foco#/` | `.org-foco` | fixture | **demonstração** | `reveal` do painel; 3 fios em fluxo; 2 anéis | `--org-chegada`, `--org-fluxo`, `--org-pulso` | para; anel fixo | O11, O20, O22, O24 | **Figma não sincronizado** |
| Aproximação Sushi | — | `?cena=foco&area=sushi#/` | `.org-aprox` | fixture | **demonstração** | `reveal` do corpo e do minimapa | `--org-chegada` | para | O12, O24 | **Figma não sincronizado** |
| Aproximação Cozinha | — | `?cena=foco&area=cozinha#/` | `.org-aprox` | fixture | **demonstração** | idem | `--org-chegada` | para | O12 | **Figma não sincronizado** |
| Informação parcial | — | `?cena=degradado#/` | `.org-area[data-degrau="0"]` | fixture | **demonstração** | nenhum | — | n/a | O9 | **Figma não sincronizado** |
| Sem integração | — | todas as cenas | `[data-ausencia="sem_integracao"]` | contrato de áreas | **real** (a ausência é real) | nenhum | — | n/a | O4b, O9 | **Figma não sincronizado** |
| Falha persistente | — | `?cena=degradado#/` | `.org-tecnico` | fixture | **demonstração** | **nenhum, por regra** | — | n/a | O8, O21 | **Figma não sincronizado** |
| Recuperação | — | — | — | — | **futuro** | não implementado | — | — | — | exige leitura em vigor |
| Mobile (todas) | — | 375px | `.org` | fixture | **demonstração** | idêntico ao desktop | mesmos | para | O13 | **Figma não sincronizado** |

**Nenhum node ID foi inventado.** A coluna está vazia porque o Figma **não foi aberto nesta
sessão** — ver **PB11** e §7 abaixo. Preencher com IDs plausíveis seria a pior linha deste
documento.

---

## 7. Por que o Figma não foi aberto

A §18 desta missão proíbe abrir **nova categoria** depois de 60% do contexto consumido. A
inspeção do OriginKit (bloqueada, PB12), a matriz, a correção de movimento e a rodada adversarial
consumiram o orçamento antes disso.

Um Figma sincronizado pela metade — algumas frames na expressão nova, outras na antiga, sem matriz
e sem node IDs — é **pior** que um Figma coerentemente desatualizado: ele passa a mentir sobre
qual é a expressão vigente, e a próxima sessão não sabe de onde partir.

**PB11 continua aberto.** É a próxima ação segura.
