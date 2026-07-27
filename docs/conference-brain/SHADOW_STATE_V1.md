# Estado sombra da Conferência — V1

`src/conference-brain/snapshots/engine.js` · `src/conference-brain/shadow/conference-state.js`

**Sombra significa sombra.** Este estado não alimenta interface, não decide, não
move pessoas, não aparece para ninguém da operação. Ele existe para ser
comparado com a realidade antes de ganhar o direito de falar.

---

## 1. Snapshots — toda grandeza é uma contagem conferível

Janela de **5 minutos** (10 também suportado; qualquer outro valor lança
`janela_nao_suportada`). Nenhum campo é índice abstrato: cada número pode ser
recontado à mão contra a lista de pedidos.

| Campo | Definição |
|---|---|
| `active_orders` | recebidos antes do fim da janela e ainda não prontos/concluídos/cancelados |
| `received_in_window` | quantos chegaram na janela |
| `ready_in_window` | quantos ficaram prontos na janela |
| `concluded_in_window` | quantos concluíram na janela |
| `convergence` | **quantos ficaram prontos juntos nesta janela** — contagem, não score |
| `avg_ready_minutes` | média de recebido→pronto dos que ficaram prontos na janela |
| `queue_delta` | `active_orders` desta janela menos o da anterior |

### A honestidade estrutural

`active_orders` e `convergence` exigem carimbo de **PRONTO**. Quando a fonte não
o observa:

```js
active_orders: null,
convergence:   null,
source_state:  "parcial",
notes: "fonte_nao_observa_pronto:ativos_e_convergencia_indisponiveis"
```

Jamais estimados. Se a cobertura de `ready_at` existe mas fica abaixo de 90%, a
fonte é rebaixada de `disponivel` para `parcial` automaticamente.

### Ritmo

`computeRhythm(snapshots, index, lookback=2)` devolve, separados e sem
combinação: `inflow`, `outflow`, `inflow_over_outflow`, `growing_windows`,
`queue_delta`, `recovering`, `avg_ready_minutes`, `baseline_ready_minutes`,
`ready_growth_ratio`.

`ready_growth_ratio` compara a janela atual com **a média recente da própria
operação** — não com um alvo externo. Uma noite lenta que piora é detectável;
uma noite rápida não é punida por ser rápida.

## 2. A avaliação, em ordem

```
1. fonte indisponível ────────────────────► fonte_indisponivel   (fim)
2. active_orders == null ─────────────────► leitura_parcial      (fim)
3. estado-base pela faixa de carga
4. modificadores observados (podem escalar para atencao)
5. fonte inconsistente ───────────────────► leitura_parcial
6. fonte degradada ───────────────────────► confiança media
```

A ordem importa: **a fonte manda**. Nunca se afirma um estado confiante sobre
uma fonte quebrada, e a ausência de sinal de carga nunca vira `calmo`.

### Estado-base

```
< 30 calmo · 30–49 fluindo · 50–69 atencao · >= 70 urgencia
```

### Modificadores

| Código | Dispara quando | Escala? |
|---|---|---|
| `HIGH_CONVERGENCE` | `convergence >= 8` prontos na janela | sim → `atencao` |
| `QUEUE_GROWING` | entrada acima da conclusão em `>= 2` janelas | sim → `atencao` |
| `READY_TIME_GROWING` | `ready_growth_ratio >= 1.25` | sim → `atencao` |
| `INFLOW_OVER_OUTFLOW` | entrada > saída nesta janela | **não** — só contexto |
| `READINESS_REDUCED` | abertura registrou condição reduzida | sim → `atencao` |

Escalar exige `active_orders >= 20` (`attention_floor_active`). Sem esse piso,
6 pedidos com 8 prontos juntos viraria "atenção" — ruído, não sinal.

Não há soma, não há peso, não há score. Um modificador escala ou não escala, e
diz por quê.

## 3. A saída é sempre decomponível

```js
{
  snapshot_at, window_minutes,
  mode: "shadow",              // travado no código, não é configuração
  base_state,                  // o que a faixa de carga sozinha diria
  suggested_state,             // o que os modificadores produziram
  active_orders,
  reasons:   [{code, message}],  // legível por humano
  modifiers: [...],
  source_health,
  confidence,                  // alta · media · baixa
  missing_data: [...],         // o que faltou para afirmar
  rule_version
}
```

`base_state` e `suggested_state` vêm separados **de propósito**: quem audita
consegue ver o que a carga dizia e o que os sinais mudaram, sem engenharia
reversa.

### Exemplo real da validação — atenção abaixo de 50

```
34 pedidos ativos, sem convergência         -> fluindo
34 pedidos ativos, com convergência e ritmo -> atencao

  base declarada: fluindo
  modificadores : HIGH_CONVERGENCE, QUEUE_GROWING, READY_TIME_GROWING, INFLOW_OVER_OUTFLOW
    - LOAD_BAND: 34 pedidos ativos na janela (faixa base: fluindo).
    - HIGH_CONVERGENCE: 9 pedidos ficaram prontos na janela atual.
    - QUEUE_GROWING: A entrada permaneceu acima da conclusao em 3 janelas.
    - READY_TIME_GROWING: Tempo ate pronto em 22 min, 1.38x a media recente.
    - INFLOW_OVER_OUTFLOW: Entraram 11 e sairam 4 nesta janela.
```

Isto é a evidência empírica endereçada: **22% do sofrimento acontece abaixo de
50 ativos**. A faixa sozinha não veria; os modificadores veem — e explicam.

## 4. Sinais pontuais de composição

`src/conference-brain/composition/hints.js`. Contexto do pedido, **nunca** estado
global. O retorno declara `affects_global_state: false`, e há teste travando.

| Código | Significado |
|---|---|
| `HAS_OBSERVATION` | pedido com observação escrita pelo cliente |
| `DECLARED_RESTRICTION` | restrição alimentar **declarada por escrito** |
| `HOT_AND_COLD` | itens quentes e frios juntos (separação térmica) |
| `HAS_DRINK` / `HAS_DESSERT` | volume separado / sobremesa |
| `HAS_ASSEMBLY_ITEM` | inclui item de `montagem_outros` |
| `MULTI_PRACA` | itens de 3+ praças convergem no pedido |
| `MANY_UNITS` | ≥ 12 unidades |
| `POSSIBLE_MULTI_VOLUME` | ≥ 18 unidades: possível segunda sacola |
| `CATALOG_MATCH_INCOMPLETE` | item sem correspondência — declarado, não adivinhado |

Proibições ativas, cada uma com teste:

- nenhum sinal gera urgência global;
- **não existe** peso ou score de complexidade por prato;
- **não se usa** o campo genérico `risco_de_erro: alto` do seed — 46% do
  cardápio o tem, usá-lo cru faria metade do menu gritar;
- **não se faz inferência médica**: alergia só quando declarada em texto, nunca
  inferida do nome do prato;
- item sem correspondência devolve `sem_correspondencia`, jamais um palpite.

## 5. Por que a fonte histórica devolve 100% `leitura_parcial`

Nas 3.287 janelas geradas sobre os dados reais, **todas** as leituras são
`leitura_parcial`. Isso não é falha — é o resultado correto.

O relatório histórico registra quando o pedido **chegou**, e nada sobre quando
ficou pronto. Sem `ready_at` não existe "pedido ativo", e sem pedido ativo não
existe faixa de carga. O sistema poderia ter chutado. Não chutou.

Para afirmar carga é preciso uma fonte que observe **pronto** e **saída**. É o
objeto do Sprint 2.
