/**
 * O instante em que a expedição registra o pedido como PRONTO precisa
 * sobreviver à montagem da viagem.
 *
 * Antes desta suíte, `ready-orders.ts` gravava `created_at` no registro e a
 * fachada removia a linha da fila ao associar o pedido à viagem (em
 * PostgreSQL, o trigger da 0008 faz o mesmo na transação da entrega). Nada
 * mais guardava o instante: o trecho pronto -> saída não podia ser
 * reconstruído.
 *
 * O que estas provas exigem:
 *  - o instante preservado é o `created_at` ORIGINAL da fila, nunca a hora da
 *    viagem, do reenvio ou do navegador;
 *  - o fato é o evento público `delivery_ready` que já existe no catálogo;
 *  - ele nasce ligado à ENTREGA (`object_id = delivery_id`), porque é assim que
 *    a linha do tempo encontra os eventos — um fato só com `order_ref` ficaria
 *    invisível;
 *  - registro de pronto não é conclusão de produção;
 *  - sem fila, sem fato: nenhuma associação inventada;
 *  - falha de gravação não perde o instante; reinício não duplica; o mesmo
 *    registro não sai em duas viagens.
 *
 * As provas de PostgreSQL rodam com DELIVERYOS_PG_URL e se declaram PULADAS
 * em voz alta sem ele.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { asInternalRiderActorId } from "../foundation/brands";
import { createPilotPolicy } from "../foundation/policy";
import type { DomainEvent } from "../foundation/types";
import { EntregasApplicationService } from "../operational/application-service";
import { MemoryUnitOfWork } from "../persistence/memory-uow";
import { openFileUnitOfWork } from "../persistence/file-store";
import type { UnitOfWork } from "../persistence/ports";
import type { PilotConfig } from "./pilot-config";
import { PilotApplicationFacade } from "./pilot-facade";
import { createPilotLogger } from "./pilot-log";
import {
  createFilePilotUnitOfWorkSource,
  type PilotUnitOfWorkSource,
} from "./pilot-storage";
import {
  FilePilotReadyOrderStore,
  type PilotReadyOrder,
  type PilotReadyOrderStore,
} from "./ready-orders";
import { buildTripTimeline } from "./trip-timeline";

const UNIT = "u-ready";
let passed = 0;
const failures: string[] = [];

async function teste(nome: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  OK   ${nome}`);
  } catch (e) {
    failures.push(nome);
    console.error(`  FAIL ${nome}\n       ${(e as Error).message.split("\n").join("\n       ")}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `null` = modo ausente de propósito (default de parâmetro não pode mascarar isso). */
