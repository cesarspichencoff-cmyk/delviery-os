import assert from "node:assert/strict";
import {
  evaluateActivationPreflight,
  type ActivationProbeInput,
} from "./pilot-activation-preflight";

function base(
  x: Partial<ActivationProbeInput> = {},
): ActivationProbeInput {
  return {
    adb_available: true,
    physical_devices: 0,
    emulator_devices: 0,
    unauthorized_devices: 0,
    docker_available: false,
    operational_db_url_present: false,
    product_reader_password_present: false,
    source_ingest_requested: false,
    source_ingest_production: "NOT_ACTIVATED",
    consumer_live: "OFF / NOT_AUTHORIZED",
    product_reader_credential: "NOT_CREATED",
    deployment_status: "NOT_DEPLOYED",
    ...x,
  };
}

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log("PASS", name);
}

test("PAP1 preflight nunca tenta efeito", () => {
  const r = evaluateActivationPreflight(base());
  assert.equal(r.effect_attempted, false);
  assert.equal(r.safe_to_run_without_authorization, true);
});

test("PAP2 emulador não conta como aparelho físico", () => {
  const r = evaluateActivationPreflight(base({ emulator_devices: 1 }));
  assert.equal(
    r.checks.find((x) => x.id === "E1_PHYSICAL_ANDROID")?.status,
    "BLOCKED",
  );
});

test("PAP3 aparelho físico conectado é pré-condição, não prova a bateria", () => {
  const r = evaluateActivationPreflight(base({ physical_devices: 1 }));
  const c = r.checks.find((x) => x.id === "E1_PHYSICAL_ANDROID");
  assert.equal(c?.status, "PASS");
  assert.match(c?.detail ?? "", /bateria de campo ainda precisa/);
});

test("PAP4 URL operacional presente não inventa deploy", () => {
  const r = evaluateActivationPreflight(
    base({ operational_db_url_present: true }),
  );
  assert.equal(
    r.checks.find((x) => x.id === "E2_OPERATIONAL_DB_AND_DEPLOY")?.status,
    "PRESENT_UNVERIFIED",
  );
});

test("PAP5 toggle source-ingest true não inventa ativação", () => {
  const r = evaluateActivationPreflight(
    base({ source_ingest_requested: true }),
  );
  assert.equal(
    r.checks.find((x) => x.id === "E3_SOURCE_INGEST_ACTIVATION")?.status,
    "PRESENT_UNVERIFIED",
  );
});

test("PAP6 consumer_live OFF permanece SAFE_OFF", () => {
  const r = evaluateActivationPreflight(base());
  assert.equal(
    r.checks.find((x) => x.id === "E4_CONSUMER_LIVE")?.status,
    "SAFE_OFF",
  );
});

test("PAP7 senha reader presente sem prova de criação não vira PASS", () => {
  const r = evaluateActivationPreflight(
    base({ product_reader_password_present: true }),
  );
  assert.equal(
    r.checks.find((x) => x.id === "E6_PRODUCT_READER_CREDENTIAL")?.status,
    "PRESENT_UNVERIFIED",
  );
});

test("PAP8 reader só passa com STATE CREATED + presença local", () => {
  const r = evaluateActivationPreflight(
    base({
      product_reader_password_present: true,
      product_reader_credential: "CREATED",
    }),
  );
  assert.equal(
    r.checks.find((x) => x.id === "E6_PRODUCT_READER_CREDENTIAL")?.status,
    "PASS",
  );
});

test("PAP9 resultado não possui campo para valores secretos", () => {
  const r = evaluateActivationPreflight(
    base({
      operational_db_url_present: true,
      product_reader_password_present: true,
    }),
  ) as unknown as Record<string, unknown>;
  const text = JSON.stringify(r);
  assert.doesNotMatch(text, /postgres:\/\//i);
  assert.doesNotMatch(text, /password_value|secret_value|credential_value/i);
});

console.log("PILOT_ACTIVATION_PREFLIGHT_TESTS:", passed + "/9 PASS");
