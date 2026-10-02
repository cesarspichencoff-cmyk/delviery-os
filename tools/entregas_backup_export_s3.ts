import { resolve } from "node:path";

import {
  exportBackupBundleS3,
  type S3OffhostConfig,
} from "../src/entregas/pilot/backup-offhost-s3";

function need(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) {
    console.error("Variavel obrigatoria ausente: " + name);
    process.exit(2);
  }
  return value;
}

function usage(): never {
  console.error(
    "Uso: npm run export:entregas:backup:s3 -- <snapshot>",
  );
  console.error(
    "A credencial deste comando deve ter PUT/writeFiles, sem readFiles/deleteFiles.",
  );
  console.error(
    "Credenciais entram somente por ENTREGAS_BACKUP_S3_*; nunca por argumento.",
  );
  process.exit(2);
}

function parse(): { snapshot: string } {
  const args = process.argv.slice(2);
  const snapshot = args[0]?.trim();
  if (!snapshot || snapshot.startsWith("--") || args.length !== 1) usage();
  return { snapshot: resolve(snapshot) };
}

async function main(): Promise<void> {
  const { snapshot } = parse();

  const config: S3OffhostConfig = {
    endpoint: need("ENTREGAS_BACKUP_S3_ENDPOINT"),
    region: need("ENTREGAS_BACKUP_S3_REGION"),
    bucket: need("ENTREGAS_BACKUP_S3_BUCKET"),
    prefix: (process.env.ENTREGAS_BACKUP_S3_PREFIX ?? "deliveryos-backups").trim(),
    access_key_id: need("ENTREGAS_BACKUP_S3_ACCESS_KEY_ID"),
    secret_access_key: need("ENTREGAS_BACKUP_S3_SECRET_ACCESS_KEY"),
    session_token: (process.env.ENTREGAS_BACKUP_S3_SESSION_TOKEN ?? "").trim() || undefined,
  };

  const result = await exportBackupBundleS3({
    snapshot_path: snapshot,
    config,
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
