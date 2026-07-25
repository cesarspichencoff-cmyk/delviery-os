/**
 * Contrato de GPS operacional — COR-ENTREGAS-V1@1.0.3 + Adendo GPS Piloto
 * (docs/entregas/cor-v1-0-3/ENTREGAS_V1_0_3_ADENDO_GPS_PILOTO.md).
 *
 * Princípios inegociáveis, todos herdados do COR e exigíveis em teste:
 *  - GPS existe SOMENTE durante viagem ativa. `trip_id` é obrigatório no
 *    GPSPoint: ponto sem viagem é inválido por construção, não por convenção
 *    (COR §21.1, §22.5).
 *  - Chegada NUNCA é entrega. Este módulo produz evidência e detecção;
 *    confirmação é ato humano (COR §11.3, §22.6, §22.12).
 *  - Posição antiga nunca se apresenta como atual: `GpsFreshness` é explícito
 *    e obrigatório em toda projeção.
 *  - Sem ranking, sem score de pessoa. Velocidade existe só como evidência
 *    instantânea de parada/movimento (COR §22.2, §27.18).
 */

import type { ClockTrust } from "../foundation/enums";

export const GPS_SCHEMA_VERSION = "gps@1.0.0";

/** Origem do ponto. */
export const GPS_SOURCES = ["device", "simulator", "offline_batch"] as const;
export type GpsSource = (typeof GPS_SOURCES)[number];

/**
 * Qualidade do ponto individual. `unusable` entra no histórico mas NUNCA
 * alimenta detecção de chegada ou retorno (COR §13.0).
 */
export const GPS_POINT_QUALITY = ["good", "degraded", "unusable"] as const;
export type GpsPointQuality = (typeof GPS_POINT_QUALITY)[number];

/**
 * Estado do que a tela APRESENTA. Contrato de honestidade: a interface nunca
 * mostra posição velha como se fosse atual.
 */
export const GPS_FRESHNESS = [
  "current",
  "stale",
  "inaccurate",
  "offline",
  "permission_denied",
  "unavailable",
  "unknown",
] as const;
export type GpsFreshness = (typeof GPS_FRESHNESS)[number];

/**
 * Ponto de GPS. Timestamps separados e nunca fundidos (COR §17.1):
 *  - occurred_at → instante no aparelho (verdade do mundo real)
 *  - recorded_at → quando o sistema recebeu
 *  - synced_at   → quando o lote offline subiu
 */
export interface GPSPoint {
  /** Identidade idempotente: device + trip + occurred_at. */
  point_id: string;
  /** Chave de negócio para dedup no servidor. */
  idempotency_key: string;
  trip_id: string;
  /** Pseudonimizado — nunca telefone/IMEI/e-mail. */
  device_id: string;
  latitude: number;
  longitude: number;
  /** Erro horizontal estimado em metros (menor = melhor). */
  accuracy_m: number;
  /** m/s. Ausente quando o provedor não fornece — nunca inventado. */
  speed_mps?: number;
  /** Graus 0–360. Ausente quando não confiável — nunca inventado. */
  heading_deg?: number;
  /** Só quando operacionalmente necessário; opcional por desenho. */
  altitude_m?: number;
  occurred_at: string;
  recorded_at: string;
  synced_at?: string;
  source: GpsSource;
  quality: GpsPointQuality;
  /** true quando o ponto ficou represado na fila local antes de subir. */
  captured_offline: boolean;
  clock_trust: ClockTrust;
  schema_version: string;
}

/** Limites operacionais — configuráveis, nunca números mágicos espalhados. */
export interface GpsPolicy {
  max_accuracy_good_m: number;
  max_accuracy_usable_m: number;
  freshness_window_s: number;
  signal_lost_after_s: number;
  store_geofence_radius_m: number;
  stop_geofence_radius_m: number;
  min_dwell_return_s: number;
  max_speed_return_mps: number;
  min_dwell_arrival_s: number;
  min_samples_return: number;
  sample_interval_s: number;
  min_distance_m: number;
  /** Retenção de coordenadas após encerramento da viagem. */
  retention_days: number;
  /** Tolerância de relógio para clock_trust. */
  clock_skew_tolerance_ms: number;
}

/** Default do piloto — sobreponível por config; documentado no adendo. */
export const DEFAULT_GPS_POLICY: GpsPolicy = {
  max_accuracy_good_m: 30,
  max_accuracy_usable_m: 100,
  freshness_window_s: 90,
  signal_lost_after_s: 300,
  store_geofence_radius_m: 80,
  stop_geofence_radius_m: 60,
  min_dwell_return_s: 60,
  max_speed_return_mps: 1.5,
  min_dwell_arrival_s: 30,
  min_samples_return: 3,
  sample_interval_s: 20,
  min_distance_m: 15,
  retention_days: 30,
  clock_skew_tolerance_ms: 120000,
};

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** Projeção para a tela — freshness SEMPRE explícito. */
export interface RiderLocationProjection {
  trip_id: string;
  freshness: GpsFreshness;
  /** Ausente quando não há posição utilizável. */
  last_point?: GPSPoint;
  age_s?: number;
  pending_offline: number;
  route_points: number;
  /** Texto curto e honesto para a interface. */
  label: string;
}

export const GPS_ERRORS = [
  "permission_denied",
  "position_unavailable",
  "timeout",
  "not_supported",
  "no_active_trip",
  "capture_disabled",
] as const;
export type GpsError = (typeof GPS_ERRORS)[number];

/** Motivos de rejeição de um ponto — sempre explícitos, nunca descarte mudo. */
export const GPS_REJECTIONS = [
  "invalid_latitude",
  "invalid_longitude",
  "invalid_accuracy",
  "impossible_timestamp",
  "no_trip_id",
  "trip_not_active",
  "device_mismatch",
  "trip_mismatch",
  "duplicate",
  "unusable_accuracy",
  "mock_location",
] as const;
export type GpsRejection = (typeof GPS_REJECTIONS)[number];
