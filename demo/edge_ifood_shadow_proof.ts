import { strict as assert } from "node:assert";
import {
  assertMetadataSafe,
  authTransition,
  findEphemeralOtp,
  type PortalAuthState,
} from "../src/edge/ifood/auth";
import {
  IFOOD_SIDECAR_CAPABILITIES,
  portalRecordToObservation,
} from "../src/edge/ifood/sidecar";

const now = new Date("2026-09-24T20:00:00.000Z");

const policy = {
  allowed_sender_suffixes: ["@allowed.example"],
  subject_pattern: /código de acesso/gi,
  code_pattern: /Código:\s*(\d{6})/gi,
  max_age_seconds: 180,
};

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
  policy,
  now,
);

if (!otp) throw new Error("expected matching OTP fixture");
assert.equal(otp.code, "654321");
assert.equal(otp.message_id, "mail-valid");

const otpAgain = findEphemeralOtp(
  [{
    message_id: "mail-repeat",
    sender: "security@allowed.example",
    subject: "Seu código de acesso",
    received_at: "2026-09-24T19:59:40.000Z",
    body_text: "Código: 777777",
  }],
  policy,
  now,
);
if (!otpAgain) throw new Error("stateful regex must reset");
assert.equal(otpAgain.code, "777777");

let state: PortalAuthState = "AUTH_HEALTHY";
state = authTransition(state, "SESSION_EXPIRED");
assert.equal(state, "AUTH_RECOVERING");
assert.equal(authTransition(state, "OTP_FOUND"), "AUTH_RECOVERING");
assert.equal(authTransition(state, "SESSION_OK"), "AUTH_HEALTHY");
assert.equal(authTransition(state, "HUMAN_CHALLENGE"), "AUTH_HUMAN_REQUIRED");

assert.doesNotThrow(() => assertMetadataSafe({ status_code: 200 }));
assert.throws(
  () => assertMetadataSafe({ auth: { session_token: "do-not-store" } }),
  /secret-like field forbidden/,
);

const review = portalRecordToObservation({
  source_mode: "synthetic",
  capture_id: "cap-review-1",
  surface: "reviews",
  unit_id: "0001",
  observed_at: "2026-09-24T20:00:00.000Z",
  entity_id: "review-1",
  endpoint_fingerprint: "GET reviews structured-json",
  payload: { score: 2, order_reference: "ORDER-X" },
});
assert.equal(review.source_ref.source, "review");
assert.equal(review.kind, "review");
assert.equal(review.payload.score, 2);

const analytics = portalRecordToObservation({
  source_mode: "synthetic",
  capture_id: "cap-analytics-1",
  surface: "analytics",
  unit_id: "0001",
  observed_at: "2026-09-24T20:01:00.000Z",
  payload: { gross_sales: 1000, status_code: 200 },
});
assert.equal(analytics.kind, "ifood_portal");
assert.notEqual(analytics.kind, "ifood_order");

const collision = portalRecordToObservation({
  source_mode: "synthetic",
  capture_id: "cap-collision-1",
  surface: "analytics",
  unit_id: "0001",
  observed_at: "2026-09-24T20:01:30.000Z",
  endpoint_fingerprint: "GET /analytics",
  payload: {
    surface: "orders",
    endpoint_fingerprint: "unsafe-source-value",
    gross_sales: 5,
  },
});
assert.equal(collision.payload.surface, "analytics");
assert.equal(collision.payload.endpoint_fingerprint, "GET /analytics");

assert.throws(
  () =>
    portalRecordToObservation({
      source_mode: "synthetic",
      capture_id: "bad capture id",
      surface: "analytics",
      unit_id: "0001",
      observed_at: "2026-09-24T20:01:40.000Z",
      payload: {},
    }),
  /invalid_portal_capture_id/,
);

assert.throws(
  () =>
    portalRecordToObservation({
  source_mode: "synthetic",
      capture_id: "cap-secret",
      surface: "analytics",
      unit_id: "0001",
      observed_at: "2026-09-24T20:02:00.000Z",
      payload: { session_token: "secret" },
    }),
  /forbidden portal field/,
);

assert.throws(
  () =>
    portalRecordToObservation({
  source_mode: "synthetic",
      capture_id: "cap-pii",
      surface: "orders",
      unit_id: "0001",
      observed_at: "2026-09-24T20:03:00.000Z",
      payload: { customer_email: "customer@example.invalid" },
    }),
  /forbidden portal field/,
);

assert.deepEqual(IFOOD_SIDECAR_CAPABILITIES, [
  "observe_structured_response",
  "observe_download_metadata",
  "observe_session_health",
]);

console.log(JSON.stringify({
  status: "PASS",
  otp_stateful_regex_safe: true,
  auth_human_gate: true,
  derived_secret_keys_blocked: true,
  analytics_not_misclassified_as_order: true,
  direct_customer_pii_blocked: true,
  payload_cannot_override_safe_metadata: true,
  unsafe_source_identifier_blocked: true,
  sidecar_observation_only: true,
}, null, 2));
