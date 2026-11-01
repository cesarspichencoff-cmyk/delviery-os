/**
 * CADEIA INTEGRADA DA V1 — fila, eventos de Entregas e Copiloto, numa cadeia só.
 * ============================================================================
 * Laboratório, com dados sintéticos em modo `simulated`. Nada é chamado em
 * processo: sobem os binários de `dist/`, cada um com a sua identidade mínima,
 * na topologia do ensaio (tudo ao lado do piloto, banco atrás de uma rede):
 *
 *   piloto (arquivo)  assina a outbox com a chave do produtor (Ed25519),
 *                     registrada pelo rito oficial (admin:entregas:producer,
 *                     plano + fingerprint + aplicação)
 *   source-ingest     lê o store.json no lugar; atestação EXIGIDA; papel mínimo
 *   assíncrono        drena a outbox; papel mínimo
 *   apresentação      Copiloto (/api/copiloto) e a fila observada
 *                     (/api/entregas/prontos): papel PostgreSQL SÓ DE LEITURA e o
 *                     observador local da fila com identidade de máquina (Q-028)
 *   rede              os quatro processos chegam ao banco por um proxy TCP que a
 *                     prova corta e restaura (queda de rede de verdade)
 *
 * O que fica provado: identidade verificável (fato assinado e admitido; papel
 * do observador e papel de leitura que não escrevem); a fila, os fatos e o
 * Copiloto concordam; queda de rede não vira zero nem perde nem duplica;
 * reinício de cada processo; o bloqueio de `real` (20/10) continua de pé.
 *
 * Exige DELIVERYOS_PG_URL e `npm run build:platform`; sem banco, PULA EM VOZ ALTA.
 */
import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, connect, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bancoIsolado } from "./banco-isolado";
import { createPgClient } from "./persistence/sql-client";

const URL_PG = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const RAIZ = process.cwd();
const BIN = {
  piloto: join(RAIZ, "dist/tools/entregas_pilot_server.js"),
  consumidor: join(RAIZ, "dist/src/platform/bin/entregas-source-ingest.js"),
  assincrono: join(RAIZ, "dist/src/platform/bin/async-runtime.js"),
  apresentacao: join(RAIZ, "dist/tools/product_system_server.js"),
  produtor: join(RAIZ, "dist/tools/entregas_producer_admin.js"),
};
const UNIT = "ITAIM";

console.log("\n=== CADEIA INTEGRADA DA V1 — fila + Entregas + Copiloto (dist/ + PostgreSQL, laboratório) ===\n");
if (!URL_PG) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — nenhum processo real foi exercitado.");
  process.exit(0);
}
for (const [nome, caminho] of Object.entries(BIN)) {
  if (!existsSync(caminho)) {
    console.log(`FALHA: binário ${nome} ausente em ${caminho} — rode npm run build:platform`);
    process.exit(1);
  }
}

let passed = 0;
const failures: string[] = [];
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    failures.push(nome);
    console.log(`  XX  ${nome}\n      ${(e as Error).message.split("\n").slice(0, 6).join("\n      ")}`);
  }
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Processo { filho: ChildProcess; saida(): string; fim(): Promise<void> }
function subir(bin: string, env: NodeJS.ProcessEnv): Processo {
  const filho = spawn(process.execPath, [bin], { cwd: RAIZ, env, stdio: ["ignore", "pipe", "pipe"] });
  let buffer = "";
  filho.stdout?.on("data", (d: Buffer) => (buffer += d.toString()));
  filho.stderr?.on("data", (d: Buffer) => (buffer += d.toString()));
  const saiu = new Promise<void>((r) => filho.once("exit", () => r()));
  return {
    filho,
    saida: () => buffer,
    fim: async () => {
      if (filho.exitCode === null && filho.signalCode === null) {
        filho.kill("SIGTERM");
        const t = setTimeout(() => filho.kill("SIGKILL"), 8000);
        await saiu;
        clearTimeout(t);
      }
    },
  };
}

