/**
 * Validação de GPSPoint — fronteira de entrada. Nada entra no domínio sem
 * passar por aqui. Rejeição é sempre EXPLÍCITA (GpsRejection), nunca descarte
 * silencioso.
 */

import type { GpsPolicy, GPSPoint, GpsRejection, GpsPointQuality } from "./types";
import { GPS_SCHEMA_VERSION } from "./types";
import type { ClockTrust } from "../foundation/enums";

export interface RawGpsSample {
  trip_id: string;
  device_id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number;
  speed_mps?: number;
  heading_deg?: number;
  altitude_m?: number;
  /** Horário do aparelho. */
  occurred_at: string;
  source: "device" | "simulator" | "offline_batch";
  captured_offline?: boolean;
}

export interface ValidationContext {
  /** Viagem ativa no momento — ausente significa: não capturar. */
  active_trip_id: string | null;
  /** Dispositivo associado à sessão/viagem. */
  session_device_id: string;
  policy: GpsPolicy;
  now: Date;
  /** point_id já conhecidos (dedup). */
  known_point_ids?: ReadonlySet<string>;
}

export type ValidationResult =
  | { ok: true; point: GPSPoint }
  | { ok: false; rejection: GpsRejection; detail?: string };

/** Identidade determinística: mesmo aparelho + viagem + instante = mesmo ponto. */
export function pointId(
  device_id: string,
  trip_id: string,
  occurred_at: string,
): string {
  return `gps:${device_id}:${trip_id}:${occurred_at}`;
}

export function classifyQuality(
  accuracy_m: number,
  policy: GpsPolicy,
): GpsPointQuality {
  if (accuracy_m <= policy.max_accuracy_good_m) return "good";
  if (accuracy_m <= policy.max_accuracy_usable_m) return "degraded";
  return "unusable";
}

function clockTrust(
  occurred_at: string,
  now: Date,
  toleranceMs: number,
): ClockTrust {
  const t = Date.parse(occurred_at);
  if (!Number.isFinite(t)) return "unknown";
  const diff = t - now.getTime();
  if (Math.abs(diff) > toleranceMs) return "suspect";
  return "trusted";
}

/**
 * Valida e normaliza uma amostra crua em GPSPoint.
 *
 * Rejeita, nesta ordem: sem viagem ativa → viagem divergente → dispositivo
 * divergente → coordenada inválida → accuracy inválida → timestamp impossível
 * → duplicata. A ordem importa: "não deveria nem estar capturando" vem antes
 * de qualquer crítica ao conteúdo do ponto.
 */
export function validateSample(
  raw: RawGpsSample,
  ctx: ValidationContext,
): ValidationResult {
  // 1. GPS só existe com viagem ativa (COR §21.1) — trava estrutural.
  if (!raw.trip_id) return { ok: false, rejection: "no_trip_id" };
  if (!ctx.active_trip_id) {
    return { ok: false, rejection: "trip_not_active" };
  }
  if (raw.trip_id !== ctx.active_trip_id) {
    return { ok: false, rejection: "trip_mismatch" };
  }
  if (raw.device_id !== ctx.session_device_id) {
    return { ok: false, rejection: "device_mismatch" };
  }

  // 2. Faixa geográfica.
  if (
    typeof raw.latitude !== "number" ||
    !Number.isFinite(raw.latitude) ||
    raw.latitude < -90 ||
    raw.latitude > 90
  ) {
    return { ok: false, rejection: "invalid_latitude" };
  }
  if (
    typeof raw.longitude !== "number" ||
    !Number.isFinite(raw.longitude) ||
    raw.longitude < -180 ||
    raw.longitude > 180
  ) {
    return { ok: false, rejection: "invalid_longitude" };
  }

  // 3. Accuracy precisa ser número positivo real.
  if (
    typeof raw.accuracy_m !== "number" ||
    !Number.isFinite(raw.accuracy_m) ||
    raw.accuracy_m < 0
  ) {
    return { ok: false, rejection: "invalid_accuracy" };
  }

  // 4. Timestamp precisa ser parseável e não absurdo.
  const t = Date.parse(raw.occurred_at);
  if (!Number.isFinite(t)) {
    return { ok: false, rejection: "impossible_timestamp" };
  }
  // Futuro além de 24h ou passado além de 30 dias: impossível para uma viagem.
  const diff = t - ctx.now.getTime();
  if (diff > 86400000 || diff < -30 * 86400000) {
    return { ok: false, rejection: "impossible_timestamp" };
  }

  const id = pointId(raw.device_id, raw.trip_id, raw.occurred_at);
  if (ctx.known_point_ids?.has(id)) {
    return { ok: false, rejection: "duplicate" };
  }

  const quality = classifyQuality(raw.accuracy_m, ctx.policy);
  const nowIso = ctx.now.toISOString();

  return {
    ok: true,
    point: {
      point_id: id,
      idempotency_key: id,
      trip_id: raw.trip_id,
      device_id: raw.device_id,
      latitude: raw.latitude,
      longitude: raw.longitude,
      accuracy_m: raw.accuracy_m,
      speed_mps: raw.speed_mps,
      heading_deg: raw.heading_deg,
      altitude_m: raw.altitude_m,
      occurred_at: raw.occurred_at,
      recorded_at: nowIso,
      source: raw.source,
      quality,
      captured_offline: raw.captured_offline === true,
      clock_trust: clockTrust(
        raw.occurred_at,
        ctx.now,
        ctx.policy.clock_skew_tolerance_ms,
      ),
      schema_version: GPS_SCHEMA_VERSION,
    },
  };
}
