/**
 * Ported source-agent contract for the TATÁ Edge runtime.
 *
 * Keeps the proven DeliveryOS semantics: local sequence, cursor, idempotency,
 * occurred_at != observed_at, replay and heartbeat.
 */

export const SOURCE_ENVELOPE_VERSION = "source-envelope@1.0.0";

export interface SourceAgentIdentity {
  agent_id: string;
  unit_id: string;
  source: string;
  agent_version: string;
  envelope_version: string;
}

export interface SourceEventEnvelope<T> {
  envelope_version: string;
  agent: SourceAgentIdentity;
  sequence_local: number;
  cursor?: string;
  idempotency_key: string;
  observed_at: string;
  occurred_at?: string;
  replay: boolean;
  evidence_hash?: string;
  payload: T;
}

export interface AgentHeartbeat {
  agent_id: string;
  unit_id: string;
  at: string;
  cursor?: string;
  pending_local: number;
  healthy: boolean;
  detail?: string;
}

export type SourceEnvelopeCheck =
  | { ok: true }
  | { ok: false; reason: string };

const SAFE_ID = /^[a-z0-9][a-z0-9_.:-]{0,159}$/i;
const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function checkSourceEnvelope(
  envelope: SourceEventEnvelope<unknown>,
): SourceEnvelopeCheck {
  if (envelope.envelope_version !== SOURCE_ENVELOPE_VERSION) {
    return { ok: false, reason: "unsupported_envelope" };
  }
  if (envelope.agent?.envelope_version !== envelope.envelope_version) {
    return { ok: false, reason: "agent_envelope_version_mismatch" };
  }
  if (!SAFE_ID.test(envelope.agent?.agent_id ?? "")) {
    return { ok: false, reason: "invalid_agent_id" };
  }
  if (!SAFE_ID.test(envelope.agent?.unit_id ?? "")) {
    return { ok: false, reason: "invalid_unit_id" };
  }
  if (!SAFE_ID.test(envelope.agent?.source ?? "")) {
    return { ok: false, reason: "invalid_source" };
  }
  if (!SAFE_ID.test(envelope.idempotency_key ?? "")) {
    return { ok: false, reason: "invalid_idempotency_key" };
  }
  if (!Number.isInteger(envelope.sequence_local) || envelope.sequence_local < 0) {
    return { ok: false, reason: "invalid_sequence" };
  }
  if (!isRfc3339(envelope.observed_at)) {
    return { ok: false, reason: "invalid_observed_at" };
  }
  if (envelope.occurred_at !== undefined && !isRfc3339(envelope.occurred_at)) {
    return { ok: false, reason: "invalid_occurred_at" };
  }
  return { ok: true };
}

function isRfc3339(value: string): boolean {
  return RFC3339.test(value) && Number.isFinite(Date.parse(value));
}
