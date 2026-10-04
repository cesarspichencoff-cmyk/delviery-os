import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import net from "node:net";

import { bancoIsolado } from "./banco-isolado";
import { lerUnidadesOperacionais } from "./leitura/unidades-operacionais";
import { lerRealidadeDeEntregas } from "./leitura/realidade-de-entregas";
import { lerUnidadesParaNavegacao } from "../../tools/product_system_server";

const URL = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const AGORA = new Date("2026-10-04T17:00:00.000Z");

async function portaLivre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      if (!a || typeof a === "string") {
        s.close();
        reject(new Error("porta indisponivel"));
        return;
      }
      const p = a.port;
      s.close((e) => (e ? reject(e) : resolve(p)));
    });
  });
}

function getJson(port: number, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "GET" },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += String(c)));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
          } catch (e) {
            reject(new Error(`JSON invalido em ${path}: ${String(e)} :: ${raw.slice(0, 200)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function esperarHttp(
  port: number,
  log: () => string,
): Promise<void> {
  let ultimo: unknown = null;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await getJson(port, "/api/health");
      if (r.status === 200) return;
    } catch (e) {
      ultimo = e;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `servidor Product System nao ficou pronto: ${String(ultimo)} :: ${log().slice(-2000)}`,
  );
}

async function parar(child: ChildProcess): Promise<void> {
  if (process.platform === "win32" && child.pid) {
    await new Promise<void>((resolve) => {
      const killer = spawn(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" },
      );
      killer.once("error", () => resolve());
      killer.once("exit", () => resolve());
    });
    return;
  }

  if (child.exitCode !== null) return;
  child.kill();
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 1500);
    child.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function main(): Promise<void> {
  if (!URL) {
    console.log("MULTI_UNIT_READ_PG_PULADO DELIVERYOS_PG_URL ausente");
    return;
  }

  const b = await bancoIsolado(URL, undefined, "multi_unit_read_pg");
  let server: ChildProcess | null = null;
  const statusAgora = new Date();
  try {
    await b.cliente.query(
      `INSERT INTO identity.unit(unit_id, display_name, active)
       VALUES
         ('ITAIM', 'Itaim', TRUE),
         ('PINHEIROS', 'Pinheiros', TRUE),
         ('HOUSE', 'House', FALSE)`,
    );

    await b.cliente.query(
      `INSERT INTO identity.actor(actor_id, unit_id, role, label)
       VALUES
         ('actor-it', 'ITAIM', 'motoboy_interno', 'Moto Itaim'),
         ('actor-pin', 'PINHEIROS', 'motoboy_interno', 'Moto Pinheiros')`,
    );

    await b.cliente.query(
      `INSERT INTO identity.device(
          device_id, unit_id, actor_id, label, secret_hash, secret_bound_at, app_version
        )
       VALUES
         ('dev-it', 'ITAIM', 'actor-it', 'Aparelho Itaim', repeat('a',64), now(), '1.0-it'),
         ('dev-pin', 'PINHEIROS', 'actor-pin', 'Aparelho Pinheiros', repeat('b',64), now(), '1.0-pin')`,
    );

    await b.cliente.query(
      `INSERT INTO identity.device_runtime_status(
          device_id, reported_at, source_mode, pending_points, pending_events, rejected_points
        )
       VALUES
         ('dev-it', $1, 'real', 3, 1, 0),
         ('dev-pin', $1, 'real', 9, 4, 2)`,
      [statusAgora.toISOString()],
    );

    const units = await lerUnidadesOperacionais(b.cliente);
    assert.deepEqual(
      units.map((u) => u.unit_id),
      ["ITAIM", "PINHEIROS"],
      "unidade inativa apareceu ou ordenacao divergiu",
    );

    const nav = await lerUnidadesParaNavegacao(b.cliente);
    assert.equal(nav.fonte_unidades, "identity.unit");
    assert.equal(nav.unidades_disponiveis, true);
    assert.deepEqual(nav.unidades.map((u) => u.unit_id), ["ITAIM", "PINHEIROS"]);
    assert.equal(nav.unidades.some((u) => u.unit_id === "demo-unit"), false);

    const itaim = await lerRealidadeDeEntregas(b.cliente, {
      agora: AGORA,
      unit_id: "ITAIM",
    });
    const pinheiros = await lerRealidadeDeEntregas(b.cliente, {
      agora: AGORA,
      unit_id: "PINHEIROS",
    });

    assert.deepEqual(itaim.aparelhos.map((a) => a.device_id), ["dev-it"]);
    assert.deepEqual(pinheiros.aparelhos.map((a) => a.device_id), ["dev-pin"]);

    assert.deepEqual(itaim.aparelhos[0]?.fila_local, {
      reportada_em: statusAgora.toISOString(),
      source_mode: "real",
      pending_points: 3,
      pending_events: 1,
      rejected_points: 0,
    });
    assert.deepEqual(pinheiros.aparelhos[0]?.fila_local, {
      reportada_em: statusAgora.toISOString(),
      source_mode: "real",
      pending_points: 9,
      pending_events: 4,
      rejected_points: 2,
    });

    assert.equal(
      itaim.aparelhos.some((a) => a.unit_id === "PINHEIROS") ||
        pinheiros.aparelhos.some((a) => a.unit_id === "ITAIM"),
      false,
      "leitura multi-unidade vazou aparelho de outra unidade",
    );

    const port = await portaLivre();
    const launcher =
      process.platform === "win32"
        ? {
            command: process.env.ComSpec || "cmd.exe",
            args: ["/d", "/s", "/c", "npx.cmd tsx tools/product_system_server.ts"],
          }
        : { command: "npx", args: ["tsx", "tools/product_system_server.ts"] };
    server = spawn(launcher.command, launcher.args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DELIVERYOS_DATABASE_URL: b.url,
        DELIVERYOS_PG_URL: "",
        PRODUCT_UI_PORT: String(port),
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let serverLog = "";
    server.stdout?.on("data", (c) => {
      serverLog += String(c);
    });
    server.stderr?.on("data", (c) => {
      serverLog += String(c);
    });
    await esperarHttp(port, () => serverLog);

    const httpNav = await getJson(port, "/api/navegacao");
    assert.equal(httpNav.status, 200);
    assert.equal(httpNav.body.fonte_unidades, "identity.unit");
    assert.deepEqual(
      httpNav.body.unidades.map((u: { unit_id: string }) => u.unit_id),
      ["ITAIM", "PINHEIROS"],
    );
    assert.equal(
      httpNav.body.unidades.some((u: { unit_id: string }) => u.unit_id === "demo-unit"),
      false,
    );

    const httpIt = await getJson(port, "/api/entregas?unit_id=ITAIM");
    const httpPin = await getJson(port, "/api/entregas?unit_id=PINHEIROS");
    assert.equal(httpIt.status, 200);
    assert.equal(httpPin.status, 200);
    assert.deepEqual(
      httpIt.body.realidade.aparelhos.map((a: { device_id: string }) => a.device_id),
      ["dev-it"],
    );
    assert.deepEqual(
      httpPin.body.realidade.aparelhos.map((a: { device_id: string }) => a.device_id),
      ["dev-pin"],
    );
    assert.equal(httpIt.body.realidade.aparelhos[0].fila_offline.valor, 4);
    assert.equal(httpPin.body.realidade.aparelhos[0].fila_offline.valor, 13);

    console.log("MULTI_UNIT_READ_PG: 14/14 PASS");
  } finally {
    if (server) await parar(server);
    await b.descartar();
  }
}

void main().catch((e) => {
  console.error("MULTI_UNIT_READ_PG_RED", e);
  process.exit(1);
});
