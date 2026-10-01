import { resolve } from "node:path";

import { verifyBackupIntegrity } from "../src/entregas/pilot/backup-integrity";

async function main(): Promise<void> {
  const arg = process.argv[2]?.trim();
  if (!arg || arg.startsWith("--")) {
    console.error("Uso: npm run verify:entregas:backup -- <snapshot>");
    process.exitCode = 2;
    return;
  }

  const result = await verifyBackupIntegrity(resolve(arg));
  console.log(JSON.stringify({
    schema: "deliveryos-backup-integrity@1",
    ...result,
  }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
