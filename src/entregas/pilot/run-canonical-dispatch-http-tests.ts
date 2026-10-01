import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyPlatformReadAssertion } from "../foundation/platform-read-assertion";

const ROOT = process.cwd();
const OPS = "CHANGE_ME_OPS_TOKEN";
const SECRET = "fixture-dispatch-read-".padEnd(48, "x");
const UNIT = "unit-piloto-1";

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

async function startPlatform(): Promise<{ base: string; server: Server }> {
  const port = await freePort();
  const server = createHttpServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (
      req.method !== "GET" ||
      !["/api/dispatch/trip/location", "/api/dispatch/trip/route"].includes(url.pathname)
    ) {
      res.writeHead(404).end();
      return;
    }
    const auth = typeof req.headers.authorization === "string"
      ? req.headers.authorization.replace(/^Bearer\s+/i, "")
      : undefined;
    const verified = verifyPlatformReadAssertion(
      auth,
      new Map([[UNIT, SECRET]]),
      new Date(),
    );
    if (!verified.ok) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, code: verified.reason }));
      return;
    }
    const trip = url.searchParams.get("trip_id");
    if (trip !== verified.claims.trip_id || verified.claims.unit_id !== UNIT) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, code: "claim_divergente" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    if (url.pathname.endsWith("/location")) {
      res.end(JSON.stringify({
        ok: true,
        source: "platform.event_log",
        unit_id: UNIT,
        trip_id: trip,
        source_mode: "real",
        point_count: 2,
        coordinates_visible: true,
        last_observation: {
          occurred_at: new Date(Date.now() - 10_000).toISOString(),
          recorded_at: new Date(Date.now() - 9_000).toISOString(),
          accuracy_m: 12,
          latitude: -23.5,
          longitude: -46.6,
        },
      }));
      return;
    }
    res.end(JSON.stringify({
      ok: true,
      source: "platform.event_log",
      unit_id: UNIT,
      trip_id: trip,
      source_mode: "real",
      point_count: 2,
      points: [
        {
          point_id: "p1", idempotency_key: "p1", trip_id: trip, device_id: "dev-1",
          latitude: -23.5, longitude: -46.6, accuracy_m: 12,
          occurred_at: "2026-10-01T12:00:00.000Z", recorded_at: "2026-10-01T12:00:01.000Z",
          captured_offline: false, clock_trust: "trusted",
        },
        {
          point_id: "p2", idempotency_key: "p2", trip_id: trip, device_id: "dev-1",
          latitude: -23.5001, longitude: -46.6001, accuracy_m: 10,
          occurred_at: "2026-10-01T12:00:20.000Z", recorded_at: "2026-10-01T12:00:21.000Z",
          captured_offline: false, clock_trust: "trusted",
        },
      ],
    }));
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { base: `http://127.0.0.1:${port}`, server };
}

interface Pilot {
  base: string;
  proc: ChildProcess;
  dir: string;
  log: string[];
}
async function startPilot(platformBase: string, secret: string): Promise<Pilot> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "dispatch-canonical-"));
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
  const proc = spawn(process.execPath, [join(ROOT, "dist", "tools", "entregas_pilot_server.js")], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const log: string[] = [];
  proc.stdout?.on("data", (d) => log.push(String(d)));
  proc.stderr?.on("data", (d) => log.push(String(d)));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + "/api/health");
      if (r.ok) return { base, proc, dir, log };
    } catch { /* subindo */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("piloto não subiu: " + log.join("").slice(-500));
}

async function get(base: string, path: string, token = OPS) {
  const r = await fetch(base + path, {
    headers: { authorization: "Bearer " + token },
  });
  return { status: r.status, body: await r.json() as Record<string, unknown> };
}

async function stopPilot(p: Pilot) {
  try {
    if (p.proc.pid) {
      if (process.platform === "win32") {
        execFileSync("taskkill", ["/PID", String(p.proc.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(-p.proc.pid, "SIGTERM");
      }
    }
  } catch { /* já saiu */ }
  rmSync(p.dir, { recursive: true, force: true });
}

async function main() {
  const platform = await startPlatform();
  let pilot: Pilot | null = null;
  let noSecret: Pilot | null = null;
  try {
    pilot = await startPilot(platform.base, SECRET);
    const health = await get(pilot.base, "/api/health");
    assert.equal(health.body.dispatch_location_source, "platform_event_log");
    assert.equal(health.body.dispatch_location_read_configured, true);

    const location = await get(pilot.base, "/api/trip/location?trip_id=T-CANON");
    assert.equal(location.status, 200);
    assert.equal(location.body.source, "platform.event_log");
    assert.equal(location.body.point_count, 2);
    assert.equal(location.body.coordinates_visible, true);
    const last = location.body.last_point as Record<string, unknown>;
    assert.equal(last.latitude, -23.5);
    assert.equal(last.longitude, -46.6);

    const route = await get(pilot.base, "/api/trip/route?trip_id=T-CANON");
    assert.equal(route.status, 200);
    assert.equal(route.body.source, "platform.event_log");
    const raw = route.body.bruto as Record<string, unknown>;
    assert.equal(raw.raw_count, 2);

    const oldGps = await fetch(pilot.base + "/api/gps/batch", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + OPS },
      body: JSON.stringify({ points: [] }),
    });
    const oldBody = await oldGps.json() as Record<string, unknown>;
    assert.equal(oldGps.status, 503);
    assert.equal(oldBody.code, "gps_ingest_moved_to_platform");

    noSecret = await startPilot(platform.base, "");
    const unavailable = await get(noSecret.base, "/api/trip/location?trip_id=T-CANON");
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.code, "canonical_location_unavailable");

    console.log("CANONICAL_DISPATCH_HTTP_GREEN 5/5");
  } finally {
    if (pilot) await stopPilot(pilot);
    if (noSecret) await stopPilot(noSecret);
    await new Promise<void>((resolve) => platform.server.close(() => resolve()));
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
