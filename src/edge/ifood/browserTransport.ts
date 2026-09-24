/**
 * Browser transport boundary for the iFood Portal Sidecar.
 *
 * The transport may own a persistent browser profile, but profile bytes,
 * cookies, tokens and passwords never enter Edge observations.
 *
 * This file deliberately exposes no generic click/type/evaluate primitive.
 * Higher layers can only inspect session health and already-observed structured
 * responses/download metadata. Any future mutating browser workflow requires
 * a separate capability contract and human gate.
 */
import type { PortalStructuredRecord, PortalSurface } from "./sidecar";

export type BrowserSessionHealth =
  | "HEALTHY"
  | "EXPIRED"
  | "HUMAN_REQUIRED"
  | "UNKNOWN";

export interface BrowserSessionSnapshot {
  health: BrowserSessionHealth;
  observed_at: string;
  profile_id: string;
  /** Safe reason only. Never raw cookies/tokens/URLs with secrets. */
  reason?: string;
}

export interface StructuredNetworkCapture {
  capture_id: string;
  surface: PortalSurface;
  unit_id: string;
  observed_at: string;
  occurred_at?: string;
  entity_id?: string;
  method: "GET" | "POST";
  resource_fingerprint: string;
  content_type?: string;
  payload: Record<string, unknown>;
}

export interface DownloadMetadata {
  download_id: string;
  surface: PortalSurface;
  unit_id: string;
  observed_at: string;
  file_name?: string;
  media_type?: string;
  size_bytes?: number;
  sha256?: string;
}

export interface IfoodBrowserReadOnlyTransport {
  sessionHealth(): Promise<BrowserSessionSnapshot>;
  collectStructured(): Promise<StructuredNetworkCapture[]>;
  collectDownloadMetadata(): Promise<DownloadMetadata[]>;
}

export function networkCaptureToPortalRecord(
  capture: StructuredNetworkCapture,
): PortalStructuredRecord {
  return {
    capture_id: capture.capture_id,
    surface: capture.surface,
    unit_id: capture.unit_id,
    observed_at: capture.observed_at,
    occurred_at: capture.occurred_at,
    entity_id: capture.entity_id,
    endpoint_fingerprint: [capture.method, capture.resource_fingerprint].join(" "),
    payload: capture.payload,
  };
}

/**
 * Persistent session is an external browser concern, not Edge data.
 * The only serializable state allowed across the boundary is this metadata.
 */
export function safeSessionMetadata(
  snapshot: BrowserSessionSnapshot,
): Record<string, unknown> {
  return {
    health: snapshot.health,
    observed_at: snapshot.observed_at,
    profile_id: snapshot.profile_id,
    reason: snapshot.reason,
  };
}

export const IFOOD_BROWSER_TRANSPORT_CAPABILITIES = Object.freeze([
  "session_health",
  "structured_network_capture",
  "download_metadata",
] as const);