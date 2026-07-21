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
