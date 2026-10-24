/**
 * Recibos de entrada — laboratorio somente sintetico, nunca piloto real.
 * Verifica conflito sequencial de UoW obsoleta; nao prova lock entre processos.
 * Execucao: npx tsx src/entregas/persistence/run-inbound-receipt-tests.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openFileUnitOfWork } from "./file-store";
import { ConcurrencyError } from "./ports";
import type { PilotInboundReceipt } from "./file-store";
import { EXAMPLE_TRIP_CREATED } from "../contracts/events/examples";
import { createBackup, restoreBackup } from "../pilot/pilot-backup";

const dir = mkdtempSync(join(tmpdir(), "deliveryos-receipt-synthetic-"));
let passed = 0;
const failed: string[] = [];
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); passed++; console.log("OK " + name); }
  catch (e) { failed.push(name + ": " + String(e)); console.error("RED " + name); }
}
function receipt(id: string, key = "key-" + id): PilotInboundReceipt {
  return { event_id: id, idempotency_key: key, fingerprint: "sha256-synthetic-" + id,
    actor_id: "operator-synthetic", role: "operador_expedicao" };
}
function outbox(id: string) {
  return { outbox_id: "outbox-" + id,
    event: { ...EXAMPLE_TRIP_CREATED, event_id: "public-" + id,
      idempotency_key: "public-key-" + id },
    status: "pending" as const, attempts: 0, created_at: "2026-10-20T00:00:00.000Z" };
}
async function main(): Promise<void> {
  try {
    await test("recibo e outbox persistem no mesmo commit apos reinicio", async () => {
      const file = join(dir, "committed.json");
      const a = openFileUnitOfWork(file);
      a.stageInboundReceipt(receipt("evt-1"));
      await a.outbox.enqueue(outbox("evt-1"));
      await a.commit();
      const b = openFileUnitOfWork(file);
      assert.equal(b.findInboundReceipt("evt-1", "key-evt-1")?.event_id, "evt-1");
      assert.equal((await b.outbox.listPending()).length, 1);
    });
    await test("rollback nao deixa recibo nem evento fantasma", async () => {
      const file = join(dir, "rollback.json");
      const a = openFileUnitOfWork(file);
      a.stageInboundReceipt(receipt("evt-2"));
      await a.outbox.enqueue(outbox("evt-2"));
      await a.rollback();
      const b = openFileUnitOfWork(file);
      assert.equal(b.findInboundReceipt("evt-2", "key-evt-2"), null);
      assert.equal((await b.outbox.all()).length, 0);
    });
    await test("colisao de chave numa UoW unica falha fechado", async () => {
      const file = join(dir, "collision.json");
      const a = openFileUnitOfWork(file);
      a.stageInboundReceipt(receipt("evt-3", "shared-key"));
      assert.throws(() => a.stageInboundReceipt(receipt("evt-other", "shared-key")));
      await a.commit();
      const b = openFileUnitOfWork(file);
      assert.equal(b.findInboundReceipt("evt-other", "shared-key")?.event_id, "evt-3");
    });
    await test("identificadores herdados do Object.prototype nao sao recibos", async () => {
      const file = join(dir, "prototype-ids.json");
      const a = openFileUnitOfWork(file);
      assert.equal(a.findInboundReceipt("constructor", "none"), null);
      assert.equal(a.findInboundReceipt("toString", "none"), null);
      assert.throws(() => a.stageInboundReceipt(receipt("__proto__")), /reservado/);
      assert.throws(() => a.stageInboundReceipt(receipt("constructor")), /reservado/);
      await a.commit();
      const b = openFileUnitOfWork(file);
      assert.equal(b.findInboundReceipt("constructor", "none"), null);
    });
    await test("escritor antigo sem recibos nao pode apagar ACK novo", async () => {
      const file = join(dir, "legacy-stale-writer.json");
      const old = openFileUnitOfWork(file);
      const fresh = openFileUnitOfWork(file);
      fresh.stageInboundReceipt(receipt("evt-new"));
      await fresh.commit();
      await old.outbox.enqueue(outbox("stale"));
      await assert.rejects(() => old.commit(), ConcurrencyError);
      const checked = openFileUnitOfWork(file);
      assert.equal(checked.findInboundReceipt("evt-new", "key-evt-new")?.event_id, "evt-new");
      assert.equal((await checked.outbox.all()).length, 0);
    });
    await test("principal ausente com .bak nao pode inicializar armazenamento vazio", async () => {
      const file = join(dir, "missing-primary.json");
      writeFileSync(file + ".bak", JSON.stringify({ trips: { "trip-synthetic": {} } }));
      assert.throws(() => openFileUnitOfWork(file),
        /backup|recupera|principal|ausente/i,
        "arquivo principal desapareceu: precisa falhar alto e recuperar por decisao humana");
    });
    await test("snapshot obsoleto falha fechado e recarregamento preserva ambos recibos", async () => {
      const file = join(dir, "concurrent.json");
      const a = openFileUnitOfWork(file);
      const b = openFileUnitOfWork(file); // b le estado antes do commit de a
      a.stageInboundReceipt(receipt("evt-first"));
      await a.commit();
      b.stageInboundReceipt(receipt("evt-second"));
      await assert.rejects(() => b.commit(), ConcurrencyError,
        "snapshot desatualizado nao pode sobrescrever recibo commitado");
      const fresh = openFileUnitOfWork(file);
      assert.equal(fresh.findInboundReceipt("evt-first", "key-evt-first")?.event_id,
        "evt-first", "recibo anterior foi perdido");
      assert.equal(fresh.findInboundReceipt("evt-second", "key-evt-second"), null,
        "commit conflitante nao pode produzir recibo fantasma");
      fresh.stageInboundReceipt(receipt("evt-second"));
      await fresh.commit();
      const both = openFileUnitOfWork(file);
      assert.equal(both.findInboundReceipt("evt-first", "key-evt-first")?.event_id, "evt-first");
      assert.equal(both.findInboundReceipt("evt-second", "key-evt-second")?.event_id, "evt-second");
    });
    await test("restore de backup antigo nao apaga recibos de entrada ja aplicados", async () => {
      const file = join(dir, "protect-restore.json");
      const backupDir = join(dir, "protect-restore-backups");
      const a = openFileUnitOfWork(file);
      await a.commit();
      const backup = createBackup(file, backupDir, 3);
      assert.equal(backup.ok, true);
      assert.ok(backup.path);
      a.stageInboundReceipt(receipt("evt-after-backup"));
      await a.commit();
      const original = readFileSync(file, "utf8");
      const restore = restoreBackup(backup.path!, file, backupDir);
      assert.equal(restore.ok, false,
        "restaurar a geracao anterior removeria ACK de entrada ja aplicado");
      assert.equal(readFileSync(file, "utf8"), original,
        "restore bloqueado nao pode alterar store com recibos");
    });
    await test("restore recusa JSON corrompido com assinatura de recibos visivel", async () => {
      const file = join(dir, "corrupt-receipt-store.json");
      const backupDir = join(dir, "corrupt-receipt-backups");
      const a = openFileUnitOfWork(file);
      await a.commit();
      const backup = createBackup(file, backupDir, 3);
      assert.equal(backup.ok, true);
      assert.ok(backup.path);
      const corrupted = '{"receipt_schema_version":1,"inbound_receipts":{"event-x":';
      writeFileSync(file, corrupted);
      const restore = restoreBackup(backup.path!, file, backupDir);
      assert.equal(restore.ok, false, "arquivo danificado com assinatura de recibo deve falhar fechado");
      assert.equal(restore.error, "estado_atual_corrompido_recuperacao_assistida");
      assert.equal(readFileSync(file, "utf8"), corrupted);
    });
    await test("restore nao atravessa principal ausente com backup lateral", async () => {
      const file = join(dir, "restore-missing-principal.json");
      const backupDir = join(dir, "restore-missing-principal-backups");
      const a = openFileUnitOfWork(file);
      await a.commit();
      await a.commit(); // gera .bak como copia da geracao anterior
      const backup = createBackup(file, backupDir, 3);
      assert.equal(backup.ok, true);
      assert.ok(backup.path);
      rmSync(file, { force: true });
      assert.equal(existsSync(file + ".bak"), true);
      const restore = restoreBackup(backup.path!, file, backupDir);
      assert.equal(restore.ok, false);
      assert.equal(restore.error, "principal_ausente_backup_lateral_presente");
      assert.equal(existsSync(file), false, "restore sem custodia nao cria novo principal");
    });
    await test("restore recusa store truncado sem assinatura textual restante", async () => {
      const file = join(dir, "restore-truncated-tail.json");
      const backupDir = join(dir, "restore-truncated-tail-backups");
      const a = openFileUnitOfWork(file);
      await a.commit();
      const backup = createBackup(file, backupDir, 3);
      assert.equal(backup.ok, true);
      assert.ok(backup.path);
      const truncated = '{"trips":{},"handoffs":';
      writeFileSync(file, truncated);
      const restore = restoreBackup(backup.path!, file, backupDir);
      assert.equal(restore.ok, false);
      assert.equal(restore.error, "estado_atual_corrompido_recuperacao_assistida");
      assert.equal(readFileSync(file, "utf8"), truncated);
    });
    await test("backup com schema de recibos desconhecido e hash valido e recusado", async () => {
      const file = join(dir, "restore-bad-contract.json");
      const backupDir = join(dir, "restore-bad-contract-backups");
      const a = openFileUnitOfWork(file);
      await a.commit();
      const backup = createBackup(file, backupDir, 3);
      assert.equal(backup.ok, true);
      assert.ok(backup.path);
      const malformed = { ...JSON.parse(readFileSync(backup.path!, "utf8")),
        receipt_schema_version: 2 };
      const raw = JSON.stringify(malformed);
      writeFileSync(backup.path!, raw);
      writeFileSync(backup.path! + ".sha256", createHash("sha256").update(raw).digest("hex"));
      const before = readFileSync(file, "utf8");
      const restore = restoreBackup(backup.path!, file, backupDir);
      assert.equal(restore.ok, false);
      assert.equal(restore.error, "contrato de recibos de entrada invalido");
      assert.equal(readFileSync(file, "utf8"), before);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("RECEIPTS synthetic: OK=" + passed + " RED=" + failed.length);
  for (const f of failed) console.error(f);
  if (failed.length) process.exitCode = 1;
}
void main();
