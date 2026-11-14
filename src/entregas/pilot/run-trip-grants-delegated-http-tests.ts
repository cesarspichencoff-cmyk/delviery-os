/**
 * X1 — a rota de concessões do piloto pela credencial DELEGADA (pt1).
 *
 * Piloto real (dist/) com chave pública de delegação, plataforma falsa em HTTPS
 * (a autorização delegada exige HTTPS) com certificado de bancada gerado na hora,
 * credenciais pt1 assinadas com a chave privada que só o teste tem. Prova que:
 * o motoboy recebe a concessão da PRÓPRIA viagem; outro motoboy recebe nulo;
 * viagem sem saída recebe nulo; sem pt1, ou com o token da plataforma, nada sai.
 * Sintético: viagens, motoboys e aparelhos fabricados.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { generateKeyPairSync, sign, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createServer as createHttpsServer, type Server } from "node:https";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stopTestProcess } from "./test-process-shutdown";
import { verifyTripCaptureGrant } from "../foundation/trip-capture-grant";
import {
  PILOT_DELEGATION_AUDIENCE, PILOT_DELEGATION_ISSUER, PILOT_DELEGATION_SCOPE, PILOT_DELEGATION_VERSION,
} from "./delegated-authorization";

const ROOT = process.cwd();
const RIDER = "CHANGE_ME_RIDER_TOKEN";
const OPS = "CHANGE_ME_OPS_TOKEN";
const UNIT = "ITAIM";
const KID = "kid-x1-teste";
const SECRET = "segredo-sintetico-da-concessao-de-viagem-0123456789";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const dispositivos: Record<string, { actor_id: string }> = { "dev-r1": { actor_id: "rid-1" }, "dev-r2": { actor_id: "rid-2" } };

function pt1(device_id: string, actor_id: string): string {
  const now = Math.floor(Date.now() / 1000);
  const claims = { v: PILOT_DELEGATION_VERSION, iss: PILOT_DELEGATION_ISSUER, aud: PILOT_DELEGATION_AUDIENCE,
    scope: PILOT_DELEGATION_SCOPE, kid: KID, jti: randomBytes(12).toString("base64url"),
    device_id, actor_id, unit_id: UNIT, role: "motoboy_interno", iat: now, nbf: now, exp: now + 120 };
  const unsigned = "pt1." + Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return unsigned + "." + sign(null, Buffer.from(unsigned, "utf8"), privateKey).toString("base64url");
}

const freePort = () => new Promise<number>((resolve) => {
  const s = createNetServer();
  s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => resolve(p)); });
});

function tlsDeBancada(dir: string): { key: string; cert: string } | null {
  for (const exe of ["openssl", "C:/Program Files/Git/usr/bin/openssl.exe", "C:/Program Files/Git/mingw64/bin/openssl.exe"]) {
    const r = spawnSync(exe, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"),
      "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"],
      { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1", MSYS2_ARG_CONV_EXCL: "*" } });
    if (r.status === 0 && existsSync(join(dir, "c.pem"))) return { key: join(dir, "k.pem"), cert: join(dir, "c.pem") };
  }
  return null;
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "x1-pt1-"));
  const tls = tlsDeBancada(dir);
  if (!tls) { console.log("PULADO EM VOZ ALTA: openssl ausente — a rota de concessões por pt1 NAO foi exercitada"); process.exit(1); }
  // Plataforma falsa: só a consulta de identidade que a autorização delegada faz.
  const plataforma: Server = createHttpsServer({ key: readFileSync(tls.key), cert: readFileSync(tls.cert) }, (req, res) => {
    if (req.url === "/api/device/pilot-identity") {
      const tok = String(req.headers.authorization || "").replace(/^Bearer\s+/, "");
      try {
        const claims = JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString("utf8"));
        const d = dispositivos[claims.device_id];
        if (!d) { res.writeHead(403); return res.end("{}"); }
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true, device_id: claims.device_id, actor_id: d.actor_id, unit_id: UNIT, role: "motoboy_interno" }));
      } catch { res.writeHead(401); return res.end("{}"); }
    }
    res.writeHead(404); res.end();
  });
  const portaPlataforma = await freePort();
  await new Promise<void>((r) => plataforma.listen(portaPlataforma, "127.0.0.1", r));

  const port = await freePort();
  const marca = "SEM VALOR LEGAL — APENAS TESTE SIMULADO";
  writeFileSync(join(dir, "term.json"), JSON.stringify({ version: "0.0.0-x1", material_version: "x1-1", unit_id: UNIT, title: marca, body: marca,
    effective_date: marca, controller: { legal_name: marca, cnpj: marca, contact_channel: marca, contact_owner: marca },
    retention: { operational_event_days: 1, detailed_point_days: 1, after_expiry: "delete" },
    access_roles: ["despacho_autorizado"], language: "pt-BR", approved: true }));
  writeFileSync(join(dir, "flags.json"), JSON.stringify({ gps_capture_enabled: true, offline_queue_enabled: true, persistent_outbox_enabled: true }));
  const env: NodeJS.ProcessEnv = { ...process.env, ENTREGAS_UI_PORT: String(port), ENTREGAS_PILOT_CONFIG: "config/entregas-pilot.example.json",
    ENTREGAS_DATA_DIR: join(dir, "data"), ENTREGAS_PLATFORM_URL: `https://127.0.0.1:${portaPlataforma}`,
    ENTREGAS_TERM_CONFIG: join(dir, "term.json"), ENTREGAS_GPS_FLAGS_CONFIG: join(dir, "flags.json"), ENTREGAS_LABORATORIO: "1",
    ENTREGAS_TRIP_GRANT_SECRET: SECRET, NODE_EXTRA_CA_CERTS: tls.cert,
    ENTREGAS_PILOT_DELEGATION_PUBLIC_KEY_B64: Buffer.from(publicKey.export({ type: "spki", format: "pem" }) as string).toString("base64"),
    ENTREGAS_PILOT_DELEGATION_KEY_ID: KID };
  for (const k of ["ENTREGAS_BIND", "ENTREGAS_HTTPS", "ENTREGAS_USERS", "ENTREGAS_STORAGE_BACKEND"]) delete env[k];
  const proc: ChildProcess = spawn(process.execPath, [join(ROOT, "dist", "tools", "entregas_pilot_server.js")],
    { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const log: string[] = [];
  proc.stdout?.on("data", (d) => log.push(String(d)));
  proc.stderr?.on("data", (d) => log.push(String(d)));
  const base = `http://127.0.0.1:${port}`;
  let ok = 0;
  const prova = async (nome: string, fn: () => Promise<void>) => { await fn(); ok += 1; console.log("PASS " + nome); };
  const pedir = async (auth: string | null, trip_ids: unknown) => {
    const r = await fetch(base + "/api/device/trip-grants", { method: "POST",
      headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify({ trip_ids }) });
    return { status: r.status, body: (await r.json()) as Record<string, any> };
  };
  const cmd = async (token: string, body: Record<string, unknown>) => {
    const r = await fetch(base + "/api/command", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    return (await r.json()) as Record<string, any>;
  };
  try {
    let subiu = false;
    for (let i = 0; i < 100 && !subiu; i++) { try { subiu = (await fetch(base + "/api/health")).ok; } catch { /* subindo */ } if (!subiu) await new Promise((r) => setTimeout(r, 200)); }
    if (!subiu) throw new Error("piloto não subiu: " + log.join("").slice(-500));
    const montar = async (trip: string, sair: boolean) => {
      const r = await fetch(base + "/api/ready-order", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${OPS}` },
        body: JSON.stringify({ order_ref: `P-${trip}`, label: "Pedido X1" }) });
      assert.equal(r.status, 200);
      const c = await cmd(OPS, { type: "CreateTrip", command_id: `create-${trip}`, occurred_at: new Date().toISOString(), unit_id: UNIT, trip_id: trip,
        courier_actor_id: "rid-1", deliveries: [{ delivery_id: `D-${trip}`, order_ref: `P-${trip}` }], actor: { actor_id: "ops-console-1", role: "operador_expedicao" } });
      assert.equal(c.result?.ok, true, JSON.stringify(c).slice(0, 200));
      if (sair) {
        const d = await cmd(RIDER, { type: "ConfirmTripDeparture", command_id: `depart-${trip}`, occurred_at: new Date().toISOString(), unit_id: UNIT, trip_id: trip,
          actor: { actor_id: "rid-1", role: "motoboy_interno" } });
        assert.equal(d.result?.ok, true, JSON.stringify(d).slice(0, 200));
      }
    };
    await montar("X1-SAIU", true);
    await montar("X1-PARADA", false);

    await prova("o motoboy recebe, pela credencial delegada, a concessão da PRÓPRIA viagem — presa a ele e ao aparelho dele", async () => {
      const r = await pedir("Bearer " + pt1("dev-r1", "rid-1"), ["X1-SAIU"]);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const v = verifyTripCaptureGrant(r.body.grants["X1-SAIU"], new Map([[UNIT, SECRET]]), new Date());
      assert.ok(v.ok, "concessão inválida");
      assert.deepEqual([v.claims.actor_id, v.claims.device_id, v.claims.trip_id, v.claims.unit_id], ["rid-1", "dev-r1", "X1-SAIU", UNIT]);
    });
    await prova("outro motoboy, com credencial delegada VÁLIDA, recebe nulo para a viagem de rid-1", async () => {
      const r = await pedir("Bearer " + pt1("dev-r2", "rid-2"), ["X1-SAIU"]);
      assert.equal(r.status, 200);
      assert.equal(r.body.grants["X1-SAIU"], null);
    });
    await prova("viagem ainda sem saída da loja não tem concessão; viagem inexistente também não", async () => {
      const r = await pedir("Bearer " + pt1("dev-r1", "rid-1"), ["X1-PARADA", "X1-NAO-EXISTE"]);
      assert.equal(r.body.grants["X1-PARADA"], null);
      assert.equal(r.body.grants["X1-NAO-EXISTE"], null);
    });
    await prova("sem credencial, com o token da plataforma ou com pt1 forjado, nada sai", async () => {
      assert.equal((await pedir(null, ["X1-SAIU"])).status, 401);
      assert.equal((await pedir("Bearer token-de-plataforma-qualquer", ["X1-SAIU"])).status, 401);
      const [h, c] = pt1("dev-r1", "rid-1").split(".").slice(0, 2);
      const forjado = await pedir(`Bearer ${h}.${c}.${Buffer.from("x".repeat(64)).toString("base64url")}`, ["X1-SAIU"]);
      assert.notEqual(forjado.status, 200);
    });
    await prova("pedido malformado ou grande demais é recusado", async () => {
      assert.equal((await pedir("Bearer " + pt1("dev-r1", "rid-1"), [])).status, 400);
      assert.equal((await pedir("Bearer " + pt1("dev-r1", "rid-1"), Array.from({ length: 21 }, (_, i) => "T" + i))).status, 400);
      assert.equal((await pedir("Bearer " + pt1("dev-r1", "rid-1"), [123])).status, 400);
    });
    console.log(`X1_TRIP_GRANTS_DELEGATED_HTTP_PASS ${ok}/${ok} REAL_PILOT_SYNTHETIC`);
  } finally {
    await stopTestProcess(proc);
    plataforma.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