async function portaLivre(): Promise<number> {
  return await new Promise((ok, falha) => {
    const s = createServer();
    s.once("error", falha);
    s.listen(0, "127.0.0.1", () => { const a = s.address(); s.close(() => ok(typeof a === "object" && a ? a.port : 0)); });
  });
}

async function ate<T>(descricao: string, fn: () => Promise<T | null>, prazoMs = 40_000): Promise<T> {
  const fim = Date.now() + prazoMs;
  let ultimo: unknown = null;
  while (Date.now() < fim) {
    try {
      const v = await fn();
      if (v !== null) return v;
    } catch (e) { ultimo = e; }
    await esperar(200);
  }
  throw new Error(`prazo esgotado: ${descricao}${ultimo ? ` (${(ultimo as Error).message})` : ""}`);
}

/**
 * A "rede" entre os processos e o banco: um proxy TCP que a prova corta (fecha
 * as conexões abertas e para de aceitar) e restaura. Funciona com PostgreSQL por
 * TCP (local) e por socket unix (CI: `?host=/dir`).
 */
class RedeDoBanco {
  private servidor: Server | null = null;
  private readonly abertas = new Set<Socket>();
  constructor(private readonly porta: number, private readonly destino: { host?: string; port?: number; path?: string }) {}
  async abrir(): Promise<void> {
    this.servidor = createServer((cliente) => {
      const alvo = this.destino.path ? connect(this.destino.path) : connect(this.destino.port!, this.destino.host!);
      this.abertas.add(cliente);
      this.abertas.add(alvo);
      const fechar = () => { cliente.destroy(); alvo.destroy(); this.abertas.delete(cliente); this.abertas.delete(alvo); };
      cliente.on("error", fechar); alvo.on("error", fechar); cliente.on("close", fechar); alvo.on("close", fechar);
      cliente.pipe(alvo); alvo.pipe(cliente);
    });
    await new Promise<void>((ok, falha) => { this.servidor!.once("error", falha); this.servidor!.listen(this.porta, "127.0.0.1", () => ok()); });
  }
  async cortar(): Promise<void> {
    const s = this.servidor;
    this.servidor = null;
    for (const c of this.abertas) c.destroy();
    this.abertas.clear();
    if (s) await new Promise<void>((ok) => s.close(() => ok()));
  }
}

function destinoDoBanco(url: string): { host?: string; port?: number; path?: string } {
  const u = new URL(url);
  const porta = Number(u.port || 5432);
  const dirSocket = u.searchParams.get("host");
  if (dirSocket && dirSocket.startsWith("/")) return { path: join(dirSocket, `.s.PGSQL.${porta}`) };
  return { host: u.hostname || "127.0.0.1", port: porta };
}

