/**
 * Q-028 — O OBSERVADOR DA FILA: identidade de máquina, exclusivamente de leitura.
 *
 * Quem observa a fila em operação é um processo local, ao lado do piloto (o
 * servidor de apresentação, que já é só GET). Ele precisa de identidade no
 * piloto. Não pode ser um código humano de gerente ou líder (dá poder de
 * comando) nem o papel `sistema` (tem escrita no domínio).
 *
 * O mecanismo é o que já existe — usuário e token do piloto — com um papel de
 * máquina: `observador_fila`. O que esta suíte exige:
 *  - o papel alcança SÓ `GET /api/ready-orders/observation`, sem parâmetro. Toda
 *    outra rota ou método é recusado na borda, antes de qualquer outra regra;
 *  - o domínio também recusa (defesa em profundidade): nenhum comando, nenhum
 *    registro de pronto;
 *  - token de máquina forte: 32+ caracteres, sem marcador de exemplo, no arquivo e
 *    no ambiente;
 *  - não é motoboy, não aparece na escala, não vê rota nem coordenada.
 *
 * A parte HTTP sobe o processo REAL do piloto (modo arquivo).
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { asInternalRiderActorId } from "../foundation/brands";
import { loadCloudConfig, parseUsers } from "./cloud-config";
import { loadPilotConfig, type PilotConfig } from "./pilot-config";
import { PilotApplicationFacade } from "./pilot-facade";
import { createPilotLogger } from "./pilot-log";
import { FilePilotReadyOrderStore } from "./ready-orders";

const UNIT = "ITAIM";
let passed = 0;
const failures: string[] = [];
async function teste(nome: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  OK   ${nome}`);
  } catch (e) {
    failures.push(nome);
    console.error(`  FAIL ${nome}\n       ${(e as Error).message.split("\n").slice(0, 6).join("\n       ")}`);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TOKEN_OBS = "obs-maquina-sintetico-0123456789-abcdefgh";
const ORIGEM = { storage_backend: "file", process_started_at: "2026-11-01T09:00:00.000Z" };

function cfg(dir: string): PilotConfig {
  return {
    mode: "pilot", unit_id: UNIT, unit_name: "UNIDADE TESTE", timezone: "America/Sao_Paulo", port: 5199,
    bind: "127.0.0.1", data_dir: dir, max_stops: 5, banner: "PILOTO {unit_name}", source_mode: "simulated",
    users: [
      { actor_id: "ops-1", role: "operador_expedicao", label: "Ops", token: "tok-ops" },
      { actor_id: "rid-1", role: "motoboy_interno", label: "Rider", token: "tok-rider" },
      { actor_id: "obs-1", role: "observador_fila" as PilotConfig["users"][number]["role"], label: "Observador", token: TOKEN_OBS },
    ],
    features: { demo_seed: false, demo_controls: false, map_poc: false, gps_production: false,
      auto_assignment: false, copiloto: false, shell: false },
  } as PilotConfig;
}

async function main(): Promise<void> {
  console.log("Q-028 — observador da fila: papel de máquina só de leitura");

  await teste("R1 ambiente: o papel de máquina é aceito, e com token fraco ou de exemplo é recusado mesmo em local", () => {
    const ok = parseUsers(`obs-1:observador_fila:Observador:${TOKEN_OBS}`);
    assert.deepEqual(ok.issues, [], JSON.stringify(ok.issues));
    assert.equal(ok.users[0]?.role, "observador_fila");
    for (const fraco of ["curto-demais-123", "TROQUE-ESTE-TOKEN-DO-OBSERVADOR-00000000"]) {
      const r = loadCloudConfig({ ENTREGAS_USERS: `obs-1:observador_fila:Observador:${fraco}` });
      const queixa = (r as { issues?: Array<{ message: string }> }).issues ?? [];
      assert.ok(queixa.some((i) => /obs-1/.test(i.message)), `token de máquina fraco aceito: ${fraco} ${JSON.stringify(queixa)}`);
      assert.equal((r as { ok?: boolean }).ok, false, `a configuração subiria com ${fraco}`);
    }
  });

  await teste("R2 arquivo do piloto: observador com token de máquina fraco não sobe", () => {
    const dir = mkdtempSync(join(tmpdir(), "obs-cfg-"));
    try {
      const fraco = { ...cfg(dir), users: [...cfg(dir).users.slice(0, 2),
        { actor_id: "obs-1", role: "observador_fila", label: "Observador", token: "obs-curto" }] };
      writeFileSync(join(dir, "pilot.json"), JSON.stringify(fraco));
      assert.throws(() => loadPilotConfig(join(dir, "pilot.json")), /observador_fila|máquina|maquina/i);
      writeFileSync(join(dir, "pilot.json"), JSON.stringify(cfg(dir)));
      assert.equal(loadPilotConfig(join(dir, "pilot.json")).users.length, 3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await teste("R2b arquivo do piloto: papel desconhecido não sobe (não vira leitor do snapshot inteiro)", () => {
    const dir = mkdtempSync(join(tmpdir(), "obs-papel-"));
    try {
      const inventado = { ...cfg(dir), users: [...cfg(dir).users, { actor_id: "x-1", role: "gerente_geral", label: "X", token: "tok-x-123" }] };
      writeFileSync(join(dir, "pilot.json"), JSON.stringify(inventado));
      assert.throws(() => loadPilotConfig(join(dir, "pilot.json")), /papel desconhecido "gerente_geral"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await teste("R3 fachada e domínio: o observador lê a fila, mas não registra pronto nem executa comando", async () => {
    const dir = mkdtempSync(join(tmpdir(), "obs-fachada-"));
    try {
      const facade = new PilotApplicationFacade(cfg(dir), createPilotLogger(dir), undefined,
        new FilePilotReadyOrderStore(join(dir, "ready_orders.json")), { internalRiders: () => new Set(["rid-1"]) });
      const ops = { actor_id: "ops-1", role: "operador_expedicao" as const };
      const obs = { actor_id: "obs-1", role: "observador_fila" as never };
      assert.equal((await facade.withActor(ops, () => facade.registerReadyOrder("A", "Pedido A · Rua Sintética 9", "proprio"))).ok, true);
      const lido = await facade.withActor(obs, () => facade.observeReadyQueue(ORIGEM));
      assert.equal(lido.ok, true, JSON.stringify(lido));
      const reg = await facade.withActor(obs, () => facade.registerReadyOrder("B", "Pedido B", "proprio"));
      assert.equal(reg.ok, false, "o observador registrou pronto");
      const cmd = await facade.executeAs(obs, { type: "CreateTrip", command_id: "obs-ct", occurred_at: new Date().toISOString(),
        unit_id: UNIT, trip_id: "T-OBS", courier_actor_id: asInternalRiderActorId("rid-1"),
        deliveries: [{ delivery_id: "DA", order_ref: "A" }], actor: obs });
      assert.equal(cmd.ok, false, "o observador montou viagem");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await provaDeProcesso();

  const total = passed + failures.length;
  console.log(`OBSERVADOR_FILA: ${passed}/${total} PASS`);
  if (failures.length) {
    console.log(`OBSERVADOR_FILA_RED: ${failures.map((f) => f.split(" ")[0]).join(" ")}`);
    process.exit(1);
  }
  console.log("OBSERVADOR_FILA_GREEN");
}

async function provaDeProcesso(): Promise<void> {
  const { spawn } = await import("node:child_process");
  const { createServer } = await import("node:net");
  const RAIZ = process.cwd();
  if (existsSync(join(RAIZ, "config", "entregas-unit-itaim.json"))) {
    console.log("  PULADO processo: config/entregas-unit-itaim.json presente — H1-H3 NAO rodaram");
    return;
  }
  const porta = await new Promise<number>((ok, falha) => {
    const s = createServer();
    s.once("error", falha);
    s.listen(0, "127.0.0.1", () => { const a = s.address(); s.close(() => ok(typeof a === "object" && a ? a.port : 0)); });
  });
  const tok = { ops: "tok-ops-obs-proc-sintetico-01", rid: "tok-rid-obs-proc-sintetico-01" };
  const dir = mkdtempSync(join(tmpdir(), "obs-processo-"));
  mkdirSync(join(dir, "dados"), { recursive: true });
  writeFileSync(join(dir, "pilot.json"), JSON.stringify({
    ...cfg(join(dir, "dados")), port: porta,
    users: [
      { actor_id: "ops-1", role: "operador_expedicao", label: "Caixa", token: tok.ops },
      { actor_id: "rid-1", role: "motoboy_interno", label: "Motoboy", token: tok.rid },
      { actor_id: "obs-1", role: "observador_fila", label: "Observador local", token: TOKEN_OBS },
    ],
    backup: { auto_interval_minutes: 600, retain_count: 2, dir: join(dir, "backups") },
  }));
  writeFileSync(join(dir, "flags.json"), JSON.stringify({ gps_capture_enabled: false }));
  writeFileSync(join(dir, "termo.json"), JSON.stringify({}));
  const env: Record<string, string | undefined> = { ...process.env, ENTREGAS_UI_PORT: String(porta),
    ENTREGAS_PILOT_CONFIG: join(dir, "pilot.json"), ENTREGAS_DATA_DIR: join(dir, "dados"),
    ENTREGAS_TERM_CONFIG: join(dir, "termo.json"), ENTREGAS_GPS_FLAGS_CONFIG: join(dir, "flags.json") };
  for (const k of ["ENTREGAS_UNIT_CONFIG", "ENTREGAS_BIND", "ENTREGAS_HTTPS", "ENTREGAS_STORAGE_BACKEND", "ENTREGAS_PLATFORM_URL", "ENTREGAS_USERS"]) delete env[k];
  const sep = process.platform === "win32" ? ";" : ":";
  const tsxCli = (process.env.PATH ?? "").split(sep).map((b) => join(b, "..", "tsx", "dist", "cli.mjs")).find((c) => existsSync(c));
  if (!tsxCli) throw new Error("tsx_cli_nao_localizado_no_path");
  const base = `http://127.0.0.1:${porta}`;
  const log: string[] = [];
  const pr = spawn(process.execPath, [tsxCli, "tools/entregas_pilot_server.ts"], {
    cwd: RAIZ, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
  pr.stdout?.on("data", (d) => log.push(String(d)));
  pr.stderr?.on("data", (d) => log.push(String(d)));
  const api = async (caminho: string, token: string | null, metodo = "GET", corpo?: unknown) => {
    const r = await fetch(`${base}${caminho}`, { method: metodo,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const t = await r.text();
    return { status: r.status, texto: t };
  };
  try {
    let subiu = false;
    for (let i = 0; i < 160 && !subiu; i++) {
      try { subiu = (await fetch(`${base}/api/health`)).ok; } catch { /* subindo */ }
      if (!subiu) await sleep(250);
    }
    if (!subiu) throw new Error(`piloto não subiu: ${log.join("").slice(-400)}`);
    assert.equal((await api("/api/ready-order", tok.ops, "POST", { order_ref: "H-1", label: "Pedido H-1 · Rua Sintética 9", channel: "proprio" })).status, 200);
    await api("/api/command", tok.ops, "POST", { type: "CreateTrip", command_id: "h-ct", occurred_at: new Date().toISOString(),
      unit_id: UNIT, trip_id: "TH", courier_actor_id: "rid-1", deliveries: [] });

    await teste("H1 processo real: o observador recebe a saída mínima da fila, sem rótulo", async () => {
      const r = await api("/api/ready-orders/observation", TOKEN_OBS);
      assert.equal(r.status, 200, r.texto.slice(0, 200));
      const o = JSON.parse(r.texto) as { unit_id: string; entries: Array<{ order_ref: string }> };
      assert.equal(o.unit_id, UNIT);
      assert.deepEqual(o.entries.map((e) => e.order_ref), ["H-1"]);
      assert.equal(r.texto.includes("Rua Sintética"), false);
    });

    await teste("H2 processo real: em qualquer outra rota ou método o observador é recusado na borda (403), sem corpo de dado", async () => {
      const casos: Array<[string, string, unknown?]> = [
        ["GET", "/api/snapshot"], ["POST", "/api/command", { type: "CreateTrip", command_id: "x" }],
        ["POST", "/api/ready-order", { order_ref: "Z", label: "Z" }], ["POST", "/api/session", { token: TOKEN_OBS }],
        ["GET", "/api/session"], ["GET", "/api/policies"], ["GET", "/api/term"], ["POST", "/api/term/acknowledge", {}],
        ["GET", "/api/trip/timeline?trip_id=TH"], ["GET", "/api/trip/location?trip_id=TH"], ["GET", "/api/trip/route?trip_id=TH"],
        ["GET", "/api/backups"], ["POST", "/api/backup", {}], ["POST", "/api/restore", {}],
        ["GET", "/api/copiloto/source"], ["GET", "/api/copiloto/lab-storage"], ["GET", "/console/index.html"],
        ["POST", "/api/ready-orders/observation", {}], ["GET", "/api/ready-orders/observation?unit_id=MOOCA"],
      ];
      for (const [metodo, caminho, corpo] of casos) {
        const r = await api(caminho, TOKEN_OBS, metodo, corpo);
        assert.equal(r.status, 403, `${metodo} ${caminho} respondeu ${r.status}: ${r.texto.slice(0, 120)}`);
        assert.match(r.texto, /observer_read_only/, `${metodo} ${caminho}: recusa sem o motivo da borda`);
        assert.equal(r.texto.includes("H-1") || r.texto.includes("TH"), false, `${metodo} ${caminho}: a recusa trouxe dado`);
      }
      const fila = JSON.parse((await api("/api/ready-orders/observation", TOKEN_OBS)).texto) as { entries: unknown[] };
      assert.equal(fila.entries.length, 1, "alguma tentativa do observador mudou a fila");
    });

    await teste("H3 processo real: o observador não é motoboy nem aparece na escala de quem expede", async () => {
      const snap = JSON.parse((await api("/api/snapshot", tok.ops)).texto) as { internal_riders?: Array<{ rider_id: string }> };
      assert.deepEqual((snap.internal_riders ?? []).map((r) => r.rider_id), ["rid-1"]);
    });
  } finally {
    const saiu = new Promise<void>((ok) => pr.once("exit", () => ok()));
    try { if (pr.pid) process.kill(process.platform === "win32" ? pr.pid : -pr.pid, "SIGTERM"); } catch { /* saiu */ }
    await Promise.race([saiu, sleep(10_000)]);
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
