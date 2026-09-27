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
import type { ObservationSourceMode } from "../simulator";
import type { PortalStructuredRecord, PortalSurface } from "./sidecar";

export type BrowserSessionHealth =
  | "HEALTHY"
  | "EXPIRED"
  | "HUMAN_REQUIRED"
  | "UNKNOWN";

export type BrowserSessionReason =
  | "session_valid"
  | "session_expired"
  | "human_challenge"
  | "session_probe_failed"
  | "source_mode_mismatch"
  | "unknown";

export interface BrowserSessionSnapshot {
  source_mode: ObservationSourceMode;
  health: BrowserSessionHealth;
  observed_at: string;
  profile_id: string;
  /** Safe semantic code only. Never raw URLs, cookies or exception text. */
  reason?: BrowserSessionReason;
}

export interface StructuredNetworkCapture {
  capture_id: string;
  source_mode: ObservationSourceMode;
  surface: PortalSurface;
  unit_id: string;
  observed_at: string;
  occurred_at?: string;
  entity_id?: string;
  method: "GET" | "POST";
  /** Path/fingerprint only; query strings and fragments are removed at boundary. */
  resource_fingerprint: string;
  content_type?: string;
  payload: Record<string, unknown>;
}

export interface DownloadMetadata {
  download_id: string;
  source_mode: ObservationSourceMode;
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
    source_mode: capture.source_mode,
    surface: capture.surface,
    unit_id: capture.unit_id,
    observed_at: capture.observed_at,
    occurred_at: capture.occurred_at,
    entity_id: capture.entity_id,
    endpoint_fingerprint: [
      capture.method,
      safeResourceFingerprint(capture.resource_fingerprint),
    ].join(" "),
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
    source_mode: snapshot.source_mode,
    health: snapshot.health,
    observed_at: snapshot.observed_at,
    profile_id: safeBrowserProfileId(snapshot.profile_id),
    reason: snapshot.reason,
  };
}

export function safeBrowserProfileId(value: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(value)
    ? value
    : "redacted-profile";
}

function safeResourceFingerprint(input: string): string {
  const stripped = input.trim().split(/[?#]/, 1)[0];
  if (/^\/?[a-z0-9._~:/-]{1,160}$/i.test(stripped)) return stripped;
  return "redacted-resource";
}

export const IFOOD_BROWSER_TRANSPORT_CAPABILITIES = Object.freeze([
  "session_health",
  "structured_network_capture",
  "download_metadata",
] as const);
