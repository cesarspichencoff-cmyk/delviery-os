import assert from "node:assert/strict";
import { decidirControleDeCaptura } from "./capture-control";
import { consultarIdentidadeDoAparelho } from "./device-identity-client";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; }
  catch (e) { throw new Error(`${name}: ${e instanceof Error ? e.message : String(e)}`); }
}

const identity = { device_id: "dev-1", unit_id: "ITAIM", actor_id: "rid-1" };
const trip = (state: string, rider = "rid-1", unit = "ITAIM") => ({
  trip_id: "T-1", unit_id: unit, courier_actor_id: rider, state,
});

async function main() {
  for (const state of ["em_rota", "retornando", "sem_atualizacao"]) {
    await test(`mantém captura em ${state}`, () => {
      assert.equal(decidirControleDeCaptura(identity, "T-1", trip(state)).decision, "continue");
    });
  }

  for (const state of ["preparando_saida", "encerrada"]) {
    await test(`para captura em ${state}`, () => {
      assert.equal(decidirControleDeCaptura(identity, "T-1", trip(state)).decision, "stop");
    });
  }

  await test("estado futuro/desconhecido é UNKNOWN, nunca stop", () => {
    const r = decidirControleDeCaptura(identity, "T-1", trip("novo_estado_futuro"));
    assert.equal(r.decision, "unknown");
    assert.equal(r.reason, "trip_state_unknown");
  });

  await test("viagem ausente para", () => {
    assert.equal(decidirControleDeCaptura(identity, "T-1", null).decision, "stop");
  });
  await test("reatribuição ou unidade divergente para", () => {
    assert.equal(decidirControleDeCaptura(identity, "T-1", trip("em_rota", "rid-2")).decision, "stop");
    assert.equal(decidirControleDeCaptura(identity, "T-1", trip("em_rota", "rid-1", "PINHEIROS")).decision, "stop");
  });

  await test("device sem actor é UNKNOWN, nunca stop", () => {
    assert.equal(
      decidirControleDeCaptura({ ...identity, actor_id: null }, "T-1", trip("em_rota")).decision,
      "unknown",
    );
  });

  const fake = (status: number, body: Record<string, unknown>) =>
    (async () => new Response(JSON.stringify(body), {
      status, headers: { "content-type": "application/json" },
    })) as typeof fetch;

  await test("identity 200 devolve só identidade", async () => {
    const r = await consultarIdentidadeDoAparelho({
      platformBaseUrl: "https://platform.test", authorization: "Bearer x",
      fetchImpl: fake(200, identity),
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.identity.actor_id, "rid-1");
  });

  await test("identity renovável e terminal ficam distintos", async () => {
    const renew = await consultarIdentidadeDoAparelho({
      platformBaseUrl: "https://platform.test", authorization: "Bearer x",
      fetchImpl: fake(403, { instrucao: "renovar_e_repetir", humano: "renove" }),
    });
    assert.deepEqual(renew.ok ? null : renew.kind, "renew");    const terminal = await consultarIdentidadeDoAparelho({
      platformBaseUrl: "https://platform.test", authorization: "Bearer x",
      fetchImpl: fake(403, { instrucao: "parar_e_avisar", humano: "revogado" }),
    });
    assert.deepEqual(terminal.ok ? null : terminal.kind, "terminal");
  });

  await test("403 genérico não vira revogação terminal", async () => {
    const r = await consultarIdentidadeDoAparelho({
      platformBaseUrl: "https://platform.test", authorization: "Bearer x",
      fetchImpl: fake(403, { human: "bloqueado por camada intermediária" }),
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.kind, "unavailable");
  });

  await test("plataforma ausente é unavailable", async () => {
    const r = await consultarIdentidadeDoAparelho({
      platformBaseUrl: "", authorization: "Bearer x", fetchImpl: fake(200, identity),
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.kind, "unavailable");
  });

  console.log(`CAPTURE_CONTROL: ${passed}/13 PASS`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
