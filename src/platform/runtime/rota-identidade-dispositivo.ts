/**
 * Identidade de aparelho para consultas servidor-servidor de leitura.
 *
 * Não emite token, não aceita segredo do aparelho e não consulta domínio.
 * Só atesta: este Bearer ainda representa este device/unit/actor?
 */

import {
  autenticarDispositivo,
  corpoDeRecusa,
} from "../auth/device-auth";
import type { RegistroDeDispositivos } from "../ingest/device-ingest";
import type { RespostaDaRota } from "./rota-ingestao";

export const ROTA_IDENTIDADE_DISPOSITIVO = "/api/device/identity";
export const DEVICE_IDENTITY_VERSION = "device-identity@1.0.0";

export interface DepsDaIdentidadeDoDispositivo {
  segredo: string;
  registro: RegistroDeDispositivos;
  agora: () => Date;
}

export async function tratarIdentidadeDoDispositivo(
  headers: Record<string, string | string[] | undefined>,
  deps: DepsDaIdentidadeDoDispositivo,
): Promise<RespostaDaRota> {  const auth = await autenticarDispositivo({
    authorization:
      typeof headers.authorization === "string" ? headers.authorization : undefined,
    segredo: deps.segredo,
    registro: deps.registro,
    agora: deps.agora(),
  });

  if (!auth.ok) {
    return { status: auth.status, corpo: corpoDeRecusa(auth) };
  }

  return {
    status: 200,
    corpo: {
      ok: true,
      api_version: DEVICE_IDENTITY_VERSION,
      device_id: auth.dispositivo.device_id,
      unit_id: auth.dispositivo.unit_id,
      actor_id: auth.dispositivo.actor_id ?? null,
      expires_at: new Date(auth.claims.exp * 1000).toISOString(),
    },
  };
}
