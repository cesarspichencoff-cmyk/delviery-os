import { strict as assert } from "node:assert";
import {
  assertMetadataSafe,
  authTransition,
  findEphemeralOtp,
} from "../src/edge/ifood/auth";
import {
  IFOOD_SIDECAR_CAPABILITIES,
  portalRecordToObservation,
} from "../src/edge/ifood/sidecar";

const now = new Date("2026-09-24T20:00:00.000Z");

const otp = findEphemeralOtp(
  [
    {
      message_id: "mail-old",
      sender: "security@allowed.example",
      subject: "Seu código de acesso",
      received_at: "2026-09-24T19:40:00.000Z",
      body_text: "Código: 111111",
    },
    {
      message_id: "mail-valid",
      sender: "security@allowed.example",
      subject: "Seu código de acesso",
      received_at: "2026-09-24T19:59:30.000Z",
      body_text: "Código: 654321",
    },
    {
      message_id: "mail-wrong-sender",
      sender: "fake@example.net",
      subject: "Seu código de acesso",
      received_at: "2026-09-24T19:59:50.000Z",
      body_text: "Código: 999999",
    },
  ],
  {
    allowed_sender_suffixes: ["@allowed.example"],
    subject_pattern: /código de acesso/i,
    code_pattern: /Código:\s*(\d{6})/i,
    max_age_seconds: 180,
  },
  now,
);

assert.ok(otp);
assert.equal(otp.code, "654321");
assert.equal(otp.message_id, "mail-valid");

let state = "AUTH_HEALTHY" as const;
state = authTransition(state, "SESSION_EXPIRED");
assert.equal(state, "AUTH_RECOVERING");
assert.equal(authTransition(state, "OTP_FOUND"), "AUTH_RECOVERING");
assert.equal(authTransition(state, "SESSION_OK"), "AUTH_HEALTHY");
assert.equal(authTransition(state, "HUMAN_CHALLENGE"), "AUTH_HUMAN_REQUIRED");

assert.throws(
  () => assertMetadataSafe({ auth: { token: "do-not-store" } }),
  /secret-like field forbidden/,
);

const observation = portalRecordToObservation({
  capture_id: "cap-review-1",
  surface: "reviews",
  unit_id: "0001",
  observed_at: "2026-09-24T20:00:00.000Z",
  entity_id: "review-1",
  endpoint_fingerprint: "GET reviews structured-json",
  payload: { score: 2, order_reference: "ORDER-X" },
});
assert.equal(observation.source_ref.source, "review");
assert.equal(observation.payload.score, 2);

assert.throws(
  () =>
    portalRecordToObservation({
      capture_id: "cap-secret",
      surface: "analytics",
      unit_id: "0001",
      observed_at: "2026-09-24T20:00:00.000Z",
      payload: { cookie: "secret" },
    }),
  /forbidden portal field/,
);

assert.deepEqual(IFOOD_SIDECAR_CAPABILITIES, [
  "observe_structured_response",
  "observe_download_metadata",
  "observe_session_health",
]);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      otp_narrow_match: true,
      auth_human_gate: true,
      secrets_not_metadata: true,
      sidecar_observation_only: true,
    },
    null,
    2,
  ),
);
