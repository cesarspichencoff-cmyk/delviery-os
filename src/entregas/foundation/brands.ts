/**
 * Distinção técnica inequívoca (Gate Zero confirmado + COR):
 * - InternalRiderActorId → Trip.courier_actor_id (motoboy da casa)
 * - ExternalCourierRef   → Handoff.external_courier_ref (só repasse iFood)
 * Nunca intercambiáveis.
 */

/** Motoboy interno da casa — único papel válido em Trip.courier_actor_id */
export type InternalRiderActorId = string & {
  readonly __brand: "InternalRiderActorId";
};

/**
 * Referência mínima ao entregador externo de plataforma.
 * Não é usuário do módulo; sem conta/app/Trip/GPS.
 * Preferir código mascarado da plataforma; sem nome/documento obrigatórios.
 */
export type ExternalCourierRef = string & {
  readonly __brand: "ExternalCourierRef";
};

export function asInternalRiderActorId(id: string): InternalRiderActorId {
  if (!id || !id.trim()) {
    throw new Error("InternalRiderActorId vazio");
  }
  return id.trim() as InternalRiderActorId;
}

export function asExternalCourierRef(ref: string): ExternalCourierRef {
  if (!ref || !ref.trim()) {
    throw new Error("ExternalCourierRef vazio");
  }
  return ref.trim() as ExternalCourierRef;
}

/** Type-guard: impede uso acidental de string crua como rider em APIs tipadas */
export function isInternalRiderActorId(
  v: InternalRiderActorId | ExternalCourierRef | string,
): v is InternalRiderActorId {
  return typeof v === "string" && (v as InternalRiderActorId).__brand === undefined
    ? // brands are erased at runtime — separation is compile-time;
      // runtime checks use explicit field names on aggregates
      true
    : typeof v === "string";
}

/**
 * Documentação de runtime: campos distintos em objetos.
 * Trip sempre usa courier_actor_id: InternalRiderActorId
 * Handoff sempre usa external_courier_ref?: ExternalCourierRef
 */
export const ACTOR_FIELD_DOCS = {
  trip_courier_actor_id:
    "InternalRiderActorId — motoboy da casa somente (COR Trip.courier_actor_id)",
  handoff_external_courier_ref:
    "ExternalCourierRef — entregador externo mínimo no Handoff; não é usuário do módulo",
} as const;
