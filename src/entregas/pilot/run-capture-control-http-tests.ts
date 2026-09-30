import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const RIDER = "CHANGE_ME_RIDER_TOKEN";
const OPS = "CHANGE_ME_OPS_TOKEN";
const ADMIN = "CHANGE_ME_ADMIN_TOKEN";
const DEVICE_BEARER = "device-token-q019";
const DEVICE_TERMINAL_BEARER = "device-token-q019-terminal";
const DEVICE_GENERIC_403_BEARER = "device-token-q019-generic-403";

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

async function startIdentity(): Promise<{ base: string; server: Server }> {
  const port = await freePort();
  const server = createHttpServer((req, res) => {
    if (req.url === "/api/device/identity" && req.method === "GET") {
      if (req.headers.authorization === `Bearer ${DEVICE_TERMINAL_BEARER}`) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ instrucao: "parar_e_avisar", humano: "revogado" }));
        return;
      }
      if (req.headers.authorization === `Bearer ${DEVICE_GENERIC_403_BEARER}`) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ human: "forbidden intermediario" }));
        return;
      }
      if (req.headers.authorization !== `Bearer ${DEVICE_BEARER}`) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ instrucao: "renovar_e_repetir" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        ok: true, device_id: "dev-q019", unit_id: "demo-unit", actor_id: "rid-1",
      }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { base: `http://127.0.0.1:${port}`, server };
}

interface Pilot { base: string; proc: ChildProcess; dir: string; log: string[] }

async function startPilot(platformBase: string): Promise<Pilot> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "capture-http-"));
  const env = {
    ...process.env,
    ENTREGAS_UI_PORT: String(port),
    ENTREGAS_PILOT_CONFIG: "config/entregas-pilot.example.json",
    ENTREGAS_DATA_DIR: join(dir, "data"),
    ENTREGAS_PLATFORM_URL: platformBase,
  };
  delete (env as Record<string, string | undefined>).ENTREGAS_BIND;
  delete (env as Record<string, string | undefined>).ENTREGAS_HTTPS;
  const pilotJs = join(ROOT, "dist", "tools", "entregas_pilot_server.js");
  const proc = spawn(process.execPath, [pilotJs], {
    cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  const log: string[] = [];
  proc.stdout?.on("data", (d) => log.push(String(d)));
  proc.stderr?.on("data", (d) => log.push(String(d)));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return { base, proc, dir, log };
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`piloto não subiu: ${log.join("").slice(-500)}`);
}

async function post(base: string, token: string, path: string, body: unknown) {
  const r = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() as Record<string, unknown> };
}

async function command(base: string, token: string, body: Record<string, unknown>) {
  return post(base, token, "/api/command", body);}

async function capture(base: string, tripId: string, bearer = DEVICE_BEARER) {
  const r = await fetch(`${base}/api/device/capture-state?trip_id=${encodeURIComponent(tripId)}`, {
    headers: { authorization: `Bearer ${bearer}` },
  });
  return { status: r.status, body: await r.json() as Record<string, unknown> };
}

async function main() {
  const identity = await startIdentity();
  const pilot = await startPilot(identity.base);
  const trip = "Q019-HTTP-1";
  const now = new Date().toISOString();
  try {
    const ready = await post(pilot.base, OPS, "/api/ready-order", {
      order_ref: `P-${trip}`, label: "Pedido Q019",
    });
    assert.equal(ready.status, 200);

    const created = await command(pilot.base, OPS, {
      type: "CreateTrip", command_id: `create-${trip}`, occurred_at: now,
      unit_id: "demo-unit", trip_id: trip, courier_actor_id: "rid-1",
      deliveries: [{ delivery_id: `D-${trip}`, order_ref: `P-${trip}` }],
      actor: { actor_id: "ops-console-1", role: "operador_expedicao" },
    });
    assert.equal((created.body.result as { ok?: boolean })?.ok, true);

    const departed = await command(pilot.base, RIDER, {
      type: "ConfirmTripDeparture", command_id: `depart-${trip}`,      occurred_at: new Date().toISOString(), unit_id: "demo-unit", trip_id: trip,
      actor: { actor_id: "rid-1", role: "motoboy_interno" },
    });
    assert.equal((departed.body.result as { ok?: boolean })?.ok, true);

    const on = await capture(pilot.base, trip);
    assert.equal(on.status, 200);
    assert.equal(on.body.capture, true);

    const generic403 = await capture(pilot.base, trip, DEVICE_GENERIC_403_BEARER);
    assert.equal(generic403.status, 503);
    assert.equal(generic403.body.unknown, true);

    const terminal = await capture(pilot.base, trip, DEVICE_TERMINAL_BEARER);
    assert.equal(terminal.status, 410);
    assert.equal(terminal.body.terminal, true);

    const closed = await command(pilot.base, ADMIN, {
      type: "CloseTripManually", command_id: `close-${trip}`,
      occurred_at: new Date().toISOString(), unit_id: "demo-unit", trip_id: trip,
      reason: "Q019 prova HTTP",
      actor: { actor_id: "admin-1", role: "gerente" },
    });
    assert.equal((closed.body.result as { ok?: boolean })?.ok, true);

    const off = await capture(pilot.base, trip);
    assert.equal(off.status, 200);
    assert.equal(off.body.capture, false);
    assert.equal(off.body.reason, "trip_not_active");

    console.log("CAPTURE_CONTROL_HTTP: 4/4 PASS");
  } finally {
    try {
      if (pilot.proc.pid) {
        if (process.platform === "win32") {
          execFileSync("taskkill", ["/PID", String(pilot.proc.pid), "/T", "/F"], { stdio: "ignore" });
        } else {
          process.kill(-pilot.proc.pid, "SIGTERM");
        }
      }
    } catch { /* já saiu */ }
    rmSync(pilot.dir, { recursive: true, force: true });
    await new Promise<void>((resolve) => identity.server.close(() => resolve()));
  }
}
void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
