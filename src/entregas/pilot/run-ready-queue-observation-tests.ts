/**
 * A SAÍDA MÍNIMA DA FILA DE PRONTOS — o que o piloto entrega para quem observa.
 *
 * `snapshot()` já lê a fila pela porta `readyOrders.list()`, nos dois modos.
 * Mas a rota que o serve (`/api/snapshot`) leva o snapshot bruto: rótulo com
 * endereço, viagens, ocorrências e motoboys; descarta o instante do registro;
 * não diz unidade, origem, quando foi lida, se a fila estava legível, nem o
 * modo de cada registro. Esta suíte exige a saída mínima pela MESMA porta:
 *
 *  - só pedido, canal, instante do registro e modo declarado no registro
 *    (ausente = null, nunca real);
 *  - unidade, origem, instante da observação e disponibilidade;
 *  - fila ilegível = indisponível, nunca zero; linha inválida contada;
 *  - a marca do último `delivery_ready` publicado, lida DEPOIS da fila, para a
 *    plataforma saber se os fatos dela estão atrasados;
 *  - só gerente e líder; motoboy e operador recusados; sem sessão, 401;
 *  - custo pela fila: nenhuma lista de viagens, ocorrências ou motoboys.
 *
 * A parte HTTP sobe o processo REAL do piloto (modo arquivo, como no campo).
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { asInternalRiderActorId } from "../foundation/brands";
import { openFileUnitOfWork } from "../persistence/file-store";
import type { UnitOfWork } from "../persistence/ports";
import type { PilotConfig } from "./pilot-config";
import { PilotApplicationFacade } from "./pilot-facade";
import { createPilotLogger } from "./pilot-log";
import { createFilePilotUnitOfWorkSource, type PilotUnitOfWorkSource } from "./pilot-storage";
import { FilePilotReadyOrderStore, type PilotReadyOrderStore } from "./ready-orders";

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

const ORIGEM = { storage_backend: "file", process_started_at: "2026-11-01T09:00:00.000Z" };
const CHAVES_TOPO = ["availability", "entries", "facts_watermark", "invalid_entries", "observed_at", "origin",
  "reason", "schema", "total", "unit_id"];
const CHAVES_LINHA = ["channel", "order_ref", "registered_at", "source_mode"];

function cfg(dir: string, modo: PilotConfig["source_mode"] | null = "simulated"): PilotConfig {
  return {
    mode: "pilot", unit_id: UNIT, unit_name: "UNIDADE TESTE", timezone: "America/Sao_Paulo", port: 5199,
    bind: "127.0.0.1", data_dir: dir, max_stops: 5, banner: "PILOTO {unit_name}",
    source_mode: modo === null ? undefined : modo,
    users: [
      { actor_id: "ops-1", role: "operador_expedicao", label: "Ops", token: "tok-ops" },
      { actor_id: "rid-1", role: "motoboy_interno", label: "Rider", token: "tok-rider" },
      { actor_id: "ger-1", role: "gerente", label: "Gerente", token: "tok-ger" },
      { actor_id: "lid-1", role: "lider_delivery", label: "Líder", token: "tok-lid" },
    ],
    features: { demo_seed: false, demo_controls: false, map_poc: false, gps_production: false,
      auto_assignment: false, copiloto: false, shell: false },
  } as PilotConfig;
}

interface Piloto { dir: string; facade: PilotApplicationFacade; ready: PilotReadyOrderStore }
function abrir(dir: string, o: { storage?: PilotUnitOfWorkSource; modo?: PilotConfig["source_mode"] | null } = {}): Piloto {
  const ready = new FilePilotReadyOrderStore(join(dir, "ready_orders.json"));
  const facade = new PilotApplicationFacade(cfg(dir, o.modo), createPilotLogger(dir), o.storage, ready,
    { internalRiders: () => new Set(["rid-1"]) });
  return { dir, facade, ready };
}
const novoDir = (n: string) => mkdtempSync(join(tmpdir(), `ready-obs-${n}-`));

async function registrar(p: Piloto, ref: string): Promise<void> {
  p.facade.login("tok-ops");
  const r = await p.facade.registerReadyOrder(ref, `Pedido ${ref} · Rua Sintética 9`, "proprio");
  assert.equal(r.ok, true, r.human);
  await sleep(3);
}
async function viagem(p: Piloto, trip: string, refs: string[]) {
  p.facade.login("tok-ops");
  return await p.facade.execute({ type: "CreateTrip", command_id: `ct-${trip}`, occurred_at: new Date().toISOString(),
    unit_id: UNIT, trip_id: trip, courier_actor_id: asInternalRiderActorId("rid-1"),
    deliveries: refs.map((r) => ({ delivery_id: `D${r}`, order_ref: r })),
    actor: { actor_id: "ops-1", role: "operador_expedicao" } });
}

type Obs = Record<string, unknown> & { entries: Array<Record<string, unknown>>; facts_watermark: Record<string, unknown> };
/** A chamada nova, nomeada: ausente antes da correção. */
async function observar(p: Piloto, quem: string | null): Promise<{ ok: boolean; code?: string; observation?: Obs }> {
  const f = (p.facade as unknown as Record<string, unknown>).observeReadyQueue;
  if (typeof f !== "function") throw new Error("fachada sem observeReadyQueue: não há saída mínima da fila");
  const ator = quem === null ? null : cfg(p.dir).users.find((u) => u.token === quem)!;
  return await p.facade.withActor(ator ? { actor_id: ator.actor_id, role: ator.role } : null,
    () => (f as (o: typeof ORIGEM) => Promise<{ ok: boolean; code?: string; observation?: Obs }>).call(p.facade, ORIGEM));
}

