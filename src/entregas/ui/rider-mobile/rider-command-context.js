/**
 * Native rider command identity: do not let a browser demo identity reach the
 * Android Room outbox. This pure guard runs BEFORE command creation.
 * Server-side authorization still remains authoritative; a web snapshot is
 * never a substitute for server authentication.
 */
export function riderCommandContext({
  nativePresent, nativeAvailable, snapshot, sessionActor, trip,
}) {
  if (nativePresent !== true) {
    return {
      unit_id: "demo-unit",
      actor: { actor_id: "rid-demo", role: "motoboy_interno" },
    };
  }
  const who = sessionActor;
  const actor = snapshot?.actor;
  const validId = typeof who?.actor_id === "string" &&
    who.actor_id.length > 0 && who.actor_id === who.actor_id.trim();
  const validTrip = typeof trip?.trip_id === "string" &&
    trip.trip_id.length > 0 && trip.trip_id === trip.trip_id.trim();
  const trips = snapshot?.trips;
  if (!nativeAvailable || snapshot?.unit_id !== "ITAIM" ||
      !who || who.role !== "motoboy_interno" || !validId ||
      !actor || actor.role !== "motoboy_interno" ||
      actor.actor_id !== who.actor_id ||
      !validTrip || trip.courier_actor_id !== who.actor_id ||
      !Array.isArray(trips) ||
      !trips.some((t) => t && t.trip_id === trip.trip_id &&
        t.courier_actor_id === who.actor_id)) {
    throw new Error(
      "Não foi possível confirmar sua unidade e viagem. Atualize a tela antes de registrar.",
    );
  }
  return {
    unit_id: "ITAIM",
    actor: { actor_id: who.actor_id, role: "motoboy_interno" },
  };
}
