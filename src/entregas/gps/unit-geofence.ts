/**
 * Configuração de geofence POR UNIDADE — externa ao código.
 *
 * Regra dura: nenhuma coordenada real de loja no código-fonte. A unidade é
 * configurada em arquivo fora do Git (`config/entregas-geofence.json`), com
 * validação de faixa e FALHA FECHADA.
 *
 * Sem configuração válida o sistema ainda captura e apresenta GPS (o
 * operador continua vendo onde o motoboy está), mas NÃO detecta retorno
 * automaticamente — porque não há como saber o que é "estar na loja".
 */

import type { GpsPolicy } from "./types";
import { DEFAULT_GPS_POLICY } from "./types";

export interface UnitGeofenceConfig {
  unit_id: string;
  latitude: number;
  longitude: number;
  /** Raio do geofence da loja em metros. */
  radius_m: number;
  max_accuracy_m: number;
  min_dwell_s: number;
  max_speed_mps: number;
  max_freshness_s: number;
  /** Versão da política — muda a cada alteração, para auditoria. */
  version: string;
  active: boolean;
  /** Quem alterou por último (papel funcional, nunca nome de pessoa). */
  updated_by?: string;
  updated_at?: string;
}

export interface GeofenceValidationIssue {
  field: string;
  message: string;
}

export type GeofenceLoadResult =
  | { ok: true; config: UnitGeofenceConfig; policy: GpsPolicy }
  | { ok: false; issues: GeofenceValidationIssue[]; returnDetectionAvailable: false };

/** Faixas aceitáveis — valores fora disso são erro de configuração, não opinião. */
const LIMITS = {
  radius_m: { min: 10, max: 1000 },
  max_accuracy_m: { min: 5, max: 500 },
  min_dwell_s: { min: 10, max: 1800 },
  max_speed_mps: { min: 0, max: 10 },
  max_freshness_s: { min: 10, max: 3600 },
} as const;

export function validateUnitGeofence(
  raw: Partial<UnitGeofenceConfig> | null | undefined,
): GeofenceValidationIssue[] {
  const issues: GeofenceValidationIssue[] = [];
  if (!raw) {
    issues.push({ field: "config", message: "configuração ausente" });
    return issues;
  }

  if (!raw.unit_id || !String(raw.unit_id).trim()) {
    issues.push({ field: "unit_id", message: "obrigatório" });
  }
  if (!raw.version || !String(raw.version).trim()) {
    issues.push({ field: "version", message: "obrigatório para auditoria" });
  }

  const lat = raw.latitude;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    issues.push({ field: "latitude", message: "fora da faixa -90..90" });
  }
  const lon = raw.longitude;
  if (typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    issues.push({ field: "longitude", message: "fora da faixa -180..180" });
  }
  // Coordenada 0,0 é quase sempre erro de preenchimento, não uma loja real.
  if (lat === 0 && lon === 0) {
    issues.push({
      field: "latitude/longitude",
      message: "0,0 não é coordenada de loja — configuração provavelmente vazia",
    });
  }

  for (const [field, range] of Object.entries(LIMITS)) {
    const v = (raw as Record<string, unknown>)[field];
    if (typeof v !== "number" || !Number.isFinite(v) || v < range.min || v > range.max) {
      issues.push({
        field,
        message: `fora da faixa ${range.min}..${range.max}`,
      });
    }
  }

  return issues;
}

/**
 * Carrega e valida. Falha fechada: qualquer problema desabilita a detecção
 * automática de retorno, sem derrubar o resto do sistema.
 */
export function loadUnitGeofence(
  raw: Partial<UnitGeofenceConfig> | null | undefined,
  basePolicy: GpsPolicy = DEFAULT_GPS_POLICY,
): GeofenceLoadResult {
  const issues = validateUnitGeofence(raw);
  if (issues.length) {
    return { ok: false, issues, returnDetectionAvailable: false };
  }
  const c = raw as UnitGeofenceConfig;
  if (!c.active) {
    return {
      ok: false,
      issues: [{ field: "active", message: "geofence marcada como inativa" }],
      returnDetectionAvailable: false,
    };
  }
  return {
    ok: true,
    config: c,
    policy: {
      ...basePolicy,
      store_geofence_radius_m: c.radius_m,
      max_accuracy_usable_m: c.max_accuracy_m,
      min_dwell_return_s: c.min_dwell_s,
      max_speed_return_mps: c.max_speed_mps,
      freshness_window_s: c.max_freshness_s,
    },
  };
}

/**
 * Resumo para tela de diagnóstico. Mostra a política ativa SEM expor a
 * coordenada exata da loja para papéis não autorizados.
 */
export function geofenceDiagnostic(
  result: GeofenceLoadResult,
  canSeeCoordinates: boolean,
): Record<string, unknown> {
  if (!result.ok) {
    return {
      configured: false,
      return_detection_available: false,
      issues: result.issues,
    };
  }
  const base = {
    configured: true,
    return_detection_available: true,
    unit_id: result.config.unit_id,
    version: result.config.version,
    radius_m: result.config.radius_m,
    min_dwell_s: result.config.min_dwell_s,
    max_speed_mps: result.config.max_speed_mps,
    max_accuracy_m: result.config.max_accuracy_m,
    max_freshness_s: result.config.max_freshness_s,
    updated_by: result.config.updated_by ?? null,
    updated_at: result.config.updated_at ?? null,
  };
  if (!canSeeCoordinates) return base;
  return {
    ...base,
    latitude: result.config.latitude,
    longitude: result.config.longitude,
  };
}