function cfg(dir: string, modo: PilotConfig["source_mode"] | null = "simulated"): PilotConfig {
  const source_mode = modo === null ? undefined : modo;
  return {
    mode: "pilot",
    unit_id: UNIT,
    unit_name: "UNIDADE PRONTO",
    timezone: "America/Sao_Paulo",
    port: 5199,
    bind: "127.0.0.1",
    data_dir: dir,
    max_stops: 5,
    banner: "PILOTO {unit_name}",
    source_mode,
    users: [
      { actor_id: "ops-1", role: "operador_expedicao", label: "Ops", token: "tok-ops" },
      { actor_id: "rid-1", role: "motoboy_interno", label: "Rider", token: "tok-rider" },
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
  } as PilotConfig;
}

interface Piloto {
  dir: string;
  facade: PilotApplicationFacade;
  ready: PilotReadyOrderStore;
}

function abrir(
  dir: string,
  opts: { storage?: PilotUnitOfWorkSource; ready?: PilotReadyOrderStore; source_mode?: PilotConfig["source_mode"] | null } = {},
): Piloto {
  const ready = opts.ready ?? new FilePilotReadyOrderStore(join(dir, "ready_orders.json"));
  const facade = new PilotApplicationFacade(
    cfg(dir, opts.source_mode),
    createPilotLogger(dir),
    opts.storage,
    ready,
    { internalRiders: () => new Set(["rid-1"]) },
  );
  return { dir, facade, ready };
}

function novoDir(nome: string): string {
  return mkdtempSync(join(tmpdir(), `ready-fact-${nome}-`));
}

async function registrar(p: Piloto, order_ref: string, label = `Pedido ${order_ref}`, channel?: string): Promise<string> {
  p.facade.login("tok-ops");
  const r = await p.facade.registerReadyOrder(order_ref, label, channel);
  assert.equal(r.ok, true, `registro de pronto recusado: ${r.human}`);
  const linha = (await p.ready.list()).find((o) => o.order_ref === order_ref);
  assert.ok(linha, `fila sem ${order_ref} logo depois do registro`);
  return linha!.created_at;
}

async function criarViagem(
  p: Piloto,
  trip_id: string,
  deliveries: Array<{ delivery_id: string; order_ref: string; [k: string]: unknown }>,
  extra: Record<string, unknown> = {},
) {
  p.facade.login("tok-ops");
  return await p.facade.execute({
    type: "CreateTrip",
    command_id: `ct-${trip_id}`,
    occurred_at: new Date().toISOString(),
    unit_id: UNIT,
    trip_id,
    courier_actor_id: asInternalRiderActorId("rid-1"),
    deliveries,
    actor: { actor_id: "ops-1", role: "operador_expedicao" },
    ...extra,
  });
}

async function sair(p: Piloto, trip_id: string) {
  p.facade.login("tok-rider");
  return await p.facade.execute({
    type: "ConfirmTripDeparture",
    command_id: `dep-${trip_id}`,
    occurred_at: new Date().toISOString(),
    unit_id: UNIT,
    trip_id,
    actor: { actor_id: "rid-1", role: "motoboy_interno" },
  });
}

async function eventosDuraveis(dir: string): Promise<DomainEvent[]> {
  return await openFileUnitOfWork(join(dir, "store.json")).events.listAll();
}

async function prontos(dir: string): Promise<DomainEvent[]> {
  const all = await openFileUnitOfWork(join(dir, "store.json")).events.listAll();
  return all.filter((e) => e.event_type === "delivery_ready");
}

function arquivosContem(dir: string, agulha: string): string[] {
  const achados: string[] = [];
  const andar = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) andar(p);
      else if (readFileSync(p, "utf8").includes(agulha)) achados.push(p.replace(dir, "<data>"));
    }
  };
  andar(dir);
  return achados;
}

/** UoW cujo commit falha na próxima chamada armada, uma vez. */
function storageComFalhaNoCommit(dataFile: string): { storage: PilotUnitOfWorkSource; armar: () => void } {
  const base = createFilePilotUnitOfWorkSource(dataFile);
  let armado = false;
  return {
    armar: () => { armado = true; },
    storage: {
      kind: base.kind,
      dataPath: base.dataPath,
      open(): UnitOfWork {
        const uow = base.open();
        const commit = uow.commit.bind(uow);
        uow.commit = async () => {
          if (armado) {
            armado = false;
            throw new Error("falha injetada: disco recusou a escrita");
          }
          return commit();
        };
        return uow;
      },
    },
  };
}

/** Fila cuja remoção falha uma vez: o commit da viagem já aconteceu. */
class FilaComFalhaNaRemocao implements PilotReadyOrderStore {
  armado = false;
  constructor(private readonly base: PilotReadyOrderStore) {}
  list(): Promise<PilotReadyOrder[]> { return this.base.list(); }
  add(o: PilotReadyOrder) { return this.base.add(o); }
  async removeByOrderRefs(refs: readonly string[]): Promise<number> {
    if (this.armado) {
      this.armado = false;
      throw new Error("falha injetada: queda entre o commit da viagem e a limpeza da fila");
    }
    return this.base.removeByOrderRefs(refs);
  }
}

