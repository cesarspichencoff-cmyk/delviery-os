import { createHash } from "node:crypto";
import { PUBLIC_EVENT_TYPES, PUBLIC_EVENT_ALIASES } from "./catalog";
import { PUBLIC_EVENTS_SCHEMA_VERSION, FORBIDDEN_PAYLOAD_KEYS } from "./types";

/**
 * Manifesto de congelamento do contrato público de eventos.
 * Mudança incompatível → nova schema_version / catalog_version.
 */
export const PUBLIC_CATALOG_VERSION = "1.0.0" as const;

/** Campos obrigatórios do envelope (v1.0.0) — base do hash de schema */
export const ENVELOPE_REQUIRED_FIELDS = [
  "event_id",
  "event_type",
  "schema_version",
  "occurred_at",
  "recorded_at",
  "idempotency_key",
  "source",
  "source_health",
  "confidence",
  "unit_id",
  "payload",
  "correlation_id",
] as const;

export const ENVELOPE_OPTIONAL_FIELDS = [
  "synced_at",
  "trip_id",
  "delivery_id",
  "handoff_id",
  "occurrence_id",
  "rider_actor_id",
  "causation_id",
  "contract_version",
] as const;

function stableStringify(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}

/** Hash determinístico dos schemas/catálogo públicos (sem código de domínio) */
export function computePublicSchemasHash(): string {
  const material = {
    catalog_version: PUBLIC_CATALOG_VERSION,
    schema_version: PUBLIC_EVENTS_SCHEMA_VERSION,
    event_types: [...PUBLIC_EVENT_TYPES].sort(),
    aliases: PUBLIC_EVENT_ALIASES,
    envelope_required: [...ENVELOPE_REQUIRED_FIELDS],
    envelope_optional: [...ENVELOPE_OPTIONAL_FIELDS],
    forbidden_payload_keys: [...FORBIDDEN_PAYLOAD_KEYS],
    source_fixed: "entregas",
  };
  return createHash("sha256")
    .update(stableStringify(material), "utf8")
    .digest("hex");
}

export interface PublicContractsFreezeManifest {
  catalog_version: typeof PUBLIC_CATALOG_VERSION;
  schema_version: typeof PUBLIC_EVENTS_SCHEMA_VERSION;
  event_types: readonly string[];
  event_count: number;
  aliases: typeof PUBLIC_EVENT_ALIASES;
  schemas_hash: string;
  compatibility: {
    policy: string;
    breaking_change_requires: string;
    additive_optional_fields: string;
  };
  origin_commit: string;
  status: "pre_integration";
  consumer_live: "disabled";
  producer: "entregas";
  domain_contract: "COR-ENTREGAS-V1@1.0.3";
  frozen_at: string;
}

/**
 * @param origin_commit — git SHA no momento do freeze (passado pelo caller/teste)
 */
export function buildPublicContractsFreezeManifest(
  origin_commit: string,
  frozen_at = new Date().toISOString(),
): PublicContractsFreezeManifest {
  return {
    catalog_version: PUBLIC_CATALOG_VERSION,
    schema_version: PUBLIC_EVENTS_SCHEMA_VERSION,
    event_types: [...PUBLIC_EVENT_TYPES],
    event_count: PUBLIC_EVENT_TYPES.length,
    aliases: PUBLIC_EVENT_ALIASES,
    schemas_hash: computePublicSchemasHash(),
    compatibility: {
      policy:
        "Campos opcionais novos permitidos na mesma major se ignoráveis por consumidores antigos",
      breaking_change_requires: "nova schema_version (e preferencialmente catalog_version)",
      additive_optional_fields: "permitido sem rehash de significado de campos existentes",
    },
    origin_commit,
    status: "pre_integration",
    consumer_live: "disabled",
    producer: "entregas",
    domain_contract: "COR-ENTREGAS-V1@1.0.3",
    frozen_at,
  };
}
