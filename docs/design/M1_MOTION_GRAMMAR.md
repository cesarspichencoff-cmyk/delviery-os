---
lifecycle:
  artefato: docs/design/M1_MOTION_GRAMMAR.md
  status: ACTIVE
  authority_scope: motion_law
  superseded_by: null
  atualizado_em: "2026-08-11"
  state_basis: f87a36dfd39c9989344f0fed6ebf8db5db1a8c35
  missao: M1A.1 — ponte canônica e estrutural
---

# Gramática de movimento M1 — uma autoridade, no nível da lei

> *"A operação não recebe animação. A operação revela sua mudança através do movimento."*

```
MOTION_AUTHORITY_ACTIVE = docs/design/M1_MOTION_GRAMMAR.md
```

**Uma só.** Antes desta missão havia duas: `docs/figma/MOTION_SYSTEM.md`, canônico
no repositório, e o **Motion North Star** do pacote, aprovado pelo César. Nenhum dos
dois se declarava subordinado ao outro. Duas autoridades ativas para o mesmo assunto
é o defeito que a mutação **M-H** procura, e ele existia de verdade.

Este documento **não apaga** o antigo. Ele o classifica lei por lei e absorve o que
continua válido. `docs/figma/MOTION_SYSTEM.md`, `MOTION_TOKENS.json`,
`MOTION_COMPONENT_MAPPING.md`, `MOTION_ACCESSIBILITY.md` e
`docs/design/CANONICAL_MOTION_PARITY.md` passam a ser **HISTÓRICO VIGENTE**: continuam
governando o que já está implementado no Design System e no organismo atual, e
**deixam de decidir** a expressão temporal de M1B. Onde discordarem desta gramática,
vence esta.

> `docs/figma/**` está congelado por sete gates. Nenhum daqueles arquivos foi
> editado por esta missão — a subordinação é declarada aqui, e não lá.

---

## 1. Reconciliação lei a lei — o antigo contra a North Star

