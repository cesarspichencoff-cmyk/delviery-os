/* ============================================================================
 * IfoodCancellationRequest + IfoodDispute — fluxos paralelos à produção,
 * nunca fundidos com order_status (mesmo princípio de separação de fatos
 * do conference-brain, reimplementado independente aqui).
 * ==========================================================================*/
"use strict";

const CANCELLATION_REQUESTED_BY = Object.freeze({ MERCHANT: "merchant", CONSUMER: "consumer", IFOOD: "ifood", UNKNOWN: "unknown" });
const CANCELLATION_STATUS = Object.freeze({ REQUESTED: "requested", ACCEPTED: "accepted", DENIED: "denied", UNKNOWN: "unknown" });

function buildCancellationRequest(raw) {
  const r = raw || {};
  if (!r.orderId) return null;
  return {
    request_id: r.requestId || null,
    order_id: r.orderId,
    requested_by: Object.values(CANCELLATION_REQUESTED_BY).includes(r.requestedBy) ? r.requestedBy : CANCELLATION_REQUESTED_BY.UNKNOWN,
    reason_code: r.reasonCode || null,
    reason_text_sanitized: r.reasonTextSanitized || null, // sanitização acontece em security/, nunca aqui
    status: Object.values(CANCELLATION_STATUS).includes(r.status) ? r.status : CANCELLATION_STATUS.REQUESTED,
    created_at: r.createdAt || null
  };
}

const DISPUTE_STATUS = Object.freeze({ OPEN: "open", RESOLVED: "resolved", EXPIRED: "expired", UNKNOWN: "unknown" });

function buildDispute(raw) {
  const r = raw || {};
  if (!r.orderId) return null;
  return {
    dispute_id: r.disputeId || null,
    order_id: r.orderId,
    category: r.category || "unknown",
    status: Object.values(DISPUTE_STATUS).includes(r.status) ? r.status : DISPUTE_STATUS.UNKNOWN,
    opened_at: r.openedAt || null,
    resolution_deadline_at: r.resolutionDeadlineAt || null,
    evidence_refs: Array.isArray(r.evidenceRefs) ? r.evidenceRefs.slice() : []
  };
}

module.exports = {
  CANCELLATION_REQUESTED_BY, CANCELLATION_STATUS, buildCancellationRequest,
  DISPUTE_STATUS, buildDispute
};
