import assert from "node:assert/strict";

import { emitirToken } from "./auth/device-token";
import type { DispositivoConhecido, RegistroDeDispositivos } from "./ingest/device-ingest";
import {
  DEVICE_STATUS_MAX_COUNT,
  DEVICE_STATUS_VERSION,
  tratarStatusDoDispositivo,
  type RegistroDeStatusDoDispositivo,
} from "./runtime/rota-status-dispositivo";

const SEGREDO = "q".repeat(40);
const AGORA = new Date("2026-10-04T12:00:00.000Z");

const APARELHO: DispositivoConhecido = {
  device_id: "dev-status-1",
  unit_id: "ITAIM",
  actor_id: "rid-1",
};

const REGISTRO: RegistroDeDispositivos = {
  buscar: async (id) => {
    if (id === "dev-status-1") return APARELHO;
    if (id === "dev-revogado") {
      return {
        device_id: "dev-revogado",
        unit_id: "ITAIM",
        actor_id: "rid-2",
        revoked_at: "2026-10-03T00:00:00.000Z",
      };
    }
    return null;
  },
};

function token(device_id = "dev-status-1", unit_id = "ITAIM"): string {
  return emitirToken({
    device_id,
    unit_id,
    actor_id: "rid-1",
    issued_by: "test",
    agora: AGORA,
    segredo: SEGREDO,
  }).token;
}

type Gravacao = {
  device_id: string;
  pending_points: number;
  pending_events: number;
  rejected_points: number;
  source_mode: "real" | "simulated" | "control";
  at: string;
};

function sink(graves: Gravacao[]): RegistroDeStatusDoDispositivo {
  return {
    registrarStatus: async (device_id, dados) => {
      graves.push({
        device_id,
        pending_points: dados.pending_points,
        pending_events: dados.pending_events,
        rejected_points: dados.rejected_points,
        source_mode: dados.source_mode,
        at: dados.agora.toISOString(),
      });
    },
  };
}

let passed = 0;
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log("PASS", name);
}

async function main(): Promise<void> {
await test("DST1 status valido grava só contadores e modo do servidor", async () => {
  const graves: Gravacao[] = [];
  const r = await tratarStatusDoDispositivo(
    { authorization: `Bearer ${token()}` },
    {
      pending_points: 7,
      pending_events: 2,
      rejected_points: 1,
    },
    {
      segredo: SEGREDO,
      registro: REGISTRO,
      status: sink(graves),
      source_mode: "real",
      agora: () => new Date(AGORA),
    },
  );

  assert.equal(r.status, 200);
  assert.equal(graves.length, 1);
  assert.deepEqual(graves[0], {
    device_id: "dev-status-1",
    pending_points: 7,
    pending_events: 2,
    rejected_points: 1,
    source_mode: "real",
    at: AGORA.toISOString(),
  });
  assert.deepEqual(r.corpo, {
    ok: true,
    api_version: DEVICE_STATUS_VERSION,
    device_id: "dev-status-1",
    unit_id: "ITAIM",
    received_at: AGORA.toISOString(),
  });
  assert.equal(JSON.stringify(graves).includes("latitude"), false);
  assert.equal(JSON.stringify(graves).includes("longitude"), false);
});

await test("DST2 campos extras, inclusive device_id/localizacao, sao recusados", async () => {
  for (const extra of [
    { device_id: "dev-outro" },
    { latitude: -23.5 },
    { longitude: -46.6 },
    { payload: { qualquer: "coisa" } },
  ]) {
    const graves: Gravacao[] = [];
    const r = await tratarStatusDoDispositivo(
      { authorization: token() },
      {
        pending_points: 1,
        pending_events: 1,
        rejected_points: 0,
        ...extra,
      },
      {
        segredo: SEGREDO,
        registro: REGISTRO,
        status: sink(graves),
        source_mode: "simulated",
        agora: () => new Date(AGORA),
      },
    );
    assert.equal(r.status, 400);
    assert.equal(graves.length, 0);
  }
});

await test("DST3 sem bearer recusa e não grava", async () => {
  const graves: Gravacao[] = [];
  const r = await tratarStatusDoDispositivo(
    {},
    { pending_points: 1, pending_events: 2, rejected_points: 3 },
    {
      segredo: SEGREDO,
      registro: REGISTRO,
      status: sink(graves),
      source_mode: "real",
      agora: () => new Date(AGORA),
    },
  );
  assert.equal(r.status, 401);
  assert.equal(graves.length, 0);
});

await test("DST4 aparelho revogado recusa e não grava", async () => {
  const graves: Gravacao[] = [];
  const r = await tratarStatusDoDispositivo(
    { authorization: token("dev-revogado") },
    { pending_points: 1, pending_events: 2, rejected_points: 3 },
    {
      segredo: SEGREDO,
      registro: REGISTRO,
      status: sink(graves),
      source_mode: "real",
      agora: () => new Date(AGORA),
    },
  );
  assert.equal(r.status, 403);
  assert.equal(graves.length, 0);
});

for (const invalido of [
  { pending_points: -1, pending_events: 0, rejected_points: 0 },
  { pending_points: 1.5, pending_events: 0, rejected_points: 0 },
  { pending_points: DEVICE_STATUS_MAX_COUNT + 1, pending_events: 0, rejected_points: 0 },
  { pending_points: 0, pending_events: -1, rejected_points: 0 },
  { pending_points: 0, pending_events: 0, rejected_points: -1 },
  { pending_points: "1", pending_events: 0, rejected_points: 0 },
]) {
  await test(`DST invalid counter ${JSON.stringify(invalido)}`, async () => {
    const graves: Gravacao[] = [];
    const r = await tratarStatusDoDispositivo(
      { authorization: token() },
      invalido,
      {
        segredo: SEGREDO,
        registro: REGISTRO,
        status: sink(graves),
        source_mode: "control",
        agora: () => new Date(AGORA),
      },
    );
    assert.equal(r.status, 400);
    assert.equal(graves.length, 0);
  });
}

console.log(`DEVICE_STATUS: ${passed}/${passed} PASS`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