| # | OLD_LAW | SOURCE | CLASSIFICATION | RATIONALE | NEW_EXPRESSION_IF_ANY | M1B_EFFECT |
|---|---|---|---|---|---|---|
| 1 | movimento comunica mudança de estado; o que não comunica não entra | `MOTION_SYSTEM.md` §1 | **STILL_VALID_LAW** | é a mesma frase da North Star, dita antes | §2 L1 | inalterado |
| 2 | nenhuma biblioteca de motion; só CSS/`@keyframes` | `MOTION_SYSTEM.md` §2 | **STILL_VALID_LAW** | guarda executável já existe; a North Star não pede biblioteca | §2 L11 | `NATIVE_FIRST` continua |
| 3 | **inerte** não anima; **ativa** = tracejado parado; **carregada** = tracejado em movimento (D55) | `MOTION_SYSTEM.md` §2, guarda O20 | **STILL_VALID_LAW** | a North Star chega à mesma lei por outro caminho: *"espera não finge fluxo"* | §2 L4 | preservar; a expressão muda de fio para passagem |
| 4 | estado crítico vence movimento ambiente; máx. **uma** animação ambiente por região | `MOTION_SYSTEM.md` §2/§5, guarda O22 | **STILL_VALID_LAW** | contagem medida: Calmo 1 · Ambiente 1 · Foco 5 · Degradado 0 | §2 L8 | preservar |
| 5 | falha técnica não anima — nem pulsa, nem cresce, nem usa âmbar | `MOTION_SYSTEM.md` §2, guarda O21 | **STILL_VALID_LAW** | — | §2 L6 | preservar |
| 6 | evidência não anima, em hipótese nenhuma | `MOTION_COMPONENT_MAPPING.md` | **STILL_VALID_LAW** | a North Star repete: a evidência chega inteira | §2 L5 | preservar |
| 7 | `reveal.permitido_em` inclui `bloco de evidencia` | `MOTION_TOKENS.json` | **CONFLICT** | contradiz a linha 6; registrado em `CANONICAL_MOTION_PARITY.md` §4 e **aberto desde D56** | §2 L5 resolve: **evidência não anima** | `MOTION_TOKENS.json` precisa perder essa permissão em M1B; até lá vale L5 |
| 8 | nenhuma informação vive só no movimento; `reduce` preserva tudo | `MOTION_ACCESSIBILITY.md` §1/§2 | **STILL_VALID_LAW** | exercitado de verdade: 6 cenas, 0 animando em `reduce`, contagem de caracteres idêntica | §2 L9 | preservar, e estender à matéria nova |
| 9 | interrupção não enfileira: a nova transição parte do valor corrente | `MOTION_SYSTEM.md` §5 | **STILL_VALID_LAW** | a North Star chama de *"retarget a partir do quadro atual"* — mesma lei, nome novo | §2 L10 | preservar |
| 10 | nenhuma animação move layout (só `opacity`, `transform`, cor, `grid-template-rows`, `width` em caixa fixa) | `MOTION_SYSTEM.md` §5 | **NEEDS_RECONCILIATION** | a reorganização do Foco da North Star é **interpolação de geometria** — deforma o território. Não é layout shift acidental; é a única transformação estrutural da cena, e é semântica | §2 L7 | a regra passa a ser: layout não se move **por acidente**; a geometria do território pode interpolar quando isso É a mudança de estado |
| 11 | stagger 40 ms até o oitavo item; do nono, entrada simultânea | `MOTION_SYSTEM.md` §5 | **SUPERSEDED_EXPRESSION** | vale para lista; a Home de M1B não tem lista de cartões — tem território. O atraso entre carga, passagem e efeito é **causal**, não estético | §2 L3 | não aplicar stagger de lista ao território |
| 12 | `pulse_line` só pulsa com fonte observada viva | `MOTION_SYSTEM.md` §2, `MOTION_COMPONENT_MAPPING.md` | **STILL_VALID_LAW** | pulsar sobre sinal degradado afirmaria vida não observada | §2 L2 | preservar |
| 13 | `expiration_fade` nunca remove: `.45` e legível no DOM | `MOTION_SYSTEM.md` §6 | **STILL_VALID_LAW** | histórico de recomendação retirada é o que sustenta confiança | §2 L5 | preservar |
| 14 | `--org-pulso/fluxo/troca/chegada/resposta` derivam dos tokens canônicos | `MOTION_SYSTEM.md` §2, guarda O19 | **STILL_VALID_LAW** | matou o sistema paralelo de movimento da home (mesma espécie de erro que PB9 para cor) | §3 | tokens novos também derivam; nada literal no CSS |
| 15 | Text Morph, recuperação, confirmação, progresso: **bloqueados** porque a home não tem mudança de estado ao vivo | `CANONICAL_MOTION_PARITY.md` §0(B) | **NEEDS_RECONCILIATION** | continua verdade em `f87a36d`: trocar cena é recarga de página inteira. A North Star pressupõe uma superfície que atravessa estados sem recarregar | §4 | **pré-requisito de M1B**: sem atualização em vigor, a cena da North Star só existe como encenação — e encenação é o que L1 proíbe |
| 16 | movimento decorativo proibido em alerta, ocorrência, evidência, erro, offline, tabela | `MOTION_SYSTEM.md` §4 | **STILL_VALID_LAW** | — | §2 L5/L6 | preservar |
| 17 | partícula, 3D e fundo reativo restritos a capa/onboarding | `MOTION_SYSTEM.md` §4 | **STILL_VALID_LAW** | nenhum existe nesta unidade | §2 | preservar |
| 18 | nenhum timer de JS conduz animação | `MOTION_SYSTEM.md` §5 | **REDUNDANT** com L11, mas mantida | é a forma verificável de L11 | §2 L11 | preservar |
| 19 | duas animações infinitas variam só opacidade, ~0,4 Hz, abaixo de 3 Hz | `MOTION_ACCESSIBILITY.md` §5 | **STILL_VALID_LAW** | fotossensibilidade | §2 L9 | qualquer canal ambiente novo precisa medir isso |
| 20 | a troca de rota não tem transição | `MOTION_COMPONENT_MAPPING.md` | **STILL_VALID_LAW** | *"atraso entre pedir e ver é custo, não polimento"* | §2 L12 | preservar |
| 21 | OriginKit é referência externa opcional; não é autoridade nem dependência (D54/D57) | `MOTION_SYSTEM.md` §2 | **STILL_VALID_LAW** | `NOT_INSPECTED` continua registrado, sem nada atribuído | §5 | preservar |

