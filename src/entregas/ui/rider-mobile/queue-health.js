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
  const ids = new Set();
  const sequences = new Set();
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.event_id !== "string" || !item.event_id ||
        typeof item.kind !== "string" || !item.kind ||
        !KNOWN_STATES.has(item.state) ||
        !Number.isSafeInteger(item.sequence_local) || item.sequence_local < 1 ||
        ids.has(item.event_id) || sequences.has(item.sequence_local)) {
      // The native Room journal must identify one action per event_id and
      // monotonically assigned local sequence. Never count or replay an
      // ambiguous snapshot as if it were a healthy queue.
      return { ok: false, events: [], code: QUEUE_READ_BLOCK };
    }
    ids.add(item.event_id);
    sequences.add(item.sequence_local);
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

/** Mensagem operacional sem supor se a requisicao chegou ao servidor.
 * "failed" inclui rejeicoes HTTP observadas e falhas sem resposta. O Room
 * mostra a tentativa LOCAL, nao um ACK de processamento do dominio.
 * Somente contagens e estados entram no texto, nunca mensagens da API.
 */
export function queuedOperationalActionsMessage(raw) {
  const read = inspectOperationalEvents(raw);
  if (!read.ok) return "";
  const open = read.events.filter((e) =>
    e.state === "pending" || e.state === "failed" || e.state === "sending");
  if (!open.length) return "";
  const prefix = open.length === 1
    ? "1 ação guardada neste aparelho"
    : `${open.length} ações guardadas neste aparelho`;
  if (open.some((e) => e.state === "failed"))
    return prefix + ". Há tentativa sem confirmação do servidor; ela pode ter chegado até ele. Não repita a confirmação sem verificar.";
  if (open.some((e) => e.state === "sending"))
    return prefix + ". Envio em andamento; a confirmação do servidor ainda não chegou ao aparelho.";
  return prefix + ". Aguardando sincronização; ainda sem confirmação do servidor.";
}

/** Nunca ecoar last_error ou resposta HTTP arbitraria: podem conter dados
 * de cliente, infraestrutura ou credenciais. A recusa continua visivel.
 */
export function rejectedOperationalActionMessage(event) {
  if (!event || event.state !== "rejected") return "";
  return "Ação recusada pelo servidor. Peça ao responsável para verificar o motivo antes de repetir.";
}

/**
 * O botao manual so agenda o WorkManager quando existe fila legivel e aberta.
 * O estado de rede da fachada demo NAO decide a disponibilidade da ponte.
 * 'sending' nao e prova de resposta do servidor; pode exigir recuperacao.
 */
export function canRequestNativeQueueSync(raw, nativeSyncAvailable) {
  const read = inspectOperationalEvents(raw);
  return nativeSyncAvailable === true && read.ok &&
    read.events.some((e) => ["pending", "failed", "sending"].includes(e.state));
}

/**
 * Indica somente transicoes verificadas NA MESMA identidade local:
 * pending/failed/sending -> sent. 'sent' no primeiro snapshot da pagina
 * nao ganha aviso novo; sumico de linha ou rejeicao nao e recibo.
 *
 * A ponte nativa declara 'sent' apenas apos recibo por event_id do dominio.
 * Este texto descreve o REGISTRO do aparelho, nao a entrega fisica.
 */
export function confirmedNativeQueueTransition(previous, current) {
  if (!previous) return "";
  const old = inspectOperationalEvents(previous);
  const next = inspectOperationalEvents(current);
  if (!old.ok || !next.ok) return "";
  const unique = (events) => new Set(events.map((e) => e.event_id)).size === events.length &&
    new Set(events.map((e) => e.sequence_local)).size === events.length;
  if (!unique(old.events) || !unique(next.events)) return "";
  const was = new Map(old.events.map((e) => [e.event_id, e]));
  const confirmed = next.events.filter((e) => {
    const before = was.get(e.event_id);
    return e.state === "sent" && !!before &&
      before.sequence_local === e.sequence_local &&
      ["pending", "failed", "sending"].includes(before.state);
  });
  if (!confirmed.length) return "";
  return confirmed.length === 1
    ? "O aparelho registrou a confirmação do servidor para 1 ação. Confira o estado atualizado da viagem."
    : `O aparelho registrou a confirmação do servidor para ${confirmed.length} ações. Confira o estado atualizado da viagem.`;
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