async function main(): Promise<void> {
  const db = await bancoIsolado(URL_PG, undefined, "v1_integrada");
  const admin = await createPgClient({ url: URL_PG, max: 1 });
  const sufixo = `${process.pid}_${randomBytes(3).toString("hex")}`;
  const papel = {
    critico: `v1i_crit_${sufixo}`, assincrono: `v1i_async_${sufixo}`, ingest: `v1i_ingest_${sufixo}`,
    piloto: `v1i_pilot_${sufixo}`, leitura: `v1i_leitura_${sufixo}`,
  };
  const senha = Object.fromEntries(Object.values(papel).map((p) => [p, randomBytes(18).toString("hex")])) as Record<string, string>;
  const portaRede = await portaLivre();
  const rede = new RedeDoBanco(portaRede, destinoDoBanco(db.url));
  const urlPelaRede = (r: string) => {
    const u = new URL(db.url);
    u.username = r; u.password = senha[r]!; u.hostname = "127.0.0.1"; u.port = String(portaRede); u.search = "";
    return u.toString();
  };
  const dir = mkdtempSync(join(tmpdir(), "v1-integrada-"));
  const dados = join(dir, "dados");
  const estado = join(dir, "consumidor");
  mkdirSync(dados, { recursive: true });
  mkdirSync(estado, { recursive: true });
  const portaPiloto = await portaLivre();
  const portaApresentacao = await portaLivre();
  const tok = { ops: "tok-ops-v1i-sintetico-0001", rid: "tok-rid-v1i-sintetico-0001",
    obs: `obs-v1i-${randomBytes(16).toString("hex")}` };
  const chave = generateKeyPairSync("ed25519");
  const produtor = { id: "entregas-piloto-itaim-lab", kid: `lab-${sufixo}` };

  let piloto: Processo | null = null;
  let consumidor: Processo | null = null;
  let assincrono: Processo | null = null;
  let apresentacao: Processo | null = null;
  try {
    /* ---------------- o banco: unidade, papéis mínimos e o papel de leitura ---------------- */
    await db.cliente.query(`INSERT INTO identity.unit(unit_id,display_name) VALUES ($1,'Teste')`, [UNIT]);
    const sqlPapeis = readFileSync(join(RAIZ, "deploy/sql/papeis_minimos.sql"), "utf8")
      .replaceAll("deliveryos_critical", papel.critico).replaceAll("deliveryos_async", papel.assincrono)
      .replaceAll("deliveryos_source_ingest", papel.ingest).replaceAll("deliveryos_entregas_pilot", papel.piloto);
    await db.cliente.query(sqlPapeis);
    await db.cliente.query(readFileSync(join(RAIZ, "deploy/sql/papel_leitura_produto.sql"), "utf8")
      .replaceAll("deliveryos_leitura", papel.leitura));
    for (const r of Object.values(papel)) await admin.query(`ALTER ROLE ${r} PASSWORD '${senha[r]}'`);
    await rede.abrir();

    /* ---------------- a chave do produtor, pelo rito oficial ---------------- */
    const pub = chave.publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const priv = chave.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
    const envAdmin = { ...process.env, DELIVERYOS_DATABASE_URL: db.url };
    const args = ["register", "--producer", produtor.id, "--kid", produtor.kid, "--unit", UNIT, "--public-key", pub,
      "--types", "trip_created,delivery_added,delivery_ready,delivery_removed,trip_started",
      "--modes", "simulated", "--not-before", new Date(Date.now() - 60_000).toISOString(),
      "--not-after", new Date(Date.now() + 3_600_000).toISOString(), "--by", "laboratorio"];
    const plano = JSON.parse(execFileSync(process.execPath, [BIN.produtor, ...args], { env: envAdmin, encoding: "utf8" })) as { fingerprint: string };
    const aplicado = JSON.parse(execFileSync(process.execPath, [BIN.produtor, ...args, "--apply=YES", "--expect", plano.fingerprint],
      { env: envAdmin, encoding: "utf8" })) as { applied?: boolean };

    /* ---------------- os processos ---------------- */
    writeFileSync(join(dir, "pilot.json"), JSON.stringify({
      mode: "pilot", unit_id: UNIT, unit_name: "UNIDADE DE TESTE", timezone: "America/Sao_Paulo", port: portaPiloto,
      bind: "127.0.0.1", data_dir: dados, max_stops: 5, banner: "LABORATORIO V1", source_mode: "simulated",
      users: [
        { actor_id: "ops-1", role: "operador_expedicao", label: "Caixa", token: tok.ops },
        { actor_id: "rid-1", role: "motoboy_interno", label: "Motoboy", token: tok.rid },
        { actor_id: "obs-local", role: "observador_fila", label: "Observador local", token: tok.obs },
      ],
      features: { demo_seed: false, demo_controls: false, map_poc: false, gps_production: false,
        auto_assignment: false, copiloto: false, shell: false },
      backup: { auto_interval_minutes: 600, retain_count: 2, dir: join(dir, "backups") },
    }));
    writeFileSync(join(dir, "flags.json"), JSON.stringify({ gps_capture_enabled: false }));
    writeFileSync(join(dir, "termo.json"), JSON.stringify({}));
    const chaveDoConsumidor = join(estado, "control");
    writeFileSync(chaveDoConsumidor, "RUN");
    const envPiloto: NodeJS.ProcessEnv = { ...process.env, ENTREGAS_UI_PORT: String(portaPiloto),
      ENTREGAS_PILOT_CONFIG: join(dir, "pilot.json"), ENTREGAS_DATA_DIR: dados, ENTREGAS_TERM_CONFIG: join(dir, "termo.json"),
      ENTREGAS_GPS_FLAGS_CONFIG: join(dir, "flags.json"), ENTREGAS_STORAGE_BACKEND: "file",
      ENTREGAS_PRODUCER_SIGNING_KEY_B64: priv, ENTREGAS_PRODUCER_ID: produtor.id, ENTREGAS_PRODUCER_KEY_ID: produtor.kid };
    for (const k of ["ENTREGAS_UNIT_CONFIG", "ENTREGAS_BIND", "ENTREGAS_HTTPS", "ENTREGAS_PLATFORM_URL", "DELIVERYOS_DATABASE_URL", "ENTREGAS_USERS"]) delete envPiloto[k];
    const envBase: NodeJS.ProcessEnv = { ...process.env, DELIVERYOS_ENV: "local", DELIVERYOS_MIGRATE_ON_BOOT: "false", DELIVERYOS_TICK_MS: "200" };
    delete envBase.DELIVERYOS_PG_URL;
    const envConsumidor: NodeJS.ProcessEnv = { ...envBase, DELIVERYOS_DATABASE_URL: urlPelaRede(papel.ingest),
      DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "true", DELIVERYOS_ENTREGAS_SOURCE_FILE: join(dados, "store.json"),
      DELIVERYOS_ENTREGAS_CONSUMER_STATE_FILE: join(estado, "checkpoint.json"), DELIVERYOS_ENTREGAS_KILL_SWITCH_FILE: chaveDoConsumidor,
      DELIVERYOS_ENTREGAS_SOURCE_TICK_MS: "200", DELIVERYOS_ENTREGAS_PRODUCER_ATTESTATION: "required" };
    const envAssincrono: NodeJS.ProcessEnv = { ...envBase, DELIVERYOS_DATABASE_URL: urlPelaRede(papel.assincrono) };
    const envApresentacao: NodeJS.ProcessEnv = { ...envBase, PRODUCT_UI_PORT: String(portaApresentacao),
      DELIVERYOS_DATABASE_URL: urlPelaRede(papel.leitura), DELIVERYOS_PRODUCT_READ_UNIT: UNIT,
      DELIVERYOS_FILA_PILOTO_URL: `http://127.0.0.1:${portaPiloto}`, DELIVERYOS_FILA_PILOTO_TOKEN: tok.obs };
    for (const k of ["DELIVERYOS_ENTREGAS_INCREMENTAL_RR", "DELIVERYOS_ENTREGAS_RR_DEADLINE_MS", "DELIVERYOS_ENTREGAS_MAX_INFLIGHT"]) delete envApresentacao[k];

    const basePiloto = `http://127.0.0.1:${portaPiloto}`;
    const baseApresentacao = `http://127.0.0.1:${portaApresentacao}`;
    const subirPiloto = async () => {
      const p = subir(BIN.piloto, envPiloto);
      await ate("piloto no ar", async () => ((await fetch(`${basePiloto}/api/health`).catch(() => null))?.ok ? true : null));
      return p;
    };
    const subirApresentacao = async () => {
      const p = subir(BIN.apresentacao, envApresentacao);
      await ate("apresentação no ar", async () => ((await fetch(`${baseApresentacao}/api/health`).catch(() => null))?.ok ? true : null), 60_000);
      return p;
    };
    const api = async (caminho: string, token: string, corpo?: unknown) => {
      const r = await fetch(`${basePiloto}${caminho}`, { method: corpo === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: corpo === undefined ? undefined : JSON.stringify(corpo) });
      const t = await r.text();
      return { status: r.status, texto: t, json: (() => { try { return JSON.parse(t) as Record<string, unknown>; } catch { return {}; } })() };
    };
    const comando = async (token: string, c: Record<string, unknown>) => {
      const r = await api("/api/command", token, { ...c, unit_id: UNIT, occurred_at: new Date().toISOString() });
      assert.equal((r.json.result as { ok?: boolean })?.ok, true, r.texto.slice(0, 300));
    };
    const ler = async (caminho: string) => {
      const r = await fetch(`${baseApresentacao}${caminho}`);
      const t = await r.text();
      return { status: r.status, texto: t, json: JSON.parse(t) as Record<string, unknown> };
    };
    type Prontos = { disponivel: boolean; motivo?: string; estado_atual: { consistencia_dos_fatos: string;
      na_fila: { estado: string; motivo: string | null; origem: { sistema: string } | null; grupos: Array<{ source_mode: string; pedidos: Array<{ order_ref: string }> }> };
      aguardando_saida: { grupos: Array<{ source_mode: string; entregas: Array<{ order_ref: string }> }> };
      retirados_sem_novo_registro: { grupos: Array<{ source_mode: string; total: number }> } };
      trajetoria: { grupos: Array<{ source_mode: string; entregas: Array<{ order_ref: string; situacao: string }> }> } };
    const prontos = async () => (await ler(`/api/entregas/prontos?unit_id=${UNIT}`)).json as unknown as Prontos;
    type Copiloto = { entregas_observadas: { estado: string; grupos: Array<{ unit_id: string; source_mode: string; viagens_na_projecao: number }> } };
    const copiloto = async () => (await ler(`/api/copiloto?unit_id=${UNIT}`)).json as unknown as Copiloto;
    const g = <T extends { source_mode: string }>(l: readonly T[] | undefined, m: string) => (l ?? []).find((x) => x.source_mode === m);
    const contar = async () => Object.fromEntries((await db.cliente.query<{ event_type: string; n: string }>(
      `SELECT event_type, count(*)::text AS n FROM platform.event_log WHERE unit_id=$1 GROUP BY 1`, [UNIT]))
      .map((x) => [x.event_type, Number(x.n)])) as Record<string, number>;

    await teste("I1 identidade: chave do produtor registrada pelo rito oficial (plano, fingerprint, aplicação); papéis sem superusuário", async () => {
      assert.equal(aplicado.applied, true, JSON.stringify(aplicado));
      const k = await db.cliente.query<{ allowed_modes: string[] }>(`SELECT allowed_modes FROM platform.producer_key WHERE producer_id=$1 AND key_id=$2`, [produtor.id, produtor.kid]);
      assert.deepEqual(k[0]?.allowed_modes, ["simulated"]);
      const super_ = await admin.query<{ n: string }>(`SELECT count(*)::text AS n FROM pg_roles WHERE rolname = ANY($1) AND (rolsuper OR rolcreaterole OR rolbypassrls)`, [Object.values(papel)]);
      assert.equal(super_[0]!.n, "0");
    });

    piloto = await subirPiloto();
    consumidor = subir(BIN.consumidor, envConsumidor);
    assincrono = subir(BIN.assincrono, envAssincrono);
    apresentacao = await subirApresentacao();
    await ate("assíncrono no ar", async () => (/\[assincrono\] replay/.test(assincrono!.saida()) ? true : null));

    for (const ref of ["A", "D", "F", "B", "C"]) {
      assert.equal((await api("/api/ready-order", tok.ops, { order_ref: ref, label: `Pedido ${ref} · Rua Sintética 9`, channel: "proprio" })).status, 200);
      await esperar(5);
    }
    await comando(tok.ops, { type: "CreateTrip", command_id: "v-ct", trip_id: "T1", courier_actor_id: "rid-1",
      deliveries: [{ delivery_id: "DA", order_ref: "A" }, { delivery_id: "DD", order_ref: "D" }] });
    await esperar(1100);
    await comando(tok.ops, { type: "AddDeliveryToTrip", command_id: "v-add", trip_id: "T1", delivery_id: "DF", order_ref: "F", planned_stop_order: 3 });
    await comando(tok.ops, { type: "RemoveDeliveryFromTrip", command_id: "v-rem", trip_id: "T1", delivery_id: "DD", reason: "teste sintético" });
    await comando(tok.rid, { type: "ConfirmTripDeparture", command_id: "v-dep", trip_id: "T1" });

    await teste("I2 fatos assinados e ADMITIDOS pela fronteira exigida: 3 prontos, 1 retirada, a saída — simulados, sem quarentena", async () => {
      const n = await ate("fatos admitidos", async () => {
        const c = await contar();
        return c.delivery_ready === 3 && c.delivery_removed === 1 && c.trip_started === 1 ? c : null;
      });
      assert.equal(n.trip_created, 1);
      const adm = await db.cliente.query<{ decisao: string; n: string }>(
        `SELECT decision AS decisao, count(*)::text AS n FROM platform.producer_admission GROUP BY 1`);
      const porDecisao = Object.fromEntries(adm.map((x) => [x.decisao, Number(x.n)]));
      assert.ok((porDecisao.admitted ?? 0) >= 6, `admissões: ${JSON.stringify(porDecisao)}`);
      assert.equal(porDecisao.quarantined ?? 0, 0, `quarentena inesperada: ${JSON.stringify(porDecisao)}`);
      const modos = await db.cliente.query<{ m: string }>(`SELECT DISTINCT source_mode AS m FROM platform.event_log`);
      assert.deepEqual(modos.map((x) => x.m), ["simulated"]);
      await ate("outbox drenada", async () => {
        const l = await db.cliente.query<{ state: string; n: string }>(`SELECT state, count(*)::text AS n FROM platform.outbox GROUP BY 1`);
        return l.length && l.every((x) => x.state === "done") ? true : null;
      });
    });

    await teste("I3 a mesma cadeia no Copiloto e na fila observada: T1 no Copiloto; fila B e C pelo observador; A e F saíram, D retirado", async () => {
      const c = await ate("Copiloto com T1", async () => {
        const x = await copiloto();
        return g(x.entregas_observadas?.grupos, "simulated")?.viagens_na_projecao === 1 ? x : null;
      });
      assert.equal(c.entregas_observadas.estado, "observado");
      assert.equal(g(c.entregas_observadas.grupos, "real"), undefined, "simulado apareceu como real");
      const p = await prontos();
      assert.equal(p.disponivel, true, JSON.stringify(p).slice(0, 300));
      assert.equal(p.estado_atual.na_fila.origem?.sistema, "entregas-pilot", "a fila não veio do observador local");
      assert.deepEqual(g(p.estado_atual.na_fila.grupos, "simulated")?.pedidos.map((x) => x.order_ref), ["B", "C"]);
      assert.equal(p.estado_atual.consistencia_dos_fatos, "fatos_em_dia");
      const t = new Map(g(p.trajetoria.grupos, "simulated")!.entregas.map((x) => [x.order_ref, x.situacao]));
      assert.deepEqual([t.get("A"), t.get("F"), t.get("D")], ["saiu", "saiu", "retirado_antes_da_saida"]);
      const textos = JSON.stringify(p) + JSON.stringify(c);
      assert.equal(textos.includes("Rua Sintética"), false, "rótulo com endereço chegou à apresentação");
    });

    await teste("I4 identidades que não escrevem: o observador é barrado no piloto; o papel de leitura é barrado no banco", async () => {
      const r = await api("/api/command", tok.obs, { type: "CreateTrip", command_id: "obs-x", unit_id: UNIT, trip_id: "TX",
        courier_actor_id: "rid-1", deliveries: [], occurred_at: new Date().toISOString() });
      assert.equal(r.status, 403);
      assert.match(r.texto, /observer_read_only/);
      const leitor = await createPgClient({ url: urlPelaRede(papel.leitura), max: 1 });
      try {
        assert.ok((await leitor.query(`SELECT count(*) FROM platform.event_log`)).length === 1);
        for (const [sql, oQue] of [
          [`INSERT INTO platform.event_log (event_id) VALUES ('x')`, "gravar fato"],
          [`UPDATE platform.outbox SET state='done'`, "mexer na outbox"],
          [`SELECT secret_hash FROM identity.device`, "ler o segredo do aparelho"],
          [`SELECT label FROM entregas.ready_order`, "ler o rótulo do pedido"],
          [`TRUNCATE platform.event_log`, "truncar o log"],
        ] as const) {
          await assert.rejects(leitor.query(sql), /permission denied|permissão negada/i, `o papel de leitura conseguiu ${oQue}`);
        }
      } finally {
        await leitor.close();
      }
    });

    await teste("I5 QUEDA DE REDE do banco: o piloto segue; Copiloto e fila ficam INDISPONÍVEIS (não zero); nada chega, nada se perde", async () => {
      const antes = await contar();
      await rede.cortar();
      await esperar(600);
      assert.equal((await api("/api/ready-order", tok.ops, { order_ref: "G", label: "Pedido G · Rua Sintética 9", channel: "proprio" })).status, 200);
      await comando(tok.ops, { type: "CreateTrip", command_id: "v-ct2", trip_id: "T2", courier_actor_id: "rid-1",
        deliveries: [{ delivery_id: "DB", order_ref: "B" }] });
      const p = await prontos();
      assert.equal(p.disponivel, false, `leitura com o banco fora: ${JSON.stringify(p).slice(0, 200)}`);
      const c = await copiloto();
      assert.equal(c.entregas_observadas.estado, "indisponivel", "o Copiloto não declarou a queda");
      assert.equal(JSON.stringify(c.entregas_observadas.grupos), "[]");
      await esperar(1500);
      assert.deepEqual(await contar(), antes, "algo chegou ao banco com a rede cortada");
      assert.equal(piloto!.filho.exitCode, null, "o piloto caiu junto com o banco");
    });

    await teste("I6 RECUPERAÇÃO: a rede volta e o atrasado chega uma vez — B aguardando saída, fila C e G, Copiloto com T2", async () => {
      await rede.abrir();
      const n = await ate("fato de B admitido depois da volta", async () => {
        const c = await contar();
        return c.delivery_ready === 4 ? c : null;
      }, 60_000);
      assert.equal(n.trip_created, 2);
      const p = await ate("leitura em dia", async () => {
        const x = await prontos();
        return x.disponivel && x.estado_atual.consistencia_dos_fatos === "fatos_em_dia" ? x : null;
      }, 60_000);
      assert.deepEqual(g(p.estado_atual.na_fila.grupos, "simulated")?.pedidos.map((x) => x.order_ref), ["C", "G"]);
      assert.deepEqual(g(p.estado_atual.aguardando_saida.grupos, "simulated")?.entregas.map((x) => x.order_ref), ["B"]);
      await ate("Copiloto com T2", async () => (g((await copiloto()).entregas_observadas?.grupos, "simulated")?.viagens_na_projecao === 2 ? true : null), 60_000);
      const dup = await db.cliente.query<{ n: string }>(`SELECT count(*)::text AS n FROM (SELECT idempotency_key FROM platform.event_log GROUP BY 1 HAVING count(*) > 1) d`);
      assert.equal(dup[0]!.n, "0");
    });

    await teste("I7 REINÍCIO de cada processo: consumidor, assíncrono, piloto e apresentação — sem duplicar, mesma leitura", async () => {
      const n0 = await contar();
      // O conteúdo da fila (pedido + instante do registro); a espera cresce com o relógio, de propósito.
      const conteudo = (x: Prontos) => JSON.stringify(x.estado_atual.na_fila.grupos.map((gr) => ({ modo: gr.source_mode,
        pedidos: gr.pedidos.map((pe) => [pe.order_ref, (pe as { registrado_em?: string }).registrado_em]) })));
      const leitura0 = conteudo(await prontos());
      await consumidor!.fim(); consumidor = subir(BIN.consumidor, envConsumidor);
      await assincrono!.fim(); assincrono = subir(BIN.assincrono, envAssincrono);
      await ate("assíncrono de volta", async () => (/\[assincrono\] replay/.test(assincrono!.saida()) ? true : null));
      await piloto!.fim(); piloto = await subirPiloto();
      await apresentacao!.fim(); apresentacao = await subirApresentacao();
      await esperar(1500);
      assert.deepEqual(await contar(), n0, "o reinício duplicou ou perdeu fato");
      const p = await prontos();
      assert.equal(conteudo(p), leitura0, "a fila mudou com o reinício");
      assert.equal(p.estado_atual.consistencia_dos_fatos, "fatos_em_dia");
      const st = await db.cliente.query<{ state: string }>(`SELECT DISTINCT state FROM platform.outbox`);
      assert.deepEqual(st.map((x) => x.state), ["done"]);
    });

    await teste("I9 o servidor de apresentação não manda o token do observador por HTTP fora do loopback", async () => {
      const porta2 = await portaLivre();
      const outra = subir(BIN.apresentacao, { ...envApresentacao, PRODUCT_UI_PORT: String(porta2),
        DELIVERYOS_FILA_PILOTO_URL: "http://10.255.255.1:5193" });
      try {
        await ate("segunda apresentação no ar", async () => ((await fetch(`http://127.0.0.1:${porta2}/api/health`).catch(() => null))?.ok ? true : null), 60_000);
        const p = (await (await fetch(`http://127.0.0.1:${porta2}/api/entregas/prontos?unit_id=${UNIT}`)).json()) as Prontos;
        assert.equal(p.estado_atual.na_fila.estado, "indisponivel");
        assert.equal(p.estado_atual.na_fila.motivo, "endereco_do_piloto_sem_tls", JSON.stringify(p.estado_atual.na_fila));
        assert.equal(JSON.stringify(p).includes(tok.obs), false, "o token apareceu na resposta");
      } finally {
        await outra.fim();
      }
    });

    await teste("I8 o bloqueio de real (20/10) segue: nenhum fato real; o rito oficial recusa conceder real", async () => {
      const reais = await db.cliente.query<{ n: string }>(`SELECT count(*)::text AS n FROM platform.event_log WHERE source_mode='real'`);
      assert.equal(reais[0]!.n, "0");
      const argsReal = ["register", "--producer", produtor.id, "--kid", `${produtor.kid}-real`, "--unit", UNIT,
        "--public-key", chave.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
        "--types", "trip_started", "--modes", "real", "--not-before", new Date().toISOString(),
        "--not-after", new Date(Date.now() + 60_000).toISOString(), "--by", "laboratorio"];
      let saida = "";
      try { saida = execFileSync(process.execPath, [BIN.produtor, ...argsReal], { env: envAdmin, encoding: "utf8" }); }
      catch (e) { saida = String((e as { stdout?: string }).stdout ?? ""); }
      const planoReal = JSON.parse(saida) as { can_apply?: boolean; conflicts?: string[] };
      assert.equal(planoReal.can_apply, false, `o rito aceitaria real: ${saida.slice(0, 300)}`);
      assert.ok((planoReal.conflicts ?? []).some((c) => /real/.test(c)), `recusa sem o motivo: ${JSON.stringify(planoReal.conflicts)}`);
    });
  } finally {
    await Promise.all([piloto, consumidor, assincrono, apresentacao].map((p) => p?.fim()));
    await rede.cortar().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
    await db.descartar();
    for (const r of Object.values(papel)) await admin.query(`DROP ROLE IF EXISTS ${r}`).catch(() => undefined);
    await admin.close();
  }

  const total = passed + failures.length;
  console.log(`\nCADEIA_V1_INTEGRADA: ${passed}/${total} PASS`);
  if (failures.length) {
    console.log(`CADEIA_V1_INTEGRADA_RED: ${failures.map((f) => f.split(" ")[0]).join(" ")}`);
    process.exit(1);
  }
  console.log("CADEIA_V1_INTEGRADA_GREEN");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
