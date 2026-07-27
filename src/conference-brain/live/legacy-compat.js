/* ============================================================================
 * Compatibilidade com o modelo unidimensional do Sprint 2 (Sprint 2.1, Fase 17).
 * ----------------------------------------------------------------------------
 * O Sprint 2 tem consumidores e 79 testes baseados em `LIVE_ORDER_STATUS`
 * (um único status por pedido). Em vez de quebrá-los, esta projeção lê a
 * observação MULTIDIMENSIONAL e devolve o status antigo equivalente.
 *
 * ISTO NÃO É FONTE DE VERDADE. É uma leitura com perda, só para quem ainda
 * não migrou para o modelo novo. Regras obrigatórias, todas testadas:
 *   - produz `unknown` quando a situação é ambígua (nunca um palpite);
 *   - NUNCA funde `completed` e `departed` — são fatos logísticos distintos;
 *   - NUNCA converte uma ação DISPONÍVEL ("Avisar Pedido Pronto" na tela) em
 *     estado EXECUTADO — só a confirmação observada faz isso avançar.
 * ==========================================================================*/
"use strict";

const S = require("../contracts/live-states");

/**
 * @deprecated Use a observação multidimensional diretamente
 * (`live/multidimensional-observation.js` + `live/reconciliation.js#reconcileMultidimensional`).
 * Esta função existe só para não quebrar consumidores do Sprint 2.
 *
 * @param {object} dim  saída de `reconcileMultidimensional()` (ou uma
 *   observação única de `buildOrderObservation()` com os mesmos nomes de
 *   campo no nível raiz — ambos os formatos são aceitos)
 */
function deriveLegacyLiveStatus(dim) {
  const d = normalizeInput(dim);
  if (!d) return S.LIVE_ORDER_STATUS.UNKNOWN;

  // 1. Conclusão manda quando é terminal — mas "completed" nunca é inferido
  //    daqui sozinho quando o courier ainda mostra rota em andamento (ver §3).
  if (d.completion_state === S.COMPLETION_STATE.CANCELLED) return S.LIVE_ORDER_STATUS.CANCELLED;

  // 2. Logística do entregador, quando presente, é mais específica que
  //    completion/order_state para a fase final — courier "em rota" é
  //    exatamente o fato que o Sprint 2 chama de `departed`; "entregue" é
  //    `completed`. As duas nunca colapsam na mesma linha.
  if (d.courier_state === S.COURIER_STATE.DELIVERED) return S.LIVE_ORDER_STATUS.COMPLETED;
  if (d.courier_state === S.COURIER_STATE.IN_ROUTE) return S.LIVE_ORDER_STATUS.DEPARTED;
  if (d.courier_state === S.COURIER_STATE.COLLECTED) return S.LIVE_ORDER_STATUS.PICKED_UP;

  // 3. Sem sinal de courier avançado, `completion=completed` é o "concluído"
  //    genérico do Sprint 1/2 — que já não prova saída por si (ready-departure.js).
  if (d.completion_state === S.COMPLETION_STATE.COMPLETED) return S.LIVE_ORDER_STATUS.COMPLETED;

  // 4. Produção. `readiness_notification_available` é só um BOTÃO NA TELA —
  //    nunca é lido como se a notificação já tivesse acontecido. Só
  //    `ready_notified` (confirmado) empurra para `awaiting_pickup`.
  if (d.order_state === S.ORDER_STATE.READY) {
    return d.readiness_state === S.READINESS_STATE.READY_NOTIFIED
      ? S.LIVE_ORDER_STATUS.AWAITING_PICKUP
      : S.LIVE_ORDER_STATUS.READY;
  }
  if (d.order_state === S.ORDER_STATE.PREPARING) return S.LIVE_ORDER_STATUS.PREPARING;
  if (d.order_state === S.ORDER_STATE.ACCEPTED) return S.LIVE_ORDER_STATUS.ACCEPTED;
  if (d.order_state === S.ORDER_STATE.RECEIVED) return S.LIVE_ORDER_STATUS.RECEIVED;
  if (d.order_state === S.ORDER_STATE.FINALIZED) return S.LIVE_ORDER_STATUS.COMPLETED;
  if (d.order_state === S.ORDER_STATE.CANCELLED) return S.LIVE_ORDER_STATUS.CANCELLED;

  return S.LIVE_ORDER_STATUS.UNKNOWN;
}

/** Aceita tanto a saída de `reconcileMultidimensional` quanto uma observação única. */
function normalizeInput(dim) {
  if (!dim) return null;
  if (typeof dim.completion_state === "string" || typeof dim.order_state === "string") return dim; // já achatado
  // observação única de buildOrderObservation(): campos aninhados
  return {
    completion_state: dim.completion && dim.completion.value,
    courier_state: dim.courier && dim.courier.state,
    order_state: dim.order_state && dim.order_state.value,
    readiness_state: dim.readiness && dim.readiness.state
  };
}

module.exports = { deriveLegacyLiveStatus };
