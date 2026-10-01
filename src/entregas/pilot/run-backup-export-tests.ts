import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { exportBackupBundle } from "./backup-export";
import { verifyBackupIntegrity } from "./backup-integrity";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log("PASS", name);
}

function fixture(dir: string, name = "entregas-pg-20261001T120000Z.dump"): string {
  const snapshot = join(dir, name);
  writeFileSync(snapshot, "abc", "utf8");
  const hash = createHash("sha256").update("abc").digest("hex");
  writeFileSync(snapshot + ".sha256", `${hash}  ${name}\n`, "utf8");
  return snapshot;
}

async function main(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "deliveryos-backup-export-"));
  try {
    const sourceDir = join(root, "source");
    const destRoot = join(root, "dest");
    mkdirSync(sourceDir);
    mkdirSync(destRoot);
    const snapshot = fixture(sourceDir);

    await test("BE1 copia pacote verificado e cria manifesto sem alegar off-host", async () => {
      const result = await exportBackupBundle({
        snapshot_path: snapshot,
        destination_root: destRoot,
        exported_at: new Date("2026-10-01T12:00:00.000Z"),
        transfer_id: "fixture-a",
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.off_host_proven, false);
      assert.equal(result.source_verified, true);
      assert.equal(result.destination_verified, true);
      assert.equal(result.sha256, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

      const copied = join(result.bundle_dir, result.snapshot_name);
      const verified = await verifyBackupIntegrity(copied);
      assert.equal(verified.ok, true);
      assert.ok(existsSync(join(result.bundle_dir, result.manifest_name)));
      const manifest = JSON.parse(
        readFileSync(join(result.bundle_dir, result.manifest_name), "utf8"),
      ) as Record<string, unknown>;
      assert.equal(manifest.off_host_proven, false);
      assert.equal(manifest.destination_verified, true);
      assert.equal(manifest.snapshot_name, result.snapshot_name);
    });

    await test("BE2 origem adulterada falha antes de criar bundle", async () => {
      const broken = fixture(sourceDir, "broken.dump");
      writeFileSync(broken, "abd", "utf8");
      const before = readdirSync(destRoot).length;
      const result = await exportBackupBundle({
        snapshot_path: broken,
        destination_root: destRoot,
        transfer_id: "fixture-b",
      });
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.reason, "source_invalid");
      assert.equal(!result.ok && result.source_reason, "sha256_mismatch");
      assert.equal(readdirSync(destRoot).length, before);
    });

    await test("BE3 sidecar de outro nome falha antes de escrever destino", async () => {
      const wrong = fixture(sourceDir, "wrong.dump");
      const hash = createHash("sha256").update("abc").digest("hex");
      writeFileSync(wrong + ".sha256", `${hash}  outro.dump\n`, "utf8");
      const before = readdirSync(destRoot).length;
      const result = await exportBackupBundle({
        snapshot_path: wrong,
        destination_root: destRoot,
        transfer_id: "fixture-c",
      });
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.source_reason, "sidecar_filename_mismatch");
      assert.equal(readdirSync(destRoot).length, before);
    });

    await test("BE4 destino inexistente nao e criado silenciosamente", async () => {
      const result = await exportBackupBundle({
        snapshot_path: snapshot,
        destination_root: join(root, "nao-existe"),
        transfer_id: "fixture-d",
      });
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.reason, "destination_missing");
    });

    await test("BE5 mesma transferencia nao sobrescreve bundle existente", async () => {
      const first = await exportBackupBundle({
        snapshot_path: snapshot,
        destination_root: destRoot,
        transfer_id: "fixture-e",
      });
      assert.equal(first.ok, true);
      const second = await exportBackupBundle({
        snapshot_path: snapshot,
        destination_root: destRoot,
        transfer_id: "fixture-e",
      });
      assert.equal(second.ok, false);
      assert.equal(!second.ok && second.reason, "destination_bundle_exists");
    });

    await test("BE6 copia no mesmo filesystem e declarada como tal, nunca off-host", async () => {
      const result = await exportBackupBundle({
        snapshot_path: snapshot,
        destination_root: destRoot,
        transfer_id: "fixture-f",
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.same_filesystem_device, true);
      assert.equal(result.off_host_proven, false);
    });

    await test("BE7 implementacao nao contem rotina de delete do destino", () => {
      const source = readFileSync(join(process.cwd(), "src/entregas/pilot/backup-export.ts"), "utf8");
      assert.equal(/\b(?:rm|rmSync|unlink|unlinkSync|rmdir|rmdirSync)\b/.test(source), false);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  console.log(`BACKUP_EXPORT: ${passed}/${passed} PASS`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
