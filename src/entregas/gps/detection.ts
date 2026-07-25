/**
 * Motor de detecção GPS — puro, sem I/O, 100% testável.
 *
 * Este é o PRODUTOR REAL de evidência que faltava. Antes desta implementação,
 * `closeTripAutomatic` declarava no próprio comentário: "F0: condições GPS
 * omitidas — caller só invoca quando evidência cumulativa OK", e qualquer
 * chamador podia passar um objeto arbitrário e encerrar a viagem. Agora a
 * evidência é CALCULADA a partir de pontos reais e carrega a prova de como
 * foi obtida.
 *
 * O que este módulo NUNCA faz (COR §11.3, §22.6, §22.12):
 *  - confirmar entrega;
 *  - inferir pagamento, recebimento ou identidade do cliente;
 *  - produzir ranking, score ou métrica de produtividade individual.
 */

import type {
  GeoPoint,
  GPSPoint,
  GpsFreshness,
  GpsPolicy,
  RiderLocationProjection,
} from "./types";

/** Distância em metros pela fórmula de Haversine. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isInsideGeofence(
  point: GeoPoint,
  center: GeoPoint,
  radius_m: number,
): boolean {
  return distanceMeters(point, center) <= radius_m;
}

/** Ordena por occurred_at — nunca confia na ordem de chegada. */
export function sortByOccurredAt(points: readonly GPSPoint[]): GPSPoint[] {
  return points
    .slice()
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
}

/** Só pontos que podem sustentar decisão (COR §13.0). */
export function usablePoints(points: readonly GPSPoint[]): GPSPoint[] {
  return points.filter((p) => p.quality !== "unusable");
}

/**
 * Frescor da posição apresentada. `hasActiveTrip=false` → `unknown`: sem
 * viagem não há o que apresentar (e não deveria haver captura).
 */
export function computeFreshness(args: {
  points: readonly GPSPoint[];
  policy: GpsPolicy;
  now: Date;
  hasActiveTrip: boolean;
  online: boolean;
  permissionDenied?: boolean;
  positionUnavailable?: boolean;
}): { freshness: GpsFreshness; last?: GPSPoint; age_s?: number } {
  const { points, policy, now, hasActiveTrip, online } = args;
  if (!hasActiveTrip) return { freshness: "unknown" };
  if (args.permissionDenied) return { freshness: "permission_denied" };

  const sorted = sortByOccurredAt(usablePoints(points));
  const last = sorted[sorted.length - 1];

  if (!last) {
    // Viagem ativa e nenhum ponto utilizável ainda.
    if (args.positionUnavailable) return { freshness: "unavailable" };
    if (!online) return { freshness: "offline" };
    return { freshness: "unavailable" };
  }

  const age_s = (now.getTime() - Date.parse(last.occurred_at)) / 1000;

  // Offline importa mais que idade: a posição pode ser recente no aparelho,
  // mas o operador precisa saber que não está chegando nada agora.
  if (!online) return { freshness: "offline", last, age_s };
  if (age_s > policy.freshness_window_s) {
    return { freshness: "stale", last, age_s };
  }
  if (last.quality === "degraded") {
    return { freshness: "inaccurate", last, age_s };
  }
  return { freshness: "current", last, age_s };
}

const FRESHNESS_LABEL: Record<GpsFreshness, string> = {
  current: "Localização atual",
  stale: "Posição antiga — não representa onde está agora",
  inaccurate: "Localização imprecisa",
  offline: "Aparelho sem rede — posição pode estar desatualizada",
  permission_denied: "Sem permissão de localização",
  unavailable: "Sem sinal de GPS",
  unknown: "Sem viagem ativa",
};

export function buildLocationProjection(args: {
  trip_id: string;
  points: readonly GPSPoint[];
  policy: GpsPolicy;
  now: Date;
  hasActiveTrip: boolean;
  online: boolean;
  pending_offline: number;
  permissionDenied?: boolean;
  positionUnavailable?: boolean;
}): RiderLocationProjection {
  const f = computeFreshness(args);
  return {
    trip_id: args.trip_id,
    freshness: f.freshness,
    last_point: f.last,
    age_s: f.age_s,
    pending_offline: args.pending_offline,
    route_points: usablePoints(args.points).length,
    label: FRESHNESS_LABEL[f.freshness],
  };
}

/* ------------------------------------------------------------------ *
 * Permanência (dwell)
 * ------------------------------------------------------------------ */

/**
 * Tempo contínuo, em segundos, que os pontos MAIS RECENTES permaneceram
 * dentro do geofence. Sai do cálculo assim que encontra um ponto fora —
 * permanência é contínua por definição.
 */
