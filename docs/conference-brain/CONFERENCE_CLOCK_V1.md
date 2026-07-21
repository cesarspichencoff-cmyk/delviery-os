# Relógio mínimo da Conferência — Sprint 2

`src/conference-brain/live/clock.js` · `src/conference-brain/contracts/live-states.js`

## 1. Um evento é um fato append-only

Uma vez criado, um evento do relógio não é editado. Uma correção é um evento
NOVO com `reason` preenchido — nunca uma reescrita silenciosa do que já
aconteceu. `event_id` é determinístico
(`sha256(order_id|event_type|sequence)`), então repetir a mesma gravação (ex.:
depois de uma queda e reinício) produz o mesmo id — idempotência sem precisar
de um contador externo.

## 2. Os 8 tipos de evento

```
ready_observed · conference_started · waiting_for_item · conference_resumed ·
conference_completed · released · departed_observed · cancelled
```

## 3. Grafo de transições — dois regimes diferentes

**Fluxo humano** (`CLOCK_VALID_NEXT`), estritamente ordenado:

```
ready_observed → conference_started → {waiting_for_item ↔ conference_resumed} → conference_completed → released
```

**Fatos da tela** (`FREE_TRANSITION_EVENTS`): `cancelled` e
`departed_observed` podem acontecer a partir de **qualquer** estado. Essa
distinção não é acidental — foi um bug real encontrado durante a construção:
modelar `departed_observed` como só alcançável depois de `released` fazia o
observador **descartar silenciosamente** uma saída real sempre que o painel
interno não tivesse sido usado para registrar os passos internos (operação que
não usa Conferência para pedidos de retirada simples, ou observador ligado no
meio de um pedido já em andamento). Um fato observado na tela nunca pode ser
subordinado a um passo que só existe no processo interno.

## 4. Regra mais importante do relógio

> Pronto observado NUNCA infere início automático da Conferência.

`ready_observed` é o único evento emitido automaticamente pela leitura da
tela (`origin: ifood_screen`). Todo o resto do fluxo humano
(`conference_started`, `waiting_for_item`, `conference_resumed`,
`conference_completed`, `released`) exige `origin: operator_manual` — vem do
painel, de um toque humano. `departed_observed` é o único outro evento
auto-emitido pela tela, e só quando comprovado (ver `STATUS_MAPPING_V1.md`).

`readyDoesNotImplyStarted()` existe como ponto único de verdade — travado por
teste — para que essa regra nunca seja violada por engano numa mudança futura.

## 5. Origens permitidas

```
ifood_screen · operator_manual · system_inference · imported_history
```

`system_inference` é aceito estruturalmente pelo grafo (a transição pode ser
válida), mas a origem fica **sempre marcada como tal** — nunca escondida como
`operator_manual`. Isso preserva a garantia de que uma decisão automática é
sempre identificável como automática, o mesmo princípio de
`automatic_decisions_allowed: false` do Sprint 1.

## 6. Reconstrução, nunca estado paralelo

`currentClockState(events)` recalcula o estado atual a partir do histórico
ordenado por `sequence` — nunca há uma variável "estado atual" guardada à
parte que possa divergir do histórico. Um processo que reinicia e relê o
`store` chega exatamente ao mesmo estado, testado explicitamente
("reinicio apos queda: relogio reconstruido do historico produz o mesmo
estado atual").
