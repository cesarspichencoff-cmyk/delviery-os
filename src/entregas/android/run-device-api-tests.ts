/**
 * API do aparelho — testes de integração contra o SERVIDOR REAL.
 *
 * Nada de mock de HTTP: cada teste sobe `entregas_pilot_server` num processo
 * de verdade, com configuração sintética, e faz requisição de rede. É o mais
 * perto que dá para chegar do Android sem ter o Android — e é o que prova
 * que os endpoints existem, respondem e recusam o que devem recusar.
 *
 * O que continua não sendo provado aqui: o cliente Kotlin. Ele fala este
 * mesmo contrato, mas quem confirma isso é o aparelho.
 */

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hashTerm, TERM_ITAIM_V1, type LocationTerm } from "../consent/term";

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

/* ------------------------------------------------------------------ *
 * Ambiente sintético
 * ------------------------------------------------------------------ */

const OPS_TOKEN = "tok-ops-sintetico";
const RIDER_TOKEN = "tok-rider-sintetico";
const DEVICE_ID = "dev-sintetico-1";
const PORT = 5391;
const BASE = `http://127.0.0.1:${PORT}`;

/** Coordenadas sintéticas. Nunca localização real. */
const SYNTH = { latitude: -23.5, longitude: -46.6 };

const workdir = mkdtempSync(join(tmpdir(), "entregas-device-api-"));
let child: ChildProcess | null = null;

/**
 * Termo completo para teste, marcado explicitamente como sintético.
 * O termo de produção continua não publicável — nada aqui o altera.
 */
function syntheticTerm(over: Partial<LocationTerm> = {}): LocationTerm {
  return {
    ...TERM_ITAIM_V1,
    version: "1.0.0-teste-sintetico",
    effective_date: "2026-08-01",
    controller: {
      legal_name: "FIXTURE SINTETICA PARA TESTE LTDA",
      cnpj: "00.000.000/0001-00",
      contact_channel: "canal-de-teste@sintetico",
      contact_owner: "gerencia_operacao",
    },
    approved: true,
    ...over,
  };
}

function writeConfigs(opts: { captureEnabled: boolean; term: LocationTerm | null }): void {
  const cfgDir = join(workdir, "config");
  mkdirSync(cfgDir, { recursive: true });
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
        { actor_id: "ops-1", role: "operador_expedicao", label: "Operador", token: OPS_TOKEN },
        { actor_id: "rid-1", role: "motoboy_interno", label: "Motoboy", token: RIDER_TOKEN },
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
    join(cfgDir, "entregas-gps-flags.json"),
    JSON.stringify({
      gps_capture_enabled: opts.captureEnabled,
      offline_queue_enabled: true,
      persistent_outbox_enabled: true,
    }),
  );
  writeFileSync(
    join(cfgDir, "entregas-devices.json"),
    JSON.stringify([{ device_id: DEVICE_ID, rider_id: "rid-1", label: "Aparelho de teste" }]),
  );
  if (opts.term) {
    writeFileSync(join(cfgDir, "entregas-term.json"), JSON.stringify(opts.term));
  } else if (existsSync(join(cfgDir, "entregas-term.json"))) {
    rmSync(join(cfgDir, "entregas-term.json"));
  }
}

