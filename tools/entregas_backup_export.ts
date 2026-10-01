import { resolve } from "node:path";

import { exportBackupBundle } from "../src/entregas/pilot/backup-export";

function usage(): never {
  console.error(
    "Uso: npm run export:entregas:backup -- <snapshot> --dest <diretorio-montado>",
  );
  console.error(
    "A copia verificada NAO prova off-host por si so; destino externo + restore continuam gates humanos.",
  );
  process.exit(2);
}

function parse(): { snapshot: string; dest: string } {
  const args = process.argv.slice(2);
  const snapshot = args[0]?.trim();
  const i = args.indexOf("--dest");
  const dest = i >= 0 ? args[i + 1]?.trim() : "";
  if (!snapshot || snapshot.startsWith("--") || !dest) usage();
  return { snapshot: resolve(snapshot), dest: resolve(dest) };
}

async function main(): Promise<void> {
  const { snapshot, dest } = parse();
  const result = await exportBackupBundle({
    snapshot_path: snapshot,
    destination_root: dest,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
