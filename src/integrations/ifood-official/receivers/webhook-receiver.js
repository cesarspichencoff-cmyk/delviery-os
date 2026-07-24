/* ============================================================================
 * IfoodWebhookReceiver — recebe UM payload de webhook já entregue por quem
 * quer que hospede o endpoint HTTP. Este módulo NUNCA abre porta nem cria
 * servidor (fora de escopo desta missão) — só normaliza e alimenta a
 * inbox, exatamente como o polling faz, para que as duas fontes convirjam
 * no mesmo lugar.
 * ==========================================================================*/
"use strict";

const { mapExternalEventPayload } = require("./payload-mapper");

function createWebhookReceiver(deps) {
  const inbox = deps.inbox;

  /** @param {object} rawPayload  corpo do webhook, ainda no formato externo */
  function receive(rawPayload) {
    const mapped = mapExternalEventPayload(rawPayload, "webhook");
    return inbox.receive(mapped);
  }

  return { receive };
}

module.exports = { createWebhookReceiver };
