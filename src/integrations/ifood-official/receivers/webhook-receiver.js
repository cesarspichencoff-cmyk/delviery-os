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

  /**
   * Recebe o corpo do webhook como STRING bruta (o formato real de um
   * corpo HTTP antes de qualquer parse). JSON inválido nunca derruba o
   * processo nem os demais eventos -- vira quarentena com motivo
   * declarado, nunca um payload adivinhado.
   */
  function receiveRaw(rawBody) {
    let parsed;
    try { parsed = JSON.parse(rawBody); }
    catch (e) {
      return inbox.receive({
        source: "webhook", receivedAt: new Date().toISOString(),
        rawPayload: String(rawBody).slice(0, 500)
        // eventType/schemaVersion ausentes de propósito -- buildEventEnvelope
        // recusa por forma invalida, inbox.receive() manda para quarentena.
      });
    }
    return receive(parsed);
  }

  return { receive, receiveRaw };
}

module.exports = { createWebhookReceiver };
