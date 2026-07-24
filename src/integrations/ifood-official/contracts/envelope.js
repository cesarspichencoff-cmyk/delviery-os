/* ============================================================================
 * IfoodEventEnvelope — a forma NORMALIZADA de um evento, nunca o payload
 * externo bruto.
 * ----------------------------------------------------------------------------
 * Fronteira dura: `buildEventEnvelope()` é o ÚNICO lugar onde o formato
 * externo (o que quer que o provedor mande) entra no sistema. A partir
 * daqui, todo consumidor (inbox, reconciliador, outbox) só vê este
 * envelope — nunca o payload bruto de novo, nunca um campo externo solto.
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");
const { EVENT_TYPE_LIST, EVENT_TYPES, EVENT_SOURCE_LIST } = require("./event-types");

function sha256(v) {
  return crypto.createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");
}

/**
 * Identidade REAL do evento — nunca a posição no array, nunca a ordem de
 * chegada. Combina fonte + id externo (quando o provedor fornece um) para
 * que o MESMO evento entregue duas vezes (retry de webhook, ou webhook +
 * polling do mesmo fato) produza a MESMA identidade — condição necessária
 * para idempotência real na inbox.
 *
 * Sem `external_event_id` (alguns eventos podem não ter um), a identidade
 * cai para tipo+merchant+pedido+HASH DO PAYLOAD — nunca só tipo+merchant+
 * pedido sozinho, porque isso colapsaria eventos genuinamente DISTINTOS
 * (mesmo tipo, mesmo pedido, conteúdo diferente) na ausência de ID. Incluir
 * o hash do payload no fallback reduz esse risco sem inventar uma
 * causalidade que não existe.
 */
function eventIdentityKey(externalEventId, eventType, merchantId, orderId, payloadHash) {
  if (externalEventId) return `id:${externalEventId}`;
  return `fallback:${eventType}:${merchantId || "-"}:${orderId || "-"}:${payloadHash || "-"}`;
}

/**
 * @param {object} raw
 *   externalEventId    ID do evento no provedor (pode faltar em alguns fluxos)
 *   eventType            já mapeado para EVENT_TYPES (mapeamento fica em
 *                         outro módulo — este contrato só valida a forma)
 *   externalCode          código bruto do provedor, preservado para auditoria
 *   merchantId, orderId    referências já resolvidas (ou null se ainda não)
 *   occurredAt              quando o FATO aconteceu (do provedor, se disponível)
 *   receivedAt               quando ESTE sistema recebeu (sempre local)
 *   source                    "webhook" | "polling" | "simulator"
 *   schemaVersion              versão do schema do payload externo
 *   rawPayload                 payload bruto — usado SÓ para hash, nunca persistido inteiro
 */
function buildEventEnvelope(raw) {
  const r = raw || {};
  const errors = [];
  if (!EVENT_TYPE_LIST.includes(r.eventType)) errors.push("event_type_invalido:" + r.eventType);
  if (!EVENT_SOURCE_LIST.includes(r.source)) errors.push("source_invalida:" + r.source);
  if (!r.receivedAt) errors.push("received_at_obrigatorio");
  if (errors.length) return { ok: false, errors };

  const payloadHash = r.rawPayload !== undefined ? sha256(r.rawPayload) : null;
  const identityKey = eventIdentityKey(r.externalEventId, r.eventType || EVENT_TYPES.UNKNOWN, r.merchantId, r.orderId, payloadHash);

  return {
    ok: true,
    envelope: {
      internal_event_id: sha256(identityKey + "|" + (r.schemaVersion || "v0")).slice(0, 32),
      external_event_id: r.externalEventId || null,
      identity_key: identityKey,
      event_type: r.eventType,
      external_code: r.externalCode || null,
      merchant_id: r.merchantId || null,
      order_id: r.orderId || null,
      occurred_at: r.occurredAt || null,
      received_at: r.receivedAt,
      source: r.source,
      schema_version: r.schemaVersion || "v0",
      payload_hash: payloadHash
    }
  };
}

module.exports = { buildEventEnvelope, eventIdentityKey, sha256 };
