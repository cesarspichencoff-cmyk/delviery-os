/**
 * Seleção defensiva da viagem na tela do motoboy.
 * O servidor filtra por ator, mas uma resposta incompleta/larga nunca pode
 * fazer a interface escolher a primeira viagem disponível.
 * Puro: nenhuma rede, GPS, estado local ou comando de Entregas.
 */
const ACTIVE_TRIP_STATES = new Set(["preparando_saida", "em_rota", "retornando"]);

function riderIdentity(actor) {
  return actor && typeof actor === "object" && !Array.isArray(actor) &&
    actor.role === "motoboy_interno" &&
    typeof actor.actor_id === "string" && actor.actor_id.length > 0 &&
    actor.actor_id === actor.actor_id.trim()
      ? actor.actor_id
      : null;
}

/** Ausência, papel errado ou conflito entre os dois recibos de sessão => HOLD. */
export function selectActiveRiderTrip(snap, nativeSessionActor = null) {
  const snapshotActor = snap && typeof snap === "object" ? snap.actor : null;
  const id = riderIdentity(snapshotActor ?? nativeSessionActor);
  if (!id) return null;
  if (nativeSessionActor != null && riderIdentity(nativeSessionActor) !== id)
    return null;
  if (!Array.isArray(snap?.trips)) return null;
  return snap.trips.find(t =>
    t && typeof t === "object" && !Array.isArray(t) &&
    t.courier_actor_id === id && ACTIVE_TRIP_STATES.has(t.state)
  ) ?? null;
}