export function continuousDwellSeconds(args: {
  points: readonly GPSPoint[];
  center: GeoPoint;
  radius_m: number;
  now: Date;
}): { dwell_s: number; samples: number; first_inside?: GPSPoint } {
  const sorted = sortByOccurredAt(usablePoints(args.points));
  if (!sorted.length) return { dwell_s: 0, samples: 0 };

  let firstInsideIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (isInsideGeofence(sorted[i], args.center, args.radius_m)) {
      firstInsideIdx = i;
    } else {
      break;
    }
  }
  if (firstInsideIdx === -1) return { dwell_s: 0, samples: 0 };

  const first = sorted[firstInsideIdx];
  const last = sorted[sorted.length - 1];
  const dwell_s =
    (Date.parse(last.occurred_at) - Date.parse(first.occurred_at)) / 1000;
  return {
    dwell_s: Math.max(0, dwell_s),
    samples: sorted.length - firstInsideIdx,
    first_inside: first,
  };
}

/* ------------------------------------------------------------------ *
 * Chegada — detecção por sistema (COR: arrival_detected é evento de sistema)
 * ------------------------------------------------------------------ */

export interface ArrivalEvaluation {
  detected: boolean;
  reasons: string[];
  distance_m?: number;
  dwell_s?: number;
  accuracy_m?: number;
  evidence_point_ids: string[];
}

/**
 * Avalia chegada ao destino da parada. NUNCA confirma entrega — produz
 * `arrival_detected`, que deixa a parada em `chegada_detectada` (desfecho
 * pendente, COR §9.2/§14.1).
 */
export function evaluateArrival(args: {
  points: readonly GPSPoint[];
  destination: GeoPoint;
  policy: GpsPolicy;
  now: Date;
}): ArrivalEvaluation {
  const { policy } = args;
  const reasons: string[] = [];
  const usable = usablePoints(args.points);
  if (!usable.length) {
    return {
      detected: false,
      reasons: ["sem_pontos_utilizaveis"],
      evidence_point_ids: [],
    };
  }

  const dwell = continuousDwellSeconds({
    points: usable,
    center: args.destination,
    radius_m: policy.stop_geofence_radius_m,
    now: args.now,
  });

  const sorted = sortByOccurredAt(usable);
  const last = sorted[sorted.length - 1];
  const distance_m = distanceMeters(last, args.destination);

  if (distance_m > policy.stop_geofence_radius_m) {
    reasons.push("fora_do_geofence_do_destino");
  }
  if (last.accuracy_m > policy.max_accuracy_usable_m) {
    reasons.push("accuracy_insuficiente");
  }
  if (dwell.dwell_s < policy.min_dwell_arrival_s) {
    reasons.push("permanencia_insuficiente");
  }

  const evidence = sorted
    .filter((p) =>
      isInsideGeofence(p, args.destination, policy.stop_geofence_radius_m),
    )
    .map((p) => p.point_id);

  return {
    detected: reasons.length === 0,
    reasons,
    distance_m,
    dwell_s: dwell.dwell_s,
    accuracy_m: last.accuracy_m,
    evidence_point_ids: evidence,
  };
}

/* ------------------------------------------------------------------ *
 * Retorno — produtor real da evidência exigida por closeTripAutomatic
 * ------------------------------------------------------------------ */

/**
 * Formato exato exigido por `DetectReturnCmd.evidence`
 * (operational/commands.ts). Os campos de limite viajam junto com os
 * medidos: quem auditar vê o valor E o critério aplicado.
 */
export interface ReturnEvidence {
  in_store_geofence: boolean;
  accuracy_error_m: number;
  max_horizontal_accuracy_m: number;
  dwell_s: number;
  min_dwell_s: number;
  speed_mps: number;
  max_speed_mps: number;
  gps_recent: boolean;
}

export interface ReturnEvaluation {
  detected: boolean;
  /** Motivos da recusa — vazio quando detected=true. */
  reasons: string[];
  evidence: ReturnEvidence;
  /** Prova de proveniência: quais pontos sustentaram a decisão. */
  evidence_point_ids: string[];
  samples: number;
  detected_at?: string;
}

/**
 * Avalia retorno à loja com TODAS as condições cumulativas do COR §13.1.
 * Devolve sempre a evidência preenchida — mesmo quando recusa — para que a
 * recusa também seja auditável.
 */
