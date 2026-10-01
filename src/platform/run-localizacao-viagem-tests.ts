import assert from "node:assert/strict";
import {
  lerLocalizacaoCanonicaDaViagem,
} from "./leitura/localizacao-de-viagem";
import type {
  SqlClient,
  SqlRow,
  TransactionalSqlClient,
} from "./persistence/sql-client";

type QueryCall = { sql: string; params: readonly unknown[] };

class FakeClient implements TransactionalSqlClient {
  calls: QueryCall[] = [];
  constructor(private readonly rows: SqlRow[]) {}

  async query<T extends SqlRow = SqlRow>(
    _sql: string,
    _params: readonly unknown[] = [],
  ): Promise<T[]> {
    throw new Error("leitura fora de transaction");
  }

  async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
    const tx: SqlClient = {
      query: async <R extends SqlRow = SqlRow>(
        sql: string,
        params: readonly unknown[] = [],
      ): Promise<R[]> => {
        this.calls.push({ sql, params });
        if (/SET TRANSACTION READ ONLY/.test(sql)) return [];
        if (/FROM platform\.event_log/.test(sql)) return this.rows as R[];
        throw new Error(`SQL inesperado: ${sql}`);
      },
    };
    return fn(tx);
  }

  async close(): Promise<void> {}
}

const row = (over: Partial<SqlRow> = {}): SqlRow => ({
  event_id: "ev-1",
  idempotency_key: "gps:k1",
  unit_id: "ITAIM",
  object_id: "trip-1",
  device_id: "dev-1",
  actor_id: "rider-1",
  occurred_at: "2026-10-01T08:00:00.000Z",
  recorded_at: "2026-10-01T08:00:02.000Z",
  source_mode: "real",
  sequence_local: 10,
  clock_trust: "trusted",
  payload: {
    latitude: -23.581,
    longitude: -46.675,
    accuracy_m: 12,
    speed_mps: 4.2,
    heading_deg: 90,
    captured_offline: false,
  },
  ...over,
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

async function main(): Promise<void> {
await test("porta exige leitura transacional e filtra unidade + viagem + modo", async () => {
  const c = new FakeClient([
    row(),
    row({
      event_id: "ev-2",
      idempotency_key: "gps:k2",
      sequence_local: 11,
      occurred_at: "2026-10-01T08:00:20.000Z",
      recorded_at: "2026-10-01T08:00:21.000Z",
      payload: {
        latitude: -23.582,
        longitude: -46.676,
        accuracy_m: 18,
        provider: "fused",
        captured_offline: true,
      },
    }),
  ]);
  const r = await lerLocalizacaoCanonicaDaViagem(c, {
    unit_id: "ITAIM",
    trip_id: "trip-1",
    source_mode: "real",
  });

  assert.equal(c.calls.length, 2);
  assert.match(c.calls[0].sql, /SET TRANSACTION READ ONLY/);
  assert.match(c.calls[1].sql, /event_type = 'gps_batch_received'/);
  assert.match(c.calls[1].sql, /unit_id = \$1/);
  assert.match(c.calls[1].sql, /object_id = \$2/);
  assert.match(c.calls[1].sql, /source_mode = \$3/);
  assert.deepEqual(c.calls[1].params, ["ITAIM", "trip-1", "real"]);
  assert.equal(r.fonte, "platform.event_log");
  assert.equal(r.point_count, 2);
  assert.equal(r.points[0].latitude, -23.581);
  assert.equal(r.points[1].captured_offline, true);
  assert.equal(r.points[1].provider, "fused");
  assert.equal(r.last_point?.sequence_local, 11);
});

await test("payload GPS corrompido falha fechado em vez de sumir silenciosamente", async () => {
  const c = new FakeClient([
    row({
      event_id: "ev-bad",
      payload: { latitude: 999, longitude: -46.67, accuracy_m: 10 },
    }),
  ]);
  await assert.rejects(
    () =>
      lerLocalizacaoCanonicaDaViagem(c, {
        unit_id: "ITAIM",
        trip_id: "trip-1",
        source_mode: "real",
      }),
    /fato GPS inválido/,
  );
});

await test("ausência é zero medido, não posição inventada", async () => {
  const c = new FakeClient([]);
  const r = await lerLocalizacaoCanonicaDaViagem(c, {
    unit_id: "ITAIM",
    trip_id: "trip-sem-pontos",
    source_mode: "real",
  });
  assert.equal(r.point_count, 0);
  assert.deepEqual(r.points, []);
  assert.equal(r.last_point, undefined);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log(`LOCALIZACAO_CANONICA_GREEN ${passed}/3`);
}

void main();
