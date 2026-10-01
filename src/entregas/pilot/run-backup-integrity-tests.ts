import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseSha256Sidecar,
  verifyBackupIntegrity,
} from "./backup-integrity";

const ABC_SHA256 =
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log("PASS", name);
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "deliveryos-backup-integrity-"));
  try {
    const snapshot = join(dir, "entregas-pg-20261001T120000Z.dump");
    const sidecar = snapshot + ".sha256";

    await test("BI1 parser aceita formato portatil do sha256sum", () => {
      assert.deepEqual(
        parseSha256Sidecar(`${ABC_SHA256}  entregas.dump\n`),
        { sha256: ABC_SHA256, filename: "entregas.dump" },
      );
    });

    await test("BI2 snapshot intacto fecha hash, tamanho e basename", async () => {
      writeFileSync(snapshot, "abc");
      writeFileSync(sidecar, `${ABC_SHA256}  entregas-pg-20261001T120000Z.dump\n`);
      const result = await verifyBackupIntegrity(snapshot);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.sha256, ABC_SHA256);
      assert.equal(result.bytes, 3);
      assert.equal(result.snapshot_name, "entregas-pg-20261001T120000Z.dump");
    });

    await test("BI3 corrupção do snapshot é recusada", async () => {
      writeFileSync(snapshot, "abd");
      const result = await verifyBackupIntegrity(snapshot);
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.reason, "sha256_mismatch");
    });

    await test("BI4 sidecar ausente é recusa explícita", async () => {
      rmSync(sidecar, { force: true });
      const result = await verifyBackupIntegrity(snapshot);
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.reason, "sidecar_missing");
    });

    await test("BI5 sidecar não pode apontar outro arquivo ou caminho", async () => {
      writeFileSync(sidecar, `${ABC_SHA256}  ../outro.dump\n`);
      const result = await verifyBackupIntegrity(snapshot);
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.reason, "sidecar_filename_mismatch");
    });

    await test("BI6 sidecar multiline/malformado é recusado", async () => {
      writeFileSync(
        sidecar,
        `${ABC_SHA256}  entregas-pg-20261001T120000Z.dump\n${ABC_SHA256}  outro.dump\n`,
      );
      const result = await verifyBackupIntegrity(snapshot);
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.reason, "sidecar_invalid");
    });

    await test("BI7 snapshot ausente não vira sucesso por sidecar presente", async () => {
      rmSync(snapshot, { force: true });
      writeFileSync(sidecar, `${ABC_SHA256}  entregas-pg-20261001T120000Z.dump\n`);
      const result = await verifyBackupIntegrity(snapshot);
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.reason, "snapshot_missing");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`BACKUP_INTEGRITY: ${passed}/${passed} PASS`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
