/* ============================================================================
 * Simulador oficial v1 — produz eventos e injeta falhas LOCALMENTE, sem
 * internet, sem rede, sem credencial. Implementa `IfoodOfficialAdapter`
 * (label "simulator") para que polling/webhook receivers e outbox possam
 * ser exercitados de ponta a ponta sem nenhuma dependência externa.
 * ----------------------------------------------------------------------------
 * Todo evento produzido aqui é SINTÉTICO -- nunca deve ser confundido com
 * dado real (mesma disciplina do resto do DeliveryOS: dado sintético
 * sempre rotulado, nunca tratado como real).
 * ==========================================================================*/
"use strict";

const { createAdapter } = require("../../src/integrations/ifood-official/adapter/ifood-official-adapter");

const FAULT_TYPES = Object.freeze({
  DUPLICATE_EVENT: "duplicate_event",
  OUT_OF_ORDER: "out_of_order",
  SAME_TIMESTAMP: "same_timestamp",
  INCOMPLETE_BATCH: "incomplete_batch",
  TIMEOUT: "timeout",
  HTTP_401: "http_401", HTTP_403: "http_403", HTTP_404: "http_404",
  HTTP_409: "http_409", HTTP_429: "http_429", HTTP_5XX: "http_5xx",
  TOKEN_EXPIRED: "token_expired",
  CRASH_BEFORE_PROCESSING: "crash_before_processing",
  CRASH_BEFORE_ACK: "crash_before_ack",
  INVALID_JSON: "invalid_json",
  UNKNOWN_SCHEMA_VERSION: "unknown_schema_version"
});

/** Falhas que fazem o proprio pollEvents() falhar (nunca chegam a virar evento). */
const REQUEST_LEVEL_FAULTS = new Set([
  FAULT_TYPES.TIMEOUT, FAULT_TYPES.HTTP_401, FAULT_TYPES.HTTP_403, FAULT_TYPES.HTTP_404,
  FAULT_TYPES.HTTP_409, FAULT_TYPES.HTTP_429, FAULT_TYPES.HTTP_5XX, FAULT_TYPES.TOKEN_EXPIRED
]);