async function main(): Promise<void> {
  console.log("PRONTO VIRA FATO — instante do registro preservado depois da viagem");
  const dirs: string[] = [];
  const dir = (n: string) => { const d = novoDir(n); dirs.push(d); return d; };

  await teste("F1 o instante ORIGINAL da fila vira delivery_ready ligado à entrega, visível na linha do tempo", async () => {
    const p = abrir(dir("f1"));
    const t0 = await registrar(p, "P-1", "Pedido P-1", "proprio");
    await sleep(25);
    const r = await criarViagem(p, "T1", [{ delivery_id: "D1", order_ref: "P-1" }]);
    assert.equal(r.ok, true, r.error);
    assert.equal((await sair(p, "T1")).ok, true);
    const fatos = await prontos(p.dir);
    assert.equal(fatos.length, 1, `esperava 1 delivery_ready, achou ${fatos.length}`);
    const f = fatos[0]!;
    assert.equal(f.occurred_at, t0, "occurred_at precisa ser o created_at original, byte a byte");
    assert.equal(f.object_type, "delivery");
    assert.equal(f.object_id, "D1");
    assert.equal(f.payload.trip_id, "T1");
    assert.equal(f.payload.order_ref, "P-1");
    assert.equal(f.idempotency_key, "delivery_ready:T1:D1");
    const timeline = buildTripTimeline(await p.facade.listTripEvents("T1"));
    const linha = timeline.find((e) => e.event_type === "delivery_ready");
    assert.ok(linha, "a linha do tempo da viagem não mostra o pronto");
    assert.equal(linha!.at, t0);
    assert.equal(linha!.label, "Pronto registrado pela expedição");
    assert.equal(linha!.author, "operacao");
    const ordem = timeline.map((e) => e.event_type);
    assert.ok(ordem.indexOf("delivery_ready") < ordem.indexOf("trip_created"), `ordem: ${ordem.join(",")}`);
    assert.ok(ordem.indexOf("trip_created") < ordem.indexOf("trip_started"));
  });

  await teste("F2 registro de pronto não é conclusão de produção; identidade de quem registrou não é inventada", async () => {
    const p = abrir(dir("f2"));
    await registrar(p, "P-2");
    await sleep(5);
    assert.equal((await criarViagem(p, "T2", [{ delivery_id: "D2", order_ref: "P-2" }])).ok, true);
    const f = (await prontos(p.dir))[0];
    assert.ok(f, "sem delivery_ready");
    assert.equal(f!.payload.ready_kind, "registro_expedicao");
    assert.equal(f!.payload.production_completed_at, null);
    assert.equal(f!.payload.registered_by, null, "a fila nunca guardou quem registrou: tem de ficar UNKNOWN");
    assert.equal(f!.actor_id, undefined, "o ator da viagem não é quem registrou o pronto");
    assert.equal(f!.origin, "ops_console");
    assert.equal(f!.clock_trust, "trusted");
  });

  await teste("F3 reinício do piloto: o instante continua disponível, com o mesmo event_id e sem duplicar", async () => {
    const d = dir("f3");
    const p = abrir(d);
    const t0 = await registrar(p, "P-3");
    await sleep(5);
    assert.equal((await criarViagem(p, "T3", [{ delivery_id: "D3", order_ref: "P-3" }])).ok, true);
    const antes = await prontos(d);
    const p2 = abrir(d);
    const depois = await prontos(d);
    assert.equal(depois.length, 1);
    assert.equal(depois[0]!.event_id, antes[0]!.event_id);
    assert.equal(depois[0]!.occurred_at, t0);
    const timeline = buildTripTimeline(await p2.facade.listTripEvents("T3"));
    assert.equal(timeline.filter((e) => e.event_type === "delivery_ready").length, 1);
    assert.equal(arquivosContem(d, t0).length > 0, true, "o instante não está em nenhum arquivo durável");
  });

  await teste("F4 AddDeliveryToTrip também preserva o instante do pedido acrescentado", async () => {
    const p = abrir(dir("f4"));
    await registrar(p, "P-4a");
    const t4b = await registrar(p, "P-4b");
    await sleep(5);
    assert.equal((await criarViagem(p, "T4", [{ delivery_id: "D4a", order_ref: "P-4a" }])).ok, true);
    p.facade.login("tok-ops");
    const r = await p.facade.execute({
      type: "AddDeliveryToTrip",
      command_id: "add-T4",
      occurred_at: new Date().toISOString(),
      unit_id: UNIT,
      trip_id: "T4",
      delivery_id: "D4b",
      order_ref: "P-4b",
      planned_stop_order: 2,
      actor: { actor_id: "ops-1", role: "operador_expedicao" },
    });
    assert.equal(r.ok, true, r.error);
    const f = (await prontos(p.dir)).find((e) => e.object_id === "D4b");
    assert.ok(f, "AddDeliveryToTrip não gravou o pronto");
    assert.equal(f!.occurred_at, t4b);
    assert.equal(f!.idempotency_key, "delivery_ready:T4:D4b");
  });

  await teste("F5 sem registro na fila não há fato: nenhuma associação inventada", async () => {
    const p = abrir(dir("f5"));
    await registrar(p, "P-5a");
    await sleep(5);
    const r = await criarViagem(p, "T5", [
      { delivery_id: "D5a", order_ref: "P-5a" },
      { delivery_id: "D5x", order_ref: "SEM-REGISTRO" },
    ]);
    assert.equal(r.ok, true, r.error);
    const fatos = await prontos(p.dir);
    assert.deepEqual(fatos.map((e) => e.object_id), ["D5a"]);
  });

  await teste("F6 instante enviado pelo navegador é ignorado: vale só o da fila do servidor", async () => {
    const p = abrir(dir("f6"));
    const t0 = await registrar(p, "P-6");
    await sleep(5);
    const forjado = "2001-01-01T00:00:00.000Z";
    const r = await criarViagem(
      p, "T6",
      [{ delivery_id: "D6", order_ref: "P-6", ready_registered_at: forjado, registered_at: forjado, created_at: forjado }],
      { ready_registered_at: forjado, ready: [{ order_ref: "P-6", registered_at: forjado }] },
    );
    assert.equal(r.ok, true, r.error);
    const f = (await prontos(p.dir))[0];
    assert.ok(f, "sem delivery_ready");
    assert.equal(f!.occurred_at, t0);
    assert.equal(JSON.stringify(await eventosDuraveis(p.dir)).includes(forjado), false, "instante forjado entrou no log");
  });

  await teste("F7 falha de gravação: nada é gravado, a fila guarda o instante e a nova tentativa usa o ORIGINAL", async () => {
    const d = dir("f7");
    const falha = storageComFalhaNoCommit(join(d, "store.json"));
    const p = abrir(d, { storage: falha.storage });
    const t0 = await registrar(p, "P-7");
    await sleep(25);
    falha.armar();
    const r1 = await criarViagem(p, "T7", [{ delivery_id: "D7", order_ref: "P-7" }]);
    assert.equal(r1.ok, false, "a falha injetada no commit precisava falhar o comando");
    assert.equal((await prontos(d)).length, 0, "fato gravado sem a viagem");
    assert.equal(await openFileUnitOfWork(join(d, "store.json")).trips.get("T7"), null, "viagem gravada apesar da falha");
    const fila = (await p.ready.list()).find((o) => o.order_ref === "P-7");
    assert.ok(fila, "a falha apagou o pedido da fila: instante perdido");
    assert.equal(fila!.created_at, t0);
    await sleep(25);
    const p2 = abrir(d);
    const r2 = await criarViagem(p2, "T7", [{ delivery_id: "D7", order_ref: "P-7" }]);
    assert.equal(r2.ok, true, r2.error);
    const fatos = await prontos(d);
    assert.equal(fatos.length, 1);
    assert.equal(fatos[0]!.occurred_at, t0, "a nova tentativa trocou o instante original pelo da reexecução");
  });

  await teste("F8 queda depois do commit e antes de limpar a fila: o fato fica, e o mesmo registro não sai de novo", async () => {
    const d = dir("f8");
    const fila = new FilaComFalhaNaRemocao(new FilePilotReadyOrderStore(join(d, "ready_orders.json")));
    const p = abrir(d, { ready: fila });
    const t0 = await registrar(p, "P-8");
    await sleep(5);
    fila.armado = true;
    await criarViagem(p, "T8", [{ delivery_id: "D8", order_ref: "P-8" }]);
    const duraveis = await prontos(d);
    assert.equal(duraveis.length, 1, "o commit aconteceu: o fato precisa estar no log");
    assert.equal(duraveis[0]!.occurred_at, t0);
    // Reinício: a fila ainda lista o pedido (limpeza não aconteceu).
    const p2 = abrir(d);
    assert.equal((await p2.ready.list()).some((o) => o.order_ref === "P-8"), true, "pré-condição: fila velha");
    const r = await criarViagem(p2, "T8b", [{ delivery_id: "D8b", order_ref: "P-8" }]);
    assert.equal(r.ok, false, "o mesmo registro de pronto saiu em duas viagens");
    assert.equal(r.code, "READY_ALREADY_CONSUMED");
    assert.equal((await prontos(d)).length, 1, "o fato duplicou");
    assert.equal((await p2.ready.list()).some((o) => o.order_ref === "P-8"), false, "a fila velha não foi reconciliada");
  });

  await teste("F9 novo registro do mesmo pedido depois da saída é outro ato: outro instante, outra entrega", async () => {
    const p = abrir(dir("f9"));
    const t1 = await registrar(p, "P-9");
    await sleep(5);
    assert.equal((await criarViagem(p, "T9", [{ delivery_id: "D9", order_ref: "P-9" }])).ok, true);
    await sleep(25);
    const t2 = await registrar(p, "P-9");
    assert.notEqual(t1, t2);
    await sleep(5);
    assert.equal((await criarViagem(p, "T9b", [{ delivery_id: "D9b", order_ref: "P-9" }])).ok, true);
    const fatos = await prontos(p.dir);
    assert.deepEqual(fatos.map((e) => [e.object_id, e.occurred_at]).sort(), [["D9", t1], ["D9b", t2]].sort());
  });

  await teste("F10 privacidade e modo: sem rótulo/endereço; outbox carrega o source_mode do piloto, nunca real por padrão", async () => {
    const d = dir("f10");
    const p = abrir(d, { source_mode: "simulated" });
    await registrar(p, "P-10", "Pedido P-10 · Rua das Flores 123 apto 45");
    await sleep(5);
    assert.equal((await criarViagem(p, "T10", [{ delivery_id: "D10", order_ref: "P-10" }])).ok, true);
    const uow = openFileUnitOfWork(join(d, "store.json"));
    const pub = (await uow.outbox.all()).filter((r) => r.event.event_type === "delivery_ready");
    assert.equal(pub.length, 1, `outbox com ${pub.length} delivery_ready`);
    assert.equal(pub[0]!.event.source_mode, "simulated");
    assert.equal(pub[0]!.event.delivery_id, "D10");
    assert.equal(pub[0]!.event.trip_id, "T10");
    assert.equal(pub[0]!.event.unit_id, UNIT);
    const blob = JSON.stringify({ ev: await uow.events.listAll(), ob: await uow.outbox.all(),
      tl: buildTripTimeline(await p.facade.listTripEvents("T10")) });
    assert.equal(blob.includes("Rua das Flores"), false, "rótulo com endereço vazou para evento, outbox ou linha do tempo");

    const d2 = dir("f10-sem-modo");
    const p2 = abrir(d2, { source_mode: null });
    await registrar(p2, "P-10b");
    await sleep(5);
    assert.equal((await criarViagem(p2, "T10b", [{ delivery_id: "D10b", order_ref: "P-10b" }])).ok, true);
    const pub2 = (await openFileUnitOfWork(join(d2, "store.json")).outbox.all())
      .filter((r) => r.event.event_type === "delivery_ready");
    assert.equal(pub2.length, 1);
    assert.notEqual(pub2[0]!.event.source_mode, "real", "modo ausente virou real");
  });

  await teste("F11 serviço chamado sem a fila do servidor não fabrica pronto", async () => {
    const memoria = new MemoryUnitOfWork();
    const svc = new EntregasApplicationService(memoria, createPilotPolicy(), "simulated");
    const r = await svc.execute({
      type: "CreateTrip",
      command_id: "svc-only",
      occurred_at: new Date().toISOString(),
      unit_id: UNIT,
      trip_id: "TS",
      courier_actor_id: asInternalRiderActorId("rid-1"),
      deliveries: [{ delivery_id: "DS", order_ref: "PS" }],
      actor: { actor_id: "ops-1", role: "operador_expedicao" },
    } as never);
    assert.equal(r.ok, true, r.error);
    const fatos = (await memoria.events.listAll()).filter((e) => e.event_type === "delivery_ready");
    assert.equal(fatos.length, 0, "o serviço inventou um pronto sem fila");
  });

  await provasPostgres();

  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  const total = passed + failures.length;
  console.log(`READY_FACT: ${passed}/${total} PASS`);
  if (failures.length) {
    console.log(`READY_FACT_RED: ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log("READY_FACT_GREEN");
}

async function provasPostgres(): Promise<void> {
  const url = process.env.DELIVERYOS_PG_URL?.trim();
  if (!url) {
    console.log("  PULADO PostgreSQL: DELIVERYOS_PG_URL ausente — as provas P1-P3 NAO rodaram");
    return;
  }
  const { createPgClient } = await import("../../platform/persistence/sql-client");
  const { runMigrations } = await import("../../platform/migrations/runner");
  const { diretorioDeMigrations } = await import("../../platform/migrations/localizar");
  const { PgEntregasUnitOfWork } = await import("../persistence/pg-uow");
  const { PgPilotReadyOrderStore } = await import("./ready-orders");
  const PGUNIT = "READY_FACT_PG";
  const admin = await createPgClient({ url, max: 2 });
  const a = await createPgClient({ url, max: 2 });
  try {
    await runMigrations(admin, diretorioDeMigrations());
    await admin.query(
      `INSERT INTO identity.unit(unit_id,display_name,timezone,active)
       VALUES ($1,$1,'America/Sao_Paulo',true) ON CONFLICT (unit_id) DO UPDATE SET active=true`,
      [PGUNIT],
    );
    const sufixo = Date.now().toString(36);
    const pgDir = mkdtempSync(join(tmpdir(), "ready-fact-pg-"));
    const pgCfg = { ...cfg(pgDir), unit_id: PGUNIT } as PilotConfig;
    const storage: PilotUnitOfWorkSource = { kind: "external", open: () => new PgEntregasUnitOfWork(a, PGUNIT) };
    const ready = new PgPilotReadyOrderStore(a, PGUNIT);
    const facade = () => new PilotApplicationFacade(pgCfg, createPilotLogger(pgDir), storage, ready,
      { internalRiders: () => new Set(["rid-1"]) });

    await teste("P1 PostgreSQL: viagem, entrega, fato e consumo da fila na MESMA transação", async () => {
      const f = facade();
      f.login("tok-ops");
      const ref = `PG-${sufixo}-1`;
      assert.equal((await f.registerReadyOrder(ref, "Pedido PG", "proprio")).ok, true);
      const t0 = (await ready.list()).find((o) => o.order_ref === ref)!.created_at;
      await sleep(5);
      const r = await f.execute({
        type: "CreateTrip", command_id: `pg-ct-${sufixo}`, occurred_at: new Date().toISOString(), unit_id: PGUNIT,
        trip_id: `PGT-${sufixo}`, courier_actor_id: asInternalRiderActorId("rid-1"),
        deliveries: [{ delivery_id: `PGD-${sufixo}`, order_ref: ref }],
        actor: { actor_id: "ops-1", role: "operador_expedicao" },
      });
      assert.equal(r.ok, true, r.error);
      const rows = await admin.query<{ occurred_at: Date; object_id: string; payload: Record<string, unknown> }>(
        `SELECT occurred_at, object_id, payload FROM entregas.domain_event
          WHERE unit_id=$1 AND event_type='delivery_ready' AND object_id=$2`, [PGUNIT, `PGD-${sufixo}`]);
      assert.equal(rows.length, 1, `esperava 1 delivery_ready no PG, achou ${rows.length}`);
      assert.equal(new Date(rows[0]!.occurred_at).toISOString(), t0);
      assert.equal(rows[0]!.payload.order_ref, ref);
      assert.equal((await ready.list()).some((o) => o.order_ref === ref), false, "fila não foi consumida");
      const pub = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM entregas.public_outbox WHERE unit_id=$1 AND event->>'event_type'='delivery_ready'
           AND event->>'delivery_id'=$2`, [PGUNIT, `PGD-${sufixo}`]);
      assert.equal(pub[0]!.n, "1");
    });

    await teste("P2 PostgreSQL: reinício (UoW e fachada novas) lê o mesmo instante pela linha do tempo", async () => {
      const f2 = facade();
      const tl = buildTripTimeline(await f2.listTripEvents(`PGT-${sufixo}`));
      assert.equal(tl.filter((e) => e.event_type === "delivery_ready").length, 1);
    });

    await teste("P3 PostgreSQL: falha no commit não grava fato nem consome a fila", async () => {
      const ref = `PG-${sufixo}-3`;
      const f = facade();
      f.login("tok-ops");
      assert.equal((await f.registerReadyOrder(ref, "Pedido PG 3", "proprio")).ok, true);
      const t0 = (await ready.list()).find((o) => o.order_ref === ref)!.created_at;
      let armado = true;
      const falhando: PilotUnitOfWorkSource = { kind: "external", open: () => {
        const u = new PgEntregasUnitOfWork(a, PGUNIT);
        const commit = u.commit.bind(u);
        u.commit = async () => { if (armado) { armado = false; await u.rollback(); throw new Error("falha injetada no commit PG"); } return commit(); };
        return u;
      } };
      const ff = new PilotApplicationFacade(pgCfg, createPilotLogger(pgDir), falhando, ready,
        { internalRiders: () => new Set(["rid-1"]) });
      ff.login("tok-ops");
      const r = await ff.execute({
        type: "CreateTrip", command_id: `pg-ct3-${sufixo}`, occurred_at: new Date().toISOString(), unit_id: PGUNIT,
        trip_id: `PGT3-${sufixo}`, courier_actor_id: asInternalRiderActorId("rid-1"),
        deliveries: [{ delivery_id: `PGD3-${sufixo}`, order_ref: ref }],
        actor: { actor_id: "ops-1", role: "operador_expedicao" },
      });
      assert.equal(r.ok, false);
      const rows = await admin.query(`SELECT 1 FROM entregas.domain_event WHERE unit_id=$1 AND object_id=$2`,
        [PGUNIT, `PGD3-${sufixo}`]);
      assert.equal(rows.length, 0, "fato gravado sem viagem");
      const fila = (await ready.list()).find((o) => o.order_ref === ref);
      assert.ok(fila, "fila consumida apesar da falha");
      assert.equal(fila!.created_at, t0);
    });
    rmSync(pgDir, { recursive: true, force: true });
  } finally {
    await (a as { close?: () => Promise<void> }).close?.();
    await (admin as { close?: () => Promise<void> }).close?.();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
