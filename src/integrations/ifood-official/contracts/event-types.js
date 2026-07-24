/* ============================================================================
 * Vocabulário de eventos da integração oficial — HIPÓTESE DE IMPLEMENTAÇÃO.
 * ----------------------------------------------------------------------------
 * Baseado no padrão público e amplamente documentado de integrações
 * Order/Events de marketplaces de delivery (polling de eventos + webhook,
 * pedido -> confirmação -> preparo -> pronto -> despacho -> conclusão,
 * cancelamento/disputa como fluxos paralelos). NUNCA verificado contra uma
 * resposta real da API do iFood nesta missão — esta app não acessou API
 * real, não tem credencial, não abriu o Gestor. Todo nome aqui é rotulado
 * "hipótese" em `docs/integrations/ifood/IFOOD_EVENT_CONTRACTS_V1.md` e deve
 * ser confirmado/corrigido na fase de homologação (ver
 * IFOOD_HOMOLOGATION_NEXT_STEPS.md) antes de qualquer uso em produção.
 * ==========================================================================*/
"use strict";

/** Tipo canônico interno do evento — nunca o `code` bruto do provedor. */
const EVENT_TYPES = Object.freeze({
  ORDER_PLACED: "order_placed",
  ORDER_CONFIRMED: "order_confirmed",
  ORDER_IN_PREPARATION: "order_in_preparation",
  ORDER_READY_FOR_PICKUP: "order_ready_for_pickup",
  ORDER_DISPATCHED: "order_dispatched",
  ORDER_CONCLUDED: "order_concluded",
  ORDER_CANCELLED: "order_cancelled",
  CANCELLATION_REQUESTED: "cancellation_requested",
  DISPUTE_OPENED: "dispute_opened",
  DISPUTE_RESOLVED: "dispute_resolved",
  COURIER_ASSIGNED: "courier_assigned",
  COURIER_ARRIVED_AT_MERCHANT: "courier_arrived_at_merchant",
  COURIER_PICKED_UP: "courier_picked_up",
  COURIER_ARRIVED_AT_DESTINATION: "courier_arrived_at_destination",
  COURIER_DELIVERED: "courier_delivered",
  SCHEDULED_ORDER_CONFIRMED: "scheduled_order_confirmed",
  MERCHANT_STATUS_CHANGED: "merchant_status_changed",
  UNKNOWN: "unknown"
});

const EVENT_TYPE_LIST = Object.freeze(Object.values(EVENT_TYPES));

/**
 * Progressão natural de produção — usada só para detectar REGRESSÃO
 * inesperada na reconciliação (nunca para inventar ordem entre eventos sem
 * evidência de tempo). `UNKNOWN`/eventos paralelos (courier/disputa/
 * cancelamento) não têm posição — não entram na progressão.
 */
const ORDER_PROGRESS_RANK = Object.freeze([
  EVENT_TYPES.ORDER_PLACED,
  EVENT_TYPES.ORDER_CONFIRMED,
  EVENT_TYPES.ORDER_IN_PREPARATION,
  EVENT_TYPES.ORDER_READY_FOR_PICKUP,
  EVENT_TYPES.ORDER_DISPATCHED,
  EVENT_TYPES.ORDER_CONCLUDED
]);

/** Fontes de entrada aceitas pela inbox — nunca inventadas em runtime. */
const EVENT_SOURCES = Object.freeze({ WEBHOOK: "webhook", POLLING: "polling", SIMULATOR: "simulator" });
const EVENT_SOURCE_LIST = Object.freeze(Object.values(EVENT_SOURCES));

module.exports = { EVENT_TYPES, EVENT_TYPE_LIST, ORDER_PROGRESS_RANK, EVENT_SOURCES, EVENT_SOURCE_LIST };
