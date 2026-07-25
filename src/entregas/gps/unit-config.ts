/**
 * Configuração da unidade piloto — ITAIM.
 *
 * Duas coisas que este arquivo existe para impedir:
 *
 * 1. Coordenada deduzida de endereço. "Rua João Cachoeira, 278" vira um ponto
 *    diferente em cada geocodificador, e o erro típico em quadra urbana é
 *    maior que o raio do geofence. A coordenada tem de ser CAPTURADA no local,
 *    com várias amostras, e confirmada por alguém.
 *
 * 2. Ponto tratado como prova quando a margem de erro atravessa a cerca. Em
 *    rua estreita com prédio alto, um ponto "dentro" com 60 m de precisão não
 *    prova nada. Aqui isso vira `incerto`, não `dentro`.
 *
 * Nenhuma coordenada real mora neste arquivo — só o procedimento.
 */

import type { GeoPoint, GpsPolicy } from "./types";
import { DEFAULT_GPS_POLICY } from "./types";
import { distanceMeters } from "./detection";

export const PILOT_UNIT_ID = "ITAIM" as const;

/**
 * Endereço de referência da unidade piloto. Serve para a pessoa saber onde
 * ir capturar as amostras — NUNCA para derivar coordenada.
 */
export const PILOT_UNIT_REFERENCE = {
  unit_id: PILOT_UNIT_ID,
  display_name: "TATÁ Itaim",
  reference_address: "Rua João Cachoeira, 278 - Itaim Bibi - São Paulo",
} as const;

export interface UnitConfig {
  unit_id: string;
  display_name: string;
  reference_address: string;
  latitude: number;
  longitude: number;
  /** Raio para detectar RETORNO à unidade. */
  return_radius_m: number;
  /** Raio para detectar CHEGADA a uma parada. */
  arrival_radius_m: number;
  max_accuracy_m: number;
  minimum_dwell_s: number;
  max_return_speed_mps: number;
  max_freshness_s: number;
  policy_version: string;
  active: boolean;
  /** Papel funcional de quem confirmou em campo — nunca nome de pessoa. */
  confirmed_by?: string;
  confirmed_at?: string;
  /** Quantas amostras deram origem ao ponto — abaixo do mínimo, não confirma. */
  sample_count?: number;
  /** Dispersão das amostras em metros — alta significa captura ruim. */
  sample_spread_m?: number;
}

const LIMITS = {
  return_radius_m: { min: 20, max: 500 },
  arrival_radius_m: { min: 20, max: 500 },
  max_accuracy_m: { min: 5, max: 500 },
  minimum_dwell_s: { min: 10, max: 1800 },
  max_return_speed_mps: { min: 0, max: 10 },
  max_freshness_s: { min: 10, max: 3600 },
} as const;

/** Mínimos do procedimento de captura em campo. */
export const CAPTURE_PROCEDURE = {
  min_samples: 5,
  /** Acima desta dispersão, as amostras não convergiram: repetir a captura. */
  max_spread_m: 25,
  /** Amostra individual pior que isto não entra na média. */
  max_sample_accuracy_m: 30,
} as const;

export interface UnitConfigIssue {
  field: string;
  message: string;
}

