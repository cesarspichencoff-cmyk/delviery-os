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
import { canonicalInboundFingerprint, type DurableInboundReceipt } from "../persistence/inbound-receipt";
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
      { actor_id: "ops-2", role: "operador_expedicao", label: "Ops 2", token: "tok-ops-2" },
      { actor_id: "rid-2", role: "motoboy_interno", label: "Rider 2", token: "tok-rider-2" },
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
    { internalRiders: () => new Set(["rid-1", "rid-2"]) },
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
    assert.equal(f.idempotency_key, `delivery_ready:${UNIT}:P-1:${t0}`, "a chave é por REGISTRO (unidade + pedido + instante)");
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

  await teste("F2 quem registrou o pronto (sessão) fica no actor_id; não é quem montou a viagem nem quem preparou", async () => {
    const p = abrir(dir("f2"));
    await registrar(p, "P-2"); // sessão tok-ops = ops-1
    const fila = (await p.ready.list()).find((o) => o.order_ref === "P-2");
    assert.deepEqual(fila?.registered_by, { actor_id: "ops-1", role: "operador_expedicao" },
      "a fila não guardou a sessão que registrou");
    await sleep(5);
    const ops2 = { actor_id: "ops-2", role: "operador_expedicao" as const };
    const r = await p.facade.executeAs(ops2, {
      type: "CreateTrip", command_id: "ct-T2", occurred_at: new Date().toISOString(), unit_id: UNIT,
      trip_id: "T2", courier_actor_id: asInternalRiderActorId("rid-1"),
      deliveries: [{ delivery_id: "D2", order_ref: "P-2" }], actor: ops2,
    });
    assert.equal(r.ok, true, r.error);
    const f = (await prontos(p.dir))[0];
    assert.ok(f, "sem delivery_ready");
    assert.equal(f!.actor_id, "ops-1", "o ato de registrar é de ops-1, não de quem montou a viagem");
    assert.equal(f!.payload.ready_kind, "registro_expedicao");
    assert.equal(f!.payload.production_completed_at, null);
    assert.equal(f!.payload.prepared_by, null, "quem registrou não é quem preparou: preparo fica UNKNOWN");
    assert.equal(f!.origin, "ops_console");
    assert.equal(f!.clock_trust, "trusted");
    const pub = (await openFileUnitOfWork(join(p.dir, "store.json")).outbox.all())
      .filter((x) => x.event.event_type === "delivery_ready");
    assert.equal(pub.length, 1);
    assert.equal(JSON.stringify(pub[0]).includes("ops-1"), false, "identidade do operador vazou para o evento público");
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
    assert.equal(f!.idempotency_key, `delivery_ready:${UNIT}:P-4b:${t4b}`);
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

  await teste("F12 instante corrompido na fila: recusa visível, sem viagem e sem fato reformatado", async () => {
    const d = dir("f12");
    const p = abrir(d);
    await p.ready.add({ order_ref: "P-12", label: "Pedido P-12", created_at: "01/11/2026 10:00" });
    const r = await criarViagem(p, "T12", [{ delivery_id: "D12", order_ref: "P-12" }]);
    assert.equal(r.ok, false, "a viagem foi aceita com o instante da fila corrompido: o pronto seria perdido ou reformatado");
    assert.equal(r.code, "PRECONDITION_FAILED");
    assert.equal((await prontos(d)).length, 0);
    assert.equal(await openFileUnitOfWork(join(d, "store.json")).trips.get("T12"), null, "viagem gravada sem o fato");
    assert.equal((await p.ready.list()).some((o) => o.order_ref === "P-12"), true, "a fila perdeu o registro");
  });

  await teste("F13 evento autenticado (recibo durável): fato gravado uma vez, reenvio idêntico é replay sem duplicar", async () => {
    const d = dir("f13");
    const p = abrir(d);
    const t0 = await registrar(p, "P-13");
    await sleep(5);
    const ator = { actor_id: "ops-1", role: "operador_expedicao" as const };
    const cmd = {
      type: "CreateTrip", command_id: "ct-inbound-13", occurred_at: new Date().toISOString(), unit_id: UNIT,
      trip_id: "T13", courier_actor_id: asInternalRiderActorId("rid-1"),
      deliveries: [{ delivery_id: "D13", order_ref: "P-13" }], actor: ator,
    };
    const envelope = { event_id: "ev-13", idempotency_key: "idem-13", device_id: null };
    const r1 = await p.facade.executeAs(ator, cmd, envelope);
    assert.equal(r1.ok, true, `${r1.code} ${r1.error}`);
    const r2 = await p.facade.executeAs(ator, cmd, envelope);
    assert.equal(r2.ok, true, `${r2.code} ${r2.error}`);
    assert.equal(r2.code, "REPLAY_APPLIED");
    const fatos = await prontos(d);
    assert.equal(fatos.length, 1);
    assert.equal(fatos[0]!.occurred_at, t0);
  });

  await teste("C1 arquivo: dois operadores consomem o mesmo pronto ao mesmo tempo — uma viagem, um fato, a outra recusada", async () => {
    const d = dir("c1");
    const p = abrir(d);
    const t0 = await registrar(p, "P-C1");
    await sleep(5);
    const a = { actor_id: "ops-1", role: "operador_expedicao" as const };
    const b = { actor_id: "ops-2", role: "operador_expedicao" as const };
    const montar = (trip: string, entrega: string, rider: string, ator: typeof a) => p.facade.executeAs(ator, {
      type: "CreateTrip", command_id: `ct-${trip}`, occurred_at: new Date().toISOString(), unit_id: UNIT,
      trip_id: trip, courier_actor_id: asInternalRiderActorId(rider),
      deliveries: [{ delivery_id: entrega, order_ref: "P-C1" }], actor: ator,
    });
    const rs = await Promise.all([montar("TC1A", "DC1A", "rid-1", a), montar("TC1B", "DC1B", "rid-2", b)]);
    assert.equal(rs.filter((r) => r.ok).length, 1, `as duas montagens passaram: ${JSON.stringify(rs.map((r) => [r.ok, r.code]))}`);
    assert.equal(rs.find((r) => !r.ok)!.code, "READY_ALREADY_CONSUMED");
    const fatos = (await prontos(d)).filter((e) => e.payload.order_ref === "P-C1");
    assert.equal(fatos.length, 1);
    assert.equal(fatos[0]!.occurred_at, t0);
    const viagens = await openFileUnitOfWork(join(d, "store.json")).trips.list();
    const ativas = viagens.flatMap((v) => v.deliveries).filter((e) => e.order_ref === "P-C1" && e.active);
    assert.equal(ativas.length, 1, `o pedido está em ${ativas.length} entregas ativas`);
    assert.equal((await p.ready.list()).some((o) => o.order_ref === "P-C1"), false);
  });

  await teste("F16 armazenamento em arquivo recusa o MESMO registro em duas entregas, mesmo sem a fachada", async () => {
    const d = dir("f16");
    const uow = openFileUnitOfWork(join(d, "store.json"));
    const svc = new EntregasApplicationService(uow, createPilotPolicy(), "simulated");
    const registro = [{ order_ref: "P-16", registered_at: "2026-11-01T10:00:00.000Z" }];
    const montar = (trip: string, entrega: string, rider: string) => svc.execute({
      type: "CreateTrip", command_id: `svc-${trip}`, occurred_at: "2026-11-01T10:05:00.000Z", unit_id: UNIT,
      trip_id: trip, courier_actor_id: asInternalRiderActorId(rider),
      deliveries: [{ delivery_id: entrega, order_ref: "P-16" }],
      actor: { actor_id: "ops-1", role: "operador_expedicao" },
    } as never, undefined, undefined, registro);
    const r1 = await montar("T16A", "D16A", "rid-1");
    assert.equal(r1.ok, true, r1.error);
    const r2 = await montar("T16B", "D16B", "rid-2");
    assert.equal(r2.ok, false, "o mesmo registro virou duas entregas");
    assert.equal(r2.code, "READY_ALREADY_CONSUMED");
    const duravel = openFileUnitOfWork(join(d, "store.json"));
    assert.equal(await duravel.trips.get("T16B"), null, "a viagem perdedora ficou gravada");
    assert.equal((await duravel.events.listAll()).filter((e) => e.event_type === "delivery_ready").length, 1);
  });

  await teste("F17 falha depois do commit + reinício + reenvio idêntico do evento autenticado: replay confirmado, um fato, fila reconciliada", async () => {
    const d = dir("f17");
    const fila = new FilaComFalhaNaRemocao(new FilePilotReadyOrderStore(join(d, "ready_orders.json")));
    const p = abrir(d, { ready: fila });
    const t0 = await registrar(p, "P-17");
    await sleep(5);
    const ator = { actor_id: "ops-1", role: "operador_expedicao" as const };
    const cmd = {
      type: "CreateTrip", command_id: "ct-inbound-17", occurred_at: new Date().toISOString(), unit_id: UNIT,
      trip_id: "T17", courier_actor_id: asInternalRiderActorId("rid-1"),
      deliveries: [{ delivery_id: "D17", order_ref: "P-17" }], actor: ator,
    };
    const envelope = { event_id: "ev-17", idempotency_key: "idem-17", device_id: null };
    fila.armado = true;
    await p.facade.executeAs(ator, cmd, envelope); // commit feito; limpeza da fila cai
    assert.equal((await prontos(d)).length, 1, "o commit aconteceu: o fato precisa estar no log");
    const p2 = abrir(d); // reinício; a fila ainda lista P-17
    assert.equal((await p2.ready.list()).some((o) => o.order_ref === "P-17"), true, "pré-condição: fila velha");
    const r2 = await p2.facade.executeAs(ator, cmd, envelope);
    assert.equal(r2.ok, true, `${r2.code} ${r2.error}`);
    assert.equal(r2.code, "REPLAY_APPLIED", "o reenvio do próprio evento tem de ser confirmado, não recusado");
    const fatos = await prontos(d);
    assert.equal(fatos.length, 1);
    assert.equal(fatos[0]!.occurred_at, t0);
    assert.equal((await p2.ready.list()).some((o) => o.order_ref === "P-17"), false, "a fila velha não foi reconciliada");
  });

  await teste("F18 o mesmo registro pelo caminho com recibo: recusa DEFINITIVA, nunca resultado incerto para reenviar", async () => {
    const d = dir("f18");
    const uow = openFileUnitOfWork(join(d, "store.json"));
    const svc = new EntregasApplicationService(uow, createPilotPolicy(), "simulated");
    const registro = [{ order_ref: "P-18", registered_at: "2026-11-01T11:00:00.000Z" }];
    const ator = { actor_id: "ops-1", role: "operador_expedicao" as const };
    const comando = (trip: string, entrega: string, rider: string) => ({
      type: "CreateTrip", command_id: `svc-${trip}`, occurred_at: "2026-11-01T11:05:00.000Z", unit_id: UNIT,
      trip_id: trip, courier_actor_id: asInternalRiderActorId(rider),
      deliveries: [{ delivery_id: entrega, order_ref: "P-18" }], actor: ator,
    });
    const recibo = (cmd: ReturnType<typeof comando>, ev: string): DurableInboundReceipt => ({
      unit_id: UNIT, event_id: ev, idempotency_key: `idem-${ev}`, actor_id: ator.actor_id, actor_role: ator.role,
      device_id: null, command_id: cmd.command_id, command_type: cmd.type,
      fingerprint: canonicalInboundFingerprint({ event_id: ev, idempotency_key: `idem-${ev}`,
        command: cmd as unknown as Record<string, unknown>, unit_id: UNIT, actor_id: ator.actor_id,
        actor_role: ator.role, device_id: null }),
      outcome: "applied", code: null, recorded_at: "2026-11-01T11:05:01.000Z",
    });
    const c1 = comando("T18A", "D18A", "rid-1");
    const r1 = await svc.execute(c1 as never, recibo(c1, "ev18a"), c1 as never, registro);
    assert.equal(r1.ok, true, `${r1.code} ${r1.error}`);
    const c2 = comando("T18B", "D18B", "rid-2");
    const r2 = await svc.execute(c2 as never, recibo(c2, "ev18b"), c2 as never, registro);
    assert.equal(r2.ok, false);
    assert.equal(r2.code, "READY_ALREADY_CONSUMED", `veio ${r2.code}: o aparelho reenviaria para sempre`);
    assert.notEqual(r2.retryable, true);
    assert.equal((await openFileUnitOfWork(join(d, "store.json")).events.listAll())
      .filter((e) => e.event_type === "delivery_ready").length, 1);
  });

  await teste("F14 reenvio do mesmo comando depois do sucesso: confirmação de já registrado, sem segundo fato", async () => {
    const d = dir("f14");
    const p = abrir(d);
    const t0 = await registrar(p, "P-14");
    await sleep(5);
    const corpo = [{ delivery_id: "D14", order_ref: "P-14" }];
    assert.equal((await criarViagem(p, "T14", corpo)).ok, true);
    const r2 = await criarViagem(p, "T14", corpo);
    assert.equal(r2.ok, false);
    assert.equal(r2.code, "DUPLICATE_COMMAND");
    const fatos = await prontos(d);
    assert.equal(fatos.length, 1);
    assert.equal(fatos[0]!.occurred_at, t0);
  });

  await teste("F15 reenvio do mesmo comando depois do reinício: recusado pelo domínio, fato e instante intactos", async () => {
    const d = dir("f15");
    const p = abrir(d);
    const t0 = await registrar(p, "P-15");
    await sleep(5);
    const corpo = [{ delivery_id: "D15", order_ref: "P-15" }];
    assert.equal((await criarViagem(p, "T15", corpo)).ok, true);
    const antes = await prontos(d);
    const p2 = abrir(d); // reinício: a memória de command_id se perde
    const r2 = await criarViagem(p2, "T15", corpo);
    assert.equal(r2.ok, false, "o reenvio depois do reinício criou outra viagem");
    const depois = await prontos(d);
    assert.equal(depois.length, 1);
    assert.equal(depois[0]!.event_id, antes[0]!.event_id);
    assert.equal(depois[0]!.occurred_at, t0);
  });

  await provasPostgres();
  await provaDeProcesso();

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
    console.log("  PULADO PostgreSQL: DELIVERYOS_PG_URL ausente — as provas P1-P5, C3a e C3b NAO rodaram");
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
      { internalRiders: () => new Set(["rid-1", "rid-2"]) });

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
        { internalRiders: () => new Set(["rid-1", "rid-2"]) });
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
    await teste("P4 PostgreSQL: linha velha do mesmo registro na fila é reconciliada e não sai em segunda viagem", async () => {
      const ref = `PG-${sufixo}-1`;
      const linhas = await admin.query<{ occurred_at: Date }>(
        `SELECT occurred_at FROM entregas.domain_event WHERE unit_id=$1 AND event_type='delivery_ready'
           AND payload->>'order_ref'=$2`, [PGUNIT, ref]);
      assert.equal(linhas.length, 1, "pré-condição: o fato de P1 não existe no PG");
      const t0 = linhas[0]!.occurred_at;
      // Outro terminal com a lista antiga: a linha do MESMO registro reaparece.
      await admin.query(
        `INSERT INTO entregas.ready_order(unit_id,order_ref,label,channel,created_at) VALUES ($1,$2,'velha','proprio',$3)`,
        [PGUNIT, ref, new Date(t0).toISOString()]);
      const f = facade();
      f.login("tok-ops");
      const r = await f.execute({
        type: "CreateTrip", command_id: `pg-ct4-${sufixo}`, occurred_at: new Date().toISOString(), unit_id: PGUNIT,
        trip_id: `PGT4-${sufixo}`, courier_actor_id: asInternalRiderActorId("rid-1"),
        deliveries: [{ delivery_id: `PGD4-${sufixo}`, order_ref: ref }],
        actor: { actor_id: "ops-1", role: "operador_expedicao" },
      });
      assert.equal(r.ok, false, "o mesmo registro saiu em duas viagens");
      assert.equal(r.code, "READY_ALREADY_CONSUMED");
      const n = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM entregas.domain_event WHERE unit_id=$1 AND event_type='delivery_ready'
           AND payload->>'order_ref'=$2`, [PGUNIT, ref]);
      assert.equal(n[0]!.n, "1", "o fato duplicou no PG");
      assert.equal((await ready.list()).some((o) => o.order_ref === ref), false, "a linha velha ficou na fila");
    });
    // Dois "processos": conexões, UoWs e fachadas separadas sobre o mesmo banco.
    const b = await createPgClient({ url, max: 2 });
    function barreira(n: number) {
      let chegaram = 0;
      let abrir!: () => void;
      const aberta = new Promise<void>((r) => { abrir = r; });
      return { chegar: async () => { chegaram += 1; if (chegaram >= n) abrir(); await aberta; } };
    }
    class FilaComBarreira implements PilotReadyOrderStore {
      constructor(private readonly base: PilotReadyOrderStore, private readonly bar: { chegar: () => Promise<void> }) {}
      async list(): Promise<PilotReadyOrder[]> { const l = await this.base.list(); await this.bar.chegar(); return l; }
      add(o: PilotReadyOrder) { return this.base.add(o); }
      removeByOrderRefs(r: readonly string[]) { return this.base.removeByOrderRefs(r); }
    }
    const processo = (cli: typeof a, fila: PilotReadyOrderStore) => new PilotApplicationFacade(pgCfg, createPilotLogger(pgDir),
      { kind: "external", open: () => new PgEntregasUnitOfWork(cli, PGUNIT) }, fila,
      { internalRiders: () => new Set(["rid-1", "rid-2"]) });
    const montarPg = (f: PilotApplicationFacade, ator: { actor_id: string; role: "operador_expedicao" }, trip: string, entrega: string, rider: string, ref: string) =>
      f.executeAs(ator, {
        type: "CreateTrip", command_id: `pg-${trip}`, occurred_at: new Date().toISOString(), unit_id: PGUNIT,
        trip_id: trip, courier_actor_id: asInternalRiderActorId(rider),
        deliveries: [{ delivery_id: entrega, order_ref: ref }], actor: ator,
      });
    const contarFatos = async (ref: string) => Number((await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM entregas.domain_event WHERE unit_id=$1 AND event_type='delivery_ready'
         AND payload->>'order_ref'=$2`, [PGUNIT, ref]))[0]!.n);
    const contarAtivas = async (ref: string) => Number((await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM entregas.delivery d JOIN entregas.trip t ON t.trip_id=d.trip_id
        WHERE t.unit_id=$1 AND d.order_ref=$2 AND d.active`, [PGUNIT, ref]))[0]!.n);
    const opsA = { actor_id: "ops-1", role: "operador_expedicao" as const };
    const opsB = { actor_id: "ops-2", role: "operador_expedicao" as const };

    await teste("C3a PostgreSQL: dois processos com o MESMO registro em mãos — uma transação vence, a outra é recusada", async () => {
      const ref = `PG-${sufixo}-C3A`;
      const f0 = facade();
      f0.login("tok-ops");
      assert.equal((await f0.registerReadyOrder(ref, "Pedido corrida", "proprio")).ok, true);
      const t0 = (await ready.list()).find((o) => o.order_ref === ref)!.created_at;
      await sleep(5);
      const bar = barreira(2);
      const fA = processo(a, new FilaComBarreira(new PgPilotReadyOrderStore(a, PGUNIT), bar));
      const fB = processo(b, new FilaComBarreira(new PgPilotReadyOrderStore(b, PGUNIT), bar));
      const rs = await Promise.all([
        montarPg(fA, opsA, `PGTA-${sufixo}`, `PGDA-${sufixo}`, "rid-1", ref),
        montarPg(fB, opsB, `PGTB-${sufixo}`, `PGDB-${sufixo}`, "rid-2", ref),
      ]);
      assert.equal(rs.filter((r) => r.ok).length, 1, `resultado: ${JSON.stringify(rs.map((r) => [r.ok, r.code, r.error]))}`);
      assert.equal(rs.find((r) => !r.ok)!.code, "READY_ALREADY_CONSUMED");
      assert.equal(await contarFatos(ref), 1, "o fato duplicou no PG");
      assert.equal(await contarAtivas(ref), 1, "o pedido ficou em duas entregas ativas");
      const fato = await admin.query<{ occurred_at: Date }>(
        `SELECT occurred_at FROM entregas.domain_event WHERE unit_id=$1 AND event_type='delivery_ready' AND payload->>'order_ref'=$2`,
        [PGUNIT, ref]);
      assert.equal(new Date(fato[0]!.occurred_at).toISOString(), t0);
    });

    await teste("C3b PostgreSQL: o segundo processo chega depois do commit do primeiro — recusado, não vira pedido avulso", async () => {
      const ref = `PG-${sufixo}-C3B`;
      const f0 = facade();
      f0.login("tok-ops");
      assert.equal((await f0.registerReadyOrder(ref, "Pedido tardio", "proprio")).ok, true);
      await sleep(5);
      const fA = processo(a, new PgPilotReadyOrderStore(a, PGUNIT));
      const fB = processo(b, new PgPilotReadyOrderStore(b, PGUNIT));
      const ra = await montarPg(fA, opsA, `PGTC-${sufixo}`, `PGDC-${sufixo}`, "rid-1", ref);
      assert.equal(ra.ok, true, ra.error);
      const rb = await montarPg(fB, opsB, `PGTD-${sufixo}`, `PGDD-${sufixo}`, "rid-2", ref);
      assert.equal(rb.ok, false, "o pedido já despachado entrou numa segunda viagem como avulso");
      assert.equal(rb.code, "READY_ALREADY_CONSUMED");
      assert.equal(await contarFatos(ref), 1);
      assert.equal(await contarAtivas(ref), 1);
    });

    await teste("P5 PostgreSQL: a fila não tem onde guardar quem registrou — actor_id fica UNKNOWN, nunca o montador", async () => {
      const ref = `PG-${sufixo}-1`;
      const linhas = await admin.query<{ actor_id: string | null }>(
        `SELECT actor_id FROM entregas.domain_event WHERE unit_id=$1 AND event_type='delivery_ready' AND payload->>'order_ref'=$2`,
        [PGUNIT, ref]);
      assert.equal(linhas.length, 1);
      assert.equal(linhas[0]!.actor_id, null);
    });
    await (b as { close?: () => Promise<void> }).close?.();
    rmSync(pgDir, { recursive: true, force: true });
  } finally {
    await (a as { close?: () => Promise<void> }).close?.();
    await (admin as { close?: () => Promise<void> }).close?.();
  }
}

/**
 * O processo REAL do piloto, pela rota HTTP que o console usa: registrar,
 * montar, sair, ler a linha do tempo; derrubar o processo; subir OUTRO sobre os
 * mesmos arquivos e ler de novo.
 */
async function provaDeProcesso(): Promise<void> {
  const { spawn } = await import("node:child_process");
  const { createServer } = await import("node:net");
  const { existsSync, mkdirSync, writeFileSync } = await import("node:fs");
  const RAIZ = process.cwd();
  const tok = {
    caixa: "tok-caixa-pronto-sintetico", tablet: "tok-tablet-pronto-sintetico",
    rid: "tok-rid-pronto-sintetico", rid2: "tok-rid2-pronto-sintetico",
  };
  const porta = await new Promise<number>((ok, falha) => {
    const s = createServer();
    s.once("error", falha);
    s.listen(0, "127.0.0.1", () => { const a = s.address(); s.close(() => ok(typeof a === "object" && a ? a.port : 0)); });
  });
  const dir = mkdtempSync(join(tmpdir(), "ready-fact-processo-"));
  mkdirSync(join(dir, "dados"), { recursive: true });
  writeFileSync(join(dir, "pilot.json"), JSON.stringify({
    mode: "pilot", unit_id: "ITAIM", unit_name: "UNIDADE DE TESTE", timezone: "America/Sao_Paulo",
    port: porta, bind: "127.0.0.1", data_dir: join(dir, "dados"), max_stops: 5, banner: "TESTE AUTOMATIZADO",
    source_mode: "simulated",
    users: [
      { actor_id: "ops-caixa-1", role: "operador_expedicao", label: "Caixa", token: tok.caixa },
      { actor_id: "rid-1", role: "motoboy_interno", label: "Motoboy Um", token: tok.rid },
      { actor_id: "ops-tablet-1", role: "operador_expedicao", label: "Tablet", token: tok.tablet },
      { actor_id: "rid-2", role: "motoboy_interno", label: "Motoboy Dois", token: tok.rid2 },
    ],
    features: { demo_seed: false, demo_controls: false, map_poc: false, gps_production: false,
      auto_assignment: false, copiloto: false, shell: false },
    backup: { auto_interval_minutes: 600, retain_count: 2, dir: join(dir, "backups") },
  }));
  writeFileSync(join(dir, "flags.json"), JSON.stringify({ gps_capture_enabled: false }));
  writeFileSync(join(dir, "termo.json"), JSON.stringify({}));
  const env: Record<string, string | undefined> = {
    ...process.env,
    ENTREGAS_UI_PORT: String(porta),
    ENTREGAS_PILOT_CONFIG: join(dir, "pilot.json"),
    ENTREGAS_DATA_DIR: join(dir, "dados"),
    ENTREGAS_TERM_CONFIG: join(dir, "termo.json"),
    ENTREGAS_GPS_FLAGS_CONFIG: join(dir, "flags.json"),
  };
  delete env.ENTREGAS_UNIT_CONFIG;
  delete env.ENTREGAS_BIND;
  delete env.ENTREGAS_HTTPS;
  if (existsSync(join(RAIZ, "config", "entregas-unit-itaim.json"))) {
    console.log("  PULADO processo: config/entregas-unit-itaim.json presente — H1/H2 NAO rodaram");
    return;
  }
  const sep = process.platform === "win32" ? ";" : ":";
  const tsxCli = (process.env.PATH ?? "").split(sep).map((b) => join(b, "..", "tsx", "dist", "cli.mjs"))
    .find((c) => existsSync(c));
  if (!tsxCli) throw new Error("tsx_cli_nao_localizado_no_path");
  const base = `http://127.0.0.1:${porta}`;
  type Proc = import("node:child_process").ChildProcess;
  const log: string[] = [];
  const subir = async (): Promise<Proc> => {
    const pr = spawn(process.execPath, [tsxCli, "tools/entregas_pilot_server.ts"], {
      cwd: RAIZ, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32",
    });
    pr.stdout?.on("data", (d) => log.push(String(d)));
    pr.stderr?.on("data", (d) => log.push(String(d)));
    for (let i = 0; i < 160; i++) {
      try { if ((await fetch(`${base}/api/health`)).ok) return pr; } catch { /* subindo */ }
      await sleep(250);
    }
    throw new Error(`piloto não subiu: ${log.join("").slice(-500)}`);
  };
  const derrubar = async (pr: Proc): Promise<void> => {
    if (pr.exitCode !== null || pr.signalCode !== null) return;
    const saiu = new Promise<void>((ok) => pr.once("exit", () => ok()));
    try { if (pr.pid) process.kill(process.platform === "win32" ? pr.pid : -pr.pid, "SIGTERM"); } catch { /* saiu */ }
    await Promise.race([saiu, sleep(10_000)]);
  };
  const api = async (caminho: string, token: string, corpo?: unknown) => {
    const r = await fetch(`${base}${caminho}`, {
      method: corpo === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const t = await r.text();
    return { status: r.status, json: (t ? JSON.parse(t) : {}) as Record<string, unknown> };
  };
  type Linha = { at: string; event_type: string; label: string; author: string; object_id: string };
  let pr: Proc | null = null;
  let t0 = "";
  try {
    pr = await subir();
    await teste("H1 processo real: pronto por HTTP, viagem e saída; a rota da linha do tempo devolve o instante original", async () => {
      const reg = await api("/api/ready-order", tok.caixa, { order_ref: "H-1", label: "Pedido H-1 · Rua Sintética 9", channel: "proprio" });
      assert.equal(reg.status, 200);
      const fila = JSON.parse(readFileSync(join(dir, "dados", "ready_orders.json"), "utf8")) as { orders: PilotReadyOrder[] };
      t0 = fila.orders.find((o) => o.order_ref === "H-1")!.created_at;
      await sleep(25);
      const ct = await api("/api/command", tok.caixa, {
        type: "CreateTrip", command_id: "ct-h1", occurred_at: new Date().toISOString(), unit_id: "ITAIM",
        trip_id: "TH1", courier_actor_id: "rid-1", deliveries: [{ delivery_id: "DH1", order_ref: "H-1" }],
      });
      assert.equal((ct.json.result as { ok?: boolean })?.ok, true, JSON.stringify(ct.json));
      const dep = await api("/api/command", tok.rid, {
        type: "ConfirmTripDeparture", command_id: "dep-h1", occurred_at: new Date().toISOString(),
        unit_id: "ITAIM", trip_id: "TH1",
      });
      assert.equal((dep.json.result as { ok?: boolean })?.ok, true, JSON.stringify(dep.json));
      const tl = await api("/api/trip/timeline?trip_id=TH1", tok.caixa);
      assert.equal(tl.status, 200);
      const linhas = tl.json.timeline as Linha[];
      const pronto = linhas.filter((l) => l.event_type === "delivery_ready");
      assert.equal(pronto.length, 1, JSON.stringify(linhas.map((l) => l.event_type)));
      assert.equal(pronto[0]!.at, t0);
      assert.equal(pronto[0]!.object_id, "DH1");
      assert.equal(pronto[0]!.label, "Pronto registrado pela expedição");
      assert.equal(JSON.stringify(tl.json).includes("Rua Sintética"), false, "endereço do rótulo vazou na rota");
    });
    await derrubar(pr);
    pr = null;
    pr = await subir();
    await teste("H2 processo real reiniciado sobre os mesmos arquivos: o mesmo instante, uma vez só", async () => {
      assert.ok(t0, "H1 não capturou o instante");
      const tl = await api("/api/trip/timeline?trip_id=TH1", tok.caixa);
      assert.equal(tl.status, 200);
      const pronto = (tl.json.timeline as Linha[]).filter((l) => l.event_type === "delivery_ready");
      assert.equal(pronto.length, 1);
      assert.equal(pronto[0]!.at, t0);
      const ordem = (tl.json.timeline as Linha[]).map((l) => l.event_type);
      assert.ok(ordem.indexOf("delivery_ready") < ordem.indexOf("trip_started"), ordem.join(","));
    });
    await teste("H3 processo real: caixa e tablet pedem ao mesmo tempo a viagem do MESMO pronto — uma viagem, um fato", async () => {
      const reg = await api("/api/ready-order", tok.caixa, { order_ref: "H-3", label: "Pedido H-3", channel: "proprio" });
      assert.equal(reg.status, 200);
      await sleep(5);
      const pedir = (token: string, trip: string, entrega: string, rider: string) => api("/api/command", token, {
        type: "CreateTrip", command_id: `ct-${trip}`, occurred_at: new Date().toISOString(), unit_id: "ITAIM",
        trip_id: trip, courier_actor_id: rider, deliveries: [{ delivery_id: entrega, order_ref: "H-3" }],
      });
      const rs = await Promise.all([pedir(tok.caixa, "TH3A", "DH3A", "rid-1"), pedir(tok.tablet, "TH3B", "DH3B", "rid-2")]);
      const res = rs.map((r) => r.json.result as { ok?: boolean; code?: string });
      assert.equal(res.filter((r) => r?.ok).length, 1, `as duas viagens passaram: ${JSON.stringify(res)}`);
      assert.equal(res.find((r) => !r?.ok)?.code, "READY_ALREADY_CONSUMED");
      const snap = await api("/api/snapshot", tok.caixa);
      const viagens = (snap.json.trips ?? []) as Array<{ trip_id: string; deliveries: Array<{ order_ref: string; state: string }> }>;
      const comH3 = viagens.filter((v) => v.deliveries.some((e) => e.order_ref === "H-3"));
      assert.equal(comH3.length, 1, `H-3 em ${comH3.length} viagens`);
      const tl = await api(`/api/trip/timeline?trip_id=${comH3[0]!.trip_id}`, tok.caixa);
      assert.equal((tl.json.timeline as Linha[]).filter((l) => l.event_type === "delivery_ready").length, 1);
    });
  } finally {
    if (pr) await derrubar(pr);
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
