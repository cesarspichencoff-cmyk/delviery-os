# Contrato de linhagem, confiança e validador — prontidão para R5-D

> **R5-D0.** Não conecta runtime, não cria flag, não emite recomendação.
> Implementação: `src/product/atencao/prontidao-r5d.ts` · Guarda: `npm run test:platform:r5d0`.
>
> **Existência de event log não prova propagação de identidade até a recomendação.
> Rótulo qualitativo de confiança não autoriza conversão numérica sem regra canônica.**

---

## 1. As três respostas

| Pergunta | Resposta | Estado |
|---|---|---|
| De quais eventos reais virão os `input_event_ids`? | **Só do Caminho A** (`event log → projetar() → ViagemProjetada.eventos[]`). O Caminho B, que produz o Foco, **não tem event ID nenhum**. | **BLOQUEADO** |
| Como a confiança será representada sem precisão inventada? | Como `nao_estimada` (ausência explícita) ou `apurada` com **regra declarada**. Rótulo e severidade **não** viram número. Hoje **não existe** produtor de confiança apurada no Caminho B. | **BLOQUEADO** |
| O harness e o runtime usam o mesmo validador? | **Sim.** `validarDraftShadow` mora em `shadow.ts`, `recomendar()` a chama, e o tradutor a **reexporta** — não há segunda cópia. | ✅ **RESOLVIDO** |

**Veredito: `R5D_BLOCKED`.** Duas verdes e uma vermelha continuaria bloqueado; aqui são duas vermelhas.

---

## 2. Linhagem — os dois caminhos, medidos no código

```text
Caminho A   event log → projetar() → ViagemProjetada.eventos[] → eventosDe() → input_event_ids
            IDENTIDADE PRESERVADA

Caminho B   LeituraOperacional → sinaisDe() → causa → política temporal → decidir() → tradutor
            IDENTIDADE INEXISTENTE
```

| Etapa | Tipo | Arquivo | Identidade de entrada | Identidade de saída | Preserva event ID? | Lacuna |
|---|---|---|---|---|---|---|
| envelope | `EventEnvelope` | `contracts/event-catalog.ts:88` | — | `event_id` | **sim** | — |
| projeção | `projetar()` | `projections/operacao-viva.ts:205` | `EventEnvelope[]` | `ViagemProjetada.eventos: string[]` (`:86`) | **sim** | — |
| evidência Shadow | `eventosDe()` | `copiloto/shadow.ts:92` | `ViagemProjetada[]` | `input_event_ids` | **sim** | um id por viagem, o último |
| **leitura operacional** | `LeituraOperacional` | `viewmodels/sinais.ts:91` | — | pedidos · carga · fontes | **NÃO** | **não existe campo de evento** |
| **sinal** | `sinaisDe()` | `viewmodels/sinais.ts` | `LeituraOperacional` | `Sinal.evidencias: {tipo, referencia, observado_em}` | **NÃO** | `referencia` é domínio, não `event_id` |
| causa candidata | `identidadeDaCausa()` | `atencao/politica-temporal.ts` | `Sinal` | `codigo\|ambiente\|subarea\|pedido\|fonte` | **NÃO** | identidade de causa ≠ identidade de evento |
| causa eleita | `elegerModo()` | `atencao/politica-temporal.ts` | causas | `FocoAtivo.identidade` | **NÃO** | — |
| ação | `decidir()` | `perfil-delivery/decisao.js:175` | fotografia do minuto | ação candidata | **NÃO** | o motor não conhece o log |
| tradutor | `traduzirParaShadow()` | `atencao/traducao-motor-shadow.ts` | `PacoteDeEvidencias` | draft | **exige do chamador** | bloqueia sem evidência |

### O achado, e ele é mais simples e mais grave do que "perdeu no meio"

**A identidade não é perdida em algum ponto do Caminho B — ela nunca entra.** `LeituraOperacional`
não tem campo de evento (`sinais.ts:91-107`), e `sinais.ts` **não cita `event_id` em nenhuma linha**
(`grep` = 0 ocorrências). A `Evidencia` do produto é `{tipo, referencia, observado_em}`
(`estados.ts:177`): `referencia` é um alvo de domínio — um pedido, uma praça —, nunca um id do log.

Guarda executável: **D-LIN** falha se `sinais.ts` passar a citar evento (aí a matriz precisa ser
reavaliada) **ou** se a projeção parar de preservar `eventos[]`.

### Sinais elegíveis e inelegíveis

| Origem | Elegível para recomendação Shadow? | Motivo |
|---|---|---|
| Políticas do Shadow sobre `Projecao` (`sinal-velho`, `capacidade-saturada`) | **sim** | evidência é `input_event_ids` real, do Caminho A |
| **Todos os sinais de `sinais.ts`** (S1…S22) | **não** | `eligible_for_shadow: false` · `reason: event_lineage_unavailable` |

**Nenhum backfill sintético foi feito.** Um id inventado depois é pior que a ausência: ele parece
verificável.

### A mudança mínima para o futuro — registrada, **não** implementada

Fazer `LeituraOperacional` carregar, por pedido e por fonte, os `event_id` que a sustentaram, e
`sinaisDe()` propagá-los para `Sinal.evidencias`. Isso exige que a leitura passe a **nascer do event
log** em vez de nascer de uma fotografia — mudança de runtime amplo, fora de R5-D0.

