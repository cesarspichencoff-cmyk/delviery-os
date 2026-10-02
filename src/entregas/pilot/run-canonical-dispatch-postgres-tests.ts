import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bancoIsolado, type BancoIsolado } from "../../platform/banco-isolado";
import {
  AparelhoLogico,
  KEY_DEVICE_SECRET,
} from "../../platform/aparelho-logico";
import { hashDoSegredo } from "../../platform/auth/device-session";

const ROOT = process.cwd();
const URL_PG = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const UNIT = "unit-piloto-1";
const ACTOR = "rid-canonical-pg";
const TRIP = "trip-canonical-pg";
const READ_SECRET = "fixture-canonical-pg-read-".padEnd(48, "x");
const TOKEN_SECRET = "fixture-canonical-pg-device-".padEnd(48, "y");
const ADMIN_TOKEN = "CHANGE_ME_ADMIN_TOKEN";
const RIDER_TOKEN = "CHANGE_ME_RIDER_TOKEN";

interface Proc {
  child: ChildProcess;
  base: string;
  log: string[];
  dir?: string;
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

async function waitHealth(base: string, log: string[], path = "/api/health"): Promise<void> {
  for (let i = 0; i < 150; i += 1) {
    try {
      const r = await fetch(base + path);
      if (r.status >= 200 && r.status < 500) return;
    } catch { /* subindo */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("processo não subiu: " + log.join("").slice(-1200));
}

async function startCritical(b: BancoIsolado): Promise<Proc> {
  const port = await freePort();
  const env = {
    ...process.env,
    DELIVERYOS_ENV: "local",
    DELIVERYOS_DATABASE_URL: b.url,
    DELIVERYOS_MIGRATE_ON_BOOT: "false",
    DELIVERYOS_DEVICE_TOKEN_SECRET: TOKEN_SECRET,
    DELIVERYOS_PILOT_READ_SECRETS: JSON.stringify({ [UNIT]: READ_SECRET }),
    DELIVERYOS_SOURCE_MODE: "simulated",
    DELIVERYOS_PORT: String(port),
    DELIVERYOS_TICK_MS: "200",
  };
  const child = spawn(process.execPath, [join(ROOT, "dist/src/platform/bin/critical.js")], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const log: string[] = [];
  child.stdout?.on("data", (d) => log.push(String(d)));
  child.stderr?.on("data", (d) => log.push(String(d)));
  const base = `http://127.0.0.1:${port}`;
  await waitHealth(base, log, "/ready");
  return { child, base, log };
}

async function startPilot(platformBase: string, secret: string): Promise<Proc> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "canonical-dispatch-pg-"));
  const env = {
    ...process.env,
    ENTREGAS_UI_PORT: String(port),
    ENTREGAS_PILOT_CONFIG: "config/entregas-pilot.example.json",
    ENTREGAS_DATA_DIR: join(dir, "data"),
    ENTREGAS_PLATFORM_URL: platformBase,
    ENTREGAS_PLATFORM_READ_SECRET: secret,
  };
  delete (env as Record<string, string | undefined>).ENTREGAS_BIND;
  delete (env as Record<string, string | undefined>).ENTREGAS_HTTPS;
  const child = spawn(process.execPath, [join(ROOT, "dist/tools/entregas_pilot_server.js")], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const log: string[] = [];
  child.stdout?.on("data", (d) => log.push(String(d)));
  child.stderr?.on("data", (d) => log.push(String(d)));
  const base = `http://127.0.0.1:${port}`;
  await waitHealth(base, log);
  return { child, base, log, dir };
}

async function stop(p: Proc | null): Promise<void> {
  if (!p) return;
  try {
    if (p.child.pid) {
      if (process.platform === "win32") {
        execFileSync("taskkill", ["/PID", String(p.child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(-p.child.pid, "SIGTERM");
      }
    }
  } catch { /* já saiu */ }
  if (p.dir) rmSync(p.dir, { recursive: true, force: true });
}

async function get(base: string, path: string, token: string) {
  const r = await fetch(base + path, {
    headers: { authorization: "Bearer " + token },
  });
  return { status: r.status, body: await r.json() as Record<string, unknown> };
}

async function authorizeDevice(b: BancoIsolado, ap: AparelhoLogico): Promise<void> {
  const proof = hashDoSegredo(ap.db.get(KEY_DEVICE_SECRET)!);
  await b.cliente.query(
    `INSERT INTO identity.unit(unit_id, display_name) VALUES ($1, 'Canonical PG') ON CONFLICT DO NOTHING`,
    [UNIT],
  );
  await b.cliente.query(
    `INSERT INTO identity.actor(actor_id, unit_id, role, label)
     VALUES ($1, $2, 'motoboy_interno', 'Rider Canonical PG')
     ON CONFLICT DO NOTHING`,
    [ACTOR, UNIT],
  );
  await b.cliente.query(
    `INSERT INTO identity.device(device_id, unit_id, actor_id, label, secret_hash, secret_bound_at)
     VALUES ($1, $2, $3, 'Device Canonical PG', $4, now())`,
    [ap.deviceId, UNIT, ACTOR, proof],
  );
}

async function main(): Promise<void> {
  if (!URL_PG) {
    console.log("CANONICAL_DISPATCH_POSTGRES_PULADO DELIVERYOS_PG_URL ausente");
    return;
  }

  const b = await bancoIsolado(URL_PG, undefined, "dispatchpg");
  const deviceDir = mkdtempSync(join(tmpdir(), "canonical-dispatch-device-"));
  let critical: Proc | null = null;
  let pilot: Proc | null = null;
  let badSecretPilot: Proc | null = null;
  let passed = 0;
  const ok = async (name: string, fn: () => void | Promise<void>) => {
    await fn();
    passed += 1;
    console.log("ok", name);
  };

  try {
    critical = await startCritical(b);
    const ap = new AparelhoLogico({ diretorio: deviceDir, plataformaUrl: critical.base });
    await authorizeDevice(b, ap);

    const t1 = new Date(Date.now() - 20_000).toISOString();
    const t2 = new Date(Date.now() - 10_000).toISOString();
    ap.capturar(TRIP, -23.581, -46.675, t1);
    ap.capturar(TRIP, -23.582, -46.676, t2);
    assert.equal(await ap.sincronizar(), "success");

    await ok("PG1 PostgreSQL recebeu dois fatos GPS reais do runtime crítico", async () => {
      const rows = await b.cliente.query(
        `SELECT event_type, object_id, unit_id, source_mode, payload
           FROM platform.event_log
          WHERE device_id = $1
          ORDER BY sequence_local`,
        [ap.deviceId],
      );
      assert.equal(rows.length, 2);
      assert.equal(rows.every((r) => r.event_type === "gps_batch_received"), true);
      assert.equal(rows.every((r) => r.object_id === TRIP), true);
      assert.equal(rows.every((r) => r.unit_id === UNIT), true);
      assert.equal(rows.every((r) => r.source_mode === "simulated"), true);
    });

    pilot = await startPilot(critical.base, READ_SECRET);

    await ok("PG2 piloto lê localização canônica do PostgreSQL via runtime crítico real", async () => {
      const r = await get(pilot!.base, `/api/trip/location?trip_id=${TRIP}`, ADMIN_TOKEN);
      assert.equal(r.status, 200);
      assert.equal(r.body.source, "platform.event_log");
      assert.equal(r.body.point_count, 2);
      assert.equal(r.body.coordinates_visible, true);
      const last = r.body.last_point as Record<string, unknown>;
      assert.equal(last.latitude, -23.582);
      assert.equal(last.longitude, -46.676);
    });

    await ok("PG3 rota canônica devolve os dois pontos persistidos, em ordem", async () => {
      const r = await get(pilot!.base, `/api/trip/route?trip_id=${TRIP}`, ADMIN_TOKEN);
      assert.equal(r.status, 200);
      assert.equal(r.body.source, "platform.event_log");
      const bruto = r.body.bruto as Record<string, unknown>;
      assert.equal(bruto.raw_count, 2);
      const points = bruto.points as Array<Record<string, unknown>>;
      assert.equal(points.length, 2);
      assert.equal(points[0].latitude, -23.581);
      assert.equal(points[1].latitude, -23.582);
    });

    await ok("PG4 motoboy recebe metadata sem coordenadas", async () => {
      const r = await get(pilot!.base, `/api/trip/location?trip_id=${TRIP}`, RIDER_TOKEN);
      assert.equal(r.status, 200);
      assert.equal(r.body.point_count, 2);
      assert.equal(r.body.coordinates_visible, false);
      assert.equal("last_point" in r.body && r.body.last_point !== undefined, false);
    });

    await ok("PG5 ingestão GPS legada do piloto continua tombstone sem fallback", async () => {
      const r = await fetch(pilot!.base + "/api/gps/batch", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + RIDER_TOKEN },
        body: JSON.stringify({ points: [] }),
      });
      const body = await r.json() as Record<string, unknown>;
      assert.equal(r.status, 503);
      assert.equal(body.code, "gps_ingest_moved_to_platform");
    });

    badSecretPilot = await startPilot(critical.base, "wrong-secret-".padEnd(48, "z"));
    await ok("PG6 segredo interno divergente falha fechado, sem fallback para RAM", async () => {
      const r = await get(
        badSecretPilot!.base,
        `/api/trip/location?trip_id=${TRIP}`,
        ADMIN_TOKEN,
      );
      assert.equal(r.status, 401);
      assert.equal(r.body.code, "canonical_location_unavailable");
    });

    console.log(`CANONICAL_DISPATCH_POSTGRES_GREEN ${passed}/6`);
  } finally {
    await stop(badSecretPilot);
    await stop(pilot);
    await stop(critical);
    rmSync(deviceDir, { recursive: true, force: true });
    await b.descartar();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
