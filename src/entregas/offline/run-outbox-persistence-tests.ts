/**
 * Prova de persistência do OUTBOX através de reinício.
 *
 * Contexto honesto: o relatório anterior classificou "outbox em memória" como
 * risco. A investigação mostrou que isso era IMPRECISO — o
 * `InMemoryTransactionalOutbox` é usado apenas na sessão de integração/demo;
 * o caminho do piloto (`pilot-facade` → `openFileUnitOfWork`) já persiste o
 * outbox junto do domínio, com commit atômico.
 *
 * Estes testes PROVAM a persistência em vez de reimplementar o que já existe.
 * Executar: npm run test:entregas:outbox
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openFileUnitOfWork, createTempDataFile } from "../persistence/file-store";
import type { OutboxRecord } from "../integration/outbox";
import type { EntregasPublicEvent } from "../contracts/events/types";
import { EXAMPLE_TRIP_CREATED } from "../contracts/events/examples";

let passed = 0;
function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve(fn()).then(
    () => {
      passed++;
      console.log(`  OK  ${name}`);
    },
    (e) => {
      console.error(`  FAIL ${name}`);
      throw e;
    },
  );
}

/** Baseado no exemplo canônico anonimizado — só troca a identidade. */
function publicEvent(id: string): EntregasPublicEvent {
  return {
    ...EXAMPLE_TRIP_CREATED,
    event_id: id,
    idempotency_key: `trip_created:${id}`,
  };
}

function record(id: string): OutboxRecord {
  return {
    outbox_id: `obx-${id}`,
    event: publicEvent(id),
    status: "pending",
    attempts: 0,
    created_at: "2026-07-25T18:00:00.000Z",
  };
}

async function main(): Promise<void> {
  console.log("\n=== Entregas outbox persistence tests ===\n");
  const dir = mkdtempSync(join(tmpdir(), "entregas-outbox-"));

  try {
    await test("outbox sobrevive ao reinício do processo (FileUnitOfWork)", async () => {
      const file = createTempDataFile(dir);

      const uow1 = openFileUnitOfWork(file);
      await uow1.outbox.enqueue(record("ev-1"));
      await uow1.outbox.enqueue(record("ev-2"));
      await uow1.commit();

      // "reinicia": nova instância lendo o mesmo arquivo
      const uow2 = openFileUnitOfWork(file);
      const pending = await uow2.outbox.listPending();
      assert.equal(pending.length, 2, "outbox recuperado do disco");
    });

    await test("enqueue é idempotente por event_id mesmo após reinício", async () => {
      const file = createTempDataFile(dir);
      const uow1 = openFileUnitOfWork(file);
      await uow1.outbox.enqueue(record("ev-dup"));
      await uow1.commit();

      const uow2 = openFileUnitOfWork(file);
      const r = await uow2.outbox.enqueue(record("ev-dup"));
      await uow2.commit();
      assert.equal(r.duplicate, true, "mesmo event_id não duplica");

      const uow3 = openFileUnitOfWork(file);
      assert.equal((await uow3.outbox.all()).length, 1);
    });

    await test("markPublished persiste e o item sai de pending", async () => {
      const file = createTempDataFile(dir);
      const uow1 = openFileUnitOfWork(file);
      await uow1.outbox.enqueue(record("ev-pub"));
      await uow1.commit();

      const uow2 = openFileUnitOfWork(file);
      const [item] = await uow2.outbox.listPending();
      await uow2.outbox.markPublished(item.outbox_id, "2026-07-25T18:05:00.000Z");
      await uow2.commit();

      const uow3 = openFileUnitOfWork(file);
      assert.equal((await uow3.outbox.listPending()).length, 0);
      const all = await uow3.outbox.all();
      assert.equal(all[0].status, "published");
      assert.equal(all[0].published_at, "2026-07-25T18:05:00.000Z");
    });

    await test("markFailed preserva o evento e registra o erro (nunca perde)", async () => {
      const file = createTempDataFile(dir);
      const uow1 = openFileUnitOfWork(file);
      await uow1.outbox.enqueue(record("ev-fail"));
      await uow1.commit();

      const uow2 = openFileUnitOfWork(file);
      const [item] = await uow2.outbox.listPending();
      await uow2.outbox.markFailed(item.outbox_id, "consumidor fora do ar", "2026-07-25T18:06:00.000Z");
      await uow2.commit();

      const uow3 = openFileUnitOfWork(file);
      const all = await uow3.outbox.all();
      assert.equal(all.length, 1, "evento continua existindo após falha");
      assert.equal(all[0].last_error, "consumidor fora do ar");
    });

    await test("rollback não deixa o evento no disco (sem perda nem fantasma)", async () => {
      const file = createTempDataFile(dir);
      const uow1 = openFileUnitOfWork(file);
      await uow1.outbox.enqueue(record("ev-rollback"));
      await uow1.rollback();

      const uow2 = openFileUnitOfWork(file);
      assert.equal((await uow2.outbox.all()).length, 0, "sem commit, nada persiste");
    });

    await test("arquivo persistido NÃO contém coordenada de GPS neste fluxo", async () => {
      const file = createTempDataFile(dir);
      const uow = openFileUnitOfWork(file);
      await uow.outbox.enqueue(record("ev-priv"));
      await uow.commit();
      const raw = readFileSync(file, "utf8");
      assert.equal(/"latitude"|"longitude"/.test(raw), false);
    });

    console.log(`\n=== ${passed} outbox persistence tests OK ===\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
