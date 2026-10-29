/**
 * Backup / restauração para piloto single-instance (FileUnitOfWork).
 * Não é banco de produção.
 */
import {
  copyFileSync,
  renameSync,
  openSync,
  closeSync,
  fsyncSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import type { PilotLogger } from "./pilot-log";
import { parseSha256Sidecar } from "./backup-integrity";

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

function expectedHashFromSidecar(
  backupPath: string,
): { ok: true; sha256: string } | { ok: false; error: string } {
  const sidecarPath = backupPath + ".sha256";
  if (!existsSync(sidecarPath)) {
    return { ok: false, error: "checksum ausente" };
  }

  const raw = readFileSync(sidecarPath, "utf8").trim();
  // Compatibilidade com snapshots legados do FileUnitOfWork: antes de
  // 2026-10-01 o sidecar guardava apenas os 64 hex, sem basename.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return { ok: true, sha256: raw.toLowerCase() };
  }

  const parsed = parseSha256Sidecar(readFileSync(sidecarPath, "utf8"));
  if (!parsed) return { ok: false, error: "checksum inválido" };
  if (parsed.filename !== basename(backupPath)) {
    return { ok: false, error: "checksum aponta outro arquivo" };
  }
  return { ok: true, sha256: parsed.sha256 };
}

function validateStoreJson(path: string): { ok: boolean; error?: string } {
  try {
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, error: "JSON inválido" };
    }
    for (const k of ["trips", "handoffs", "occurrences", "riders", "events", "outbox"]) {
      if (!(k in data)) return { ok: false, error: `faltando chave ${k}` };
    }
    const version = data.receipt_schema_version;
    const hasMap = Object.prototype.hasOwnProperty.call(data, "inbound_receipts");
    if ((version !== undefined && version !== 1) || (version === 1 && !hasMap)) {
      return { ok: false, error: "contrato de recibos de entrada invalido" };
    }
    if (hasMap && (!data.inbound_receipts ||
        typeof data.inbound_receipts !== "object" || Array.isArray(data.inbound_receipts))) {
      return { ok: false, error: "mapa de recibos de entrada invalido" };
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
    writeFileSync(dest + ".sha256", `${hash}  ${basename(dest)}\n`, "utf8");

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
    if (!existsSync(dataFile) && existsSync(dataFile + ".bak")) {
      return { ok: false, error: "principal_ausente_backup_lateral_presente",
        human: "Restauração bloqueada: principal ausente e backup lateral presente. Exige recuperação assistida." };
    }

    // Recibos de entrada sao ACK de comandos aplicados. Restaurar uma
    // geracao anterior, mesmo com checksum valido, poderia apagar o ACK
    // enquanto o aparelho ainda guarda o evento e vai tentar de novo.
    // Sem restauracao consciente dos recibos + dominio, BLOQUEAR.
    if (existsSync(dataFile)) {
      const currentRaw = readFileSync(dataFile, "utf8");
      let current: unknown;
      try {
        current = JSON.parse(currentRaw) as unknown;
      } catch {
        // Dados truncados podem perder todo o sufixo com inbound_receipts.
        // Ausencia textual de chave NAO prova que nao existiam recibos.
        // Preservar o arquivo para recuperacao humana, sem overwrite.
        return { ok: false, error: "estado_atual_corrompido_recuperacao_assistida",
          human: "Restauração bloqueada: arquivo atual corrompido exige recuperação assistida." };
      }
      if (current !== undefined) {
      if (!current || typeof current !== "object" || Array.isArray(current)) {
        return { ok: false, error: "estado_atual_invalido", human: "Restauração bloqueada: estado atual inválido." };
      }
      const source = current as Record<string, unknown>;
      const version = source.receipt_schema_version;
      const hasMap = Object.prototype.hasOwnProperty.call(source, "inbound_receipts");
      if ((version !== undefined && version !== 1) || (version === 1 && !hasMap)) {
        return { ok: false, error: "recibos_atual_inconsistente",
          human: "Restauração bloqueada: contrato de recibos inconsistente." };
      }
      if (hasMap) {
        const receipts = source.inbound_receipts;
        if (!receipts || typeof receipts !== "object" || Array.isArray(receipts)) {
          return { ok: false, error: "mapa_recibos_invalido",
            human: "Restauração bloqueada: recibos de entrada inválidos." };
        }
        if (Object.keys(receipts).length > 0) {
          const human = "Restauração bloqueada: há recibos de comandos aplicados. Exige recuperação transacional.";
          log?.error("restore_failed", human, "restore_requires_receipt_aware_recovery");
          return { ok: false, error: "restore_requires_receipt_aware_recovery", human };
        }
      }
      }
    }

    const expected = expectedHashFromSidecar(backupPath);
    if (!expected.ok) {
      const human = "Restauração cancelada: integridade do backup não comprovada.";
      log?.error("restore_failed", human, expected.error);
      return { ok: false, error: expected.error, human };
    }
    const actualHash = sha256File(backupPath);
    if (actualHash !== expected.sha256) {
      const human = "Restauração cancelada: checksum do backup divergente.";
      log?.error("restore_failed", human, "checksum divergente");
      return { ok: false, error: "checksum divergente", human };
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
    // Publica de uma vez o arquivo temporario ja validado. Nao truncar
    // o principal com copyFileSync: erro no meio nao pode apagar o original.
    const fd = openSync(tmp, "r+");
    try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, dataFile);
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