---

## 3. Confiança — comparação formal

| Conceito | Motor original | Shadow | Interface (`home-vm`) | Regra canônica existente | Lacuna |
|---|---|---|---|---|---|
| rótulo qualitativo | `"alta" \| "média" \| "baixa"` | ∅ | ∅ | **nenhuma** | não convertível |
| valor numérico | ∅ | `confidence: number` 0..1, obrigatório | `Campo<number>` | `exigirConfianca` (faixa, não origem) | **sem produtor legítimo** |
| evidência | ∅ | `input_event_ids` não vazio | `Evidencia[]` | `confiancaApresentavel` | Caminho B sem event ID |
| qualidade da fonte | ∅ | `source_mode` | `EstadoDeFonte` | — | conceitos distintos |
| completude | ∅ | ∅ | `Campo.observado` | — | — |
| recência | `STALE 120` (espera do pedido) | `expires_at` | `observado_em` | **D62** | não são a mesma grandeza |
| derivação | `dados` (texto) | `policy_version` | `procedencia` | — | texto não é estrutura |
| apresentação | sussurro "só quando não for alta" | `paraPainel` | `confiancaApresentavel` | **I9** | — |
| ausência | rótulo sempre presente | **não representável** | `ausente(...)` | I9 | Shadow **exige** o campo |
| não estimada | ∅ | ∅ | ∅ | **nenhuma** | criada aqui como `nao_estimada` |

### Resultado: **Caso C** — o Shadow exige número e nenhuma política existe

`Recomendacao.confidence` é `number` **obrigatório** (`shadow.ts:52`). Não há política canônica que
produza esse número a partir do Caminho B. **A regra não foi inventada.** As alternativas reais, com
impacto e risco, ficam registradas para o César decidir:

| # | Alternativa | Impacto | Risco |
|---|---|---|---|
| 1 | Tornar `confidence` **opcional/`nao_estimada`** no Shadow | mexe num contrato provado por 39 testes e em `exigirConfianca` | recomendação sem confiança pode ser lida como certeza — mitigável exigindo o rótulo "não estimada" na apresentação |
| 2 | Definir **política canônica** de cálculo, com evidência | destrava o Caminho A e, no futuro, o B | inventar a fórmula sem medição repete o erro que D66 evitou; exige dado real |
| 3 | **Manter bloqueado** | nenhum | R5-D não começa — e é o estado honesto hoje |

**Nenhuma foi escolhida em silêncio. R5-D permanece bloqueado.**

### Defeito registrado, **não corrigido** — `home-vm.ts:474`

```ts
sinal.severidade >= 3 ? 0.8 : 0.6
```

**Severidade virando confiança**, exatamente o que §10 proíbe (`severidade ≠ confiança`). É um número
com a aparência de medição e a origem de um degrau de severidade. Não foi corrigido porque as view
models estão **congeladas** nesta missão. Guarda que impede a regra de entrar no caminho novo:
`conferirConfianca` recusa qualquer regra que mencione severidade
(`motivo: severity_used_as_confidence`, teste **D16**).

---

## 4. Validador Shadow — a duplicação foi eliminada

**Antes (R5-C):** `recomendar()` aplicava as recusas inline e o harness tinha a sua própria cópia
parecida. Dois validadores que divergiriam no dia em que um deles mudasse.

**Agora:**

```text
validarDraftShadow()   função pura canônica, em shadow.ts
recomendar()           monta a candidata → chama validarDraftShadow() → só então empilha
tradutor / harness     REEXPORTA a mesma função — não há segunda implementação
```

**Prova que texto não consegue dar:** o teste **D21/D22/D23** compara a **identidade de referência**
das duas importações — `validadorDaFronteira === validadorDoShadow`. Duas cópias parecidas passariam
em qualquer comparação textual e falham nesta.

**Equivalência preservada:** os **39** testes do Shadow continuam verdes, sem nenhuma regra alterada,
reduzida ou acrescentada. Validar continua **sem efeito**: ciclo de vida, ordenação e store ficam
fora da função.

---

## 5. Separação conceitual — o que este contrato proíbe fundir

```text
qualidade da evidência ≠ confiança da recomendação ≠ severidade operacional
prioridade ≠ estado Calmo/Ambiente/Foco
frescor da fonte ≠ validade da recomendação
STALE 120 ≠ frescor        MAXFOCUS ≠ validade        quantidade de eventos ≠ confiança
texto do motor ≠ evidência
```

Nenhuma conversão entre eles existe no código desta missão, e duas guardas impedem que apareçam:
`severity_used_as_confidence` e `qualitative_label_not_convertible`.

---

## 6. Estado — o que existe e o que não

**Existe:** o pacote `LinhagemDeEvidencia` (serializável, determinístico, auditável, vinculado à
causa eleita), `conferirLinhagem`, `conferirConfianca`, `avaliarProntidaoR5D` e o validador único.

**Não existe:** conexão motor↔Shadow · flag · runtime · recomendação real · store novo · fila ·
endpoint · listener. O preflight **devolve veredito e não liga nada** (teste D28/D29/D30).

**R5-D não iniciado. D43 de pé. D29 preservada.**
