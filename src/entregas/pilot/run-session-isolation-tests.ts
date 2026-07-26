/**
 * Isolamento de sessão entre requisições — contra o servidor REAL.
 *
 * O defeito que estes testes fecham: `PilotApplicationFacade` guarda o último
 * ator que fez login, e o servidor só chamava `login()` quando havia token.
 * Resultado: uma requisição SEM token nenhum era respondida com o papel de
 * quem tinha entrado antes. Num servidor exposto na rede local, isso é
 * elevação de privilégio sem credencial.
 *
 * Cada teste aqui é uma pergunta adversarial concreta, não uma verificação
 * de forma. Vários deles FALHAVAM antes da correção — é para isso que
 * existem.
 */

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const GERENTE = "tok-gerente-sintetico";
const OPS = "tok-ops-sintetico";
const RIDER = "tok-rider-sintetico";
const PORT = 5397;
const BASE = `http://127.0.0.1:${PORT}`;

const workdir = mkdtempSync(join(tmpdir(), "entregas-session-"));
let child: ChildProcess | null = null;

function writeConfig(): void {
  mkdirSync(join(workdir, "config"), { recursive: true });
  writeFileSync(
    join(workdir, "pilot.json"),
    JSON.stringify({
      mode: "pilot",
      unit_id: "ITAIM",
      unit_name: "UNIDADE DE TESTE",
      timezone: "America/Sao_Paulo",
      port: PORT,
      bind: "127.0.0.1",
      data_dir: "dados",
      max_stops: 5,
      banner: "TESTE AUTOMATIZADO",
      users: [
        { actor_id: "ger-1", role: "gerente", label: "Gerente", token: GERENTE },
        { actor_id: "ops-1", role: "operador_expedicao", label: "Operador", token: OPS },
        { actor_id: "rid-1", role: "motoboy_interno", label: "Motoboy", token: RIDER },
      ],
      features: {
        demo_seed: false,
        demo_controls: false,
        map_poc: false,
        gps_production: false,
        auto_assignment: false,
        copiloto: false,
        shell: false,
      },
      backup: { auto_interval_minutes: 600, retain_count: 2, dir: "backups" },
    }),
  );
  writeFileSync(
    join(workdir, "config", "entregas-gps-flags.json"),
    JSON.stringify({ gps_capture_enabled: true, offline_queue_enabled: true }),
  );
}

