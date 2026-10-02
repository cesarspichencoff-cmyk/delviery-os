import { resolve } from "node:path";

import {
  downloadBackupBundleS3,
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
    "Uso: npm run fetch:entregas:backup:s3 -- <manifest-key> --dest <diretorio>",
  );
  console.error(
    "Use uma credencial de LEITURA separada do uploader no ensaio real.",
  );
  process.exit(2);
}

function parse(): { manifestKey: string; dest: string } {
  const args = process.argv.slice(2);
  const manifestKey = args[0]?.trim();
  const i = args.indexOf("--dest");
  const dest = i >= 0 ? args[i + 1]?.trim() : "";
  if (!manifestKey || manifestKey.startsWith("--") || !dest) usage();
  return { manifestKey, dest: resolve(dest) };
}

async function main(): Promise<void> {
  const { manifestKey, dest } = parse();
  const config: S3OffhostConfig = {
    endpoint: need("ENTREGAS_BACKUP_S3_ENDPOINT"),
    region: need("ENTREGAS_BACKUP_S3_REGION"),
    bucket: need("ENTREGAS_BACKUP_S3_BUCKET"),
    prefix: (process.env.ENTREGAS_BACKUP_S3_PREFIX ?? "deliveryos-backups").trim(),
    access_key_id: need("ENTREGAS_BACKUP_S3_ACCESS_KEY_ID"),
    secret_access_key: need("ENTREGAS_BACKUP_S3_SECRET_ACCESS_KEY"),
    session_token: (process.env.ENTREGAS_BACKUP_S3_SESSION_TOKEN ?? "").trim() || undefined,
  };

  const result = await downloadBackupBundleS3({
    config,
    manifest_key: manifestKey,
    destination_root: dest,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