async function main(): Promise<void> {
  console.log("SAÍDA MÍNIMA DA FILA — campos, papel, falha, marca, reinício e custo");

  await teste("Q1 só os campos permitidos, com unidade, origem, instante e disponibilidade — sem rótulo nem autor", async () => {
    const p = abrir(novoDir("q1"));
    await registrar(p, "B");
    await registrar(p, "C");
    const r = await observar(p, "tok-ger");
    assert.equal(r.ok, true, JSON.stringify(r));
    const o = r.observation!;
    assert.deepEqual(Object.keys(o).sort(), CHAVES_TOPO);
    assert.equal(o.schema, "deliveryos.ready-queue-observation.v1");
    assert.equal(o.unit_id, UNIT);
    assert.deepEqual(o.origin, { system: "entregas-pilot", ...ORIGEM });
    assert.equal(o.availability, "available");
    assert.equal(o.reason, null);
    assert.equal(o.total, 2);
    assert.ok(Number.isFinite(Date.parse(String(o.observed_at))));
    for (const e of o.entries) assert.deepEqual(Object.keys(e).sort(), CHAVES_LINHA);
    const fila = await p.ready.list();
    assert.deepEqual(o.entries.map((e) => [e.order_ref, e.registered_at, e.channel]),
      fila.map((l) => [l.order_ref, l.created_at, "proprio"]), "o instante do registro mudou na saída");
    const texto = JSON.stringify(o);
    assert.equal(texto.includes("Rua Sintética"), false, "o rótulo com endereço saiu");
    assert.equal(texto.includes("ops-1"), false, "quem registrou saiu");
    assert.equal(texto.includes("rid-1"), false, "motoboy saiu");
  });

  await teste("Q2 modo declarado no registro; registro antigo ou piloto sem modo saem null, nunca real", async () => {
    const dir = novoDir("q2");
    const p = abrir(dir);
    await registrar(p, "S1");
    const semModo = abrir(dir, { modo: null });
    await registrar(semModo, "N1");
    const bruto = JSON.parse(readFileSync(join(dir, "ready_orders.json"), "utf8")) as { orders: Array<Record<string, unknown>> };
    bruto.orders.push({ order_ref: "L1", label: "Pedido antigo", channel: "proprio", created_at: new Date().toISOString() });
    writeFileSync(join(dir, "ready_orders.json"), JSON.stringify(bruto));
    const o = (await observar(p, "tok-ger")).observation!;
    const modo = new Map(o.entries.map((e) => [e.order_ref, e.source_mode]));
    assert.equal(modo.get("S1"), "simulated", "o modo do piloto não foi declarado no registro");
    assert.equal(modo.get("N1"), null, "piloto sem modo declarou um modo");
    assert.equal(modo.get("L1"), null, "registro antigo ganhou modo");
    assert.equal([...modo.values()].includes("real"), false);
  });

  await teste("Q3 papel: gerente e líder observam; operador e motoboy recusados; sem sessão, recusa de sessão", async () => {
    const p = abrir(novoDir("q3"));
    await registrar(p, "B");
    assert.equal((await observar(p, "tok-ger")).ok, true);
    assert.equal((await observar(p, "tok-lid")).ok, true);
    const mot = await observar(p, "tok-rider");
    assert.equal(mot.ok, false);
    assert.equal(mot.code, "manager_required");
    assert.equal(mot.observation, undefined, "o motoboy recebeu a fila");
    assert.equal((await observar(p, "tok-ops")).code, "manager_required");
    assert.equal((await observar(p, null)).code, "session_required");
  });

  await teste("Q4 fila ilegível: indisponível com motivo, total null, nenhuma linha — nunca zero; a marca segue", async () => {
    const dir = novoDir("q4");
    const p = abrir(dir);
    await registrar(p, "A");
    assert.equal((await viagem(p, "T1", ["A"])).ok, true);
    writeFileSync(join(dir, "ready_orders.json"), "{ corrompido");
    const o = (await observar(p, "tok-ger")).observation!;
    assert.equal(o.availability, "unavailable");
    assert.equal(o.reason, "ready_queue_unreadable");
    assert.equal(o.total, null, "fila ilegível virou zero");
    assert.equal(o.invalid_entries, null);
    assert.deepEqual(o.entries, []);
    assert.equal(o.facts_watermark.availability, "available");
    assert.equal(typeof o.facts_watermark.last_event_id, "string", "a falha da fila apagou a marca");
  });

  await teste("Q5 linha com instante ilegível fica fora e é CONTADA, nunca some calada", async () => {
    const dir = novoDir("q5");
    const p = abrir(dir);
    await registrar(p, "B");
    const bruto = JSON.parse(readFileSync(join(dir, "ready_orders.json"), "utf8")) as { orders: Array<Record<string, unknown>> };
    bruto.orders.push({ order_ref: "Z", label: "x", created_at: "ontem" });
    writeFileSync(join(dir, "ready_orders.json"), JSON.stringify(bruto));
    const o = (await observar(p, "tok-ger")).observation!;
    assert.deepEqual(o.entries.map((e) => e.order_ref), ["B"]);
    assert.equal(o.total, 1);
    assert.equal(o.invalid_entries, 1);
  });

  await teste("Q6 marca: nada publicado = null; depois da viagem, o último delivery_ready; depois da saída, o trip_started", async () => {
    const dir = novoDir("q6");
    const p = abrir(dir);
    await registrar(p, "A");
    await registrar(p, "B");
    const vazio = (await observar(p, "tok-ger")).observation!.facts_watermark;
    assert.equal(vazio.last_event_id, null);
    assert.deepEqual(vazio.covered_types, ["delivery_ready", "delivery_removed", "trip_started"]);
    assert.equal((await viagem(p, "T1", ["A"])).ok, true);
    const ultimoDe = async (tipo: string) => (await openFileUnitOfWork(join(dir, "store.json")).outbox.all())
      .filter((r) => r.event.event_type === tipo).at(-1)!.event.event_id;
    const o = (await observar(p, "tok-ger")).observation!;
    assert.equal(o.facts_watermark.last_event_id, await ultimoDe("delivery_ready"));
    assert.deepEqual(o.entries.map((e) => e.order_ref), ["B"]);
    p.facade.login("tok-rider");
    assert.equal((await p.facade.execute({ type: "ConfirmTripDeparture", command_id: "dep-T1", occurred_at: new Date().toISOString(),
      unit_id: UNIT, trip_id: "T1", actor: { actor_id: "rid-1", role: "motoboy_interno" } })).ok, true);
    const depois = (await observar(p, "tok-ger")).observation!;
    assert.equal(depois.facts_watermark.last_event_id, await ultimoDe("trip_started"),
      "a saída publicada depois do pronto ficou fora da marca");
  });

  await teste("Q7 reinício: outra fachada sobre os mesmos arquivos observa as mesmas linhas, modos e marca", async () => {
    const dir = novoDir("q7");
    const p = abrir(dir);
    await registrar(p, "A");
    await registrar(p, "B");
    assert.equal((await viagem(p, "T1", ["A"])).ok, true);
    const antes = (await observar(p, "tok-ger")).observation!;
    const depois = (await observar(abrir(dir), "tok-ger")).observation!;
    assert.deepEqual(depois.entries, antes.entries);
    assert.deepEqual(depois.facts_watermark, antes.facts_watermark);
  });

  await teste("Q8 custo pela fila: observar não lista viagens, ocorrências, motoboys nem entregas", async () => {
    const dir = novoDir("q8");
    const chamadas: string[] = [];
    const base = createFilePilotUnitOfWorkSource(join(dir, "store.json"));
    const espiao: PilotUnitOfWorkSource = { kind: base.kind, dataPath: base.dataPath, open: () => {
      const uow = base.open();
      const espiar = <T extends object>(nome: string, repo: T): T => new Proxy(repo, { get(alvo, k, r) {
        const v = Reflect.get(alvo, k, r);
        return typeof v === "function" ? (...a: unknown[]) => { chamadas.push(`${nome}.${String(k)}`); return v.apply(alvo, a); } : v;
      } });
      return { get trips() { return espiar("trips", uow.trips); }, get handoffs() { return espiar("handoffs", uow.handoffs); },
        get occurrences() { return espiar("occurrences", uow.occurrences); }, get riders() { return espiar("riders", uow.riders); },
        get events() { return espiar("events", uow.events); }, get outbox() { return espiar("outbox", uow.outbox); },
        get inboundReceipts() { return uow.inboundReceipts; }, hasPendingWrites: () => uow.hasPendingWrites(),
        commit: () => uow.commit(), rollback: () => uow.rollback() } as UnitOfWork;
    } };
    const p = abrir(dir, { storage: espiao });
    await registrar(p, "A");
    await registrar(p, "B");
    assert.equal((await viagem(p, "T1", ["A"])).ok, true);
    chamadas.length = 0;
    assert.equal((await observar(p, "tok-ger")).ok, true);
    const pesadas = chamadas.filter((c) => !c.startsWith("outbox."));
    assert.deepEqual(pesadas, [], `a observação leu o histórico: ${pesadas.join(", ")}`);
    const externo = abrir(novoDir("q8b"), { storage: { kind: "external", open: espiao.open } });
    chamadas.length = 0;
    const o = (await observar(externo, "tok-ger")).observation!;
    assert.deepEqual(chamadas, [], "backend externo: a marca leu a outbox inteira");
    assert.equal(o.facts_watermark.availability, "unavailable");
    assert.equal(o.facts_watermark.last_event_id, null);
  });

  await provaDeProcesso();

  const total = passed + failures.length;
  console.log(`READY_QUEUE_OBSERVATION: ${passed}/${total} PASS`);
  if (failures.length) {
    console.log(`READY_QUEUE_OBSERVATION_RED: ${failures.map((f) => f.split(" ")[0]).join(" ")}`);
    process.exit(1);
  }
  console.log("READY_QUEUE_OBSERVATION_GREEN");
}