Nenhuma lei antiga foi apagada. Sete continuam válidas sem tradução, oito com
tradução, uma é redundante, duas precisam de reconciliação e **uma é conflito real
herdado** (linha 7) que M1B tem de fechar.

---

## 2. As doze leis da gramática M1B

Direção aprovada: **H3 — propagação causal, com uma pausa importada da H2.**

| # | Lei | Consequência verificável |
|---|---|---|
| **L1** | movimento corresponde a mudança de estado real | nenhuma animação sem transição de estado no modelo |
| **L2** | fluxo real pode se mover | e só ele |
| **L3** | a ordem é **causal**: carga adensa → passagem responde → efeito chega. O efeito nunca chega antes da causa | o atraso é semântico; não é stagger estético e não pode ser reordenado por gosto |
| **L4** | espera **não** finge fluxo | matéria parada na passagem, sem deslocamento em nenhum quadro. Se um dia existir fluxo comprovado, ele ganha canal próprio e visivelmente diferente |
| **L5** | evidência chega inteira e estática | evidência, limitação, procedência e hora não animam; expirado permanece legível |
| **L6** | estado técnico fala baixo | falha técnica não pulsa, não cresce, não usa âmbar |
| **L7** | transformação, não decoração | a reorganização do Foco é interpolação de geometria — o território muda de forma. Nada aparece nem desaparece; nenhum painel substitui a transformação espacial |
| **L8** | modo degradado reduz movimento | estado crítico vence ambiente; uma animação ambiente por região visível |
| **L9** | `reduced motion` preserva **toda** a informação | os estados finais são assumidos sem interpolação; contagem de texto idêntica nos dois modos; nenhuma área desaparece |
| **L10** | interrupção não rebobina | verdade nova faz *retarget* a partir do quadro atual; nada espera a transição anterior terminar e nada volta a quadro já passado |
| **L11** | nativo primeiro | CSS/SVG/browser. Biblioteca só depois de propriedade provada, spike isolado, custo medido e rollback trivial |
| **L12** | a pausa é recurso | há **um** silêncio antes do Foco. É a única parte da cena em que a ausência de movimento é o próprio recurso |

---

## 3. Tempo — proporção é lei, relógio é calibração

```
CALIBRATION_PENDING = duração absoluta da cena, e o grânulo real de acumulação por praça
```

A North Star declara oito canais com fração da cena. **As frações são a razão entre
as etapas; não são relógio de parede.** O próprio artefato registra: *"os 26 segundos
são uma escala de leitura, não a operação. Se a acumulação real levar oito minutos,
as proporções continuam válidas mas a cena precisa ser reamostrada."*

| Canal | Fração da cena | Curva | Regra |
|---|---|---|---|
| carga do território | 24 % | suave, sem retorno | densidade satura; **nunca** aponta posição interna |
| passagem carregada | 16 %, atrasada em 20 % | suave, entra parada | só com evidência de espera; matéria imóvel |
| resposta do destino | 14 %, atrasada em 30 % | suave | o efeito chega depois da causa |
| pausa antes do Foco | 6 % em silêncio | nenhuma | nenhum canal muda |
| reorganização do Foco | 12 % | desaceleração forte | todas as câmaras interpolam ao mesmo tempo |
| confirmação da ação | 6 % | troca direta | hora exata, sem cor comemorativa |
| alívio em cadeia | 16 %, em três tempos | suave, um canal por vez | passagem esvazia → território afrouxa → destino escoa |
| verdade nova no meio | imediata | mistura de 10 % a partir do quadro atual | L10 |

**Proibido, e é a mutação `M-I`:** transformar `24%`, `16%`, `6%`, `26s` ou qualquer
outro número da demonstração em constante de runtime. Guarda `E5` verifica o CSS do
produto. As durações absolutas entram quando a operação real for medida — até lá,
`CALIBRATION_PENDING`, e os tokens continuam derivando de `MOTION_TOKENS.json`.

