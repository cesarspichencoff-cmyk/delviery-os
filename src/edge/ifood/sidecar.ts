/**
 * iFood Portal Sidecar shadow contracts.
 *
 * Browser/network collection is intentionally absent here. This layer only
 * accepts already-observed structured records and turns them into safe Edge
 * observations. No click, write, reply, pause or account mutation exists.
 */

import type {
  EdgeSourceObservation,
  ObservationSourceMode,
} from "../simulator";

export type PortalSurface =
  | "reviews"
  | "analytics"
  | "financial"
  | "store_status"
  | "orders"
  | "unknown";

export interface PortalStructuredRecord {
  capture_id: string;
  source_mode: ObservationSourceMode;
  surface: PortalSurface;
  unit_id: string;
  observed_at: string;
  occurred_at?: string;
  entity_id?: string;
  endpoint_fingerprint?: string;
  payload: Record<string, unknown>;
}

const SAFE_SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

const FORBIDDEN_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "senha",
  "otp",
  "token",
  "access_token",
  "refresh_token",
  "jwt",
  "secret",
  "customer_name",
  "customer_phone",
  "customer_email",
  "customer_address",
  "email",
  "address",
]);

function isForbiddenPortalKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (FORBIDDEN_KEYS.has(normalized)) return true;

  const suffixes = [
    "authorization",
    "cookie",
    "password",
    "senha",
    "otp",
    "token",
    "jwt",
    "secret",
    "email",
    "address",
  ];
  if (suffixes.some((suffix) => normalized.endsWith(`_${suffix}`))) return true;

  return (
    normalized.startsWith("customer_") &&
    /(name|phone|email|address)$/.test(normalized)
  );
}

export function portalRecordToObservation(
  record: PortalStructuredRecord,
): EdgeSourceObservation {
  assertPortalRecordIdentifiers(record);
  assertPortalPayloadSafe(record.payload);

  return {
    observation_id: `ifood-portal:${record.capture_id}`,
    source_mode: record.source_mode,
    kind: surfaceToKind(record.surface),
    source_ref: {
      source: record.surface === "reviews" ? "review" : "ifood",
      kind: record.surface,
      id: record.entity_id ?? record.capture_id,
      unit_id: record.unit_id,
    },
    observed_at: record.observed_at,
    occurred_at: record.occurred_at,
    payload: {
      ...record.payload,
      surface: record.surface,
      endpoint_fingerprint: record.endpoint_fingerprint,
    },
  };
}

function assertPortalRecordIdentifiers(record: PortalStructuredRecord): void {
  const values: Array<[string, string | undefined]> = [
    ["capture_id", record.capture_id],
    ["unit_id", record.unit_id],
    ["entity_id", record.entity_id],
  ];
  for (const [label, value] of values) {
    if (value !== undefined && !SAFE_SOURCE_ID.test(value)) {
      throw new Error(`invalid_portal_${label}`);
    }
  }
}

export function assertPortalPayloadSafe(value: unknown, depth = 0): void {
  if (depth > 12 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertPortalPayloadSafe(item, depth + 1);
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isForbiddenPortalKey(key)) {
      throw new Error(`forbidden portal field: ${key}`);
    }
    assertPortalPayloadSafe(nested, depth + 1);
  }
}

function surfaceToKind(
  surface: PortalSurface,
): EdgeSourceObservation["kind"] {
  if (surface === "reviews") return "review";
  if (surface === "orders") return "ifood_order";
  return "ifood_portal";
}

/**
 * Capability list is deliberately observation-only.
 * Any future mutating capability requires a separate contract + human gate.
 */
export const IFOOD_SIDECAR_CAPABILITIES = Object.freeze([
  "observe_structured_response",
  "observe_download_metadata",
  "observe_session_health",
] as const);
