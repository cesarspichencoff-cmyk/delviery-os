import assert from "node:assert/strict";
import { emitirToken } from "./auth/device-token";
import { tratarIdentidadeDoDispositivo } from "./runtime/rota-identidade-dispositivo";
import type { RegistroDeDispositivos } from "./ingest/device-ingest";

const AGORA = new Date("2026-09-30T12:30:00.000Z");
const SEGREDO = "q019-device-token-secret-abcdefghijklmnopqrstuvwxyz";

function registro(revoked_at: string | null = null): RegistroDeDispositivos {
  return {
    buscar: async (device_id: string) =>
      device_id === "dev-q019"
        ? {
            device_id,
            unit_id: "ITAIM",
            actor_id: "rid-1",
            revoked_at,
          }
        : null,
  };
}

async function main(): Promise<void> {
  let passed = 0;
  const ok = emitirToken({
    device_id: "dev-q019",
    unit_id: "ITAIM",
    actor_id: "rid-1",
    issued_by: "teste",    agora: AGORA,
    validade_s: 3600,
    segredo: SEGREDO,
    jti: "q019-ok",
  });
  const r1 = await tratarIdentidadeDoDispositivo(
    { authorization: `Bearer ${ok.token}` },
    { segredo: SEGREDO, registro: registro(), agora: () => AGORA },
  );
  assert.equal(r1.status, 200);
  assert.equal(r1.corpo["device_id"], "dev-q019");
  assert.equal(r1.corpo["unit_id"], "ITAIM");
  assert.equal(r1.corpo["actor_id"], "rid-1");
  assert.equal("device_token" in r1.corpo, false);
  passed++;

  const expirado = emitirToken({
    device_id: "dev-q019", unit_id: "ITAIM", actor_id: "rid-1",
    issued_by: "teste", agora: new Date(AGORA.getTime() - 7200_000),
    validade_s: 60, segredo: SEGREDO, jti: "q019-exp",
  });
  const r2 = await tratarIdentidadeDoDispositivo(
    { authorization: `Bearer ${expirado.token}` },
    { segredo: SEGREDO, registro: registro(), agora: () => AGORA },
  );
  assert.equal(r2.status, 401);
  assert.equal(r2.corpo["instrucao"], "renovar_e_repetir");
  passed++;
  const r3 = await tratarIdentidadeDoDispositivo(
    { authorization: `Bearer ${ok.token}` },
    { segredo: SEGREDO, registro: registro("2026-09-30T12:00:00.000Z"), agora: () => AGORA },
  );
  assert.equal(r3.status, 403);
  assert.equal(r3.corpo["instrucao"], "parar_e_avisar");
  passed++;

  const r4 = await tratarIdentidadeDoDispositivo(
    {},
    { segredo: SEGREDO, registro: registro(), agora: () => AGORA },
  );
  assert.equal(r4.status, 401);
  assert.equal(r4.corpo["instrucao"], "renovar_e_repetir");
  passed++;

  console.log(`DEVICE_IDENTITY: ${passed}/4 PASS`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
