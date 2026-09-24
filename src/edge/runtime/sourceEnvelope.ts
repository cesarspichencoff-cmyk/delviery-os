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

export function checkSourceEnvelope(
  envelope: SourceEventEnvelope<unknown>,
): SourceEnvelopeCheck {
  if (envelope.envelope_version !== SOURCE_ENVELOPE_VERSION) {
    return { ok: false, reason: "unsupported_envelope" };
  }
  if (!envelope.agent?.agent_id?.trim()) {
    return { ok: false, reason: "missing_agent_id" };
  }
  if (!envelope.agent.unit_id?.trim()) {
    return { ok: false, reason: "missing_unit_id" };
  }
  if (!envelope.idempotency_key?.trim()) {
    return { ok: false, reason: "missing_idempotency_key" };
  }
  if (!Number.isInteger(envelope.sequence_local) || envelope.sequence_local < 0) {
    return { ok: false, reason: "invalid_sequence" };
  }
  if (!isIso(envelope.observed_at)) {
    return { ok: false, reason: "invalid_observed_at" };
  }
  if (envelope.occurred_at !== undefined && !isIso(envelope.occurred_at)) {
    return { ok: false, reason: "invalid_occurred_at" };
  }
  return { ok: true };
}

function isIso(value: string): boolean {
  return Boolean(value?.trim()) && Number.isFinite(Date.parse(value));
}