export function validateUnitConfig(
  raw: Partial<UnitConfig> | null | undefined,
): UnitConfigIssue[] {
  const issues: UnitConfigIssue[] = [];
  if (!raw) return [{ field: "config", message: "configuração ausente" }];

  if (!raw.unit_id?.trim()) issues.push({ field: "unit_id", message: "obrigatório" });
  if (!raw.policy_version?.trim()) {
    issues.push({ field: "policy_version", message: "obrigatório para auditoria" });
  }

  const lat = raw.latitude;
  const lon = raw.longitude;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    issues.push({ field: "latitude", message: "fora da faixa -90..90" });
  }
  if (typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    issues.push({ field: "longitude", message: "fora da faixa -180..180" });
  }
  if (lat === 0 && lon === 0) {
    issues.push({
      field: "latitude/longitude",
      message: "0,0 não é coordenada de loja — configuração provavelmente vazia",
    });
  }

  for (const [field, range] of Object.entries(LIMITS)) {
    const v = (raw as Record<string, unknown>)[field];
    if (typeof v !== "number" || !Number.isFinite(v) || v < range.min || v > range.max) {
      issues.push({ field, message: `fora da faixa ${range.min}..${range.max}` });
    }
  }

  // Confirmação em campo é parte da configuração, não formalidade.
  if (!raw.confirmed_by?.trim()) {
    issues.push({
      field: "confirmed_by",
      message: "coordenada precisa ser confirmada em campo por papel autorizado",
    });
  }
  if (typeof raw.sample_count === "number" && raw.sample_count < CAPTURE_PROCEDURE.min_samples) {
    issues.push({
      field: "sample_count",
      message: `mínimo de ${CAPTURE_PROCEDURE.min_samples} amostras`,
    });
  }
  if (
    typeof raw.sample_spread_m === "number" &&
    raw.sample_spread_m > CAPTURE_PROCEDURE.max_spread_m
  ) {
    issues.push({
      field: "sample_spread_m",
      message: `amostras dispersas demais (> ${CAPTURE_PROCEDURE.max_spread_m} m): repetir a captura`,
    });
  }

  return issues;
}

export type UnitConfigLoad =
  | { ok: true; config: UnitConfig; policy: GpsPolicy }
  | { ok: false; issues: UnitConfigIssue[]; returnDetectionAvailable: false };

