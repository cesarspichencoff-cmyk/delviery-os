import { strict as assert } from "node:assert";
import {
  checkSourceEnvelope,
  SOURCE_ENVELOPE_VERSION,
  type SourceEventEnvelope,
} from "../src/edge/runtime/sourceEnvelope";

const valid: SourceEventEnvelope<{ event: string }> = {
  envelope_version: SOURCE_ENVELOPE_VERSION,
  agent: {
    agent_id: "edge-itaim-01",
    unit_id: "0001",
    source: "ifood",
    agent_version: "0.1.0",
    envelope_version: SOURCE_ENVELOPE_VERSION,
  },
  sequence_local: 1,
  idempotency_key: "edge-itaim-01:1",
  observed_at: "2026-09-24T19:00:00.000Z",
  occurred_at: "2026-09-24T18:59:59-03:00",
  replay: false,
  payload: { event: "synthetic" },
};

assert.deepEqual(checkSourceEnvelope(valid), { ok: true });

assert.deepEqual(
  checkSourceEnvelope({
    ...valid,
    observed_at: "2026-09-24",
  }),
  { ok: false, reason: "invalid_observed_at" },
);

assert.deepEqual(
  checkSourceEnvelope({
    ...valid,
    agent: {
      ...valid.agent,
      envelope_version: "source-envelope@0.9.0",
    },
  }),
  { ok: false, reason: "agent_envelope_version_mismatch" },
);

assert.deepEqual(
  checkSourceEnvelope({
    ...valid,
    idempotency_key: "contains spaces",
  }),
  { ok: false, reason: "invalid_idempotency_key" },
);

console.log(JSON.stringify({
  status: "PASS",
  strict_rfc3339_required: true,
  envelope_version_mismatch_blocked: true,
  unsafe_idempotency_key_blocked: true,
}, null, 2));
