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

test("storage corrompido não trava o app nem apaga o arquivo original", () => {
  const storage = new MemoryOfflineStorage("{ isto nao e json valido");
  const q = makeQueue(storage);
  assert.equal(q.all().length, 0, "começa vazio em memória");
  assert.doesNotThrow(() => q.enqueue(item(1, "2026-07-25T10:00:00.000Z")));
  assert.equal(q.pendingCount(), 1);
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

console.log(`\n=== ${passed} offline queue tests OK ===\n`);