/** Falha fechada, igual ao geofence: sem config válida, sem retorno automático. */
export function loadUnitConfig(
  raw: Partial<UnitConfig> | null | undefined,
  basePolicy: GpsPolicy = DEFAULT_GPS_POLICY,
): UnitConfigLoad {
  const issues = validateUnitConfig(raw);
  if (issues.length) return { ok: false, issues, returnDetectionAvailable: false };
  const c = raw as UnitConfig;
  if (!c.active) {
    return {
      ok: false,
      issues: [{ field: "active", message: "unidade marcada como inativa" }],
      returnDetectionAvailable: false,
    };
  }
  return {
    ok: true,
    config: c,
    policy: {
      ...basePolicy,
      store_geofence_radius_m: c.return_radius_m,
      stop_geofence_radius_m: c.arrival_radius_m,
      max_accuracy_usable_m: c.max_accuracy_m,
      min_dwell_return_s: c.minimum_dwell_s,
      max_speed_return_mps: c.max_return_speed_mps,
      freshness_window_s: c.max_freshness_s,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Captura da coordenada em campo
 * ------------------------------------------------------------------ */

export interface FieldSample {
  latitude: number;
  longitude: number;
  accuracy_m: number;
  occurred_at: string;
}

export type FieldCaptureResult =
  | {
      ok: true;
      point: GeoPoint;
      sample_count: number;
      spread_m: number;
      discarded: number;
    }
  | { ok: false; reason: string; discarded: number };

/**
 * Calcula o ponto de referência a partir de várias amostras tiradas no local.
 *
 * Descarta amostras ruins, exige um mínimo de amostras boas e recusa quando
 * elas não convergem. Recusar é o comportamento certo: melhor voltar lá com
 * o celular do que cravar um centro errado e passar o piloto inteiro
 * detectando retorno na esquina errada.
 */
export function computeReferencePoint(
  samples: readonly FieldSample[],
  procedure = CAPTURE_PROCEDURE,
): FieldCaptureResult {
  const good = samples.filter(
    (s) =>
      Number.isFinite(s.latitude) &&
      Number.isFinite(s.longitude) &&
      Number.isFinite(s.accuracy_m) &&
      s.accuracy_m > 0 &&
      s.accuracy_m <= procedure.max_sample_accuracy_m &&
      !(s.latitude === 0 && s.longitude === 0),
  );
  const discarded = samples.length - good.length;

  if (good.length < procedure.min_samples) {
    return {
      ok: false,
      reason: `são necessárias ao menos ${procedure.min_samples} amostras com precisão até ${procedure.max_sample_accuracy_m} m (boas: ${good.length})`,
      discarded,
    };
  }

  // Média ponderada pela precisão: amostra melhor puxa mais o centro.
  let wsum = 0;
  let lat = 0;
  let lon = 0;
  for (const s of good) {
    const w = 1 / s.accuracy_m;
    wsum += w;
    lat += s.latitude * w;
    lon += s.longitude * w;
  }
  const point: GeoPoint = { latitude: lat / wsum, longitude: lon / wsum };

  const spread_m = Math.max(
    ...good.map((s) =>
      distanceMeters(point, { latitude: s.latitude, longitude: s.longitude }),
    ),
  );

  if (spread_m > procedure.max_spread_m) {
    return {
      ok: false,
      reason: `amostras dispersas em ${Math.round(spread_m)} m (limite ${procedure.max_spread_m} m): repetir a captura`,
      discarded,
    };
  }

  return { ok: true, point, sample_count: good.length, spread_m, discarded };
}

/* ------------------------------------------------------------------ *
 * Incerteza do ponto contra a cerca
 * ------------------------------------------------------------------ */

export const GEOFENCE_VERDICTS = ["dentro", "incerto", "fora"] as const;
export type GeofenceVerdict = (typeof GEOFENCE_VERDICTS)[number];

export interface GeofenceEvaluation {
  verdict: GeofenceVerdict;
  distance_m: number;
  accuracy_m: number;
  /** Explicação legível para diagnóstico. */
  reason: string;
}

/**
 * Avalia um ponto contra a cerca CONSIDERANDO a margem de erro.
 *
 * O ponto só é `dentro` quando o círculo de incerteza inteiro cabe na cerca;
 * só é `fora` quando o círculo inteiro está fora. Quando a margem atravessa a
 * borda, o veredito é `incerto` — e ponto incerto não prova retorno sozinho.
 * As demais condições cumulativas do COR §13.1 continuam valendo por cima.
 */
export function evaluateAgainstGeofence(args: {
  point: GeoPoint;
  accuracy_m: number;
  center: GeoPoint;
  radius_m: number;
}): GeofenceEvaluation {
  const distance_m = distanceMeters(args.point, args.center);
  const acc = Math.max(0, args.accuracy_m);

  if (distance_m + acc <= args.radius_m) {
    return {
      verdict: "dentro",
      distance_m,
      accuracy_m: acc,
      reason: "margem de erro inteira dentro da cerca",
    };
  }
  if (distance_m - acc > args.radius_m) {
    return {
      verdict: "fora",
      distance_m,
      accuracy_m: acc,
      reason: "margem de erro inteira fora da cerca",
    };
  }
  return {
    verdict: "incerto",
    distance_m,
    accuracy_m: acc,
    reason: "margem de erro atravessa a borda da cerca — não serve como prova isolada",
  };
}

/**
 * Modelo de configuração para o César preencher. Coordenada permanece zerada
 * de propósito: a validação recusa 0,0, então um arquivo copiado sem edição
 * falha em vez de fingir que funciona.
 */
export const ITAIM_CONFIG_TEMPLATE: UnitConfig = {
  unit_id: PILOT_UNIT_ID,
  display_name: PILOT_UNIT_REFERENCE.display_name,
  reference_address: PILOT_UNIT_REFERENCE.reference_address,
  latitude: 0,
  longitude: 0,
  return_radius_m: 80,
  arrival_radius_m: 60,
  max_accuracy_m: 100,
  minimum_dwell_s: 60,
  max_return_speed_mps: 1.5,
  max_freshness_s: 90,
  policy_version: "itaim@1",
  active: false,
};
