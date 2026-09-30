import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { OperationalRole } from "../operational/auth";
import type { EntregasSourceMode } from "../contracts/events/types";

export interface PilotUser {
  actor_id: string;
  role: OperationalRole;
  label: string;
  token: string;
}

export interface PilotConfig {
  mode: "pilot" | "demo" | "test";
  unit_id: string;
  unit_name: string;
  timezone: string;
  port: number;
  bind: string;
  data_dir: string;
  /**
   * Natureza dos eventos públicos deste produtor.
   * Opcional para compatibilidade; ausência = UNKNOWN, nunca "real".
   */
  source_mode?: EntregasSourceMode;
  max_stops: number;
  banner: string;
  users: PilotUser[];
  features: {
    demo_seed: boolean;
    demo_controls: boolean;
    map_poc: boolean;
    gps_production: boolean;
    auto_assignment: boolean;
    copiloto: boolean;
    shell: boolean;
  };
  backup: {
    auto_interval_minutes: number;
    retain_count: number;
    dir: string;
  };
}

export function loadPilotConfig(path?: string): PilotConfig {
  const p =
    path ||
    process.env.ENTREGAS_PILOT_CONFIG ||
    join(process.cwd(), "config", "entregas-pilot.json");
  if (!existsSync(p)) {
    throw new Error(
      `Config do piloto não encontrada: ${p}. Copie config/entregas-pilot.example.json para config/entregas-pilot.json e defina tokens.`,
    );
  }
  const raw = JSON.parse(readFileSync(p, "utf8")) as PilotConfig;
  if (
    raw.source_mode !== undefined &&
    raw.source_mode !== "real" &&
    raw.source_mode !== "simulated" &&
    raw.source_mode !== "control"
  ) {
    throw new Error(
      "Config piloto: source_mode deve ser real, simulated ou control; ausência permanece UNKNOWN",
    );
  }
  if (!raw.users?.length) throw new Error("Config piloto: users obrigatório");
  if (raw.users.some((u) => !u.token || u.token.startsWith("CHANGE_ME"))) {
    console.warn(
      "[piloto] AVISO: tokens CHANGE_ME ainda presentes — troque antes do uso real.",
    );
  }
  return raw;
}

export function resolveBanner(cfg: PilotConfig): string {
  return (cfg.banner || "PILOTO CONTROLADO · UNIDADE {unit_name}").replace(
    "{unit_name}",
    cfg.unit_name,
  );
}

export function findUserByToken(cfg: PilotConfig, token: string): PilotUser | null {
  if (!token?.trim()) return null;
  return cfg.users.find((u) => u.token === token) ?? null;
}
