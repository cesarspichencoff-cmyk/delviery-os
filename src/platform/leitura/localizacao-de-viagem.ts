/**
 * Leitura canônica dos pontos de uma viagem.
 *
 * Esta porta NÃO é endpoint e NÃO decide autorização humana. Ela só lê a
 * fonte durável que já recebeu o GPS do Android: platform.event_log.
 *
 * O chamador precisa informar unidade + viagem + source_mode. Isso impede
 * somar fatos real/simulated/control e impede uma consulta ambígua por trip_id.
 */
import type {
  SqlRow,
  TransactionalSqlClient,
} from "../persistence/sql-client";
import type { SourceMode } from "../contracts/event-catalog";

export interface PontoGpsCanonico {
  event_id: string;
  idempotency_key: string;
  unit_id: string;
  trip_id: string;
  device_id: string;
  actor_id: string | null;
  occurred_at: string;
  recorded_at: string;
  source_mode: SourceMode;
  sequence_local: number | null;
  clock_trust: string;
  latitude: number;
  longitude: number;
  accuracy_m: number;
  speed_mps?: number;
  heading_deg?: number;
  altitude_m?: number;
  provider?: string;
  captured_offline: boolean;
}

export interface LocalizacaoCanonicaDaViagem {
  fonte: "platform.event_log";
  unit_id: string;
  trip_id: string;
  source_mode: SourceMode;
  point_count: number;
  points: PontoGpsCanonico[];
  last_point?: PontoGpsCanonico;
}

interface LinhaGps extends SqlRow {
  event_id: unknown;
  idempotency_key: unknown;
  unit_id: unknown;
  object_id: unknown;
  device_id: unknown;
  actor_id: unknown;
  occurred_at: unknown;
  recorded_at: unknown;
  source_mode: unknown;
  sequence_local: unknown;
  clock_trust: unknown;
  payload: unknown;
}

function iso(v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v));
  if (!Number.isFinite(d.getTime())) throw new Error("timestamp GPS inválido no event_log");
  return d.toISOString();
}

function numero(payload: Record<string, unknown>, chave: string): number | undefined {
  const v = payload[chave];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function pontoDaLinha(l: LinhaGps, modo: SourceMode): PontoGpsCanonico {
  const payload =
    l.payload !== null && typeof l.payload === "object"
      ? (l.payload as Record<string, unknown>)
      : {};
  const latitude = numero(payload, "latitude");
  const longitude = numero(payload, "longitude");
  const accuracy = numero(payload, "accuracy_m");
  if (
    latitude === undefined ||
    longitude === undefined ||
    accuracy === undefined ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    accuracy < 0
  ) {
    throw new Error(`fato GPS inválido no event_log: ${String(l.event_id)}`);
  }
  if (typeof l.device_id !== "string" || !l.device_id) {
    throw new Error(`fato GPS sem device_id: ${String(l.event_id)}`);
  }

  const speed = numero(payload, "speed_mps");
  const heading = numero(payload, "heading_deg");
  const altitude = numero(payload, "altitude_m");
  const provider = typeof payload.provider === "string" ? payload.provider : undefined;
  const sequence =
    typeof l.sequence_local === "number" && Number.isInteger(l.sequence_local)
      ? l.sequence_local
      : null;

  return {
    event_id: String(l.event_id),
    idempotency_key: String(l.idempotency_key),
    unit_id: String(l.unit_id),
    trip_id: String(l.object_id),
    device_id: l.device_id,
    actor_id: l.actor_id === null ? null : String(l.actor_id),
    occurred_at: iso(l.occurred_at),
    recorded_at: iso(l.recorded_at),
    source_mode: modo,
    sequence_local: sequence,
    clock_trust: String(l.clock_trust ?? "unknown"),
    latitude,
    longitude,
    accuracy_m: accuracy,
    speed_mps: speed,
    heading_deg: heading,
    altitude_m: altitude,
    provider,
    captured_offline: payload.captured_offline === true,
  };
}

export async function lerLocalizacaoCanonicaDaViagem(
  cliente: TransactionalSqlClient,
  opcoes: { unit_id: string; trip_id: string; source_mode: SourceMode },
): Promise<LocalizacaoCanonicaDaViagem> {
  return cliente.transaction(async (tx) => {
    await tx.query("SET TRANSACTION READ ONLY");
    const linhas = await tx.query<LinhaGps>(
      `SELECT event_id, idempotency_key, unit_id, object_id, device_id, actor_id,
              occurred_at, recorded_at, source_mode, sequence_local, clock_trust, payload
         FROM platform.event_log
        WHERE event_type = 'gps_batch_received'
          AND object_type = 'trip'
          AND unit_id = $1
          AND object_id = $2
          AND source_mode = $3
        ORDER BY sequence_local ASC NULLS LAST, recorded_at ASC, event_id ASC`,
      [opcoes.unit_id, opcoes.trip_id, opcoes.source_mode],
    );
    const points = linhas.map((l) => pontoDaLinha(l, opcoes.source_mode));
    return {
      fonte: "platform.event_log",
      unit_id: opcoes.unit_id,
      trip_id: opcoes.trip_id,
      source_mode: opcoes.source_mode,
      point_count: points.length,
      points,
      last_point: points.at(-1),
    };
  });
}