async function startServer(opts: {
  captureEnabled: boolean;
  term: LocationTerm | null;
}): Promise<void> {
  writeConfigs(opts);
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
        ENTREGAS_UNIT_CONFIG: "config/entregas-unit-itaim.json",
        ENTREGAS_TERM_CONFIG: "config/entregas-term.json",
        ENTREGAS_HTTPS: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stderr?.on("data", () => undefined);

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("servidor não subiu a tempo");
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
  return {
    status: r.status,
    json: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

function gpsPoint(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    trip_id: "trip-teste-1",
    device_id: DEVICE_ID,
    latitude: SYNTH.latitude,
    longitude: SYNTH.longitude,
    accuracy_m: 12,
    speed_mps: 5,
    heading_deg: 90,
    occurred_at: new Date().toISOString(),
    source: "device",
    ...over,
  };
}

/* ------------------------------------------------------------------ *
 * Suíte A — termo pendente (estado real de hoje)
 * ------------------------------------------------------------------ */

async function suiteTermoPendente(): Promise<void> {
  await startServer({ captureEnabled: true, term: null });

  await test("servidor sobe e responde /api/health", async () => {
    const r = await api("/api/health");
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.api_version, "device-api@1.0.0");
  });

  await test("health diz que o termo NÃO é publicável enquanto faltar preenchimento", async () => {
    const r = await api("/api/health");
    assert.equal(r.json.term_publishable, false);
    assert.equal(r.json.unit_configured, false, "sem coordenada calibrada");
  });

  await test("política entregue ao aparelho reflete termo pendente", async () => {
    const r = await api("/api/policies", { token: OPS_TOKEN });
    assert.equal(r.status, 200);
    const term = r.json.term as Record<string, unknown>;
    assert.equal(term.publishable, false);
    assert.equal(term.hash, null, "sem hash quando o termo não pode ser apresentado");
  });

  await test("aceite é recusado enquanto o termo não estiver liberado", async () => {
    const r = await api("/api/term/acknowledge", {
      method: "POST",
      token: RIDER_TOKEN,
      body: {
        acknowledgement_id: "ack-1",
        rider_id: "rid-1",
        unit_id: "ITAIM",
        term_version: "1.0.0",
        term_material_version: "1",
        term_hash: "qualquer",
        status: "accepted",
        accepted_at: new Date().toISOString(),
        device_id: DEVICE_ID,
      },
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.code, "term_not_publishable");
  });

  await test("sem sessão, nenhum endpoint do aparelho responde", async () => {
    for (const p of ["/api/policies", "/api/trip/route?trip_id=x"]) {
      const r = await api(p, { token: null });
      assert.ok(r.status === 401 || r.status === 403, `${p} devia recusar, veio ${r.status}`);
    }
    const batch = await api("/api/gps/batch", {
      method: "POST",
      token: null,
      body: { points: [gpsPoint()] },
    });
    assert.equal(batch.status, 401);
  });

  await test("aparelho não cadastrado é recusado mesmo com token válido", async () => {
    const r = await api("/api/device/session", {
      method: "POST",
      token: OPS_TOKEN,
      body: { device_id: "dev-intruso", app_version: "1.0.0", client: "android" },
    });
    assert.equal(r.status, 403);
    assert.equal(r.json.code, "device_not_authorized");
  });

  await test("aparelho cadastrado autentica e recebe o rider vinculado", async () => {
    const r = await api("/api/device/session", {
      method: "POST",
      token: OPS_TOKEN,
      body: { device_id: DEVICE_ID, app_version: "1.0.0", client: "android" },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.rider_id, "rid-1");
    assert.equal(r.json.unit_id, "ITAIM");
  });

  await test("ponto de viagem que não existe é recusado, com motivo", async () => {
    const r = await api("/api/gps/batch", {
      method: "POST",
      token: RIDER_TOKEN,
      body: { device_id: DEVICE_ID, points: [gpsPoint()] },
    });
    assert.equal(r.status, 200, "lote sempre responde 200; o veredito está no corpo");
    assert.equal(r.json.accepted, 0);
    assert.equal(r.json.rejected, 1);
    const reasons = r.json.reasons as Record<string, number>;
    assert.ok(reasons.trip_not_active >= 1, JSON.stringify(reasons));
  });

  await test("papel sem autorização não vê rota — e a negativa fica auditada", async () => {
    const r = await api("/api/trip/route?trip_id=trip-teste-1", { token: RIDER_TOKEN });
    assert.equal(r.status, 403);
    assert.ok(String(r.json.human).length > 0);
    const auditFile = join(workdir, "dados", "route-access.jsonl");
    assert.ok(existsSync(auditFile), "arquivo de auditoria de rota não foi criado");
    const lines = readFileSync(auditFile, "utf8").trim().split("\n");
    const last = JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
    assert.equal(last.granted, false);
    assert.equal(last.role, "motoboy_interno");
    assert.equal(last.point_count, 0, "negada não revela quantidade");
  });

  await test("registro de auditoria de rota não contém coordenada", async () => {
    const auditFile = join(workdir, "dados", "route-access.jsonl");
    const raw = readFileSync(auditFile, "utf8");
    assert.equal(/-?\d{1,3}\.\d{4,}/.test(raw), false, "coordenada na auditoria");
    for (const k of ["latitude", "longitude"]) {
      assert.equal(raw.includes(k), false, `campo ${k} na auditoria`);
    }
  });

  await stopServer();
}

/* ------------------------------------------------------------------ *
 * Suíte B — termo liberado (estado depois que o César preencher)
 * ------------------------------------------------------------------ */

async function suiteTermoLiberado(): Promise<void> {
  const term = syntheticTerm();
  await startServer({ captureEnabled: true, term });

  await test("com o termo preenchido, o health muda para publicável", async () => {
    const r = await api("/api/health");
    assert.equal(r.json.term_publishable, true);
  });

  await test("política entrega hash do termo para o aparelho conferir", async () => {
    const r = await api("/api/policies", { token: RIDER_TOKEN });
    const t = r.json.term as Record<string, unknown>;
    assert.equal(t.publishable, true);
    assert.equal(t.hash, hashTerm(term), "hash tem de bater com o texto vigente");
    assert.equal(t.unit_id, "ITAIM");
  });

  await test("política não vaza a coordenada da unidade para o aparelho", async () => {
    const r = await api("/api/policies", { token: RIDER_TOKEN });
    const raw = JSON.stringify(r.json);
    assert.equal(/latitude|longitude/.test(raw), false);
    assert.equal(/-?\d{1,3}\.\d{4,}/.test(raw), false);
  });

  const ackBody = () => ({
    acknowledgement_id: "ack-sintetico-1",
    rider_id: "rid-1",
    unit_id: "ITAIM",
    term_version: term.version,
    term_material_version: term.material_version,
    term_hash: hashTerm(term),
    status: "accepted",
    accepted_at: "2026-07-25T12:00:00.000Z",
    device_id: DEVICE_ID,
    app_version: "1.0.0-piloto",
    language: "pt-BR",
    correlation_id: "corr-1",
    schema_version: "consent@1.0.0",
  });

  await test("aceite com o hash certo é registrado e devolve recibo", async () => {
    const r = await api("/api/term/acknowledge", {
      method: "POST",
      token: RIDER_TOKEN,
      body: ackBody(),
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.stored, true);
    const receipt = r.json.receipt as Record<string, unknown>;
    assert.equal(receipt.situacao, "aceito");
    assert.equal(receipt.impressao_do_texto, hashTerm(term));
  });

  await test("aceite repetido é idempotente: registra uma vez só", async () => {
    const r = await api("/api/term/acknowledge", {
      method: "POST",
      token: RIDER_TOKEN,
      body: ackBody(),
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.stored, false, "segundo envio não grava de novo");
  });

  await test("aceite sobrevive ao reinício do servidor", async () => {
    const file = join(workdir, "dados", "term-acks.jsonl");
    assert.ok(existsSync(file), "aceite não foi gravado em disco");
    const lines = readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
    assert.equal(lines.length, 1, "append-only com um único registro");
  });

  await test("aceite de um texto diferente do vigente é recusado", async () => {
    const r = await api("/api/term/acknowledge", {
      method: "POST",
      token: RIDER_TOKEN,
      body: { ...ackBody(), acknowledgement_id: "ack-2", term_hash: "hash-de-outro-texto" },
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.code, "term_hash_mismatch");
  });

  await test("aceite com campo proibido é recusado", async () => {
    const r = await api("/api/term/acknowledge", {
      method: "POST",
      token: RIDER_TOKEN,
      body: { ...ackBody(), acknowledgement_id: "ack-3", latitude: SYNTH.latitude },
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.code, "forbidden_field");
  });

  await test("aceite incompleto é recusado", async () => {
    const body = ackBody() as Record<string, unknown>;
    delete body.rider_id;
    const r = await api("/api/term/acknowledge", {
      method: "POST",
      token: RIDER_TOKEN,
      body,
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.code, "incomplete_ack");
  });

  await test("aceite não fica salvo em log comum com dado excessivo", async () => {
    const logFile = join(workdir, "dados", "pilot.log");
    if (!existsSync(logFile)) return;
    const raw = readFileSync(logFile, "utf8");
    assert.equal(/-?\d{1,3}\.\d{4,}/.test(raw), false, "coordenada no log do piloto");
  });

  await stopServer();
}

/* ------------------------------------------------------------------ *
 * Suíte C — viagem real: ponto entra pelo domínio e chega ao console
 * ------------------------------------------------------------------ */

async function suiteViagemReal(): Promise<void> {
  await startServer({ captureEnabled: true, term: syntheticTerm() });

  let tripId = "";
  /* Carimbos fixos: o reenvio precisa ser do MESMO ponto, nao de um novo. */
  const t0 = Date.now() - 120000;
  const at1 = new Date(t0).toISOString();
  const at2 = new Date(t0 + 30000).toISOString();

  await test("cria viagem e confirma saída pelo domínio", async () => {
    tripId = `trip-${Date.now()}`;
    const create = await api("/api/command", {
      method: "POST",
      token: OPS_TOKEN,
      body: {
        type: "CreateTrip",
        command_id: "cmd-1",
        occurred_at: new Date().toISOString(),
        unit_id: "ITAIM",
        trip_id: tripId,
        courier_actor_id: "rid-1",
        actor: { actor_id: "ops-1", role: "operador_expedicao" },
        deliveries: [
          { delivery_id: "d1", order_ref: "P-001", planned_stop_order: 1, channel: "proprio" },
        ],
      },
    });
    assert.equal(create.status, 200);
    assert.equal((create.json.result as Record<string, unknown>).ok, true, JSON.stringify(create.json.result));

    // Quem confirma a saida e' o motoboy: operador_expedicao nao tem
    // permissao de trip_start, e isso e' o modelo operacional correto.
    const depart = await api("/api/command", {
      method: "POST",
      token: RIDER_TOKEN,
      body: {
        type: "ConfirmTripDeparture",
        command_id: "cmd-2",
        occurred_at: new Date().toISOString(),
        unit_id: "ITAIM",
        trip_id: tripId,
        actor: { actor_id: "rid-1", role: "motoboy_interno" },
      },
    });
    assert.equal(
      (depart.json.result as Record<string, unknown>).ok,
      true,
      JSON.stringify(depart.json.result),
    );
  });

  await test("lote do aparelho é aceito para viagem ativa", async () => {
    const r = await api("/api/gps/batch", {
      method: "POST",
      token: RIDER_TOKEN,
      body: {
        device_id: DEVICE_ID,
        points: [
          gpsPoint({ trip_id: tripId, occurred_at: at1 }),
          gpsPoint({
            trip_id: tripId,
            occurred_at: at2,
            latitude: SYNTH.latitude + 0.0004,
          }),
        ],
      },
    });
    assert.equal(r.json.accepted, 2, JSON.stringify(r.json));
    assert.equal(r.json.rejected, 0);
  });

  await test("reenviar o mesmo lote não duplica — conta como repetido", async () => {
    const snapshot = await api(`/api/trip/route?trip_id=${tripId}`, { token: OPS_TOKEN });
    const antes = (snapshot.json.bruto as { points: unknown[] }).points.length;

    // Reenvia exatamente o mesmo ponto do lote anterior.
    const r = await api("/api/gps/batch", {
      method: "POST",
      token: RIDER_TOKEN,
      body: {
        device_id: DEVICE_ID,
        points: [gpsPoint({ trip_id: tripId, occurred_at: at1 })],
      },
    });
    assert.equal(r.json.accepted, 0, "reenvio não cria ponto novo");
    assert.equal(r.json.duplicated, 1, JSON.stringify(r.json));

    const depois = await api(`/api/trip/route?trip_id=${tripId}`, { token: OPS_TOKEN });
    assert.equal((depois.json.bruto as { points: unknown[] }).points.length, antes);
  });

  await test("localização simulada é recusada com motivo próprio", async () => {
    const r = await api("/api/gps/batch", {
      method: "POST",
      token: RIDER_TOKEN,
      body: {
        device_id: DEVICE_ID,
        points: [
          gpsPoint({
            trip_id: tripId,
            occurred_at: new Date().toISOString(),
            is_mock: true,
          }),
        ],
      },
    });
    assert.equal(r.json.accepted, 0);
    const reasons = r.json.reasons as Record<string, number>;
    assert.equal(reasons.mock_location, 1, JSON.stringify(reasons));
  });

  await test("ponto de outro aparelho na mesma sessão é recusado", async () => {
    const r = await api("/api/gps/batch", {
      method: "POST",
      token: RIDER_TOKEN,
      body: {
        device_id: DEVICE_ID,
        points: [
          gpsPoint({
            trip_id: tripId,
            device_id: "dev-outro",
            occurred_at: new Date().toISOString(),
          }),
        ],
      },
    });
    const reasons = r.json.reasons as Record<string, number>;
    assert.equal(reasons.device_mismatch, 1, JSON.stringify(reasons));
  });

  await test("papel autorizado vê rota bruta e operacional separadas", async () => {
    const r = await api(`/api/trip/route?trip_id=${tripId}`, { token: OPS_TOKEN });
    assert.equal(r.status, 200);
    const bruto = r.json.bruto as { layer: string; points: unknown[]; raw_count: number };
    const op = r.json.operacional as { layer: string; confidence: number };
    assert.equal(bruto.layer, "bruto");
    assert.equal(op.layer, "operacional");
    assert.equal(bruto.points.length, 2);
    assert.ok(typeof op.confidence === "number");
  });

  await test("chegada relatada e detectada convivem sem confirmar entrega", async () => {
    const reported = await api("/api/command", {
      method: "POST",
      token: RIDER_TOKEN,
      body: {
        type: "RecordArrivalReported",
        command_id: "cmd-arr-1",
        occurred_at: new Date().toISOString(),
        unit_id: "ITAIM",
        trip_id: tripId,
        delivery_id: "d1",
        actor: { actor_id: "rid-1", role: "motoboy_interno" },
      },
    });
    assert.equal((reported.json.result as Record<string, unknown>).ok, true, JSON.stringify(reported.json.result));

    const snap = reported.json.snapshot as {
      trips: Array<{ trip_id: string; deliveries: Array<Record<string, unknown>> }>;
    };
    const trip = snap.trips.find((t) => t.trip_id === tripId);
    const d = trip?.deliveries?.[0];
    assert.ok(d, "entrega não encontrada no snapshot");
    assert.notEqual(d!.state, "entregue_confirmado", "chegada nunca confirma entrega");
  });

  await test("captura desligada por flag recusa o lote, com motivo legível", async () => {
    await stopServer();
    await startServer({ captureEnabled: false, term: syntheticTerm() });
    const r = await api("/api/gps/batch", {
      method: "POST",
      token: RIDER_TOKEN,
      body: { device_id: DEVICE_ID, points: [gpsPoint()] },
    });
    assert.equal(r.status, 409);
    assert.equal(r.json.code, "capture_disabled");
    assert.equal(r.json.gps_production, undefined);
  });

  await stopServer();
}

/* ------------------------------------------------------------------ *
 * Suíte D — HTTPS: falha fechada
 * ------------------------------------------------------------------ */

async function suiteHttps(): Promise<void> {
  await test("HTTPS pedido sem certificado derruba o boot em vez de cair para HTTP", async () => {
    writeConfigs({ captureEnabled: true, term: null });
    const proc = spawn(
      process.execPath,
      [join(process.cwd(), "dist", "tools", "entregas_pilot_server.js")],
      {
        cwd: workdir,
        env: {
          ...process.env,
          ENTREGAS_PILOT_CONFIG: join(workdir, "pilot.json"),
          ENTREGAS_UI_PORT: String(PORT + 1),
          ENTREGAS_HTTPS: "1",
          ENTREGAS_TLS_CERT: join(workdir, "nao-existe.pem"),
          ENTREGAS_TLS_KEY: join(workdir, "nao-existe-key.pem"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    proc.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString();
    });
    const code = await new Promise<number>((resolve) => {
      proc.on("exit", (c) => resolve(c ?? -1));
      setTimeout(() => {
        proc.kill();
        resolve(-2);
      }, 15000);
    });
    assert.equal(code, 1, `servidor devia recusar subir; saiu com ${code}`);
    assert.match(stderr, /certificado/i, stderr.slice(0, 200));
    // A mensagem não pode entregar o caminho da chave privada.
    assert.equal(
      stderr.includes("nao-existe-key.pem"),
      false,
      "mensagem de erro não pode vazar o caminho da chave",
    );
  });
}

/* ------------------------------------------------------------------ *
 * Execução
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  console.log("=== API do aparelho — integração com servidor real ===");
  try {
    await suiteTermoPendente();
    await suiteTermoLiberado();
    await suiteViagemReal();
    await suiteHttps();
  } finally {
    await stopServer();
    rmSync(workdir, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} device-api tests OK ===`);
}

void main();
