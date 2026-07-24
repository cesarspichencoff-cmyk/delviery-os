/* ============================================================================
 * IfoodOfficialAdapter — interface desacoplada do resto do sistema.
 * ----------------------------------------------------------------------------
 * Nenhum módulo operacional (inbox, outbox, reconciliador, negociação,
 * saúde) deve depender diretamente de URL ou formato externo. Tudo passa
 * por esta interface, que uma implementação concreta (simulador nesta
 * missão; cliente oficial, fixture ou homologação no futuro) preenche.
 *
 * `createAdapter(impl, opts)` NUNCA aceita um método ausente em silêncio —
 * qualquer responsabilidade não implementada gera um adapter que responde
 * `{ok:false, reason:"nao_implementado:<responsabilidade>"}` de forma
 * explícita e testável, nunca lança e nunca finge sucesso.
 * ==========================================================================*/
"use strict";

/** As responsabilidades futuras do adaptador — vocabulário fechado. */
const ADAPTER_RESPONSIBILITIES = Object.freeze([
  "authenticate",       // obter/renovar token
  "listMerchants",       // merchants acessíveis à credencial
  "pollEvents",           // polling: busca lote de eventos pendentes
  "receiveWebhook",        // normaliza um payload de webhook recebido
  "fetchOrder",              // consulta snapshot de um pedido
  "acknowledgeEvent",         // confirma processamento de um evento ao provedor
  "requestCancellation",       // inicia pedido de cancelamento
  "sendNegotiationAction",      // envia uma ação de negociação já autorizada
  "fetchDeliveryState",          // consulta estado logístico de um pedido
  "checkHealth"                   // saúde da conexão (auth, polling, webhook)
]);

function notImplemented(responsibility) {
  return async function () {
    return { ok: false, reason: "nao_implementado:" + responsibility };
  };
}

/**
 * Constrói um adapter uniforme: toda responsabilidade em
 * `ADAPTER_RESPONSIBILITIES` vira um método assíncrono, vindo de `impl`
 * quando fornecido, ou de um stub `nao_implementado` explícito quando não.
 * `label` identifica a implementação concreta por trás (ex.: "simulator",
 * "fixture") — nunca deve ser confundido com implementação real sem essa
 * etiqueta clara.
 */
function createAdapter(impl, opts) {
  const o = opts || {};
  const implementation = impl || {};
  const adapter = { label: o.label || "unlabeled", implemented: [], missing: [] };

  for (const responsibility of ADAPTER_RESPONSIBILITIES) {
    if (typeof implementation[responsibility] === "function") {
      adapter[responsibility] = implementation[responsibility].bind(implementation);
      adapter.implemented.push(responsibility);
    } else {
      adapter[responsibility] = notImplemented(responsibility);
      adapter.missing.push(responsibility);
    }
  }
  return adapter;
}

module.exports = { ADAPTER_RESPONSIBILITIES, createAdapter };
