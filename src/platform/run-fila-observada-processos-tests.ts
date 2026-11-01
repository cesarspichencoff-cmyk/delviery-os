/**
 * A FILA E OS FATOS DO PRONTO CHEGANDO À PLATAFORMA — PROCESSOS REAIS.
 * ============================================================================
 * Sucesso de laboratório não prova integração: aqui nada é chamado em
 * processo. Sobem os binários de `dist/`, como sobem em operação:
 *
 *   piloto (`dist/tools/entregas_pilot_server.js`, modo ARQUIVO, o do campo)
 *     ── HTTP do console ──▶ fila, viagem, acréscimo, retirada, saída
 *   consumidor (`dist/src/platform/bin/entregas-source-ingest.js`)
 *     ── lê o `store.json` do piloto, no lugar ──▶ platform.event_log + outbox
 *   assíncrono (`dist/src/platform/bin/async-runtime.js`)
 *     ── drena a outbox: Operação Viva + consumidor dos fatos da entrega
 *   leitor ── saída mínima do piloto por HTTP (gerente) + fatos do banco
 *
 * O que fica provado: os fatos chegam pelo consumidor EM EXECUÇÃO; a outbox é
 * drenada sem dead-letter; a viagem não muda; a fila observada e os fatos se
 * deduplicam; o atraso do consumidor aparece como `fatos_atrasados` (nunca um
 * estado completo inventado) e some quando ele volta; reinício de cada
 * processo não duplica nem perde; piloto fora do ar = fila indisponível, não
 * zero; nenhum rótulo, endereço ou autor chega à plataforma.
 *
 * Dados sintéticos, modo `simulated`, banco isolado e descartado.
 * Exige DELIVERYOS_PG_URL e `npm run build:platform`; sem banco, PULA EM VOZ ALTA.
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bancoIsolado } from "./banco-isolado";
import { observarFilaDoPiloto } from "./leitura/fila-do-piloto";
import { lerProntosDeEntregas } from "./leitura/prontos-de-entregas";
import { lerRealidadeDeEntregas } from "./leitura/realidade-de-entregas";

const URL_PG = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const RAIZ = process.cwd();
const BIN = {
  piloto: join(RAIZ, "dist/tools/entregas_pilot_server.js"),
  consumidor: join(RAIZ, "dist/src/platform/bin/entregas-source-ingest.js"),
  assincrono: join(RAIZ, "dist/src/platform/bin/async-runtime.js"),
};
const UNIT = "ITAIM";

console.log("\n=== FILA E FATOS DO PRONTO — PROCESSOS REAIS (dist/ + PostgreSQL) ===\n");
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
    console.log(`  XX  ${nome}\n      ${(e as Error).message.split("\n").slice(0, 5).join("\n      ")}`);
  }
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Processo { filho: ChildProcess; saida(): string; fim(): Promise<void> }
function subir(nome: string, bin: string, env: NodeJS.ProcessEnv): Processo {
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
      void nome;
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

async function ate<T>(descricao: string, fn: () => Promise<T | null>, prazoMs = 30_000): Promise<T> {
  const fim = Date.now() + prazoMs;
  let ultimo: unknown = null;
  while (Date.now() < fim) {
    try {
      const v = await fn();
      if (v !== null) return v;
    } catch (e) { ultimo = e; }
    await esperar(150);
  }
  throw new Error(`prazo esgotado: ${descricao}${ultimo ? ` (${(ultimo as Error).message})` : ""}`);
}

async function main(): Promise<void> {
  const db = await bancoIsolado(URL_PG, undefined, "fila_processos");
  const dir = mkdtempSync(join(tmpdir(), "fila-processos-"));
  const dados = join(dir, "dados");
  const estado = join(dir, "consumidor");
  mkdirSync(dados, { recursive: true });
  mkdirSync(estado, { recursive: true });
  const porta = await portaLivre();
  const tok = { ger: "tok-ger-proc-sintetico-0001", ops: "tok-ops-proc-sintetico-0001", rid: "tok-rid-proc-sintetico-0001" };
  writeFileSync(join(dir, "pilot.json"), JSON.stringify({
    mode: "pilot", unit_id: UNIT, unit_name: "UNIDADE DE TESTE", timezone: "America/Sao_Paulo", port: porta,
    bind: "127.0.0.1", data_dir: dados, max_stops: 5, banner: "TESTE AUTOMATIZADO", source_mode: "simulated",
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
  const chave = join(estado, "control");
  writeFileSync(chave, "RUN");

  const envPiloto: NodeJS.ProcessEnv = { ...process.env, ENTREGAS_UI_PORT: String(porta),
    ENTREGAS_PILOT_CONFIG: join(dir, "pilot.json"), ENTREGAS_DATA_DIR: dados,
    ENTREGAS_TERM_CONFIG: join(dir, "termo.json"), ENTREGAS_GPS_FLAGS_CONFIG: join(dir, "flags.json"),
    ENTREGAS_STORAGE_BACKEND: "file" };
  for (const k of ["ENTREGAS_UNIT_CONFIG", "ENTREGAS_BIND", "ENTREGAS_HTTPS", "ENTREGAS_PLATFORM_URL", "DELIVERYOS_DATABASE_URL"]) delete envPiloto[k];
  const envPlataforma: NodeJS.ProcessEnv = { ...process.env, DELIVERYOS_ENV: "local", DELIVERYOS_DATABASE_URL: db.url,
    DELIVERYOS_MIGRATE_ON_BOOT: "false", DELIVERYOS_TICK_MS: "200" };
  const envConsumidor: NodeJS.ProcessEnv = { ...envPlataforma, DELIVERYOS_ENTREGAS_SOURCE_INGEST_ENABLED: "true",
    DELIVERYOS_ENTREGAS_SOURCE_FILE: join(dados, "store.json"),
    DELIVERYOS_ENTREGAS_CONSUMER_STATE_FILE: join(estado, "checkpoint.json"),
    DELIVERYOS_ENTREGAS_KILL_SWITCH_FILE: chave, DELIVERYOS_ENTREGAS_SOURCE_TICK_MS: "200" };

  const base = `http://127.0.0.1:${porta}`;
  const api = async (caminho: string, token: string, corpo?: unknown) => {
    const r = await fetch(`${base}${caminho}`, { method: corpo === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const t = await r.text();
    return { status: r.status, json: (t ? JSON.parse(t) : {}) as Record<string, unknown> };
  };
  const comando = async (token: string, c: Record<string, unknown>) => {
    const r = await api("/api/command", token, { ...c, unit_id: UNIT, occurred_at: new Date().toISOString() });
    assert.equal((r.json.result as { ok?: boolean })?.ok, true, JSON.stringify(r.json));
  };
  const subirPiloto = async () => {
    const p = subir("piloto", BIN.piloto, envPiloto);
    await ate("piloto respondendo", async () => ((await fetch(`${base}/api/health`).catch(() => null))?.ok ? true : null));
    return p;
  };
  const contar = async () => {
    const l = await db.cliente.query<{ event_type: string; n: string }>(
      `SELECT event_type, count(*)::text AS n FROM platform.event_log WHERE unit_id=$1 GROUP BY 1`, [UNIT]);
    return Object.fromEntries(l.map((x) => [x.event_type, Number(x.n)])) as Record<string, number>;
  };
  const observar = () => observarFilaDoPiloto({ url_base: base, token: tok.ger, prazo_ms: 3000 });
  const ler = async () => lerProntosDeEntregas(db.cliente, { agora: new Date(), unit_id: UNIT, fila: await observar() });
  type Estado = { consistencia_dos_fatos: string; fila_velha: number | null;
    na_fila: { estado: string; motivo: string | null; grupos: Array<{ source_mode: string; pedidos: Array<{ order_ref: string; registrado_em: string }> }> };
    aguardando_saida: { grupos: Array<{ source_mode: string; total: number; entregas: Array<{ order_ref: string }> }> };
    retirados_sem_novo_registro: { grupos: Array<{ source_mode: string; total: number }> } };
  const g = <T extends { source_mode: string }>(l: readonly T[], m: string) => l.find((x) => x.source_mode === m);

  let piloto: Processo | null = null;
  let consumidor: Processo | null = null;
  let assincrono: Processo | null = null;
  try {
    await db.cliente.query(`INSERT INTO identity.unit(unit_id,display_name) VALUES ($1,'Teste')`, [UNIT]);
    piloto = await subirPiloto();
    consumidor = subir("consumidor", BIN.consumidor, envConsumidor);
    assincrono = subir("assincrono", BIN.assincrono, envPlataforma);
    await ate("assíncrono no ar", async () => (/\[assincrono\] replay/.test(assincrono!.saida()) ? true : null));

    for (const ref of ["A", "D", "F", "B", "C"]) {
      assert.equal((await api("/api/ready-order", tok.ops, { order_ref: ref, label: `Pedido ${ref} · Rua Sintética 9`, channel: "proprio" })).status, 200);
      await esperar(5);
    }
    await comando(tok.ops, { type: "CreateTrip", command_id: "p-ct", trip_id: "T1", courier_actor_id: "rid-1",
      deliveries: [{ delivery_id: "DA", order_ref: "A" }, { delivery_id: "DD", order_ref: "D" }] });
    await esperar(1100);
    await comando(tok.ops, { type: "AddDeliveryToTrip", command_id: "p-add", trip_id: "T1", delivery_id: "DF", order_ref: "F", planned_stop_order: 3 });
    await comando(tok.ops, { type: "RemoveDeliveryFromTrip", command_id: "p-rem", trip_id: "T1", delivery_id: "DD", reason: "teste sintético" });
    await comando(tok.rid, { type: "ConfirmTripDeparture", command_id: "p-dep", trip_id: "T1" });

    await teste("E1 o consumidor EM EXECUÇÃO leva os fatos do arquivo do piloto ao event log: 3 prontos, 1 retirada, a saída — simulados, uma vez", async () => {
      const n = await ate("fatos no event log", async () => {
        const c = await contar();
        return c.delivery_ready === 3 && c.delivery_removed === 1 && c.trip_started === 1 ? c : null;
      });
      assert.equal(n.delivery_ready, 3);
      const modos = await db.cliente.query<{ m: string }>(`SELECT DISTINCT source_mode AS m FROM platform.event_log WHERE unit_id=$1`, [UNIT]);
      assert.deepEqual(modos.map((x) => x.m), ["simulated"]);
      const pay = JSON.stringify(await db.cliente.query(`SELECT payload FROM platform.event_log WHERE unit_id=$1`, [UNIT]));
      assert.equal(pay.includes("Rua Sintética"), false, "rótulo com endereço chegou à plataforma");
      assert.equal(pay.includes("ops-1"), false, "quem registrou chegou à plataforma");
      assert.match(consumidor!.saida(), /\[source-ingest\] tick/, "o consumidor não registrou trabalho");
    });

    await teste("E2 o assíncrono EM EXECUÇÃO drena as mensagens da entrega sem dead-letter; a viagem segue só com os fatos dela", async () => {
      const st = await ate("outbox drenada", async () => {
        const l = await db.cliente.query<{ kind: string; state: string; n: string }>(
          `SELECT kind, state, count(*)::text AS n FROM platform.outbox GROUP BY 1,2`);
        const daEntrega = l.filter((x) => x.kind.startsWith("delivery_"));
        return daEntrega.length && daEntrega.every((x) => x.state === "done") ? l : null;
      });
      assert.equal(st.some((x) => x.state === "dead"), false, JSON.stringify(st));
      const real = await lerRealidadeDeEntregas(db.cliente, { agora: new Date(), unit_id: UNIT });
      const v = real.projecoes.find((p) => p.source_mode === "simulated")?.viagens.find((x) => x.trip_id === "T1");
      assert.equal(v?.estado, "em_rota");
      const daEntrega = new Set((await db.cliente.query<{ event_id: string }>(
        `SELECT event_id FROM platform.event_log WHERE event_type LIKE 'delivery_%'`)).map((x) => x.event_id));
      assert.equal(v!.eventos.some((id) => daEntrega.has(id)), false, "fato da entrega entrou na projeção da viagem");
    });

    await teste("E3 a saída mínima do piloto por HTTP + os fatos do banco: fila B e C, D retirado, A e F saíram — fatos em dia", async () => {
      const obs = await observar();
      const r = await ler();
      const e = r.estado_atual as unknown as Estado;
      assert.equal(e.na_fila.estado, "observado", JSON.stringify(e.na_fila));
      assert.deepEqual(g(e.na_fila.grupos, "simulated")?.pedidos.map((p) => p.order_ref), ["B", "C"]);
      assert.equal(e.consistencia_dos_fatos, "fatos_em_dia");
      assert.equal(g(e.aguardando_saida.grupos, "simulated")?.total ?? 0, 0);
      assert.equal(g(e.retirados_sem_novo_registro.grupos, "simulated")?.total, 1);
      const t = r.trajetoria.grupos.find((x) => x.source_mode === "simulated")!.entregas;
      const por = new Map(t.map((x) => [x.order_ref, x.situacao]));
      assert.deepEqual([por.get("A"), por.get("F"), por.get("D")], ["saiu", "saiu", "retirado_antes_da_saida"]);
      assert.equal(JSON.stringify(obs).includes("Rua Sintética"), false, "o rótulo saiu do piloto");
    });

    await teste("E4 atraso: consumidor parado e B entra numa viagem — B some da fila, o fato não chegou: 'fatos_atrasados', nunca estado completo", async () => {
      writeFileSync(chave, "STOP");
      await esperar(500);
      await comando(tok.ops, { type: "CreateTrip", command_id: "p-ct2", trip_id: "T2", courier_actor_id: "rid-1",
        deliveries: [{ delivery_id: "DB", order_ref: "B" }] });
      const e = (await ler()).estado_atual as unknown as Estado;
      assert.deepEqual(g(e.na_fila.grupos, "simulated")?.pedidos.map((p) => p.order_ref), ["C"]);
      assert.equal(g(e.aguardando_saida.grupos, "simulated")?.total ?? 0, 0, "o fato de B não podia estar na plataforma");
      assert.equal(e.consistencia_dos_fatos, "fatos_atrasados", "B está entre a fila e os fatos e a leitura disse que estava em dia");
      writeFileSync(chave, "RUN");
      const depois = await ate("fato de B ingerido", async () => {
        const x = (await ler()).estado_atual as unknown as Estado;
        return x.consistencia_dos_fatos === "fatos_em_dia" ? x : null;
      });
      assert.deepEqual(g(depois.aguardando_saida.grupos, "simulated")?.entregas.map((x) => x.order_ref), ["B"]);
    });

    await teste("E5 reinício do consumidor: sobe outro sobre o mesmo ponto e nada duplica", async () => {
      const n0 = await contar();
      await consumidor!.fim();
      consumidor = subir("consumidor", BIN.consumidor, envConsumidor);
      await esperar(1500);
      assert.deepEqual(await contar(), n0);
      assert.equal(consumidor.filho.exitCode, null, `o consumidor caiu: ${consumidor.saida().slice(-300)}`);
    });

    await teste("E6 reinício do piloto: fora do ar a fila é INDISPONÍVEL (não zero); de volta, as mesmas linhas, modos e marca", async () => {
      type Obs = { entries: unknown[]; facts_watermark: unknown; origin: { process_started_at: string } };
      const pegar = async (): Promise<Obs> => {
        const d = await observar();
        assert.ok("observacao" in d, `observação indisponível: ${JSON.stringify(d)}`);
        return (d as { observacao: Obs }).observacao;
      };
      const antesDoReinicio = await pegar();
      await piloto!.fim();
      const fora = (await ler()).estado_atual as unknown as Estado;
      assert.equal(fora.na_fila.estado, "indisponivel");
      assert.equal(fora.na_fila.motivo, "piloto_inalcancavel");
      assert.deepEqual(fora.na_fila.grupos, []);
      assert.equal(fora.consistencia_dos_fatos, "desconhecida");
      piloto = await subirPiloto();
      const depois = await pegar();
      assert.equal(JSON.stringify(depois.entries), JSON.stringify(antesDoReinicio.entries), "as linhas mudaram com o reinício");
      assert.equal(JSON.stringify(depois.facts_watermark), JSON.stringify(antesDoReinicio.facts_watermark), "a marca mudou com o reinício");
      assert.notEqual(depois.origin.process_started_at, antesDoReinicio.origin.process_started_at, "o reinício não aparece na origem");
      const atual = (await ler()).estado_atual as unknown as Estado;
      assert.deepEqual(g(atual.na_fila.grupos, "simulated")?.pedidos.map((p) => p.order_ref), ["C"]);
      assert.equal(atual.consistencia_dos_fatos, "fatos_em_dia");
    });

    await teste("E7 reinício do assíncrono: o replay sobe, nada vai a dead-letter, a outbox continua drenada", async () => {
      await assincrono!.fim();
      assincrono = subir("assincrono", BIN.assincrono, envPlataforma);
      await ate("replay do assíncrono", async () => (/\[assincrono\] replay/.test(assincrono!.saida()) ? true : null));
      await esperar(800);
      const st = await db.cliente.query<{ state: string; n: string }>(`SELECT state, count(*)::text AS n FROM platform.outbox GROUP BY 1`);
      assert.equal(st.some((x) => x.state === "dead"), false, JSON.stringify(st));
      assert.equal(st.some((x) => x.state !== "done"), false, `mensagens pendentes depois do reinício: ${JSON.stringify(st)}`);
    });

    await teste("E8 privacidade na rota do processo real: o motoboy é recusado e não vê pedido de ninguém", async () => {
      const r = await api("/api/ready-orders/observation", tok.rid);
      assert.equal(r.status, 403);
      assert.equal(JSON.stringify(r.json).includes("\"C\""), false);
    });
  } finally {
    await Promise.all([piloto, consumidor, assincrono].map((p) => p?.fim()));
    rmSync(dir, { recursive: true, force: true });
    await db.descartar();
  }

  const total = passed + failures.length;
  console.log(`\nFILA_OBSERVADA_PROCESSOS: ${passed}/${total} PASS`);
  if (failures.length) {
    console.log(`FILA_OBSERVADA_PROCESSOS_RED: ${failures.map((f) => f.split(" ")[0]).join(" ")}`);
    process.exit(1);
  }
  console.log("FILA_OBSERVADA_PROCESSOS_GREEN");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
