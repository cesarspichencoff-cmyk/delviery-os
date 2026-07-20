/**
 * Backup / restauração para piloto single-instance (FileUnitOfWork).
 * Não é banco de produção.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { PilotLogger } from "./pilot-log";

export interface BackupResult {
  ok: boolean;
  path?: string;
  sha256?: string;
  error?: string;
  human: string;
}

function sha256File(path: string): string {
  const buf = readFileSync(path);
  return createHash("sha256").update(buf).digest("hex");
}

function validateStoreJson(path: string): { ok: boolean; error?: string } {
  try {
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== "object") return { ok: false, error: "JSON inválido" };
    for (const k of ["trips", "handoffs", "occurrences", "riders", "events", "outbox"]) {
      if (!(k in data)) return { ok: false, error: `faltando chave ${k}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function listBackups(backupDir: string): string[] {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir)
    .filter((f) => f.endsWith(".json") && f.startsWith("store-"))
    .sort()
    .reverse();
}

export function createBackup(
  dataFile: string,
  backupDir: string,
  retain: number,
  log?: PilotLogger,
): BackupResult {
  try {
    mkdirSync(backupDir, { recursive: true });
    if (!existsSync(dataFile)) {
      // store ainda vazio — grava snapshot vazio válido
      const empty = {
        trips: {},
        handoffs: {},
        occurrences: {},
        riders: {},
        events: [],
        outbox: [],
      };
      writeFileSync(dataFile, JSON.stringify(empty), "utf8");
    }
    const v = validateStoreJson(dataFile);
    if (!v.ok) {
      const human = "Backup cancelado: arquivo de dados inválido.";
      log?.error("backup_failed", human, v.error);
      return { ok: false, error: v.error, human };
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = join(backupDir, `store-${stamp}.json`);
    copyFileSync(dataFile, dest);
    const hash = sha256File(dest);
    writeFileSync(dest + ".sha256", hash, "utf8");

    // retenção
    const all = listBackups(backupDir);
    for (const f of all.slice(retain)) {
      try {
        rmSync(join(backupDir, f), { force: true });
        rmSync(join(backupDir, f + ".sha256"), { force: true });
      } catch {
        /* */
      }
    }

    const human = "Backup concluído.";
    log?.info("backup_done", human, dest, { meta: { sha256: hash } });
    return { ok: true, path: dest, sha256: hash, human };
  } catch (e) {
    const technical = e instanceof Error ? e.message : String(e);
    const human = "Não foi possível criar o backup.";
    log?.error("backup_failed", human, technical);
    return { ok: false, error: technical, human };
  }
}

export function restoreBackup(
  backupPath: string,
  dataFile: string,
  backupDir: string,
  log?: PilotLogger,
): BackupResult {
  try {
    if (!existsSync(backupPath)) {
      return { ok: false, error: "arquivo ausente", human: "Backup não encontrado." };
    }
    const v = validateStoreJson(backupPath);
    if (!v.ok) {
      const human = "Restauração cancelada: backup inválido.";
      log?.error("restore_failed", human, v.error);
      return { ok: false, error: v.error, human };
    }
    // cópia de segurança do estado atual antes de substituir
    if (existsSync(dataFile)) {
      createBackup(dataFile, backupDir, 99, log);
    }
    mkdirSync(join(dataFile, ".."), { recursive: true });
    const tmp = dataFile + ".restore-tmp";
    copyFileSync(backupPath, tmp);
    // validar tmp de novo
    const v2 = validateStoreJson(tmp);
    if (!v2.ok) {
      rmSync(tmp, { force: true });
      return { ok: false, error: v2.error, human: "Restauração cancelada após cópia." };
    }
    if (existsSync(dataFile)) {
      const pre = dataFile + ".pre-restore";
      copyFileSync(dataFile, pre);
    }
    // replace
    copyFileSync(tmp, dataFile);
    rmSync(tmp, { force: true });
    const hash = sha256File(dataFile);
    const human = "Restauração concluída. Reinicie o servidor do piloto.";
    log?.info("restore_done", human, backupPath, { meta: { sha256: hash } });
    return { ok: true, path: dataFile, sha256: hash, human };
  } catch (e) {
    const technical = e instanceof Error ? e.message : String(e);
    const human = "Não foi possível restaurar o backup.";
    log?.error("restore_failed", human, technical);
    return { ok: false, error: technical, human };
  }
}

export function backupFileAgeMs(path: string): number {
  return Date.now() - statSync(path).mtimeMs;
}
