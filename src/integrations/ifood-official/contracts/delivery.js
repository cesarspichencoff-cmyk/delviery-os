/* ============================================================================
 * IfoodDeliveryState + IfoodCourierState — logística, SEPARADA de produção
 * (mesmo princípio de dimensões independentes do conference-brain,
 * reimplementado aqui sem dependência dele).
 * ----------------------------------------------------------------------------
 * `courier_reference` é sempre um ID opaco — NUNCA nome do entregador,
 * telefone ou qualquer dado pessoal. `address_reference`/`location_hint`
 * idem: referências, nunca endereço/geo bruto.
 * ==========================================================================*/
"use strict";

const DISPATCH_TYPE = Object.freeze({
  IFOOD_DELIVERY: "ifood_delivery", MERCHANT_DELIVERY: "merchant_delivery",
  CUSTOMER_PICKUP: "customer_pickup", UNKNOWN: "unknown"
});

const COURIER_STATUS = Object.freeze({
  NOT_APPLICABLE: "not_applicable", SEARCHING: "searching", ASSIGNED: "assigned",
  ARRIVED_AT_MERCHANT: "arrived_at_merchant", PICKED_UP: "picked_up",
  ARRIVED_AT_DESTINATION: "arrived_at_destination", DELIVERED: "delivered", UNKNOWN: "unknown"
});

function buildDeliveryState(raw) {
  const r = raw || {};
  return {
    order_id: r.orderId || null,
    dispatch_type: DISPATCH_TYPE[r.dispatchType] ? r.dispatchType : (r.dispatchType || DISPATCH_TYPE.UNKNOWN),
    delivery_mode: r.deliveryMode || null,
    address_reference: r.addressReference || null, // nunca o endereço em texto livre
    estimated_delivery_at: r.estimatedDeliveryAt || null,
    status: r.status || "unknown",
    updated_at: r.updatedAt || null
  };
}

function buildCourierState(raw) {
  const r = raw || {};
  return {
    order_id: r.orderId || null,
    courier_reference: r.courierReference || null, // ID opaco, nunca nome
    status: Object.values(COURIER_STATUS).includes(r.status) ? r.status : COURIER_STATUS.UNKNOWN,
    vehicle_type: r.vehicleType || null,
    location_hint: r.locationAuthorized === true ? (r.locationHint || null) : null,
    updated_at: r.updatedAt || null
  };
}

module.exports = { DISPATCH_TYPE, COURIER_STATUS, buildDeliveryState, buildCourierState };
