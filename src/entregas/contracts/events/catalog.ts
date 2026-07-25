/**
 * Catálogo de event_type públicos — nomes COR quando canônicos.
 * Não duplicar eventos só por sinônimo; aliases só na documentação.
 */

/** Eventos canônicos COR / fundação (emitidos pelo domínio) */
export const COR_PUBLIC_EVENT_TYPES = [
  "trip_created",
  "delivery_added",
  "delivery_removed",
  "trip_started",
  "arrival_detected",
  "delivery_confirmed",
  "delivery_unconfirmed",
  "customer_not_found",
  "return_requested",
  "trip_return_started",
  "return_detected",
  "trip_closed_automatic",
  "trip_closed_manual",
  "handoff_created",
  "handoff_courier_arrived",
  "handoff_conference_done",
  "handoff_transferred",
  "handoff_exception",
  "occurrence_opened",
  "occurrence_updated",
  "occurrence_closed",
] as const;

/** Sinais operacionais para consumo futuro (Capacidade Viva / Copiloto) */
export const SIGNAL_PUBLIC_EVENT_TYPES = [
  "delivery_ready",
  "rider_assigned",
  "rider_arrived_store",
  "rider_waiting_store",
  "delivery_picked_up",
  "rider_availability_changed",
  "rider_location_stale",
  "source_quality_issue",
] as const;

/** Meta-eventos de sincronização (outbox) */
export const SYNC_PUBLIC_EVENT_TYPES = [
  "event_sync_pending",
  "event_sync_completed",
] as const;

/**
 * Extensões posteriores ao COR-ENTREGAS-V1@1.0.3 — mantidas em lista própria
 * para que a lista canônica continue sendo espelho fiel do contrato.
 *
 * `arrival_reported` existe porque o COR (§ matriz de transições) modela
 * `arrival_detected` com ator **sistema (GPS)**, enquanto a operação real tem
 * o motoboy apertando "Cheguei". Fundir os dois faria um ato humano parecer
 * evidência de sensor. Nenhum dos dois confirma entrega.
 *
 * `rider_location_notice_acknowledged` registra a ciência do termo de
 * localização (Adendo §4.5).
 */
export const EXTENSION_PUBLIC_EVENT_TYPES = [
  "arrival_reported",
  "rider_location_notice_acknowledged",
] as const;

export const PUBLIC_EVENT_TYPES = [
  ...COR_PUBLIC_EVENT_TYPES,
  ...SIGNAL_PUBLIC_EVENT_TYPES,
  ...SYNC_PUBLIC_EVENT_TYPES,
  ...EXTENSION_PUBLIC_EVENT_TYPES,
] as const;

export type PublicEventType = (typeof PUBLIC_EVENT_TYPES)[number];

export function isPublicEventType(v: string): v is PublicEventType {
  return (PUBLIC_EVENT_TYPES as readonly string[]).includes(v);
}

/**
 * Aliases de leitura (documentação / consumidores) → canônico.
 * Nunca gravar o alias no outbox como event_type paralelo.
 */
export const PUBLIC_EVENT_ALIASES: Record<string, PublicEventType> = {
  delivery_added_to_trip: "delivery_added",
  trip_departed: "trip_started",
  handoff_started: "handoff_created",
  handoff_confirmed: "handoff_transferred",
  occurrence_created: "occurrence_opened",
  occurrence_resolved: "occurrence_closed",
  occurrence_updated: "occurrence_updated",
};