export function evaluateReturn(args: {
  points: readonly GPSPoint[];
  store: GeoPoint;
  policy: GpsPolicy;
  now: Date;
  /** Exceção explícita que impede retorno automático (COR §13.1). */
  blockingException?: boolean;
}): ReturnEvaluation {
  const { policy } = args;
  const reasons: string[] = [];
  const usable = usablePoints(args.points);
  const sorted = sortByOccurredAt(usable);
  const last = sorted[sorted.length - 1];

  const dwell = continuousDwellSeconds({
    points: usable,
    center: args.store,
    radius_m: policy.store_geofence_radius_m,
    now: args.now,
  });

  const in_store_geofence = last
    ? isInsideGeofence(last, args.store, policy.store_geofence_radius_m)
    : false;
  const accuracy_error_m = last ? last.accuracy_m : Number.POSITIVE_INFINITY;
  const age_s = last
    ? (args.now.getTime() - Date.parse(last.occurred_at)) / 1000
    : Number.POSITIVE_INFINITY;
  const gps_recent = age_s <= policy.freshness_window_s;
  // Ausência de velocidade não vira "parado" por otimismo: sem dado, o
  // critério de velocidade não é dado por satisfeito.
  const speed_mps = last?.speed_mps ?? Number.POSITIVE_INFINITY;

  if (!last) reasons.push("sem_pontos_utilizaveis");
  if (last && !in_store_geofence) reasons.push("fora_do_geofence_da_loja");
  if (!gps_recent) reasons.push("gps_desatualizado");
  if (accuracy_error_m > policy.max_accuracy_usable_m) {
    reasons.push("accuracy_insuficiente");
  }
  if (dwell.dwell_s < policy.min_dwell_return_s) {
    reasons.push("permanencia_insuficiente");
  }
  if (speed_mps > policy.max_speed_return_mps) {
    reasons.push("velocidade_acima_do_limite");
  }
  if (dwell.samples < policy.min_samples_return) {
    reasons.push("amostras_insuficientes");
  }
  if (args.blockingException) reasons.push("excecao_bloqueante");

  const evidence: ReturnEvidence = {
    in_store_geofence,
    accuracy_error_m,
    max_horizontal_accuracy_m: policy.max_accuracy_usable_m,
    dwell_s: dwell.dwell_s,
    min_dwell_s: policy.min_dwell_return_s,
    speed_mps,
    max_speed_mps: policy.max_speed_return_mps,
    gps_recent,
  };

  return {
    detected: reasons.length === 0,
    reasons,
    evidence,
    evidence_point_ids: sorted
      .filter((p) =>
        isInsideGeofence(p, args.store, policy.store_geofence_radius_m),
      )
      .map((p) => p.point_id),
    samples: dwell.samples,
    detected_at: reasons.length === 0 ? args.now.toISOString() : undefined,
  };
}

/* ------------------------------------------------------------------ *
 * Sinal perdido / recuperado — trip_signal_lost / trip_signal_recovered
 * ------------------------------------------------------------------ */

export type SignalStatus = "ok" | "lost" | "recovered";

/**
 * Decide se a viagem deve emitir `trip_signal_lost` ou
 * `trip_signal_recovered` (eventos canônicos declarados em enums.ts que
 * nunca eram emitidos antes desta implementação).
 */
export function evaluateSignal(args: {
  points: readonly GPSPoint[];
  policy: GpsPolicy;
  now: Date;
  /** Estado anterior conhecido — evita reemitir o mesmo evento. */
  previouslyLost: boolean;
}): { status: SignalStatus; age_s: number | null } {
  const sorted = sortByOccurredAt(usablePoints(args.points));
  const last = sorted[sorted.length - 1];
  if (!last) {
    return {
      status: args.previouslyLost ? "ok" : "lost",
      age_s: null,
    };
  }
  const age_s = (args.now.getTime() - Date.parse(last.occurred_at)) / 1000;
  const lost = age_s > args.policy.signal_lost_after_s;
  if (lost) return { status: args.previouslyLost ? "ok" : "lost", age_s };
  return { status: args.previouslyLost ? "recovered" : "ok", age_s };
}

/**
 * Amostragem: o ponto novo deve ser guardado? Evita encher a fila com
 * pontos redundantes quando o motoboy está parado (economia de bateria e
 * de dados), preservando cadência mínima de tempo.
 */
export function shouldSample(args: {
  candidate: GeoPoint & { occurred_at: string };
  last?: GPSPoint;
  policy: GpsPolicy;
}): boolean {
  if (!args.last) return true;
  const dt =
    (Date.parse(args.candidate.occurred_at) -
      Date.parse(args.last.occurred_at)) /
    1000;
  if (dt >= args.policy.sample_interval_s) return true;
  const d = distanceMeters(args.candidate, args.last);
  return d >= args.policy.min_distance_m;
}
