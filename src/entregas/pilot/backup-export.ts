import { randomUUID } from "node:crypto";
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

import {
  type BackupIntegrityFailure,
  verifyBackupIntegrity,
} from "./backup-integrity";

export const BACKUP_EXPORT_SCHEMA = "deliveryos-backup-export@1";

export type BackupExportFailure =
  | "source_invalid"
  | "destination_missing"
  | "destination_not_directory"
  | "destination_bundle_exists"
  | "copy_failed"
  | "destination_verify_failed"
  | "manifest_failed";

export type BackupExportResult =
  | {
      ok: true;
      schema: typeof BACKUP_EXPORT_SCHEMA;
      bundle_dir: string;
      snapshot_name: string;
      sidecar_name: string;
      manifest_name: string;
      sha256: string;
      bytes: number;
      exported_at: string;
      source_verified: true;
      destination_verified: true;
      same_filesystem_device: boolean;
      off_host_proven: false;
    }
  | {
      ok: false;
      schema: typeof BACKUP_EXPORT_SCHEMA;
      reason: BackupExportFailure;
      detail?: string;
      source_reason?: BackupIntegrityFailure;
      partial_bundle_dir?: string;
      off_host_proven: false;
    };

function safeName(input: string): string {
  return input.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "_");
}

function validTransferId(input: string): boolean {
  return /^[A-Za-z0-9._-]{1,80}$/.test(input);
}

/**
 * Copia um pacote de backup JA verificado para um destino de filesystem.
 *
 * Esta função não escolhe provedor, não cria credencial, não apaga nada no
 * destino e nunca afirma que o destino é off-host. Ela existe para que um
 * mount externo futuro possa reutilizar exatamente o mesmo contrato.
 */
export async function exportBackupBundle(args: {
  snapshot_path: string;
  destination_root: string;
  exported_at?: Date;
  transfer_id?: string;
}): Promise<BackupExportResult> {
  const source = resolve(args.snapshot_path);
  const sourceIntegrity = await verifyBackupIntegrity(source);
  if (!sourceIntegrity.ok) {
    return {
      ok: false,
      schema: BACKUP_EXPORT_SCHEMA,
      reason: "source_invalid",
      source_reason: sourceIntegrity.reason,
      detail: sourceIntegrity.reason,
      off_host_proven: false,
    };
  }

  const destRoot = resolve(args.destination_root);
  if (!existsSync(destRoot)) {
    return {
      ok: false,
      schema: BACKUP_EXPORT_SCHEMA,
      reason: "destination_missing",
      detail: "destination root does not exist",
      off_host_proven: false,
    };
  }
  if (!statSync(destRoot).isDirectory()) {
    return {
      ok: false,
      schema: BACKUP_EXPORT_SCHEMA,
      reason: "destination_not_directory",
      detail: "destination root is not a directory",
      off_host_proven: false,
    };
  }

  const transferId = args.transfer_id ?? randomUUID();
  if (!validTransferId(transferId)) {
    return {
      ok: false,
      schema: BACKUP_EXPORT_SCHEMA,
      reason: "copy_failed",
      detail: "invalid transfer_id",
      off_host_proven: false,
    };
  }

  const snapshotName = basename(source);
  const sidecarName = snapshotName + ".sha256";
  const bundleName =
    "deliveryos-" +
    safeName(snapshotName) +
    "-" +
    sourceIntegrity.sha256.slice(0, 12) +
    "-" +
    transferId;
  const bundleDir = join(destRoot, bundleName);
  if (existsSync(bundleDir)) {
    return {
      ok: false,
      schema: BACKUP_EXPORT_SCHEMA,
      reason: "destination_bundle_exists",
      detail: "bundle destination already exists",
      partial_bundle_dir: bundleDir,
      off_host_proven: false,
    };
  }

  try {
    mkdirSync(bundleDir, { recursive: false, mode: 0o700 });
  } catch (error) {
    return {
      ok: false,
      schema: BACKUP_EXPORT_SCHEMA,
      reason: "copy_failed",
      detail: error instanceof Error ? error.message : String(error),
      off_host_proven: false,
    };
  }

  const destSnapshot = join(bundleDir, snapshotName);
  const destSidecar = join(bundleDir, sidecarName);
  const manifestName = "deliveryos-backup-export.json";
  const manifestPath = join(bundleDir, manifestName);

  try {
    copyFileSync(source, destSnapshot, constants.COPYFILE_EXCL);
    copyFileSync(source + ".sha256", destSidecar, constants.COPYFILE_EXCL);
  } catch (error) {
    return {
      ok: false,
      schema: BACKUP_EXPORT_SCHEMA,
      reason: "copy_failed",
      detail: error instanceof Error ? error.message : String(error),
      partial_bundle_dir: bundleDir,
      off_host_proven: false,
    };
  }

  const destinationIntegrity = await verifyBackupIntegrity(destSnapshot, destSidecar);
  if (!destinationIntegrity.ok) {
    return {
      ok: false,
      schema: BACKUP_EXPORT_SCHEMA,
      reason: "destination_verify_failed",
      detail: destinationIntegrity.reason,
      partial_bundle_dir: bundleDir,
      off_host_proven: false,
    };
  }

  const exportedAt = (args.exported_at ?? new Date()).toISOString();
  const sameDevice = statSync(realpathSync(source)).dev === statSync(realpathSync(destRoot)).dev;
  const manifest = {
    schema: BACKUP_EXPORT_SCHEMA,
    exported_at: exportedAt,
    snapshot_name: snapshotName,
    sidecar_name: sidecarName,
    sha256: destinationIntegrity.sha256,
    bytes: destinationIntegrity.bytes,
    source_verified: true,
    destination_verified: true,
    same_filesystem_device: sameDevice,
    off_host_proven: false,
    note:
      "Filesystem copy verified. Physical off-host separation requires external destination evidence and restore.",
  };

  try {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    // Read-after-write catches truncated/non-readable manifests on odd mounts.
    JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      schema: BACKUP_EXPORT_SCHEMA,
      reason: "manifest_failed",
      detail: error instanceof Error ? error.message : String(error),
      partial_bundle_dir: bundleDir,
      off_host_proven: false,
    };
  }

  return {
    ok: true,
    schema: BACKUP_EXPORT_SCHEMA,
    bundle_dir: bundleDir,
    snapshot_name: snapshotName,
    sidecar_name: sidecarName,
    manifest_name: manifestName,
    sha256: destinationIntegrity.sha256,
    bytes: destinationIntegrity.bytes,
    exported_at: exportedAt,
    source_verified: true,
    destination_verified: true,
    same_filesystem_device: sameDevice,
    off_host_proven: false,
  };
}
