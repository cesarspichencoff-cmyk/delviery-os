import assert from "node:assert/strict";
import {
  emitPlatformReadAssertion,
  verifyPlatformReadAssertion,
} from "../entregas/foundation/platform-read-assertion";
import {
  handleDispatchLocation,
  handleDispatchRoute,
  loadPilotReadSecrets,
} from "./runtime/rota-localizacao-despacho";
import type {
  SqlClient,
  SqlRow,
  TransactionalSqlClient,
} from "./persistence/sql-client";

const SECRET = "fixture-read-secret-".padEnd(48, "x");
const NOW = new Date("2026-10-01T12:00:00.000Z");

class FakeClient implements TransactionalSqlClient {
  constructor(private readonly rows: SqlRow[]) {}
  async query<T extends SqlRow = SqlRow>(): Promise<T[]> {
    throw new Error("query fora de transaction");
  }
  async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
    const tx: SqlClient = {
      query: async <R extends SqlRow = SqlRow>(sql: string): Promise<R[]> => {
        if (/SET TRANSACTION READ ONLY/.test(sql)) return [];
        if (/FROM platform\.event_log/.test(sql)) return this.rows as R[];
        throw new Error(`SQL inesperado: ${sql}`);
      },
    };
    return fn(tx);
  }
  async close(): Promise<void> {}
}

const row = (): SqlRow => ({
  event_id: "ev-1",
  idempotency_key: "gps:k1",
  unit_id: "ITAIM",
  object_id: "trip-1",
  device_id: "dev-1",
  actor_id: "rid-1",
  occurred_at: "2026-10-01T11:59:50.000Z",
  recorded_at: "2026-10-01T11:59:51.000Z",
  source_mode: "real",
  sequence_local: 1,
  clock_trust: "trusted",
  payload: {
    latitude: -23.5,
    longitude: -46.6,
    accuracy_m: 12,
    captured_offline: false,
  },
});
let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

function token(role: string, scope: "location" | "route", trip = "trip-1") {
  return emitPlatformReadAssertion({
    unit_id: "ITAIM",
    actor_id: "actor-1",
    role,
    trip_id: trip,
    scope,
    now: NOW,
    secret: SECRET,
  });
}

async function main() {
  await test("segredos por unidade são opcionais, mas inválidos falham fechado", () => {
    assert.equal(loadPilotReadSecrets({}).size, 0);
    assert.throws(
      () => loadPilotReadSecrets({ DELIVERYOS_PILOT_READ_SECRETS: "{" }),
      /JSON válido/,
    );
    assert.throws(
      () =>
        loadPilotReadSecrets({
          DELIVERYOS_PILOT_READ_SECRETS: JSON.stringify({ ITAIM: "curto" }),
        }),
      /ao menos/,
    );
    assert.throws(
      () =>
        loadPilotReadSecrets({
          DELIVERYOS_PILOT_READ_SECRETS: JSON.stringify({
            ITAIM: "GERE_UM_SEGREDO_DE_32_CARACTERES_OU_MAIS",
          }),
        }),
      /placeholder/,
    );
    const m = loadPilotReadSecrets({
      DELIVERYOS_PILOT_READ_SECRETS: JSON.stringify({ ITAIM: SECRET }),
    });
    assert.equal(m.get("ITAIM"), SECRET);
  });

  await test("assertion é curta, específica da viagem e adulteração é recusada", () => {
    const t = token("gerente", "route");
    const ok = verifyPlatformReadAssertion(t, new Map([["ITAIM", SECRET]]), NOW);
    assert.equal(ok.ok, true);

    const changed = t.slice(0, -1) + (t.endsWith("a") ? "b" : "a");
    assert.equal(
      verifyPlatformReadAssertion(changed, new Map([["ITAIM", SECRET]]), NOW).ok,
      false,
    );
    const expired = verifyPlatformReadAssertion(
      t,
      new Map([["ITAIM", SECRET]]),
      new Date("2026-10-01T12:02:00.000Z"),
    );
    assert.equal(expired.ok, false);
  });

  await test("papel sem rota não consegue emitir assertion de rota", () => {
    assert.throws(() => token("motoboy_interno", "route"), /papel sem acesso/);
  });

  await test("location para papel sem rota traz metadata sem coordenada", async () => {
    const r = await handleDispatchLocation(
      "Bearer " + token("motoboy_interno", "location"),
      "trip-1",
      {
        cliente: new FakeClient([row()]),
        source_mode: "real",
        secretsByUnit: new Map([["ITAIM", SECRET]]),
        now: () => NOW,
      },
    );
    assert.equal(r.status, 200);
    assert.equal(r.body.point_count, 1);
    assert.equal(r.body.coordinates_visible, false);
    const last = r.body.last_observation as Record<string, unknown>;
    assert.equal(last.accuracy_m, 12);
    assert.equal("latitude" in last, false);
    assert.equal("longitude" in last, false);
  });

  await test("gerente recebe rota canônica e token não serve para outra viagem", async () => {
    const deps = {
      cliente: new FakeClient([row()]),
      source_mode: "real" as const,
      secretsByUnit: new Map([["ITAIM", SECRET]]),
      now: () => NOW,
    };
    const t = token("gerente", "route");
    const ok = await handleDispatchRoute("Bearer " + t, "trip-1", deps);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.source, "platform.event_log");
    assert.equal(ok.body.point_count, 1);
    const points = ok.body.points as Array<Record<string, unknown>>;
    assert.equal(points[0].latitude, -23.5);
    assert.equal(points[0].longitude, -46.6);

    const wrongTrip = await handleDispatchRoute("Bearer " + t, "trip-2", deps);
    assert.equal(wrongTrip.status, 403);
    assert.equal(wrongTrip.body.code, "trip_divergente");
  });

  await test("rota desconfigurada responde 503, nunca cai em fonte alternativa", async () => {
    const r = await handleDispatchLocation(undefined, "trip-1", {
      cliente: new FakeClient([row()]),
      source_mode: "real",
      secretsByUnit: new Map(),
      now: () => NOW,
    });
    assert.equal(r.status, 503);
    assert.equal(r.body.code, "dispatch_read_not_configured");
  });

  if (process.exitCode) process.exit(process.exitCode);
  console.log(`DISPATCH_CANONICAL_READ_GREEN ${passed}/6`);
}

void main();
