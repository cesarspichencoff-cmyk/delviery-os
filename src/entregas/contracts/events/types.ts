import type { PublicEventType } from "./catalog";

/** Versão do envelope público (evolução independente do COR domain version) */
export const PUBLIC_EVENTS_SCHEMA_VERSION = "1.0.0" as const;
export type PublicEventsSchemaVersion = typeof PUBLIC_EVENTS_SCHEMA_VERSION;

export type SourceHealth = "ok" | "degraded" | "unknown";
export type EventConfidence = "observed" | "inferred" | "unknown";

/**
 * Envelope público — consumo pelo DELIVERYOS Copiloto (futuro).
 * Sem PII desnecessária; rider apenas opaco/anonimizado.
 */
export interface EntregasPublicEvent {
  event_id: string;
  event_type: PublicEventType;
  schema_version: PublicEventsSchemaVersion;
  occurred_at: string;
  recorded_at: string;
  synced_at?: string;
  idempotency_key: string;
  source: "entregas";
  source_health: SourceHealth;
  confidence: EventConfidence;
  unit_id: string;
  trip_id?: string;
  delivery_id?: string;
  handoff_id?: string;
  occurrence_id?: string;
  /** ID opaco do motoboy interno — nunca nome */
  rider_actor_id?: string;
  payload: Record<string, unknown>;
  correlation_id: string;
  causation_id?: string;
  /** Eco do contrato de domínio, se originado de COR */
  contract_version?: string;
}

export interface PublicEventValidationIssue {
  path: string;
  message: string;
}

export type PublicEventValidationResult =
  | { ok: true; event: EntregasPublicEvent }
  | { ok: false; issues: PublicEventValidationIssue[] };

/** Campos proibidos em qualquer nível do payload (heurística F0 + privacidade) */
export const FORBIDDEN_PAYLOAD_KEYS = [
  "full_name",
  "nome_completo",
  "nome",
  "telefone",
  "phone",
  "ranking",
  "produtividade",
  "whatsapp_raw",
  "cpf",
  "documento",
  "password",
  "senha",
  "score",
  "endereco_completo",
  "address_full",
  "historico_coordenadas",
  "coordinates_history",
  "lat_lng_history",
] as const;
