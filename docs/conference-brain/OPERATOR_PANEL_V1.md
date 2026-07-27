# Painel interno mínimo — Sprint 2

`src/conference-brain/live/operator-panel.js` (lógica) ·
`tools/conference-brain/operator-panel-server.js` (servidor standalone)

## 1. Nunca conectado à interface pública

O painel roda num **processo e numa porta próprios**
(`PANEL_PORT`, padrão 5183) — nunca em `tools/servir_v1.js`, nunca na porta do
Copiloto. Existe só para registrar os eventos do relógio que a tela do iFood
não fornece (início/pausa/retomada/finalização/liberação da Conferência).

Só sobe com `CONFERENCE_OPERATOR_PANEL_V1` ligada:

```bash
CONFERENCE_OPERATOR_PANEL_V1=1 NODE_ENV=development node tools/conference-brain/operator-panel-server.js
```

## 2. Só as ações válidas para o estado atual

`visibleActions(events)` nunca mostra mais que o necessário:

| Estado atual | Ações visíveis |
|---|---|
| `ready_observed` | Iniciar |
| `conference_started` / `conference_resumed` | Aguardando item, Finalizar |
| `waiting_for_item` | Retomar |
| `conference_completed` | Liberar |
| `released` | Saiu |
| `departed_observed` / `cancelled` | (nenhuma — ciclo encerrado) |

`Cancelar evento` aparece em qualquer estado ainda ativo — é a correção
auditável exigida pela missão.

## 3. Confirmação leve para o irreversível

`applyAction("cancel", ctx)` recusa a ação sem `confirmToken` — no servidor,
isso vira o `confirm()` nativo do navegador antes do POST. Testado
explicitamente: ação irreversível sem confirmação é `{ok:false}`.

## 4. Sem identificação, sem ranking

Nenhum campo de `panelRow()` carrega nome de operador. Cada ação vira um
evento do relógio com `origin: "operator_manual"` — nunca com um nome. Testado
por busca textual no JSON da linha do painel contra os termos proibidos do
Sprint 1 (`telefone`, `endereco`, `cpf`, `email`, `cliente_nome`).

## 5. O que o painel mostra — e só isso

ID curto do pedido, minutos desde o pronto, estado atual, volumes (quando
informado), avisos pontuais, saúde da fonte. Nada de dado de cliente, nada de
composição do pedido além do necessário para conferir.

## 6. Sprint 2.1 — sinais multidimensionais, com prioridade fixa

`panelRow(order)` aceita opcionalmente `order.dimension` — a saída de
`reconciliation.js#reconcileMultidimensional`. Sem ela, o painel funciona
**exatamente** como no Sprint 2 (testado: `"painel sem dimensao
multidimensional funciona exatamente como no Sprint 2"`). Com ela,
`buildPanelSignals()` adiciona no máximo estes campos à linha — nunca todas
as 9 dimensões de uma vez:

| Prioridade | Campo | Quando aparece |
|---|---|---|
| 1 | `actions` (já existia) | sempre — ação interna válida para o estado atual |
| 2 | `minutes_since_ready` (já existia) | sempre |
| 3 | `blocked` | `true` quando o relógio está em `waiting_for_item` |
| 4 | `courier_at_store` | `true` quando `courier_state === "at_store"` |
| 5 | `logistics_alert` | primeiro indicador com `category === "alerta"`, ou `null` |
| 6 | `details.*` | tudo mais (dispatch, modalidade, grupo, agendamento, indicadores) — só sob expansão, nunca na linha principal |

`grouped`/`scheduled` são booleanos de sinalização; o conteúdo completo
(`group_id`, `scheduled_for`) fica em `details`, coerente com a regra
"mostrar apenas sinais relevantes, detalhes sob expansão".

Nenhuma ação nova foi adicionada ao portal — os sinais são só leitura.

## 7. Correção (Sprint 2.2) — o servidor real nunca usava isto

A rechecagem independente encontrou a lacuna exata: `panelRow()`/
`buildPanelSignals()` (§6 acima) sempre estiveram corretos — o problema era
que `tools/conference-brain/operator-panel-server.js#ordersInPlay()` **nunca
passava `order.dimension`**, e `renderPage()` não tinha coluna nenhuma para
os sinais. O HTML executável nunca mostrava bloqueio, entregador na loja,
alerta ou detalhes, mesmo quando esses dados existiam no store.

Corrigido: `ordersInPlay()` agora reconcilia a observação persistida
(`reconciledDimensionFor`) e injeta `dimension`; `renderPage()` ganhou a
coluna "Sinais" com os chips priorizados (§6) e `<details>` para o resto.
Testado contra o servidor real (`createServer`+`ordersInPlay`+`renderPage`),
não só contra `panelRow()` isolado — ver
`tests/conference-brain/sprint22-adversarial.test.js`, describe
"bloqueadores 3/4".