function createSimulator(opts) {
  const o = opts || {};
  const merchantId = o.merchantId || "SIM-MERCHANT-1";
  let seq = 0;
  const queue = [];       // eventos brutos pendentes de entrega via pollEvents()
  const faultQueue = [];  // falhas a injetar no PROXIMO ciclo de pollEvents()

  // Relogio sintetico monotonico, avancado a cada push() sem createdAt
  // explicito. Uma jornada real de pedido nunca teria dois eventos no
  // MESMO milissegundo (mesmo lance que expos o bloqueador 1 do Sprint
  // 2.4 no conference-brain) -- gerar timestamps colados artificialmente
  // criaria empate/conflito FALSO, nao um cenario real de teste.
  let clockMs = Date.parse(o.startAt || "2026-01-01T10:00:00.000Z");
  const stepMs = Number.isFinite(o.stepMs) ? o.stepMs : 30000;

  function nextId() { seq += 1; return "sim-evt-" + seq; }

  function push(code, orderId, opts2) {
    let createdAt = opts2 && opts2.createdAt;
    if (!createdAt) { clockMs += stepMs; createdAt = new Date(clockMs).toISOString(); }
    const e = Object.assign({
      id: nextId(), code, orderId, merchantId,
      createdAt,
      schemaVersion: (opts2 && opts2.schemaVersion) || "v1"
    }, opts2 && opts2.overrides);
    queue.push(e);
    return e;
  }

  /** Jornada completa de um pedido -- pronto -> coleta -> saída -> entrega -> conclusão. */
  function pushOrderJourney(orderId) {
    const events = [];
    events.push(push("PLACED", orderId));
    events.push(push("CONFIRMED", orderId));
    events.push(push("PREPARATION_STARTED", orderId));
    events.push(push("READY_TO_PICKUP", orderId));
    events.push(push("COURIER_ASSIGNED", orderId));
    events.push(push("COURIER_ARRIVED_AT_MERCHANT", orderId));
    events.push(push("COURIER_PICKED_UP", orderId));
    events.push(push("COURIER_ARRIVED_AT_DESTINATION", orderId));
    events.push(push("COURIER_DELIVERED", orderId));
    events.push(push("CONCLUDED", orderId));
    return events;
  }

  function pushCancellation(orderId) { return push("CANCELLED", orderId); }
  function pushCancellationRequested(orderId) { return push("CANCELLATION_REQUESTED", orderId); }
  function pushDispute(orderId) { return push("DISPUTE_OPENED", orderId); }
  function pushDisputeResolved(orderId) { return push("DISPUTE_RESOLVED", orderId); }
  function pushAlteration(orderId) { return push("MERCHANT_STATUS_CHANGED", orderId); }
  function pushUnknownEvent(orderId) { return push("SOMETHING_NEW_NEVER_DOCUMENTED", orderId); }
  function pushMerchantUnavailable() { return push("MERCHANT_STATUS_CHANGED", null, { overrides: { merchantId } }); }

  function pushDuplicateOf(event) { queue.push(Object.assign({}, event)); return event; }

  /** Empurra dois eventos de progressão contraditórios no MESMO timestamp -- caso de conflito. */
  function pushSameTimestampConflict(orderId, codeA, codeB, timestamp) {
    const ts = timestamp || new Date().toISOString();
    const a = push(codeA, orderId, { createdAt: ts });
    const b = push(codeB, orderId, { createdAt: ts });
    return [a, b];
  }

  /** Empurra um evento de etapa AVANÇADA antes do intermediário -- fora de ordem por timestamp. */
  function pushOutOfOrder(orderId) {
    const advanced = push("READY_TO_PICKUP", orderId, { createdAt: "2026-01-01T10:05:00Z" });
    const earlier = push("CONFIRMED", orderId, { createdAt: "2026-01-01T10:00:00Z" });
    return [advanced, earlier]; // entregues nesta ordem (avançado primeiro) -- reconciler deve corrigir por timestamp
  }

  function pushUnknownSchemaVersion(orderId) {
    return push("PLACED", orderId, { schemaVersion: "v99-nunca-visto" });
  }

  function invalidJsonBody() { return "{ isto nao fecha, PLACED, orderId:"; }

  function injectFault(type, opts2) { faultQueue.push({ type, opts: opts2 || {} }); }

  function reasonForFault(fault) {
    switch (fault.type) {
      case FAULT_TYPES.TIMEOUT: return "timeout";
      case FAULT_TYPES.HTTP_401: return "http_401_nao_autenticado";
      case FAULT_TYPES.HTTP_403: return "http_403_nao_autorizado";
      case FAULT_TYPES.HTTP_404: return "http_404_nao_encontrado";
      case FAULT_TYPES.HTTP_409: return "http_409_conflito";
      case FAULT_TYPES.HTTP_429: return "http_429_limite_de_taxa";
      case FAULT_TYPES.HTTP_5XX: return "http_5xx_erro_do_provedor";
      case FAULT_TYPES.TOKEN_EXPIRED: return "token_expirado";
      default: return fault.type;
    }
  }

  /**
   * pollEvents() -- a única responsabilidade do adapter que este simulador
   * implementa de verdade com efeito colateral (consumir a fila local).
   * Falhas de NÍVEL DE REQUISIÇÃO fazem o próprio poll falhar (nenhum
   * evento é entregue); INCOMPLETE_BATCH entrega só parte da fila.
   */
  async function pollEvents() {
    if (faultQueue.length) {
      const fault = faultQueue[0];
      if (REQUEST_LEVEL_FAULTS.has(fault.type)) {
        faultQueue.shift();
        return { ok: false, reason: reasonForFault(fault) };
      }
      if (fault.type === FAULT_TYPES.INCOMPLETE_BATCH) {
        faultQueue.shift();
        const half = queue.splice(0, Math.max(1, Math.floor(queue.length / 2)));
        return { ok: true, events: half, partial: true };
      }
    }
    const batch = queue.splice(0, queue.length);
    return { ok: true, events: batch, partial: false };
  }

  const impl = {
    authenticate: async () => {
      if (faultQueue.length && faultQueue[0].type === FAULT_TYPES.TOKEN_EXPIRED) {
        faultQueue.shift();
        return { ok: false, reason: "token_expirado" };
      }
      return { ok: true, tokenReference: "sim-token-ref", expiresAt: new Date(Date.now() + 3600000).toISOString() };
    },
    listMerchants: async () => ({ ok: true, merchants: [{ merchantId, tradeName: "Loja Simulada" }] }),
    pollEvents,
    receiveWebhook: async (payload) => ({ ok: true, payload }),
    fetchOrder: async (orderId) => ({ ok: true, orderId, status: "unknown_local_simulator" }),
    acknowledgeEvent: async (externalEventId) => ({ ok: true, externalEventId, acknowledgedAt: new Date().toISOString() }),
    requestCancellation: async (orderId) => ({ ok: true, orderId, status: "requested" }),
    sendNegotiationAction: async () => ({ ok: false, reason: "negociacao_nunca_enviada_nesta_missao" }),
    fetchDeliveryState: async (orderId) => ({ ok: true, orderId, status: "unknown_local_simulator" }),
    checkHealth: async () => ({ ok: true, status: "ok", queue_length: queue.length, fault_queue_length: faultQueue.length })
  };

  const adapter = createAdapter(impl, { label: "simulator" });

  return {
    adapter,
    pushOrderJourney, pushCancellation, pushCancellationRequested, pushDispute,
    pushDisputeResolved, pushAlteration, pushUnknownEvent, pushMerchantUnavailable,
    pushDuplicateOf, pushSameTimestampConflict, pushOutOfOrder, pushUnknownSchemaVersion,
    invalidJsonBody, injectFault,
    queueLength: () => queue.length, faultQueueLength: () => faultQueue.length,
    FAULT_TYPES
  };
}

module.exports = { createSimulator, FAULT_TYPES };
