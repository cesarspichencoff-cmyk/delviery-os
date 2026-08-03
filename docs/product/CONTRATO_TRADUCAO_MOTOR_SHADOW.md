# Contrato de tradução — motor original → Copiloto Shadow

> **R5-C.** Fronteira **pura e tipada** entre a ação candidata do motor original e uma recomendação
> que o Shadow seja capaz de validar. **Não conecta os runtimes.** Sem flag, sem store, sem evento,
> sem recomendação real. **D43 continua de pé.**
> Implementação: `src/product/atencao/traducao-motor-shadow.ts` · Guarda: `npm run test:platform:r5c`.

---

## 0. A regra que governa a fronteira inteira

**A Operação Viva já elegeu a causa e o Foco antes da tradução.** O tradutor, o Shadow e o Copiloto
**não podem criar, trocar, renovar ou retirar o Foco por conta própria** (C3).

```text
sinais e causas candidatas → política temporal → causa e Foco eleitos
causa eleita + fotografia    → motor original   → ação candidata limitada ao Foco
ação + Foco + evidências     → tradutor puro    → rascunho Shadow ou recusa tipada
rascunho                     → Shadow           → validação ou rejeição
recomendação validada        → pode ser anexada ao Foco JÁ existente
Copiloto                     → apresenta a orientação
```

O tradutor **não** elege modo · **não** cria Foco · **não** altera `FocoAtivo` · **não** reinicia
debounce · **não** altera cooldown · **não** prolonga `MAXFOCUS`. O Shadow **não** substitui a
política temporal. **Uma recomendação validada não cria direito de permanecer em Foco**, e
**retirada da recomendação ≠ retirada do Foco**.

---

## 1. Matriz de incompatibilidade — comparação formal dos dois lados

Legenda: **DM** diretamente mapeável · **DS** derivável sem perda · **DR** derivável com regra
explícita · **EC** exigido do chamador · **IND** indisponível · **PRO** proibido · **FUT** futuro ·
**NA** não aplicável.

| Conceito | Motor original (`decidir()`) | Shadow (`Recomendacao`) | Classe | Tradução | Ausente quando… | Resultado quando ausente |
|---|---|---|---|---|---|---|
| **causa raiz** | `sess.active.sit` (o chamador passa em `opts.active`) | **não existe campo** | **EC** | conferida contra o Foco, não copiada | sempre no Shadow | `bloqueada: causa_raiz_divergente` se divergir |
| **identidade estável da causa** | `sess.active.key` (`"praca:enrolados"`) | ∅ | **EC** | comparada com `foco.identidade` | motor não expõe fora de `opts` | `bloqueada: identidade_de_causa_ausente` |
| **ambiente** | implícito na praça | ∅ | **EC** | vem de `EscopoDoSujeito` | — | `bloqueada: escopo_invalido` |
| **subárea** | `c.praca` (`PracaId`) | ∅ | **EC** | idem | — | idem |
| **pedido** | `c.id` / `c.ids` — **id curto do iFood** | ∅ | **PRO** sem `order_id` real | nunca derivado do id curto | quase sempre (**D29**) | `bloqueada: identidade_de_pedido_ausente` |
| **ação candidata** | `c.tipo` + `c.acao` | `recommended_action: string` | **DM** | texto da ação já escolhida | — | `retida: foco_puro_sem_acao_candidata` |
| **texto da ação** | `head`, `acao`, `porque`, `primeiro`, `impacto` | `recommended_action`, `reason` | **DS** | `acao` → ação; `porque` → razão | — | — |
| **evidência** | ∅ — o motor trabalha sobre fotografia, **não sobre event log** | `input_event_ids: string[]`, **vazio é inaceitável** | **EC** | `PacoteDeEvidencias` do chamador | **sempre** | `bloqueada: evidencia_insuficiente` |
| **procedência** | `dados`: *"tempos reais (iFood) · cardápio real…"* — **texto livre** | `source_mode: "real"\|"simulated"\|"control"` | **EC** | `ProcedenciaEstruturada`; texto **nunca** vira estrutura | sempre | `bloqueada: procedencia_ausente` |
| **confiança** | `"alta"\|"média"\|"baixa"` — **rótulo** | `confidence: number` 0..1 | **EC** | **não existe mapeamento canônico** rótulo→número | sempre | `bloqueada: confianca_sem_evidencia` / `confianca_fora_de_faixa` |
| **validade** | ∅ | `expires_at` | **EC** ou **DR** | `PoliticaDeValidade` explícita | sempre | `bloqueada: validade_ausente` |
| **retirada** | ∅ | `status` + `invalidarSuperadas` | **EC** | `CondicoesDeRetirada`, ≥1 | sempre | `bloqueada: retirada_ausente` |
| **tempo observado** | `snap.t` — **minuto** de sessão | `created_at` ISO | **EC** | relógio vem do chamador | — | `bloqueada: validade_ausente` |
| **versão** | ∅ | `policy_version`, `projection_version` | **EC** | declarada na entrada e conferida | sempre | `incompativel: versao_nao_suportada` |
| **identidade da recomendação** | ∅ | `recommendation_id` (o Shadow gera **dentro** de `recomendar()`) | **EC** | **fornecida pelo chamador** — chamar `recomendar()` seria runtime | sempre | `bloqueada: escopo_invalido` |
| **execução** | ∅ | `requires_human: boolean` · **`executed` não existe** | **PRO** | `requires_human: true` literal | — | — |
| **estado temporal** | `sess` (dentro do motor) | ∅ | **NA** | o tradutor **lê** o Foco e nunca o altera | — | — |
| **modo Calmo/Ambiente/Foco** | `mode` do `MOTOR.step` | ∅ | **NA** | só **Foco** pode traduzir | — | `retida` |