/** O processo REAL do piloto, em modo arquivo: autenticação por papel na rota. */
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
  const tok = { ger: "tok-ger-obs-sintetico-0001", ops: "tok-ops-obs-sintetico-0001", rid: "tok-rid-obs-sintetico-0001" };
  const dir = mkdtempSync(join(tmpdir(), "ready-obs-processo-"));
  mkdirSync(join(dir, "dados"), { recursive: true });
  writeFileSync(join(dir, "pilot.json"), JSON.stringify({
    mode: "pilot", unit_id: UNIT, unit_name: "UNIDADE DE TESTE", timezone: "America/Sao_Paulo", port: porta,
    bind: "127.0.0.1", data_dir: join(dir, "dados"), max_stops: 5, banner: "TESTE AUTOMATIZADO", source_mode: "simulated",
    users: [
      { actor_id: "ger-1", role: "gerente", label: "Gerente", token: tok.ger },
      { actor_id: "ops-1", role: "operador_expedicao", label: "Caixa", token: tok.ops },
      { actor_id: "rid-1", role: "motoboy_interno", label: "Motoboy", token: tok.rid },
    ],
    features: { demo_seed: false, demo_controls: false, map_poc: false, gps_production: false,
      auto_assignment: false, copiloto: false, shell: false },
    backup: { auto_interval_minutes: 600, retain_count: 2, dir: join(dir, "backups") },
  }));
  writeFileSync(join(dir, "flags.json"), JSON.stringify({ gps_capture_enabled: false }));
  writeFileSync(join(dir, "termo.json"), JSON.stringify({}));
  const env: Record<string, string | undefined> = { ...process.env, ENTREGAS_UI_PORT: String(porta),
    ENTREGAS_PILOT_CONFIG: join(dir, "pilot.json"), ENTREGAS_DATA_DIR: join(dir, "dados"),
    ENTREGAS_TERM_CONFIG: join(dir, "termo.json"), ENTREGAS_GPS_FLAGS_CONFIG: join(dir, "flags.json") };
  for (const k of ["ENTREGAS_UNIT_CONFIG", "ENTREGAS_BIND", "ENTREGAS_HTTPS", "ENTREGAS_STORAGE_BACKEND", "ENTREGAS_PLATFORM_URL"]) delete env[k];
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
    let json: Record<string, unknown> = {};
    try { json = t ? JSON.parse(t) as Record<string, unknown> : {}; } catch { json = { bruto: t.slice(0, 120) }; }
    return { status: r.status, json };
  };
  try {
    let subiu = false;
    for (let i = 0; i < 160 && !subiu; i++) {
      try { subiu = (await fetch(`${base}/api/health`)).ok; } catch { /* subindo */ }
      if (!subiu) await sleep(250);
    }
    if (!subiu) throw new Error(`piloto não subiu: ${log.join("").slice(-400)}`);
    assert.equal((await api("/api/ready-order", tok.ops, "POST", { order_ref: "H-1", label: "Pedido H-1 · Rua Sintética 9", channel: "proprio" })).status, 200);
    const ROTA = "/api/ready-orders/observation";

    await teste("H1 processo real: gerente recebe a saída mínima; nenhum rótulo; unidade do piloto", async () => {
      const r = await api(ROTA, tok.ger);
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.deepEqual(Object.keys(r.json).sort(), CHAVES_TOPO);
      assert.equal(r.json.unit_id, UNIT);
      assert.deepEqual((r.json.entries as Array<Record<string, unknown>>).map((e) => [e.order_ref, e.source_mode]), [["H-1", "simulated"]]);
      assert.equal(JSON.stringify(r.json).includes("Rua Sintética"), false);
      assert.equal((r.json.origin as Record<string, unknown>).storage_backend, "file");
    });

    await teste("H2 processo real: sem sessão 401; motoboy e operador 403, sem corpo de fila", async () => {
      const sem = await api(ROTA, null);
      assert.equal(sem.status, 401);
      for (const t of [tok.rid, tok.ops]) {
        const r = await api(ROTA, t);
        assert.equal(r.status, 403);
        assert.equal(JSON.stringify(r.json).includes("H-1"), false, "a recusa carregou a fila");
      }
    });

    await teste("H3 processo real: só leitura e sem parâmetro — POST 405; ?unit_id e ?token na URL 400", async () => {
      assert.equal((await api(ROTA, tok.ger, "POST", {})).status, 405);
      assert.equal((await api(`${ROTA}?unit_id=MOOCA`, tok.ger)).status, 400);
      assert.equal((await api(`${ROTA}?token=${tok.ger}`, null)).status, 400, "token na URL foi aceito");
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
