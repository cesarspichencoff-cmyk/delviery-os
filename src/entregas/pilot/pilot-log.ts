/**
 * Observabilidade humana do piloto — log técnico em arquivo, mensagem humana separada.
 * Nunca enviar stack para a UI operacional.
 */
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export type PilotLogLevel = "info" | "warn" | "error";

export type PilotLogEvent =
  | "server_started"
  | "server_stopped"
  | "persistence_error"
  | "command_failed"
  | "command_ok"
  | "auth_failed"
  | "sync_pending"
  | "sync_done"
  | "conflict"
  | "duplicate_order"
  | "duplicate_delivery"
  | "duplicate_ifood_release"
  | "backup_done"
  | "backup_failed"
  | "restore_done"
  | "restore_failed"
  | "session_login"
  | "session_rejected"
  /* Aparelho Android */
  | "device_session"
  | "device_rejected"
  | "gps_batch"
  | "route_access";

export interface PilotLogEntry {
  at: string;
  level: PilotLogLevel;
  event: PilotLogEvent;
  human: string;
  technical?: string;
  actor_id?: string;
  meta?: Record<string, unknown>;
}

export class PilotLogger {
  constructor(private readonly logPath: string) {
    mkdirSync(join(logPath, ".."), { recursive: true });
  }

  write(
    level: PilotLogLevel,
    event: PilotLogEvent,
    human: string,
    technical?: string,
    extra?: { actor_id?: string; meta?: Record<string, unknown> },
  ): PilotLogEntry {
    const entry: PilotLogEntry = {
      at: new Date().toISOString(),
      level,
      event,
      human,
      technical,
      actor_id: extra?.actor_id,
      meta: extra?.meta,
    };
    try {
      appendFileSync(this.logPath, JSON.stringify(entry) + "\n", "utf8");
    } catch (e) {
      console.error("[pilot-log] falha ao gravar", e);
    }
    const line = `[${entry.at}] ${level.toUpperCase()} ${event}: ${human}`;
    if (level === "error") console.error(line, technical || "");
    else console.log(line);
    return entry;
  }

  info(event: PilotLogEvent, human: string, technical?: string, extra?: { actor_id?: string; meta?: Record<string, unknown> }) {
    return this.write("info", event, human, technical, extra);
  }
  warn(event: PilotLogEvent, human: string, technical?: string, extra?: { actor_id?: string; meta?: Record<string, unknown> }) {
    return this.write("warn", event, human, technical, extra);
  }
  error(event: PilotLogEvent, human: string, technical?: string, extra?: { actor_id?: string; meta?: Record<string, unknown> }) {
    return this.write("error", event, human, technical, extra);
  }
}

export function createPilotLogger(dataDir: string): PilotLogger {
  return new PilotLogger(join(dataDir, "ops.log.jsonl"));
}

export function existsLog(dataDir: string): boolean {
  return existsSync(join(dataDir, "ops.log.jsonl"));
}
