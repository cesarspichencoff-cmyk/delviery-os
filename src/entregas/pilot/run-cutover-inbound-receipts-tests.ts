/**
 * Trava sintética do cutover de arquivo para PostgreSQL.
 * O snapshot atual NÃO contempla recibos de entrada: preservar sem migrar.
 * Não conecta a PostgreSQL, não toca dados reais e não realiza cutover.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openFileUnitOfWork } from "../persistence/file-store";
import { readFilePilotStorageSnapshot, PilotStorageCutoverError } from "./storage-cutover";

const root = mkdtempSync(join(tmpdir(), "cutover-inbound-receipts-synthetic-"));
let passed = 0;
async function tc(name: string, run: () => Promise<void>): Promise<void> {
  await run();
  passed++;
  console.log("OK " + name);
}
async function assertBlocked(
  data_file: string,
  ready_file: string,
  code: "SOURCE_INVALID" | "SOURCE_UNSUPPORTED" = "SOURCE_UNSUPPORTED",
  reason: RegExp = /recibos de entrada nao migrados/,
): Promise<void> {
  const before = readFileSync(data_file, "utf8");
  await assert.rejects(
    () => readFilePilotStorageSnapshot({ unit_id: "CUTOVER_SYNTHETIC", data_file, ready_file }),
    (e: unknown) => e instanceof PilotStorageCutoverError &&
      e.code === code && reason.test(e.message),
    "migracao sem recibos devia ser proibida",
  );
  assert.equal(readFileSync(data_file, "utf8"), before, "a tentativa deve ser so leitura");
}

async function main(): Promise<void> {
  try {
    const data = join(root, "store.json");
    const ready = join(root, "ready.json");
    const uow = openFileUnitOfWork(data);
    await uow.commit();
    const initialFile = JSON.parse(readFileSync(data, "utf8")) as Record<string, unknown>;

    await tc("fonte nova com mapa de recibos vazio continua legivel", async () => {
      const snapshot = await readFilePilotStorageSnapshot({
        unit_id: "CUTOVER_SYNTHETIC", data_file: data, ready_file: ready,
      });
      assert.equal(snapshot.events.length, 0);
      assert.equal(snapshot.outbox.length, 0);
    });

    await tc("recibo aplicado impede exportar snapshot que o descartaria", async () => {
      uow.stageInboundReceipt({
        event_id: "evt-synthetic", idempotency_key: "idem-synthetic",
        fingerprint: "digest-synthetic", actor_id: "actor-synthetic",
        role: "operador_expedicao",
      });
      await uow.commit();
      await assertBlocked(data, ready);
    });

    await tc("mapa de recibos ambiguo falha fechado", async () => {
      const raw = JSON.parse(readFileSync(data, "utf8")) as Record<string, unknown>;
      raw.inbound_receipts = [];
      writeFileSync(data, JSON.stringify(raw));
      await assertBlocked(data, ready, "SOURCE_INVALID", /malformado/);
    });

    await tc("schema v1 sem campo de recibos nao pode fingir ser legado", async () => {
      const raw = { ...initialFile };
      delete raw.inbound_receipts;
      writeFileSync(data, JSON.stringify(raw));
      await assertBlocked(data, ready, "SOURCE_INVALID", /schema v1 exige/);
    });

    await tc("raiz nula nao vira snapshot vazio", async () => {
      writeFileSync(data, "null");
      await assertBlocked(data, ready, "SOURCE_INVALID", /objeto JSON valido/);
    });

    await tc("versao futura desconhecida nao e tratada como legado", async () => {
      const raw = { ...initialFile, receipt_schema_version: 2 };
      writeFileSync(data, JSON.stringify(raw));
      await assertBlocked(data, ready, "SOURCE_UNSUPPORTED", /versao de recibos/);
    });

    await tc("arquivo legado sem campo de recibos segue legivel", async () => {
      const raw = { ...initialFile };
      delete raw.receipt_schema_version;
      delete raw.inbound_receipts;
      writeFileSync(data, JSON.stringify(raw));
      const snapshot = await readFilePilotStorageSnapshot({
        unit_id: "CUTOVER_SYNTHETIC", data_file: data, ready_file: ready,
      });
      assert.equal(snapshot.events.length, 0);
    });

    console.log("CUTOVER_INBOUND_RECEIPTS: " + passed + "/7 OK");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
void main().catch((e) => { console.error(e); process.exitCode = 1; });
