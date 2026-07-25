/**
 * Trilha operacional — projeção DERIVADA dos pontos brutos.
 *
 * Regra que organiza o arquivo inteiro: o ponto bruto é imutável e continua
 * sendo a fonte histórica. Nada aqui reescreve `GPSPoint`. O que se produz é
 * uma segunda leitura, rotulada, que a tela pode mostrar sem confundir o
 * operador sobre o que é observação e o que é interpretação.
 *
 * A interface precisa distinguir quatro coisas, e por isso elas são tipos
 * diferentes e não um booleano:
 *   bruto · operacional derivado · ajustado à rua (map matching) · sem confiança.
 */

import type { GPSPoint, GpsPolicy } from "./types";
import { DEFAULT_GPS_POLICY } from "./types";
import { distanceMeters } from "./detection";

/** De onde veio a linha que está na tela. */
export const TRACK_LAYERS = ["bruto", "operacional", "ajustado_rua"] as const;
export type TrackLayer = (typeof TRACK_LAYERS)[number];

/** Por que um ponto foi tirado da trilha operacional. */
export const TRACK_EXCLUSIONS = [
  "precisao_inutilizavel",
  "salto_impossivel",
  "regresso_no_tempo",
  "ponto_simulado",
] as const;
export type TrackExclusion = (typeof TRACK_EXCLUSIONS)[number];

export interface OperationalPoint {
  /** Referência ao bruto — nunca uma cópia editada. */
  point_id: string;
  latitude: number;
  longitude: number;
  occurred_at: string;
  accuracy_m: number;
  /** 0..1. Quanto este ponto merece crédito na leitura operacional. */
  confidence: number;
  /** Velocidade entre este ponto e o anterior, quando calculável (m/s). */
  derived_speed_mps?: number;
}

export interface ExcludedPoint {
  point_id: string;
  reason: TrackExclusion;
  detail?: string;
}

export interface TrackProjection {
  layer: TrackLayer;
  trip_id: string;
  points: OperationalPoint[];
  excluded: ExcludedPoint[];
  /** Confiança agregada da trilha. */
  confidence: number;
  /** true quando não há material suficiente para afirmar uma rota. */
  insufficient: boolean;
  /** Frase honesta para a tela quando `insufficient`. */
  note?: string;
  /** Contagem do bruto — a fonte nunca muda de tamanho por causa desta leitura. */
  raw_count: number;
}

/**
 * Velocidade acima da qual o salto é fisicamente implausível para um motoboy
 * urbano. Serve para pegar erro de posicionamento, não para julgar conduta —
 * o ponto sai da leitura operacional e continua no histórico bruto.
 */
const IMPLAUSIBLE_SPEED_MPS = 40; // ~144 km/h

/** Peso por precisão: ponto preciso vale mais, ponto ruim vale pouco. */
function accuracyConfidence(accuracy_m: number, policy: GpsPolicy): number {
  if (accuracy_m <= policy.max_accuracy_good_m) return 1;
  if (accuracy_m >= policy.max_accuracy_usable_m) return 0.2;
  const span = policy.max_accuracy_usable_m - policy.max_accuracy_good_m;
  const over = accuracy_m - policy.max_accuracy_good_m;
  return Math.max(0.2, 1 - (over / span) * 0.8);
}

/**
 * Constrói a trilha operacional a partir do bruto.
 *
 * Descarta apenas o que é incoerente — e diz por quê. Não suaviza a ponto de
 * inventar caminho: a "suavização" aqui é exclusão explícita de outlier, não
 * interpolação de posição que ninguém observou.
 */
export function buildOperationalTrack(
  trip_id: string,
  raw: readonly GPSPoint[],
  policy: GpsPolicy = DEFAULT_GPS_POLICY,
): TrackProjection {
  const points: OperationalPoint[] = [];
  const excluded: ExcludedPoint[] = [];

  const ordered = [...raw].sort(
    (a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at),
  );

  let previous: { p: GPSPoint; t: number } | null = null;

  for (const p of ordered) {
    if (p.quality === "unusable") {
      excluded.push({
        point_id: p.point_id,
        reason: "precisao_inutilizavel",
        detail: `accuracy ${Math.round(p.accuracy_m)} m`,
      });
      continue;
    }

    const t = Date.parse(p.occurred_at);
    let derived_speed_mps: number | undefined;

    if (previous) {
      const dt = (t - previous.t) / 1000;
      if (dt < 0) {
        excluded.push({ point_id: p.point_id, reason: "regresso_no_tempo" });
        continue;
      }
      if (dt > 0) {
        const d = distanceMeters(
          { latitude: previous.p.latitude, longitude: previous.p.longitude },
          { latitude: p.latitude, longitude: p.longitude },
        );
        derived_speed_mps = d / dt;
        if (derived_speed_mps > IMPLAUSIBLE_SPEED_MPS) {
          excluded.push({
            point_id: p.point_id,
            reason: "salto_impossivel",
            detail: `${Math.round(derived_speed_mps)} m/s entre pontos`,
          });
          continue;
        }
      }
    }

    points.push({
      point_id: p.point_id,
      latitude: p.latitude,
      longitude: p.longitude,
      occurred_at: p.occurred_at,
      accuracy_m: p.accuracy_m,
      confidence: accuracyConfidence(p.accuracy_m, policy),
      derived_speed_mps,
    });
    previous = { p, t };
  }

  const confidence = points.length
    ? points.reduce((acc, p) => acc + p.confidence, 0) / points.length
    : 0;

  // Menos de dois pontos não é rota — é uma posição. Dizer "rota" seria mentir.
  const insufficient = points.length < 2 || confidence < 0.3;

  return {
    layer: "operacional",
    trip_id,
    points,
    excluded,
    confidence: Number(confidence.toFixed(3)),
    insufficient,
    note: insufficient
      ? points.length < 2
        ? "pontos insuficientes para desenhar a rota"
        : "pontos com precisão baixa demais para afirmar a rota"
      : undefined,
    raw_count: raw.length,
  };
}

/**
 * Camada bruta para a tela — passa adiante o que foi observado, sem juízo.
 * Existe para o operador poder comparar as duas linhas.
 */
export function buildRawTrack(
  trip_id: string,
  raw: readonly GPSPoint[],
): TrackProjection {
  const points = [...raw]
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))
    .map((p) => ({
      point_id: p.point_id,
      latitude: p.latitude,
      longitude: p.longitude,
      occurred_at: p.occurred_at,
      accuracy_m: p.accuracy_m,
      confidence: 1,
    }));
  return {
    layer: "bruto",
    trip_id,
    points,
    excluded: [],
    confidence: 1,
    insufficient: points.length < 2,
    note: points.length < 2 ? "pontos insuficientes para desenhar a rota" : undefined,
    raw_count: raw.length,
  };
}
