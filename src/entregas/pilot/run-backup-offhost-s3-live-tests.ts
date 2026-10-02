import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  downloadBackupBundleS3,
  exportBackupBundleS3,
  type S3OffhostConfig,
} from "./backup-offhost-s3";
import { verifyBackupIntegrity } from "./backup-integrity";

function need(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) throw new Error("ENV AUSENTE " + name);
  return value;
}

function baseConfig(
  access: string,
  secret: string,
): S3OffhostConfig {
  return {
    endpoint: need("ENTREGAS_BACKUP_S3_ENDPOINT"),
    region: need("ENTREGAS_BACKUP_S3_REGION"),
    bucket: need("ENTREGAS_BACKUP_S3_BUCKET"),
    prefix: need("ENTREGAS_BACKUP_S3_PREFIX"),
    access_key_id: access,
    secret_access_key: secret,
  };
}

async function main(): Promise<void> {
  const required = [
    "ENTREGAS_BACKUP_S3_ENDPOINT",
    "ENTREGAS_BACKUP_S3_REGION",
    "ENTREGAS_BACKUP_S3_BUCKET",
    "ENTREGAS_BACKUP_S3_PREFIX",
    "ENTREGAS_BACKUP_S3_WRITE_ACCESS_KEY_ID",
    "ENTREGAS_BACKUP_S3_WRITE_SECRET_ACCESS_KEY",
    "ENTREGAS_BACKUP_S3_READ_ACCESS_KEY_ID",
    "ENTREGAS_BACKUP_S3_READ_SECRET_ACCESS_KEY",
  ];
  if (required.some((name) => !(process.env[name] ?? "").trim())) {
    console.log(
      "BACKUP_OFFHOST_S3_LIVE_PULADO env de endpoint/credenciais ausente",
    );
    return;
  }

  const writeCfg = baseConfig(
    need("ENTREGAS_BACKUP_S3_WRITE_ACCESS_KEY_ID"),
    need("ENTREGAS_BACKUP_S3_WRITE_SECRET_ACCESS_KEY"),
  );
  const readCfg = baseConfig(
    need("ENTREGAS_BACKUP_S3_READ_ACCESS_KEY_ID"),
    need("ENTREGAS_BACKUP_S3_READ_SECRET_ACCESS_KEY"),
  );

  const root = mkdtempSync(join(tmpdir(), "deliveryos-offhost-s3-live-"));
  try {
    const sourceDir = join(root, "source");
    const restoreDir = join(root, "restore");
    mkdirSync(sourceDir);
    mkdirSync(restoreDir);

    const name = "entregas-pg-live.dump";
    const snapshot = join(sourceDir, name);
    const payload = Buffer.alloc(1024 * 1024 + 17);
    for (let i = 0; i < payload.length; i += 1) payload[i] = i % 251;
    writeFileSync(snapshot, payload);
    const hash = createHash("sha256").update(payload).digest("hex");
    writeFileSync(snapshot + ".sha256", hash + "  " + name + "\n", "utf8");

    const uploaded = await exportBackupBundleS3({
      snapshot_path: snapshot,
      config: writeCfg,
      exported_at: new Date("2026-10-02T12:00:00.000Z"),
    });
    assert.equal(uploaded.ok, true);
    if (!uploaded.ok) return;
    assert.equal(uploaded.uploaded_objects, 3);
    assert.equal(uploaded.source_verified, true);
    assert.equal(uploaded.remote_readback_verified, false);
    assert.equal(uploaded.off_host_proven, false);

    const downloaded = await downloadBackupBundleS3({
      config: readCfg,
      manifest_key: uploaded.manifest_key,
      destination_root: restoreDir,
    });
    assert.equal(downloaded.ok, true);
    if (!downloaded.ok) return;
    assert.equal(downloaded.sha256, hash);
    assert.equal(downloaded.bytes, payload.length);
    assert.equal(downloaded.remote_manifest_verified, true);
    assert.equal(downloaded.downloaded_integrity_verified, true);
    assert.deepEqual(readFileSync(downloaded.snapshot_path), payload);

    const integrity = await verifyBackupIntegrity(
      downloaded.snapshot_path,
      downloaded.sidecar_path,
    );
    assert.equal(integrity.ok, true);

    const writeOnlyCannotRead = await downloadBackupBundleS3({
      config: writeCfg,
      manifest_key: uploaded.manifest_key,
      destination_root: join(root, "write-cannot-read"),
    });
    assert.equal(writeOnlyCannotRead.ok, false);
    assert.equal(
      !writeOnlyCannotRead.ok && writeOnlyCannotRead.reason,
      "destination_missing",
    );

    const blockedDir = join(root, "write-cannot-read-existing");
    mkdirSync(blockedDir);
    const writeReadAttempt = await downloadBackupBundleS3({
      config: writeCfg,
      manifest_key: uploaded.manifest_key,
      destination_root: blockedDir,
    });
    assert.equal(writeReadAttempt.ok, false);
    assert.equal(
      !writeReadAttempt.ok && writeReadAttempt.reason,
      "remote_request_failed",
    );

    const readUploadAttempt = await exportBackupBundleS3({
      snapshot_path: snapshot,
      config: readCfg,
    });
    assert.equal(readUploadAttempt.ok, false);
    assert.equal(
      !readUploadAttempt.ok && readUploadAttempt.reason,
      "remote_request_failed",
    );

    console.log("BACKUP_OFFHOST_S3_LIVE_GREEN 6/6");
    console.log("MANIFEST_KEY=" + uploaded.manifest_key);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
