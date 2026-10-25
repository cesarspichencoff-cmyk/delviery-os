/**
 * Boot do piloto com a chave do produtor do feed — processo REAL, binário de
 * `dist/` (o mesmo que roda no container), nada de import em memória.
 *
 *   PSB1 chave configurada pela metade: recusa subir (78), sem ecoar segredo
 *   PSB2 chave que não é Ed25519: recusa subir (78)
 *   PSB3 sem chave: sobe e declara que a outbox sai sem atestação
 *   PSB4 chave completa: sobe, declara producer/kid, e cada registro que a
 *        API grava na outbox carrega `pa1` verificável pela chave PÚBLICA,
 *        com o evento assinado igual ao do registro
 *
 * Chaves geradas em memória. Nenhuma plataforma, nenhum banco, nenhum modo real.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assinaturaConfere,
  claimsDoContrato,
  decodificarAtestacao,
  eventoCanonicoIgual,
} from "../contracts/producer-attestation";

const ROOT = process.cwd();
const OPS = "CHANGE_ME_OPS_TOKEN";
const PILOT_UNIT = "ITAIM";
const PILOTO = join(ROOT, "dist", "tools", "entregas_pilot_server.js");

let passed = 0;
const falhas: string[] = [];
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log("  ok  " + nome);
  } catch (e) {
    falhas.push(nome);
    console.log("  XX  " + nome + ": " + (e instanceof Error ? e.message.split("\n")[0] : String(e)));
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

interface Proc { proc: ChildProcess; log: string[]; dir: string; port: number }

async function iniciar(extra: NodeJS.ProcessEnv): Promise<Proc> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "producer-boot-"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ENTREGAS_UI_PORT: String(port),
    ENTREGAS_PILOT_CONFIG: "config/entregas-pilot.example.json",
    ENTREGAS_DATA_DIR: join(dir, "data"),
    ENTREGAS_LABORATORIO: "1",
    ...extra,
  };
  for (const v of ["ENTREGAS_BIND", "ENTREGAS_HTTPS", "ENTREGAS_PLATFORM_URL"]) delete env[v];
  const proc = spawn(process.execPath, [PILOTO], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  const log: string[] = [];
  proc.stdout?.on("data", (d) => log.push(String(d)));
  proc.stderr?.on("data", (d) => log.push(String(d)));
  return { proc, log, dir, port };
}

function saida(p: Proc, ms = 20_000): Promise<number | null> {
  return new Promise((resolve) => {
    if (p.proc.exitCode !== null) return resolve(p.proc.exitCode);
    const t = setTimeout(() => resolve(null), ms);
    p.proc.once("exit", (code) => { clearTimeout(t); resolve(code); });
  });
}

async function saudavel(p: Proc): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${p.port}/api/health`);
      if (r.ok) return;
    } catch { /* subindo */ }
    if (p.proc.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("piloto não subiu: " + p.log.join("").slice(-400));
}

async function encerrar(p: Proc): Promise<void> {
  if (p.proc.exitCode === null) {
    p.proc.kill("SIGTERM");
    if ((await saida(p, 5_000)) === null) p.proc.kill("SIGKILL");
  }
  rmSync(p.dir, { recursive: true, force: true });
}

async function post(port: number, path: string, body: unknown) {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${OPS}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() as Record<string, unknown> };
}

async function main(): Promise<void> {
  console.log("\n=== PILOTO — BOOT COM CHAVE DE PRODUTOR (PROCESSO REAL) ===\n");
  execFileSync(process.execPath, [join(ROOT, "node_modules", "typescript", "bin", "tsc")], {
    cwd: ROOT, stdio: "ignore", timeout: 600_000,
  });

  const par = generateKeyPairSync("ed25519");
  const privadaB64 = par.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");

  await teste("PSB1 chave pela metade recusa subir (78) sem ecoar segredo", async () => {
    const p = await iniciar({ ENTREGAS_PRODUCER_SIGNING_KEY_B64: privadaB64, ENTREGAS_PRODUCER_ID: "LAB_PILOTO" });
    try {
      assert.equal(await saida(p), 78);
      const texto = p.log.join("");
      assert.match(texto, /chave de produtor do feed invalida: boot recusado/);
      assert.ok(!texto.includes(privadaB64.slice(0, 24)), "o log não pode conter a chave");
    } finally { await encerrar(p); }
  });

  await teste("PSB2 chave que não é Ed25519 recusa subir (78)", async () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey
      .export({ format: "der", type: "pkcs8" }).toString("base64");
    const p = await iniciar({
      ENTREGAS_PRODUCER_SIGNING_KEY_B64: rsa, ENTREGAS_PRODUCER_ID: "LAB_PILOTO", ENTREGAS_PRODUCER_KEY_ID: "k1",
    });
    try { assert.equal(await saida(p), 78); } finally { await encerrar(p); }
  });

  await teste("PSB3 sem chave sobe e declara outbox sem atestação", async () => {
    const p = await iniciar({});
    try {
      await saudavel(p);
      assert.match(p.log.join(""), /atestacao do produtor do feed: NAO/);
    } finally { await encerrar(p); }
  });

  await teste("PSB4 chave completa: outbox gravada pela API sai com pa1 verificável pela chave pública", async () => {
    const p = await iniciar({
      ENTREGAS_PRODUCER_SIGNING_KEY_B64: privadaB64, ENTREGAS_PRODUCER_ID: "LAB_PILOTO", ENTREGAS_PRODUCER_KEY_ID: "k1",
    });
    try {
      await saudavel(p);
      const texto = p.log.join("");
      assert.match(texto, /atestacao do produtor do feed: SIM \(LAB_PILOTO\/k1\)/);
      assert.ok(!texto.includes(privadaB64.slice(0, 24)));
      const trip = "PSB-T1";
      assert.equal((await post(p.port, "/api/ready-order", { order_ref: "P-" + trip, label: "Pedido lab" })).status, 200);
      const criado = await post(p.port, "/api/command", {
        type: "CreateTrip", command_id: "create-" + trip, occurred_at: new Date().toISOString(),
        unit_id: PILOT_UNIT, trip_id: trip, courier_actor_id: "rid-1",
        deliveries: [{ delivery_id: "D-" + trip, order_ref: "P-" + trip }],
        actor: { actor_id: "ops-console-1", role: "operador_expedicao" },
      });
      assert.equal((criado.body.result as { ok?: boolean })?.ok, true, JSON.stringify(criado.body));
      const store = JSON.parse(readFileSync(join(p.dir, "data", "store.json"), "utf8")) as {
        outbox: Array<{ event: Record<string, unknown>; attestation?: string }>;
      };
      assert.ok(store.outbox.length >= 2, "trip_created + delivery_added");
      for (const r of store.outbox) {
        const d = decodificarAtestacao(r.attestation);
        assert.ok(d.ok, "registro sem pa1");
        assert.ok(assinaturaConfere(d, par.publicKey), "assinatura não confere com a chave pública");
        const c = claimsDoContrato(d.bruto);
        assert.ok(c && c.producer_id === "LAB_PILOTO" && c.kid === "k1");
        assert.ok(eventoCanonicoIgual(c.event, r.event), "evento assinado difere do registro");
      }
    } finally { await encerrar(p); }
  });

  if (falhas.length) {
    console.log(`\nPRODUCER_SIGNING_BOOT: ${passed}/${passed + falhas.length} — ${falhas.length} FALHA(S)`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nPRODUCER_SIGNING_BOOT: ${passed}/${passed} PASS (BINARIO DE dist/, CHAVES FICTICIAS)`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