### As três incompatibilidades que decidem o desenho

1. **O motor não conhece o event log.** `input_event_ids` é a evidência que o Shadow exige e o motor
   trabalha sobre a fotografia do minuto, não sobre eventos. **Nenhuma tradução inventa evidência** —
   ela vem tipada do chamador ou a tradução é bloqueada.
2. **Confiança é rótulo de um lado e número do outro**, e **não existe regra canônica** ligando
   `"alta"` a `0,9`. Inventar a escala seria fabricar precisão. O número vem do chamador, com
   evidência, ou não existe.
3. **O Shadow não tem sujeito.** `recommended_action` é texto. Logo **D29 não é protegida pelo
   contrato do Shadow** — ela é protegida **aqui**, no `EscopoDoSujeito` da entrada, antes de o draft
   existir.

---

## 2. Resultados discriminados — nunca `null` ambíguo

| Resultado | Quando | Exemplos de motivo |
|---|---|---|
| `traduzida` | tudo presente e coerente | — |
| `retida` | **ausência operacional esperada** | `modo_sem_orientacao` (Calmo) · `ambiente_informa_sem_orientar` · `foco_puro_sem_acao_candidata` |
| `bloqueada` | falta evidência, identidade, procedência, validade, retirada ou escopo | `causa_raiz_divergente` · `identidade_de_pedido_ausente` · `evidencia_insuficiente` · `procedencia_incompativel` · `validade_ausente` · `retirada_ausente` |
| `incompativel` | contrato de entrada inválido | `versao_nao_suportada` |

Ausência esperada **nunca** vira exceção; contrato estruturalmente impossível pode lançar.
**Motivo é enum, nunca texto livre** — texto livre não é motivo de máquina.

---

## 3. I1 e I2 na fronteira — defesa em profundidade

**I1.** O tradutor confere de novo que a causa da ação candidata **é** a causa do Foco temporal
eleito. Isso **não substitui** `dentroDoEscopo()` no motor: é a segunda camada. Divergiu →
`bloqueada: causa_raiz_divergente`. **A causa nunca é alterada para tornar a recomendação aceitável**,
a ação nunca é reclassificada, e **similaridade textual não é usada**.

**I2.** Sem ação candidata, com todas fora do escopo, ou quando a tradução não pode ser completa: o
Foco **continua existindo como Foco puro** e o tradutor devolve `retida`/`bloqueada` **sem
recomendação**. Não gera orientação genérica, não seleciona uma segunda ação, não busca ação em outra
causa, e **não retira o Foco** — a permanência continua sendo da política temporal.

---

## 4. D29 — a regra absoluta

```text
sem order_id real → nenhuma recomendação com sujeito pedido
```

**Não é aceito como `order_id`:** número visual · posição · índice · texto exibido · horário ·
composição de itens · hash de conteúdo · identificador temporário · chave de fixture · número
extraído de frase. O id curto do iFood que o motor carrega em `c.id` **não é** `order_id`.

Referência aparente a pedido sem `order_id` real → `bloqueada: identidade_de_pedido_ausente`.
**Nunca há downgrade silencioso `pedido → fonte`**: o tradutor não muda o sujeito para conseguir
passar. Recomendação de fonte, ambiente ou subárea só existe quando o motor e o contexto **já** a
definiram nesse escopo.

---

## 5. Evidência, procedência, confiança, validade, retirada

**Evidência** aponta para evento, causa e sujeito — nunca é o texto da ação, o sussurro, o nome da
causa nem uma frase explicativa. Faltando: `bloqueada: evidencia_insuficiente`. **A confiança não é
reduzida automaticamente para permitir a passagem** (I9).

**Procedência** é estrutura, não string humana: natureza (`real · derivada · demonstracao · fixture ·
indisponivel`), `source_mode`, versão da projeção, transformação, limitações. **Fixture nunca é
marcada como real**; **demonstração nunca chega ao caminho real** (I10).

**Confiança** não é criada pelo tradutor, não é inferida de severidade sem regra canônica, e **zero
não é ausência**. Fora de faixa ou sem evidência → bloqueio.

**Validade** é fornecida ou derivada de política documentada, e é **auditável**.
**`DEBOUNCE`, `COOLDOWN`, `MAXFOCUS` e `STALE 120` NÃO são reutilizados como validade** — semânticas
diferentes, e `STALE 120 ≠ frescor da fonte ≠ validade da recomendação` (**D62**).

**Retirada** é declarada em condições (≥1) e o tradutor **apenas as representa** — ele não executa
retirada e a recomendação **não** controla cooldown nem tempo do Foco.

---

## 6. O que R5-C **não** faz

Não conecta motor e Shadow · não chama `recomendar()` · não toca store · não emite evento · não
persiste · não inicia lifecycle · não renova validade · não retira recomendação real · não aciona o
Conference Brain · não cria flag · não ativa runtime · não executa · **não resolve D29**.

**R5-D não iniciado.**
