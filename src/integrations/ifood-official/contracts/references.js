/* ============================================================================
 * Referências de identidade — MerchantReference, IfoodOrderReference.
 * ----------------------------------------------------------------------------
 * Puro. Nunca carregam dado de cliente. A referência é o elo estável entre
 * o mundo externo (IDs do provedor) e o mundo interno (o resto do
 * DeliveryOS nunca deveria precisar saber o formato do ID externo).
 * ==========================================================================*/
"use strict";

/**
 * @param {object} raw
 *   externalMerchantId  ID do merchant no provedor (obrigatório)
 *   merchantId          ID interno do DeliveryOS para essa loja, se já mapeado
 *   corporateName        razão social (opcional, nunca PII de cliente)
 *   tradeName             nome fantasia
 *   confirmedAt           quando um humano confirmou o mapeamento externo->interno
 */
function buildMerchantReference(raw) {
  const r = raw || {};
  if (!r.externalMerchantId) return null; // sem ID externo não há referência nenhuma
  return {
    merchant_id: r.merchantId || null,
    merchant_id_source: r.merchantId ? "confirmado" : "nao_mapeado",
    external_merchant_id: String(r.externalMerchantId),
    corporate_name: r.corporateName || null,
    trade_name: r.tradeName || null,
    confirmed_at: r.confirmedAt || null
  };
}

/**
 * @param {object} raw
 *   externalOrderId   ID do pedido no provedor (obrigatório)
 *   displayId          ID curto exibido na tela/comprovante
 *   merchantId          referência ao merchant interno
 *   source               "webhook" | "polling" | "simulator"
 *   firstSeenAt
 */
function buildOrderReference(raw) {
  const r = raw || {};
  if (!r.externalOrderId) return null;
  return {
    order_id: r.orderId || null,
    external_order_id: String(r.externalOrderId),
    display_id: r.displayId || null,
    merchant_id: r.merchantId || null,
    source: r.source || "unknown",
    first_seen_at: r.firstSeenAt || null
  };
}

module.exports = { buildMerchantReference, buildOrderReference };
