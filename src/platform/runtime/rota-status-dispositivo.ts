/**
 * Status efêmero do aparelho — somente contadores da fila local.
 *
 * Autenticação é a mesma dos demais endpoints do aparelho. O device_id vem
 * do Bearer; nunca do corpo. Nenhuma coordenada ou payload de fila é aceito.
 */

import { autenticarDispositivo, corpoDeRecusa } from "../auth/device-auth";
import type { RegistroDeDispositivos } from "../ingest/device-ingest";
import type { SourceMode } from "../contracts/event-catalog";
import type { RespostaDaRota } from "./rota-ingestao";

export const ROTA_STATUS_DISPOSITIVO = "/api/device/status";
export const DEVICE_STATUS_VERSION = "device-status@1.0.0";
export const DEVICE_STATUS_MAX_COUNT = 1_000_000;

export interface RegistroDeStatusDoDispositivo {
  registrarStatus(
    device_id: string,
    dados: {
      pending_points: number;
      pending_events: number;
      rejected_points: number;
      source_mode: SourceMode;
      agora: Date;
    },
  ): Promise<void>;
}

export interface DepsDoStatusDoDispositivo {
  segredo: string;
  registro: RegistroDeDispositivos;
  status: RegistroDeStatusDoDispositivo;
  source_mode: SourceMode;
  agora: () => Date;
}

function contador(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  if (v < 0 || v > DEVICE_STATUS_MAX_COUNT) return null;
  return v;
}

export async function tratarStatusDoDispositivo(
  headers: Record<string, string | string[] | undefined>,
  corpoBruto: unknown,
  deps: DepsDoStatusDoDispositivo,
): Promise<RespostaDaRota> {
  const auth = await autenticarDispositivo({
    authorization: typeof headers.authorization === "string" ? headers.authorization : undefined,
    segredo: deps.segredo,
    registro: deps.registro,
    agora: deps.agora(),
  });

  if (!auth.ok) return { status: auth.status, corpo: corpoDeRecusa(auth) };

  const corpo =
    corpoBruto && typeof corpoBruto === "object" && !Array.isArray(corpoBruto)
      ? (corpoBruto as Record<string, unknown>)
      : {};

  const CAMPOS = new Set(["pending_points", "pending_events", "rejected_points"]);
  const extras = Object.keys(corpo).filter((k) => !CAMPOS.has(k));
  if (extras.length > 0) {
    return {
      status: 400,
      corpo: {
        ok: false,
        classe: "contrato_invalido",
        motivo: "status aceita somente contadores da fila local",
        campos_inesperados: extras.sort(),
      },
    };
  }

  const pending_points = contador(corpo.pending_points);
  const pending_events = contador(corpo.pending_events);
  const rejected_points = contador(corpo.rejected_points);

  if (pending_points === null || pending_events === null || rejected_points === null) {
    return {
      status: 400,
      corpo: {
        ok: false,
        classe: "contrato_invalido",
        motivo: "contadores precisam ser inteiros entre 0 e 1000000",
      },
    };
  }

  const agora = deps.agora();
  await deps.status.registrarStatus(auth.dispositivo.device_id, {
    pending_points,
    pending_events,
    rejected_points,
    source_mode: deps.source_mode,
    agora,
  });

  return {
    status: 200,
    corpo: {
      ok: true,
      api_version: DEVICE_STATUS_VERSION,
      device_id: auth.dispositivo.device_id,
      unit_id: auth.dispositivo.unit_id,
      received_at: agora.toISOString(),
    },
  };
}
