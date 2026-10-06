/**
 * B5 — prova HTTP local do runtime critico contra PostgreSQL isolado.
 *
 * Aqui se prova a ligacao que testes puros nao enxergam:
 * Android contract -> POST /api/device/queue-depth -> critical.ts ->
 * autenticacao do aparelho -> PgDeviceRegistry -> identity.device.
 */

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

import { bancoIsolado } from "./banco-isolado";
import { emitirToken } from "./auth/device-token";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
if (!URL_BASE) {
  console.error("DELIVERYOS_PG_URL_REQUIRED");
  process.exit(78);
}

const SEGREDO = "h".repeat(48);
const DEVICE = "device-b5-http";
const UNIDADE = "ITAIM";
const PORTA = 9300 + Math.floor(Math.random() * 400);

function token(): string {
  return emitirToken({
    device_id: DEVICE,
    unit_id: UNIDADE,
    actor_id: "rider-b5-http",
    issued_by: "fixture-b5-http",
    agora: new Date(),
    validade_s: 3600,
    segredo: SEGREDO,
  }).token;
}

async function aguardarHttp(filho: ChildProcess, limiteMs = 15_000): Promise<void> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (filho.exitCode !== null) {
      throw new Error(`critical encerrou antes de ouvir: ${filho.exitCode}`);
    }
    try {
      const r = await fetch(`http://127.0.0.1:${PORTA}/health`);
      if (r.status === 200 || r.status === 503) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("critical nao abriu HTTP no prazo");
}

async function post(corpo: unknown, authorization?: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${PORTA}/api/device/queue-depth`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(corpo),
  });
}

async function main(): Promise<void> {
  const b = await bancoIsolado(URL_BASE, undefined, "b5http");
  let filho: ChildProcess | null = null;
  let saida = "";

  try {
    await b.cliente.query(
      `INSERT INTO identity.unit(unit_id, display_name)
       VALUES ('ITAIM', 'Itaim')`,
    );
    await b.cliente.query(
      `INSERT INTO identity.actor(actor_id, unit_id, role, label)
       VALUES ('rider-b5-http', 'ITAIM', 'motoboy_interno', 'Rider B5 HTTP')`,
    );
    await b.cliente.query(
      `INSERT INTO identity.device(
         device_id, unit_id, actor_id, label, secret_hash, secret_bound_at
       ) VALUES ($1, 'ITAIM', 'rider-b5-http', 'Aparelho B5 HTTP', 'fixturehash', now())`,
      [DEVICE],
    );

    const bin = join(process.cwd(), "dist/src/platform/bin/critical.js");
    filho = spawn(process.execPath, [bin], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DELIVERYOS_ENV: "local",
        DELIVERYOS_DATABASE_URL: b.url,
        DELIVERYOS_MIGRATE_ON_BOOT: "false",
        DELIVERYOS_DEVICE_TOKEN_SECRET: SEGREDO,
        DELIVERYOS_PORT: String(PORTA),
        DELIVERYOS_SOURCE_MODE: "control",
        DELIVERYOS_TICK_MS: "1000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    filho.stdout?.on("data", (d: Buffer) => { saida += d.toString(); });
    filho.stderr?.on("data", (d: Buffer) => { saida += d.toString(); });

    await aguardarHttp(filho);

    const semAuth = await post({ pending_points: 1, pending_events: 2 });
    assert.equal(semAuth.status, 401);
    const antes = await b.cliente.query(
      `SELECT queue_depth_reported_at FROM identity.device WHERE device_id=$1`,
      [DEVICE],
    );
    assert.equal(antes[0]?.queue_depth_reported_at, null);

    const valido = await post(
      { pending_points: 7, pending_events: 3 },
      `Bearer ${token()}`,
    );
    assert.equal(valido.status, 200, await valido.text());

    const lido = await b.cliente.query<{
      queue_pending_points: number;
      queue_pending_events: number;
      queue_depth_reported_at: unknown;
    }>(
      `SELECT queue_pending_points, queue_pending_events, queue_depth_reported_at
         FROM identity.device WHERE device_id=$1`,
      [DEVICE],
    );
    assert.equal(Number(lido[0]?.queue_pending_points), 7);
    assert.equal(Number(lido[0]?.queue_pending_events), 3);
    assert.ok(lido[0]?.queue_depth_reported_at);

    const extra = await post(
      { pending_points: 99, pending_events: 99, latitude: -23.5 },
      `Bearer ${token()}`,
    );
    assert.equal(extra.status, 400);
    const depoisExtra = await b.cliente.query(
      `SELECT queue_pending_points, queue_pending_events
         FROM identity.device WHERE device_id=$1`,
      [DEVICE],
    );
    assert.equal(Number(depoisExtra[0]?.queue_pending_points), 7);
    assert.equal(Number(depoisExtra[0]?.queue_pending_events), 3);

    await b.cliente.query(
      `UPDATE identity.device SET revoked_at=now(), revoked_by='fixture'
        WHERE device_id=$1`,
      [DEVICE],
    );
    const revogado = await post(
      { pending_points: 8, pending_events: 4 },
      `Bearer ${token()}`,
    );
    assert.equal(revogado.status, 403);

    const final = await b.cliente.query(
      `SELECT queue_pending_points, queue_pending_events
         FROM identity.device WHERE device_id=$1`,
      [DEVICE],
    );
    assert.equal(Number(final[0]?.queue_pending_points), 7);
    assert.equal(Number(final[0]?.queue_pending_events), 3);

    assert.equal(saida.includes("pending_points"), false, "contador vazou em log do critical");
    assert.equal(saida.includes("latitude"), false, "payload recusado vazou em log do critical");

    console.log("B5_QUEUE_DEPTH_HTTP_PG: 8/8 PASS");
  } finally {
    if (filho && filho.exitCode === null) {
      filho.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (filho && filho.exitCode === null) filho.kill("SIGKILL");
          resolve();
        }, 3000);
        filho!.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    await b.descartar().catch(() => undefined);
  }
}

void main();
