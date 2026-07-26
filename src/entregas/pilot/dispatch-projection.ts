/**
 * Projeção de localização para a central de despacho.
 *
 * O que o operador precisa saber, na ordem em que precisa: **a informação
 * está boa?** antes de **onde está?**. Uma posição de 20 minutos atrás
 * apresentada como atual é pior que nenhuma posição — o operador tomaria
 * decisão com base em algo falso.
 *
 * Por isso `freshness` é sempre calculado e sempre devolvido, mesmo para
 * papel que não pode ver coordenada. Saber que o motoboy está sem sinal há
 * 10 minutos não expõe ninguém, e é justamente o que faz o operador ligar
 * para ele.
 */

import type { GPSPoint, GpsFreshness, GpsPolicy } from "../gps/types";
import { DEFAULT_GPS_POLICY } from "../gps/types";

export interface DispatchLocation {
  freshness: GpsFreshness;
  /** Frase pronta para a tela. */
  label: string;
  /** Idade da última posição, em segundos. */
  age_s?: number;
  /** Precisão aproximada, arredondada. Não é coordenada. */
  accuracy_m?: number;
  /** Quantos pontos a viagem já produziu. */
  point_count: number;
  /** true quando a última posição é boa o suficiente para decidir. */
  usable: boolean;
}

const LABELS: Record<GpsFreshness, string> = {
  current: "Posição atual",
  stale: "Posição antiga",
  inaccurate: "Posição imprecisa",
  offline: "Sem rede — pontos represados no aparelho",
  permission_denied: "Motoboy não autorizou a localização",
  unavailable: "Sem sinal de GPS",
  unknown: "Sem posição nesta viagem",
};

/**
 * Classifica a última posição.
 *
 * `stale` antes de `inaccurate` de propósito: um ponto velho E impreciso é,
 * antes de tudo, velho — é isso que o operador precisa agir sobre.
 */
export function freshnessOf(
  last: GPSPoint | undefined,
  pointCount: number,
  now: Date,
  policy: GpsPolicy = DEFAULT_GPS_POLICY,
): DispatchLocation {
  if (!last) {
    return {
      freshness: "unknown",
      label: LABELS.unknown,
      point_count: pointCount,
      usable: false,
    };
  }

  const age_s = Math.max(0, Math.round((now.getTime() - Date.parse(last.occurred_at)) / 1000));
  const accuracy_m = Math.round(last.accuracy_m);

  let freshness: GpsFreshness;
  if (age_s > policy.signal_lost_after_s) freshness = "unavailable";
  else if (age_s > policy.freshness_window_s) freshness = "stale";
  else if (last.quality === "unusable") freshness = "inaccurate";
  else if (last.accuracy_m > policy.max_accuracy_good_m) freshness = "inaccurate";
  else freshness = "current";

  return {
    freshness,
    label: LABELS[freshness],
    age_s,
    accuracy_m,
    point_count: pointCount,
    usable: freshness === "current",
  };
}

/** Texto curto de idade, para a tela não obrigar o operador a fazer conta. */
export function ageLabel(age_s: number | undefined): string {
  if (age_s == null) return "sem atualização";
  if (age_s < 60) return `há ${age_s}s`;
  const m = Math.round(age_s / 60);
  return m < 60 ? `há ${m} min` : "há mais de 1 h";
}