---

## 4. Pré-requisito estrutural que M1B herda

A Home de `f87a36d` **não tem mudança de estado ao vivo**: trocar cena e aproximar-se
de uma área são links que recarregam a página inteira; `home.js` não tem handler.
Medido em `CANONICAL_MOTION_PARITY.md` §0(B), e continua verdade.

Enquanto isso não mudar, a cena da North Star **não pode ser implementada como
travessia real** — seria encenação, que é o que L1 proíbe. M1B tem duas saídas
legítimas, e a escolha é de produto:

1. implementar a expressão **estática** (De-Mechanization) e declarar as transições
   nas propriedades que mudariam, para que a travessia exista no dia em que houver
   atualização em vigor;
2. introduzir atualização em vigor na Home — o que sai do escopo "camada visual" e
   precisa de decisão registrada.

**Isto não é bloqueio de M1A.1.** É a condição que M1B precisa enxergar antes de
prometer a cena inteira.

---

## 5. Propriedade do movimento — nenhum componente inventa semântica

| Movimento | OWNER | TRIGGER | SOURCE_STATE → TARGET_STATE | INTERRUPTIBLE | RETARGET | REDUCED_MOTION | DEGRADED | EVIDENCE |
|---|---|---|---|---|---|---|---|---|
| carga do território | view model da Home | carga observada muda | densidade anterior → nova | sim | do quadro atual | assume o valor final | sem carga observada: **não anima e não fica verde** | n/a |
| passagem carregada | view model (evidência de espera) | espera comprovada aparece/some | vazia → carregada parada | sim | do quadro atual | matéria parada, sem interpolar | some | n/a |
| resposta do destino | view model | passagem carregou | normal → aquecida | sim | do quadro atual | estado final | some | n/a |
| pausa | orquestrador da cena | fim da propagação | — | sim, encurta | pula | **duração zero** | n/a | n/a |
| reorganização do Foco | eleição de Foco no view model | Foco eleito ou liberado | geometria A → geometria B | sim | do quadro atual | troca direta de geometria | Foco continua visível | n/a |
| confirmação | ação humana | resposta registrada | botão → confirmação com hora | não | — | troca direta | n/a | a hora é evidência: **estática** |
| alívio em cadeia | view model | pressão cai | pressionado → normal | sim | do quadro atual | estado final | n/a | n/a |
| pulso de vida | estado de fonte | fonte observada viva | — | sim | — | para | **não pulsa** | n/a |

Regra que atravessa a tabela: **o dono é sempre o estado, nunca o componente.**
Componente lê estado e desenha; ele não decide o que o estado significa.

---

## 6. Sucessão declarada — sem canon duplicado

| Documento | Papel a partir de agora |
|---|---|
| **este arquivo** | **ACTIVE** — lei de movimento de M1B |
| `docs/figma/MOTION_SYSTEM.md` | **HISTÓRICO VIGENTE** — governa o Design System e o organismo já implementados; leis absorvidas na §1 |
| `docs/figma/MOTION_TOKENS.json` | **HISTÓRICO VIGENTE** — valores continuam a fonte dos tokens; a permissão de `reveal` em evidência é **conflito aberto** (§1 linha 7) |
| `docs/figma/MOTION_COMPONENT_MAPPING.md` | **HISTÓRICO VIGENTE** — mapa dos componentes existentes |
| `docs/figma/MOTION_ACCESSIBILITY.md` | **HISTÓRICO VIGENTE** — §1 e §2 são lei preservada em L9 |
| `docs/figma/MODULE_MOTION_VISION.md` | **HISTÓRICO** |
| `docs/design/CANONICAL_MOTION_PARITY.md` | **HISTÓRICO** — medição de `c055535`/`d9a7438`; §0(B) continua sendo o pré-requisito da §4 |
| Motion North Star (`DeliveryOS - Motion North Star.dc.html`) | **N1 · fonte da direção** — a lei foi transcrita aqui; o artefato é a prancha, não o contrato |

Nenhum destes foi apagado ou reescrito. Guarda `E4` reprova se aparecer mais de uma
autoridade ativa.
