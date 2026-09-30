/**
 * Backup/restore do store durável da Intelligence Spine (Q-015).
 *
 * Não é backup do event log e não fala com banco/rede. O snapshot carrega
 * manifest com SHA-256 por arquivo e só é restaurado depois de verificação.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";

export const INTELLIGENCE_BACKUP_KEEP = 14;
export const INTELLIGENCE_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface ManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

interface Manifest {
  schema: "deliveryos-intelligence-backup@1.0.0";
  captured_at: string;
  files: ManifestFile[];
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function listarArquivos(raiz: string): string[] {
  if (!existsSync(raiz)) return [];
  const encontrados: string[] = [];
  const andar = (dir: string): void => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      const st = statSync(p);
      if (st.isDirectory()) andar(p);
      else if (st.isFile()) encontrados.push(p);
    }
  };
  andar(raiz);
  return encontrados.sort();
}

function montarManifest(raiz: string, capturedAt: string): Manifest {
  return {
    schema: "deliveryos-intelligence-backup@1.0.0",
    captured_at: capturedAt,
    files: listarArquivos(raiz).map((p) => ({
      path: relative(raiz, p).replace(/\\/g, "/"),
      bytes: statSync(p).size,
      sha256: hashFile(p),
    })),
  };
}

function nomeSnapshot(agora: Date): string {
  return "intelligence-" + agora.toISOString().replace(/[:.]/g, "-");
}

export function verificarSnapshot(snapshotDir: string): Manifest {
  const manifestPath = join(snapshotDir, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error("intelligence_backup_manifest_missing");

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  if (manifest.schema !== "deliveryos-intelligence-backup@1.0.0") {
    throw new Error("intelligence_backup_manifest_version");
  }

  const esperados = new Set(manifest.files.map((f) => f.path));
  const atuais = listarArquivos(snapshotDir)
    .map((p) => relative(snapshotDir, p).replace(/\\/g, "/"))
    .filter((p) => p !== "manifest.json");

  if (atuais.length !== esperados.size || atuais.some((p) => !esperados.has(p))) {
    throw new Error("intelligence_backup_file_set_mismatch");
  }

  for (const f of manifest.files) {
    const p = join(snapshotDir, ...f.path.split("/"));
    if (!existsSync(p)) throw new Error("intelligence_backup_file_missing");
    if (statSync(p).size !== f.bytes || hashFile(p) !== f.sha256) {
      throw new Error("intelligence_backup_hash_mismatch");
    }
  }
  return manifest;
}

function podarBackups(backupDir: string, keep: number): void {
  const dirs = existsSync(backupDir)
    ? readdirSync(backupDir)
        .filter((n) => n.startsWith("intelligence-"))
        .map((n) => join(backupDir, n))
        .filter((p) => statSync(p).isDirectory())
        .sort()
    : [];
  const remover = dirs.slice(0, Math.max(0, dirs.length - keep));
  for (const p of remover) rmSync(p, { recursive: true, force: true });
}

export function criarSnapshot(
  sourceDir: string,
  backupDir: string,
  agora: Date = new Date(),
  keep = INTELLIGENCE_BACKUP_KEEP,
): string {
  mkdirSync(backupDir, { recursive: true });
  const nome = nomeSnapshot(agora);
  const finalDir = join(backupDir, nome);
  const tmpDir = join(backupDir, `.${nome}.tmp-${process.pid}`);

  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  if (existsSync(sourceDir)) cpSync(sourceDir, tmpDir, { recursive: true });

  const manifest = montarManifest(tmpDir, agora.toISOString());
  writeFileSync(join(tmpDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  verificarSnapshot(tmpDir);

  if (existsSync(finalDir)) rmSync(finalDir, { recursive: true, force: true });
  renameSync(tmpDir, finalDir);
  podarBackups(backupDir, Math.max(1, keep));
  return finalDir;
}

function diretorioVazio(path: string): boolean {
  return !existsSync(path) || readdirSync(path).length === 0;
}

export function restaurarSnapshot(snapshotDir: string, targetDir: string): void {
  const manifest = verificarSnapshot(snapshotDir);
  if (!diretorioVazio(targetDir)) throw new Error("intelligence_restore_target_not_empty");

  const parent = dirname(targetDir);
  mkdirSync(parent, { recursive: true });
  const tmp = targetDir + ".restore-" + process.pid;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  for (const f of manifest.files) {
    const origem = join(snapshotDir, ...f.path.split("/"));
    const destino = join(tmp, ...f.path.split("/"));
    mkdirSync(dirname(destino), { recursive: true });
    cpSync(origem, destino);
  }

  const conferido = montarManifest(tmp, manifest.captured_at);
  if (JSON.stringify(conferido.files) !== JSON.stringify(manifest.files)) {
    rmSync(tmp, { recursive: true, force: true });
    throw new Error("intelligence_restore_verification_failed");
  }

  if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true });
  renameSync(tmp, targetDir);
}
