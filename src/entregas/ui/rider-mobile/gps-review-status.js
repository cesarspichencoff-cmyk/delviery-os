/* Somente apresentacao de uma CONTAGEM agregada do Room. A ponte nativa e
 * a fonte; a pagina nunca consulta coordenadas, lastError, IDs, backend ou
 * assume que a ausencia de campo prova zero. Nao existe acao de liberar HOLD. */
export function gpsReviewNotice(raw) {
  const invalid = {
    kind: "unavailable",
    message: "Não foi possível conferir os registros de GPS que aguardam revisão neste aparelho. Avise o responsável.",
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalid;
  // Aplicativo antigo: nao ha essa capacidade. Nao inventar um zero.
  if (!Object.prototype.hasOwnProperty.call(raw, "gps_review_required_points"))
    return { kind: "unsupported", message: "" };
  const held = raw.gps_review_required_points;
  const pending = raw.pending_points;
  if (!Number.isSafeInteger(held) || !Number.isSafeInteger(pending) ||
      held < 0 || pending < 0 || held > pending) return invalid;
  if (held === 0) return { kind: "clear", message: "" };
  const prefix = held === 1
    ? "1 registro de GPS guardado para revisão"
    : `${held} registros de GPS guardados para revisão`;
  return {
    kind: "held",
    message: `${prefix} neste aparelho. O envio automático desses registros está suspenso. Avise o responsável; não apague nem tente reenviá-los manualmente.`,
  };
}
