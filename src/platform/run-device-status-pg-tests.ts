import assert from "node:assert/strict";

import { bancoIsolado } from "./banco-isolado";
import { emitirToken } from "./auth/device-token";
import { PgDeviceRegistry } from "./persistence/pg-repositories";
import { tratarStatusDoDispositivo } from "./runtime/rota-status-dispositivo";
import { lerRealidadeDeEntregas } from "./leitura/realidade-de-entregas";

const URL = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const SEGREDO = "device-status-pg-fixture-".padEnd(48, "x");
const AGORA = new Date("2026-10-04T15:00:00.000Z");

async function main(): Promise<void> {
  if (!URL) {
    console.log("DEVICE_STATUS_PG_PULADO DELIVERYOS_PG_URL ausente");
    return;
  }

  const b = await bancoIsolado(URL, undefined, "device_status_pg");
  try {
    await b.cliente.query(
      `INSERT INTO identity.unit(unit_id, display_name) VALUES ('ITAIM', 'Itaim')`,
    );
    await b.cliente.query(
      `INSERT INTO identity.actor(actor_id, unit_id, role, label)
       VALUES ('rid-status', 'ITAIM', 'motoboy_interno', 'Status')`,
    );
    await b.cliente.query(
      `INSERT INTO identity.device(device_id, unit_id, actor_id, label, secret_hash, secret_bound_at)
       VALUES ('dev-status-pg', 'ITAIM', 'rid-status', 'Moto status', repeat('a', 64), now())`,
    );

    const registro = new PgDeviceRegistry(b.cliente);
    const token = emitirToken({
      device_id: "dev-status-pg",
      unit_id: "ITAIM",
      actor_id: "rid-status",
      issued_by: "test",
      agora: AGORA,
      segredo: SEGREDO,
    }).token;

    const valido = await tratarStatusDoDispositivo(
      { authorization: `Bearer ${token}` },
      { pending_points: 7, pending_events: 2, rejected_points: 1 },
      {
        segredo: SEGREDO,
        registro,
        status: registro,
        source_mode: "simulated",
        agora: () => new Date(AGORA),
      },
    );
    assert.equal(valido.status, 200);

    const rows = await b.cliente.query(
      `SELECT device_id, reported_at, source_mode, pending_points, pending_events, rejected_points
         FROM identity.device_runtime_status WHERE device_id = 'dev-status-pg'`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].device_id, "dev-status-pg");
    assert.equal(new Date(String(rows[0].reported_at)).toISOString(), AGORA.toISOString());
    assert.equal(rows[0].source_mode, "simulated");
    assert.equal(Number(rows[0].pending_points), 7);
    assert.equal(Number(rows[0].pending_events), 2);
    assert.equal(Number(rows[0].rejected_points), 1);

    const proibido = await tratarStatusDoDispositivo(
      { authorization: `Bearer ${token}` },
      {
        pending_points: 99,
        pending_events: 99,
        rejected_points: 99,
        latitude: -23.5,
      },
      {
        segredo: SEGREDO,
        registro,
        status: registro,
        source_mode: "real",
        agora: () => new Date("2026-10-04T15:01:00.000Z"),
      },
    );
    assert.equal(proibido.status, 400);

    const after = await b.cliente.query(
      `SELECT source_mode, pending_points, pending_events, rejected_points
         FROM identity.device_runtime_status WHERE device_id = 'dev-status-pg'`,
    );
    assert.deepEqual(
      after.map((r) => [
        r.source_mode,
        Number(r.pending_points),
        Number(r.pending_events),
        Number(r.rejected_points),
      ]),
      [["simulated", 7, 2, 1]],
      "corpo proibido alterou o último estado válido",
    );

    const realidade = await lerRealidadeDeEntregas(b.cliente, {
      agora: AGORA,
      unit_id: "ITAIM",
    });
    const aparelho = realidade.aparelhos.find((a) => a.device_id === "dev-status-pg");
    assert.deepEqual(aparelho?.fila_local, {
      reportada_em: AGORA.toISOString(),
      source_mode: "simulated",
      pending_points: 7,
      pending_events: 2,
      rejected_points: 1,
    });

    const migrations = await b.cliente.query(
      `SELECT version FROM platform.schema_migration WHERE version = '0009_device_runtime_status'`,
    );
    assert.equal(migrations.length, 1);

    console.log("DEVICE_STATUS_PG: 8/8 PASS");
  } finally {
    await b.descartar();
  }
}

void main().catch((e) => {
  console.error("DEVICE_STATUS_PG_RED", e);
  process.exit(1);
});
