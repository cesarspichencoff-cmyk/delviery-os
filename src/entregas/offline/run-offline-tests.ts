/**
 * Bateria da fila offline REAL — COR §17.
 * Executar: npm run test:entregas:offline
 */
import assert from "node:assert/strict";
import {
  OfflineQueue,
  MemoryOfflineStorage,
  DEFAULT_OFFLINE_CONFIG,
  type SyncAck,
} from "./queue";

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  OK  ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}`);
    throw e;
  }
}

const DEVICE = "dev-pseudo-001";
const cfg = { ...DEFAULT_OFFLINE_CONFIG, device_id: DEVICE };

function makeQueue(storage = new MemoryOfflineStorage(), clock?: () => Date) {
  return new OfflineQueue(storage, cfg, clock);
}

function item(n: number, occurred_at: string, trip = "trip-1") {
  return {
    event_id: `ev-${n}`,
    idempotency_key: `key-${n}`,
    kind: "delivery_confirmed",
    payload: { n },
    occurred_at,
    trip_id: trip,
  };
}

console.log("\n=== Entregas offline queue tests (COR §17) ===\n");

test("evento gravado durante queda de rede sobrevive na fila", () => {
  const q = makeQueue();
  q.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  assert.equal(q.pendingCount(), 1);
  assert.equal(q.stats().pending, 1);
});

test("reinício do app: fila é reconstruída do storage (não vive em memória)", () => {
  const storage = new MemoryOfflineStorage();
  const q1 = makeQueue(storage);
  q1.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  q1.enqueue(item(2, "2026-07-25T10:01:00.000Z"));
  const q2 = makeQueue(storage); // simula reinício
  assert.equal(q2.pendingCount(), 2);
  assert.equal(q2.all().length, 2);
});

test("occurred_at original NUNCA é sobrescrito pelo horário de sincronização", () => {
  const original = "2026-07-25T10:00:00.000Z";
  const q = makeQueue(new MemoryOfflineStorage(), () => new Date("2026-07-25T12:00:00.000Z"));
  q.enqueue(item(1, original));
  const batch = q.nextBatch();
  q.applyAcks([
    { event_id: "ev-1", status: "accepted", synced_at: "2026-07-25T12:00:05.000Z" },
  ]);
  const stored = q.all()[0];
  assert.equal(stored.occurred_at, original, "occurred_at do aparelho preservado");
  assert.equal(stored.synced_at, "2026-07-25T12:00:05.000Z");
  assert.notEqual(stored.occurred_at, stored.synced_at);
  assert.equal(batch.items.length, 1);
});

test("sequence_local preserva a ordem local mesmo com occurred_at fora de ordem", () => {
  const q = makeQueue();
  q.enqueue(item(1, "2026-07-25T10:05:00.000Z")); // mais novo primeiro
  q.enqueue(item(2, "2026-07-25T10:00:00.000Z")); // mais velho depois
  const batch = q.nextBatch();
  assert.deepEqual(
    batch.items.map((i) => i.event_id),
    ["ev-1", "ev-2"],
    "ordem de envio segue sequence_local do dispositivo",
  );
  assert.equal(batch.items[0].sequence_local, 1);
  assert.equal(batch.items[1].sequence_local, 2);
});

test("mesmo event_id não cria segundo item (idempotência local)", () => {
  const q = makeQueue();
  const a = q.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  const b = q.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
  assert.equal(q.all().length, 1);
});

test("mesma idempotency_key com event_id diferente também é duplicata", () => {
  const q = makeQueue();
  q.enqueue({ ...item(1, "2026-07-25T10:00:00.000Z") });
  const dup = q.enqueue({
    ...item(1, "2026-07-25T10:00:00.000Z"),
    event_id: "ev-outro",
  });
  assert.equal(dup.duplicate, true);
  assert.equal(q.all().length, 1);
});

test("lote reenviado (duplicate do servidor) conta como sucesso, não erro", () => {
  const q = makeQueue();
  q.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  q.nextBatch();
  q.applyAcks([
    { event_id: "ev-1", status: "duplicate", synced_at: "2026-07-25T10:00:10.000Z" },
  ]);
  assert.equal(q.all()[0].state, "synced");
  assert.equal(q.pendingCount(), 0);
});

test("sincronização PARCIAL: aceito sai da fila, o resto permanece", () => {
  const q = makeQueue();
  q.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  q.enqueue(item(2, "2026-07-25T10:01:00.000Z"));
  q.enqueue(item(3, "2026-07-25T10:02:00.000Z"));
  q.nextBatch();
  q.applyAcks([
    { event_id: "ev-1", status: "accepted", synced_at: "2026-07-25T10:03:00.000Z" },
  ]);
  const s = q.stats();
  assert.equal(s.synced, 1);
  assert.equal(s.sending, 2, "sem ack permanece sending até falha/recuperação");
  q.recoverStuck();
  assert.equal(q.pendingCount(), 2, "os não confirmados voltam para reenvio");
});

test("conflito fica VISÍVEL para reconciliação, nunca é apagado", () => {
  const q = makeQueue();
  q.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  q.nextBatch();
  q.applyAcks([
    {
      event_id: "ev-1",
      status: "conflict",
      synced_at: "2026-07-25T10:00:10.000Z",
      error: "estado incompatível",
    },
  ]);
  const stored = q.all()[0];
  assert.equal(stored.state, "conflict");
  assert.equal(stored.last_error, "estado incompatível");
  assert.equal(q.all().length, 1, "conflito permanece no histórico");
});

test("recuperação após queda no meio do envio: sending volta a pending", () => {
  const storage = new MemoryOfflineStorage();
  const q1 = makeQueue(storage);
  q1.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  q1.nextBatch(); // marca sending e o app "morre" aqui
  const q2 = makeQueue(storage);
  assert.equal(q2.stats().sending, 1);
  const recovered = q2.recoverStuck();
  assert.equal(recovered, 1);
  assert.equal(q2.pendingCount(), 1);
});

test("clock skew grande marca clock_trust=suspect (COR §17.2.6)", () => {
  const q = makeQueue(new MemoryOfflineStorage(), () => new Date("2026-07-25T10:00:00.000Z"));
  q.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  q.enqueue(item(2, "2026-07-25T09:00:00.000Z")); // 1h de divergência
  const all = q.all();
  assert.equal(all[0].clock_trust, "trusted");
  assert.equal(all[1].clock_trust, "suspect");
});

test("occurred_at no futuro além da tolerância também é suspect", () => {
  const q = makeQueue(new MemoryOfflineStorage(), () => new Date("2026-07-25T10:00:00.000Z"));
  q.enqueue(item(1, "2026-07-25T11:00:00.000Z"));
  assert.equal(q.all()[0].clock_trust, "suspect");
});

test("falha de transporte agenda retry com backoff crescente", () => {
  let nowMs = Date.parse("2026-07-25T10:00:00.000Z");
  const q = makeQueue(new MemoryOfflineStorage(), () => new Date(nowMs));
  q.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  const b1 = q.nextBatch();
  q.failBatch(b1.items, "network down");
  const afterFirst = q.all()[0];
  assert.equal(afterFirst.attempts, 1);
  assert.equal(afterFirst.state, "pending");
  assert.ok(afterFirst.next_attempt_at, "backoff agendado");

  // antes do backoff vencer, não entra no lote
  assert.equal(q.nextBatch().items.length, 0, "respeita o backoff");
  nowMs += 5000;
  assert.equal(q.nextBatch().items.length, 1, "após o backoff, volta a sair");
});

test("excesso de tentativas vira dead_letter VISÍVEL, nunca descarte silencioso", () => {
  let nowMs = Date.parse("2026-07-25T10:00:00.000Z");
  const q = new OfflineQueue(
    new MemoryOfflineStorage(),
    { ...cfg, max_attempts: 3, backoff_base_ms: 1 },
    () => new Date(nowMs),
  );
  q.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  for (let i = 0; i < 3; i++) {
    nowMs += 1000;
    const b = q.nextBatch();
    if (b.items.length) q.failBatch(b.items, "erro persistente");
  }
  const stored = q.all()[0];
  assert.equal(stored.state, "dead_letter");
  assert.equal(q.all().length, 1, "evento continua existindo para intervenção");
  assert.equal(q.pendingCount(), 0);
});

test("storage corrompido bloqueia gravação e preserva bytes para recuperação", () => {
  const original = "{ isto nao e json valido";
  const storage = new MemoryOfflineStorage(original);
  const q = makeQueue(storage);
  assert.equal(q.all().length, 0, "consulta degradada sem expor registros fictícios");
  assert.deepEqual(q.storageHealth(),
    { writable: false, reason: "OFFLINE_STORAGE_RECOVERY_REQUIRED" });
  assert.throws(() => q.enqueue(item(1, "2026-07-25T10:00:00.000Z")),
    /OFFLINE_STORAGE_RECOVERY_REQUIRED/);
  assert.equal(storage.read(), original, "nunca sobrescreve o original corrompido");
});

test("purgeSynced remove só o que já foi confirmado", () => {
  const q = makeQueue();
  q.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  q.enqueue(item(2, "2026-07-25T10:01:00.000Z"));
  q.nextBatch();
  q.applyAcks([
    { event_id: "ev-1", status: "accepted", synced_at: "2026-07-25T10:02:00.000Z" },
  ]);
  const removed = q.purgeSynced();
  assert.equal(removed, 1);
  assert.equal(q.all().length, 1);
  assert.equal(q.all()[0].event_id, "ev-2");
});

test("device_id pseudonimizado acompanha todo item", () => {
  const q = makeQueue();
  q.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  assert.equal(q.all()[0].device_id, DEVICE);
  assert.ok(!/\d{11}|@/.test(DEVICE), "device_id não parece telefone/e-mail");
});


test("versão desconhecida bloqueia escrita, sem converter em fila vazia", () => {
  const raw = JSON.stringify({ schema_version: "offline-queue@42", items: [] });
  const storage = new MemoryOfflineStorage(raw);
  const q = makeQueue(storage);
  assert.equal(q.storageHealth().writable, false);
  assert.throws(() => q.enqueue(item(1, "2026-07-25T10:00:00.000Z")),
    /OFFLINE_STORAGE_RECOVERY_REQUIRED/);
  assert.equal(storage.read(), raw);
});

test("instância obsoleta não sobrescreve evento gravado pela outra", () => {
  const storage = new MemoryOfflineStorage();
  const first = makeQueue(storage);
  const stale = makeQueue(storage);
  first.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  const preserved = storage.read();
  assert.throws(() => stale.enqueue(item(2, "2026-07-25T10:01:00.000Z")),
    /OFFLINE_STORAGE_EXTERNAL_CHANGE/);
  assert.equal(stale.storageHealth().writable, false);
  assert.equal(storage.read(), preserved);
  assert.deepEqual(makeQueue(storage).all().map(e => e.event_id), ["ev-1"]);
});

test("alteração externa ilegível bloqueia gravação até recuperação", () => {
  const storage = new MemoryOfflineStorage();
  const q = makeQueue(storage);
  storage.write("{fragment");
  assert.throws(() => q.enqueue(item(1, "2026-07-25T10:00:00.000Z")),
    /OFFLINE_STORAGE_EXTERNAL_CHANGE/);
  assert.equal(storage.read(), "{fragment");
});

test("consulta e lote são cópias, sem mutação silenciosa da fila", () => {
  const storage = new MemoryOfflineStorage();
  const q = makeQueue(storage);
  const inserted = q.enqueue(item(1, "2026-07-25T10:00:00.000Z", "t-1"));
  inserted.item.payload.n = 999;
  const all = q.all();
  all[0].payload.n = 888;
  const trip = q.byTrip("t-1");
  trip[0].payload.n = 777;
  assert.equal(q.all()[0].payload.n, 1);
  const batch = q.nextBatch();
  batch.items[0].payload.n = 666;
  assert.equal(q.all()[0].payload.n, 1);
  assert.equal(new OfflineQueue(storage, cfg).all()[0].payload.n, 1);
});

test("ACK tardio não reverte conflito nem dead_letter", () => {
  const q = makeQueue();
  q.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  q.nextBatch();
  q.applyAcks([{event_id: "ev-1", status: "conflict",
    synced_at: "2026-07-25T10:00:10.000Z",error: "divergente"}]);
  q.applyAcks([{event_id: "ev-1", status: "accepted",
    synced_at: "2026-07-25T10:00:20.000Z"}]);
  assert.equal(q.all()[0].state, "conflict");
  assert.equal(q.all()[0].last_error, "divergente");
});

test("resposta de falha tardia não reabre uma entrega já confirmada", () => {
  const q = makeQueue();
  q.enqueue(item(1, "2026-07-25T10:00:00.000Z"));
  const batch = q.nextBatch();
  q.applyAcks([{event_id: "ev-1", status: "duplicate",
    synced_at: "2026-07-25T10:00:10.000Z"}]);
  q.failBatch(batch.items, "timeout tardio");
  assert.equal(q.all()[0].state, "synced");
  assert.equal(q.all()[0].attempts, 0);
});

test("device B não assume histórico local persistido do device A", () => {
  const storage = new MemoryOfflineStorage();
  const a = makeQueue(storage);
  a.enqueue(item(1,"2026-07-25T10:00:00.000Z"));
  const before = storage.read();
  const b = new OfflineQueue(storage,{...cfg,device_id:"dev-B-isolated"});
  assert.deepEqual(b.storageHealth(),
    {writable:false,reason:"OFFLINE_STORAGE_DEVICE_MISMATCH"});
  assert.throws(()=>b.enqueue(item(2,"2026-07-25T10:01:00.000Z")),
    /OFFLINE_STORAGE_DEVICE_MISMATCH/);
  assert.equal(storage.read(),before);
  assert.equal(makeQueue(storage).all().length,1);
});

test("mesma chave e conteúdo divergente nunca é descartado como duplicata", () => {
  const storage = new MemoryOfflineStorage();
  const q = makeQueue(storage);
  q.enqueue(item(1,"2026-07-25T10:00:00.000Z"));
  const original = storage.read();
  assert.throws(()=>q.enqueue({...item(1,"2026-07-25T10:00:00.000Z"),
    payload:{n:42}}),/OFFLINE_IDEMPOTENCY_COLLISION/);
  assert.throws(()=>q.enqueue({...item(1,"2026-07-25T10:00:00.000Z"),
    idempotency_key:"outra-chave"}),/OFFLINE_IDEMPOTENCY_COLLISION/);
  assert.equal(storage.read(),original);
  assert.deepEqual(q.all().map(x=>x.payload.n),[1]);
});

test("reordenação de propriedades no payload não cria falso conflito", () => {
  const q = makeQueue();
  const input = item(1,"2026-07-25T10:00:00.000Z");
  q.enqueue({...input,payload:{a:1,b:{x:2,y:3}}});
  const retry = q.enqueue({...input,payload:{b:{y:3,x:2},a:1}});
  assert.equal(retry.duplicate,true);
  assert.equal(q.all().length,1);
});

test("falha de escrita não deixa evento fantasma na memória", () => {
  const underlying = new MemoryOfflineStorage();
  const io = { read: () => underlying.read(), write: (_data: string) => {
    throw new Error("SIMULATED_DISK_FULL");
  }};
  const q = new OfflineQueue(io,cfg);
  assert.throws(() => q.enqueue(item(1,"2026-07-25T10:00:00.000Z")),
    /SIMULATED_DISK_FULL/);
  assert.equal(q.all().length,0);
  assert.equal(q.storageHealth().writable,false);
  assert.equal(underlying.read(),null);
});

test("write silencioso sem persistência é detectado e revertido", () => {
  const underlying = new MemoryOfflineStorage();
  const io = { read: () => underlying.read(), write: (_data: string) => {} };
  const q = new OfflineQueue(io,cfg);
  assert.throws(() => q.enqueue(item(1,"2026-07-25T10:00:00.000Z")),
    /OFFLINE_STORAGE_WRITE_NOT_VERIFIED/);
  assert.equal(q.all().length,0);
  assert.equal(underlying.read(),null);
  assert.equal(q.storageHealth().reason,"OFFLINE_STORAGE_WRITE_NOT_VERIFIED");
});

test("gravação parcial com exceção não confirma evento nem limpa os bytes", () => {
  const underlying = new MemoryOfflineStorage();
  const io = { read: () => underlying.read(), write: (_data: string) => {
    underlying.write("{partial");
    throw new Error("SIMULATED_TORN_WRITE");
  }};
  const q = new OfflineQueue(io,cfg);
  assert.throws(() => q.enqueue(item(1,"2026-07-25T10:00:00.000Z")),
    /SIMULATED_TORN_WRITE/);
  assert.equal(q.all().length,0);
  assert.equal(underlying.read(),"{partial");
  assert.equal(q.storageHealth().writable,false);
  const restarted = new OfflineQueue(io,cfg);
  assert.equal(restarted.storageHealth().writable,false);
  assert.equal(underlying.read(),"{partial");
});

console.log(`\n=== ${passed} offline queue tests OK ===\n`);
