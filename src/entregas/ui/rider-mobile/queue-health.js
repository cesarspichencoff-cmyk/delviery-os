/* Estado de leitura da outbox do Android. Nao consulta o servidor e nao deduz
 * confirmacao de entrega: apenas determina se a UI pode confiar no snapshot
 * limitado devolvido pela ponte nativa. Fail-closed quando malformado. */
const KNOWN_STATES = new Set(["pending", "failed", "sending", "sent", "rejected"]);
export const QUEUE_READ_BLOCK = "QUEUE_READ_UNAVAILABLE";
export const QUEUE_WRITE_BLOCK = "QUEUE_WRITE_UNCONFIRMED";

export function inspectOperationalEvents(raw) {
  if (!Array.isArray(raw) || raw.length > 1000) {
    return { ok: false, events: [], code: QUEUE_READ_BLOCK };
  }
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.event_id !== "string" || !item.event_id ||
        typeof item.kind !== "string" || !item.kind ||
        !KNOWN_STATES.has(item.state) ||
        !Number.isSafeInteger(item.sequence_local) || item.sequence_local < 1) {
      return { ok: false, events: [], code: QUEUE_READ_BLOCK };
    }
  }
  return { ok: true, events: raw, code: null };
}

export function queueHoldMessage(code) {
  switch (code) {
    case QUEUE_WRITE_BLOCK:
      return "A ação NÃO foi confirmada como salva neste aparelho. Não repita a confirmação. Peça ajuda ao responsável antes de continuar.";
    case QUEUE_READ_BLOCK:
      return "Não foi possível conferir a fila deste aparelho. As confirmações estão bloqueadas até a leitura voltar ao normal.";
    default:
      return "";
  }
}

/** A ponte nativa só confirma escrita se ecoar a identidade exata.
 * Não aceitar ok solto, eco divergente ou colisão de event_id. */
export function verifiedNativeQueueReceipt(reply, requestedEventId) {
  return !!reply && typeof reply === "object" && !Array.isArray(reply) &&
    typeof requestedEventId === "string" && requestedEventId.length > 0 &&
    reply.ok === true && reply.event_id === requestedEventId &&
    reply.duplicate === false &&
    (reply.state === undefined || reply.state === "pending");
}