async function startServer(): Promise<void> {
  writeConfig();
  child = spawn(
    process.execPath,
    [join(process.cwd(), "dist", "tools", "entregas_pilot_server.js")],
    {
      cwd: workdir,
      env: {
        ...process.env,
        ENTREGAS_PILOT_CONFIG: join(workdir, "pilot.json"),
        ENTREGAS_UI_PORT: String(PORT),
        ENTREGAS_BIND: "127.0.0.1",
        ENTREGAS_HTTPS: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stderr?.on("data", () => undefined);
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      /* subindo */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("servidor não subiu");
}

async function stopServer(): Promise<void> {
  if (!child) return;
  child.kill();
  child = null;
  await new Promise((r) => setTimeout(r, 300));
}

async function api(
  path: string,
  opts: { method?: string; token?: string | null; body?: unknown } = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const r = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await r.text();
  return { status: r.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

/** Endpoints que só devem responder com sessão válida. */
const PROTEGIDOS: Array<{ path: string; method?: string; body?: unknown }> = [
  { path: "/api/snapshot" },
  { path: "/api/backups" },
  { path: "/api/policies" },
  { path: "/api/trip/route?trip_id=x" },
  { path: "/api/trip/timeline?trip_id=x" },
  { path: "/api/trip/location?trip_id=x" },
  { path: "/api/ready-order", method: "POST", body: { order_ref: "X", label: "X" } },
  { path: "/api/gps/batch", method: "POST", body: { points: [] } },
  { path: "/api/events/batch", method: "POST", body: { events: [] } },
];

async function main(): Promise<void> {
  console.log("=== Isolamento de sessão entre requisições ===");
  await startServer();

  /* ---------------------------------------------------------------- *
   * 1. O defeito original, na forma exata em que existia
   * ---------------------------------------------------------------- */

  await test("REGRESSÃO: depois de um login válido, requisição SEM token é recusada", async () => {
    // Antes da correção, esta sequência devolvia 200 com o papel do gerente.
    const login = await api("/api/session", { method: "POST", body: { token: GERENTE } });
    assert.equal(login.status, 200, "o login do gerente precisa funcionar");

    for (const ep of PROTEGIDOS) {
      const r = await api(ep.path, { method: ep.method, token: null, body: ep.body });
      assert.equal(
        r.status,
        401,
        `${ep.method ?? "GET"} ${ep.path} respondeu ${r.status} sem token — ator herdado`,
      );
    }
  });

  await test("REGRESSÃO: /api/session GET não revela o ator anterior", async () => {
    await api("/api/session", { method: "POST", body: { token: GERENTE } });
    const semToken = await api("/api/session", { token: null });
    assert.equal(semToken.json.actor, null, "sessão sem token não pode devolver ator");
  });

  await test("REGRESSÃO: comando sem token não executa com o papel anterior", async () => {
    await api("/api/session", { method: "POST", body: { token: GERENTE } });
    const r = await api("/api/command", {
      method: "POST",
      token: null,
      body: {
        type: "CreateTrip",
        command_id: "sem-token-1",
        occurred_at: new Date().toISOString(),
        unit_id: "ITAIM",
        trip_id: "trip-sem-token",
        courier_actor_id: "rid-1",
        actor: { actor_id: "ger-1", role: "gerente" },
        deliveries: [{ delivery_id: "d1", order_ref: "P1", planned_stop_order: 1 }],
      },
    });
    assert.equal(r.status, 401);

    // E a viagem realmente não existe.
    const snap = await api("/api/snapshot", { token: GERENTE });
    const trips = (snap.json.trips ?? []) as Array<{ trip_id: string }>;
    assert.equal(
      trips.some((t) => t.trip_id === "trip-sem-token"),
      false,
      "comando sem sessão criou viagem",
    );
  });

  /* ---------------------------------------------------------------- *
   * 2. Troca de ator
   * ---------------------------------------------------------------- */

  await test("autorizado A → autorizado B: o papel de B é o que vale", async () => {
    const a = await api("/api/session", { token: GERENTE });
    assert.equal((a.json.actor as { role: string }).role, "gerente");
    const b = await api("/api/session", { token: OPS });
    assert.equal((b.json.actor as { role: string }).role, "operador_expedicao");
    const a2 = await api("/api/session", { token: GERENTE });
    assert.equal((a2.json.actor as { role: string }).role, "gerente", "sem contaminação de volta");
  });

  await test("administrador → operador: operador não herda privilégio de backup", async () => {
    const admin = await api("/api/backup", { method: "POST", token: GERENTE });
    assert.equal(admin.status, 200, JSON.stringify(admin.json));
    const op = await api("/api/backup", { method: "POST", token: OPS });
    assert.equal(op.status, 403, "operador conseguiu backup logo após o gerente");
  });

  await test("operador → administrador: privilégio do admin continua valendo", async () => {
    await api("/api/backup", { method: "POST", token: OPS });
    const admin = await api("/api/backup", { method: "POST", token: GERENTE });
    assert.equal(admin.status, 200);
  });

  await test("motoboy não recebe restore, nem depois de o gerente usar", async () => {
    await api("/api/backups", { token: GERENTE });
    const r = await api("/api/restore", {
      method: "POST",
      token: RIDER,
      body: { file: "qualquer.json" },
    });
    assert.equal(r.status, 403);
  });

  await test("papel insuficiente não vê rota, mesmo após consulta autorizada", async () => {
    await api("/api/trip/route?trip_id=x", { token: OPS });
    const rider = await api("/api/trip/route?trip_id=x", { token: RIDER });
    assert.equal(rider.status, 403, "motoboy herdou permissão de rota do operador");
  });

  /* ---------------------------------------------------------------- *
   * 3. Concorrência
   * ---------------------------------------------------------------- */

  await test("duas requisições paralelas de atores diferentes não se contaminam", async () => {
    const pares = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        api("/api/session", { token: i % 2 === 0 ? GERENTE : RIDER }).then((r) => ({
          esperado: i % 2 === 0 ? "gerente" : "motoboy_interno",
          recebido: (r.json.actor as { role: string } | null)?.role ?? null,
        })),
      ),
    );
    const erradas = pares.filter((p) => p.esperado !== p.recebido);
    assert.deepEqual(erradas, [], `respostas trocadas: ${JSON.stringify(erradas)}`);
  });

  await test("rajada mista com e sem token: as sem token continuam 401", async () => {
    const resultados = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        api("/api/snapshot", { token: i % 3 === 0 ? null : GERENTE }).then((r) => ({
          comToken: i % 3 !== 0,
          status: r.status,
        })),
      ),
    );
    for (const r of resultados) {
      assert.equal(r.status, r.comToken ? 200 : 401, JSON.stringify(r));
    }
  });

  await test("backup concorrente: só o gerente passa, mesmo em paralelo", async () => {
    const rs = await Promise.all([
      api("/api/backup", { method: "POST", token: OPS }),
      api("/api/backup", { method: "POST", token: GERENTE }),
      api("/api/backup", { method: "POST", token: RIDER }),
      api("/api/backup", { method: "POST", token: OPS }),
    ]);
    assert.deepEqual(
      rs.map((r) => r.status),
      [403, 200, 403, 403],
      JSON.stringify(rs.map((r) => r.status)),
    );
  });

  /* ---------------------------------------------------------------- *
   * 4. Tokens inválidos e ausentes
   * ---------------------------------------------------------------- */

  await test("token inválido é recusado como ausência de sessão", async () => {
    for (const ruim of ["", "   ", "token-que-nao-existe", "Bearer", "null", "undefined"]) {
      const r = await api("/api/snapshot", { token: ruim || null });
      assert.equal(r.status, 401, `token "${ruim}" foi aceito`);
    }
  });

  await test("token de usuário removido da configuração deixa de valer", async () => {
    // Equivalente operacional de expiração: o responsável tira o acesso.
    const antes = await api("/api/snapshot", { token: OPS });
    assert.equal(antes.status, 200);

    await stopServer();
    const cfg = JSON.parse(readFileSync(join(workdir, "pilot.json"), "utf8")) as {
      users: Array<{ token: string }>;
    };
    cfg.users = cfg.users.filter((u) => u.token !== OPS);
    writeFileSync(join(workdir, "pilot.json"), JSON.stringify(cfg));
    child = spawn(
      process.execPath,
      [join(process.cwd(), "dist", "tools", "entregas_pilot_server.js")],
      {
        cwd: workdir,
        env: {
          ...process.env,
          ENTREGAS_PILOT_CONFIG: join(workdir, "pilot.json"),
          ENTREGAS_UI_PORT: String(PORT),
          ENTREGAS_BIND: "127.0.0.1",
          ENTREGAS_HTTPS: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stderr?.on("data", () => undefined);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(`${BASE}/api/health`)).ok) break;
      } catch {
        /* subindo */
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    const depois = await api("/api/snapshot", { token: OPS });
    assert.equal(depois.status, 401, "token revogado continuou valendo");
    const gerente = await api("/api/snapshot", { token: GERENTE });
    assert.equal(gerente.status, 200, "os demais tokens continuam valendo");
  });

  await test("servidor reiniciado não guarda sessão de antes", async () => {
    // O servidor acabou de reiniciar no teste anterior.
    const r = await api("/api/snapshot", { token: null });
    assert.equal(r.status, 401);
  });

  await test("/api/health continua aberto — é o que diz se o servidor está de pé", async () => {
    const r = await api("/api/health", { token: null });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
  });

  /* ---------------------------------------------------------------- *
   * 5. Vazamento
   * ---------------------------------------------------------------- */

  await test("nenhum token aparece no log do piloto", async () => {
    await api("/api/session", { method: "POST", body: { token: GERENTE } });
    await api("/api/snapshot", { token: OPS });
    await api("/api/snapshot", { token: "token-invalido-para-log" });

    const logFile = join(workdir, "dados", "pilot.log");
    if (!existsSync(logFile)) return;
    const raw = readFileSync(logFile, "utf8");
    for (const tok of [GERENTE, OPS, RIDER, "token-invalido-para-log"]) {
      assert.equal(raw.includes(tok), false, `token no log: ${tok}`);
    }
  });

  await test("resposta de erro não devolve token nem lista de usuários", async () => {
    const r = await api("/api/snapshot", { token: "token-invalido" });
    const blob = JSON.stringify(r.json);
    assert.equal(blob.includes("token-invalido"), false, "eco do token na resposta");
    for (const tok of [GERENTE, OPS, RIDER]) {
      assert.equal(blob.includes(tok), false, "token válido vazou na resposta");
    }
    assert.equal(/users|tokens/i.test(blob), false);
  });

  await test("nenhum endpoint aceita token por query string na prática do console", async () => {
    // O extrator ainda aceita ?token= por compatibilidade; o que não pode é
    // esse caminho conceder mais que o header. São equivalentes, e ambos
    // exigem token válido.
    const r = await fetch(`${BASE}/api/snapshot?token=token-invalido`);
    assert.equal(r.status, 401);
  });

  await stopServer();
  rmSync(workdir, { recursive: true, force: true });

  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} session-isolation tests OK ===`);
}

void main().catch(async (e) => {
  await stopServer();
  console.error(e);
  process.exit(1);
});
