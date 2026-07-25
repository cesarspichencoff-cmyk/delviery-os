/**
 * Captura adaptativa — quanto e com que precisão pedir posição, conforme o
 * momento da viagem.
 *
 * Frequência fixa é errada dos dois lados: gasta bateria com o motoboy parado
 * e perde a chegada quando ele está andando rápido. Aqui a cadência responde
 * a movimento, velocidade, precisão, bateria, proximidade da parada e
 * proximidade da loja.
 *
 * Duas regras que o adendo faz questão e que estão codificadas, não sugeridas:
 *  - bateria crítica reduz a frequência SEM ESCONDER a degradação — a decisão
 *    carrega `degraded: true` e um motivo legível;
 *  - GPS impreciso não aumenta a confiança artificialmente — pedir mais
 *    amostras não torna um ponto ruim melhor, e o motivo diz isso.
 *
 * Todos os números vivem em política versionada. Nenhum literal solto.
 */

import type { GeoPoint } from "./types";
import { distanceMeters } from "./detection";

/** Precisão pedida ao provedor — espelha as prioridades do Android. */
export const CAPTURE_ACCURACY_MODES = ["high", "balanced", "low", "passive"] as const;
export type CaptureAccuracyMode = (typeof CAPTURE_ACCURACY_MODES)[number];

/** Situação da viagem que muda a cadência. */
export const CAPTURE_CONTEXTS = [
  "em_movimento",
  "parado",
  "proximo_da_parada",
  "retornando_a_loja",
  "proximo_da_loja",
  "sem_movimento_prolongado",
  "bateria_critica",
  "sinal_impreciso",
] as const;
export type CaptureContext = (typeof CAPTURE_CONTEXTS)[number];

export interface AdaptiveCapturePolicy {
  /** Versão da política — muda a cada calibração, para auditoria. */
  version: string;
  /** Intervalos em segundos por situação. */
  interval_s: Record<CaptureContext, number>;
  accuracy: Record<CaptureContext, CaptureAccuracyMode>;
  /** Acima disto o motoboy é considerado em movimento (m/s). */
  moving_speed_mps: number;
  /** Sem deslocamento maior que isto, considera-se parado (m). */
  still_distance_m: number;
  /** Tempo parado a partir do qual a cadência cai de vez (s). */
  prolonged_still_s: number;
  /** Distância da parada em que vale pedir mais precisão (m). */
  near_stop_m: number;
  /** Distância da loja em que a precisão precisa servir ao geofence (m). */
  near_unit_m: number;
  /** Abaixo disto a bateria é crítica (0..1). */
  critical_battery: number;
  /** Acima disto a posição é imprecisa demais para adiantar cadência (m). */
  poor_accuracy_m: number;
  /** Teto de segurança: nunca ficar mais que isto sem tentar (s). */
  max_interval_s: number;
}

/**
 * Ponto de partida do piloto ITAIM. É um chute honesto para começar, não uma
 * verdade calibrada — o primeiro turno é que dá os números reais.
 */
export const DEFAULT_ADAPTIVE_POLICY: AdaptiveCapturePolicy = {
  version: "adaptive@1.0.0-piloto",
  interval_s: {
    em_movimento: 15,
    parado: 45,
    proximo_da_parada: 10,
    retornando_a_loja: 20,
    proximo_da_loja: 10,
    sem_movimento_prolongado: 120,
    bateria_critica: 90,
    sinal_impreciso: 30,
  },
  accuracy: {
    em_movimento: "balanced",
    parado: "low",
    proximo_da_parada: "high",
    retornando_a_loja: "balanced",
    proximo_da_loja: "high",
    sem_movimento_prolongado: "low",
    bateria_critica: "low",
    sinal_impreciso: "balanced",
  },
  moving_speed_mps: 1.5,
  still_distance_m: 20,
  prolonged_still_s: 300,
  near_stop_m: 150,
  near_unit_m: 200,
  critical_battery: 0.15,
  poor_accuracy_m: 100,
  max_interval_s: 180,
};

export interface CaptureSituation {
  /** Estado da viagem: retorno muda a prioridade. */
  returning: boolean;
  speed_mps?: number;
  accuracy_m?: number;
  /** Deslocamento desde o último ponto aceito. */
  distance_since_last_m?: number;
  /** Segundos desde o último ponto aceito. */
  seconds_since_last?: number;
  /** Segundos sem deslocamento relevante. */
  still_for_s?: number;
  /** 0..1. Ausente quando o runtime não informa — nunca inventado. */
  battery_level?: number;
  battery_saver?: boolean;
  current?: GeoPoint;
  next_stop?: GeoPoint;
  unit?: GeoPoint;
}

export interface CaptureDecision {
  context: CaptureContext;
  interval_s: number;
  accuracy: CaptureAccuracyMode;
  /** true quando a cadência foi reduzida por limitação, não por escolha. */
  degraded: boolean;
  /** Explicação curta e honesta — vai para diagnóstico, não para o motoboy. */
  reason: string;
  policy_version: string;
}

/**
 * Decide a cadência. Ordem de precedência deliberada: limitações primeiro
 * (bateria, sinal), depois oportunidades (proximidade), depois o normal.
 * Uma limitação nunca é mascarada por uma oportunidade.
 */
export function decideCapture(
  s: CaptureSituation,
  policy: AdaptiveCapturePolicy = DEFAULT_ADAPTIVE_POLICY,
): CaptureDecision {
  const build = (
    context: CaptureContext,
    degraded: boolean,
    reason: string,
  ): CaptureDecision => ({
    context,
    interval_s: Math.min(policy.interval_s[context], policy.max_interval_s),
    accuracy: policy.accuracy[context],
    degraded,
    reason,
    policy_version: policy.version,
  });

  // 1. Bateria crítica vence tudo — e aparece como degradação.
  if (
    (typeof s.battery_level === "number" && s.battery_level <= policy.critical_battery) ||
    s.battery_saver === true
  ) {
    return build(
      "bateria_critica",
      true,
      typeof s.battery_level === "number" && s.battery_level <= policy.critical_battery
        ? "bateria crítica: cadência reduzida para o aparelho durar a viagem"
        : "economia de bateria ativa no aparelho: cadência reduzida pelo sistema",
    );
  }

  // 2. Sinal ruim: não adianta pedir mais rápido, e não vamos fingir confiança.
  if (typeof s.accuracy_m === "number" && s.accuracy_m > policy.poor_accuracy_m) {
    return build(
      "sinal_impreciso",
      true,
      "precisão acima do limite utilizável: amostrar mais não melhora o ponto",
    );
  }

  // 3. Parado há muito tempo: cadência mínima, sem perder o teto de segurança.
  if (
    typeof s.still_for_s === "number" &&
    s.still_for_s >= policy.prolonged_still_s
  ) {
    return build(
      "sem_movimento_prolongado",
      false,
      "sem deslocamento relevante há bastante tempo: cadência longa",
    );
  }

  // 4. Perto da loja: a precisão tem de servir ao geofence e ao dwell.
  if (s.current && s.unit) {
    const d = distanceMeters(s.current, s.unit);
    if (d <= policy.near_unit_m) {
      return build(
        "proximo_da_loja",
        false,
        "próximo da unidade: precisão suficiente para geofence e permanência",
      );
    }
  }

  // 5. Perto da parada: vale pagar precisão por pouco tempo.
  if (s.current && s.next_stop) {
    const d = distanceMeters(s.current, s.next_stop);
    if (d <= policy.near_stop_m) {
      return build("proximo_da_parada", false, "próximo da parada: precisão temporária alta");
    }
  }

  if (s.returning) {
    return build("retornando_a_loja", false, "em retorno: cadência de rota");
  }

  const moving =
    (typeof s.speed_mps === "number" && s.speed_mps >= policy.moving_speed_mps) ||
    (typeof s.distance_since_last_m === "number" &&
      s.distance_since_last_m >= policy.still_distance_m);

  return moving
    ? build("em_movimento", false, "em deslocamento: cadência normal de rota")
    : build("parado", false, "sem deslocamento relevante: cadência reduzida");
}

/**
 * Validação da política — faixas, não opinião. Política inválida não entra em
 * operação; o chamador cai no default e registra o problema.
 */
export function validateAdaptivePolicy(p: AdaptiveCapturePolicy): string[] {
  const issues: string[] = [];
  if (!p.version || !p.version.trim()) issues.push("version obrigatória");
  for (const ctx of CAPTURE_CONTEXTS) {
    const v = p.interval_s[ctx];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 5 || v > 3600) {
      issues.push(`interval_s.${ctx} fora da faixa 5..3600`);
    }
    if (!CAPTURE_ACCURACY_MODES.includes(p.accuracy[ctx])) {
      issues.push(`accuracy.${ctx} inválida`);
    }
  }
  if (p.critical_battery < 0 || p.critical_battery > 1) {
    issues.push("critical_battery fora de 0..1");
  }
  if (p.max_interval_s < 30 || p.max_interval_s > 3600) {
    issues.push("max_interval_s fora da faixa 30..3600");
  }
  return issues;
}

/* ------------------------------------------------------------------ *
 * Reconhecimento de movimento (§1.6) — atrás de flag, sempre auxiliar
 * ------------------------------------------------------------------ */

export const ACTIVITY_STATES = [
  "em_veiculo",
  "bicicleta",
  "a_pe",
  "parado",
  "desconhecido",
] as const;
export type ActivityState = (typeof ACTIVITY_STATES)[number];

export interface ActivityHint {
  state: ActivityState;
  /** 0..100, como o Android reporta. */
  confidence: number;
  observed_at: string;
}

/**
 * O reconhecimento de atividade só serve para AJUSTAR CADÊNCIA. Ele não
 * confirma entrega, não gera ranking, não afirma fraude, não substitui GPS e
 * não decide retorno — por isso a única saída deste módulo é um palpite de
 * movimento, e nada mais.
 *
 * Confiança baixa devolve `undefined`: melhor não opinar do que opinar mal.
 */
export function activityMovementHint(
  hint: ActivityHint | undefined,
  enabled: boolean,
  minConfidence = 70,
): boolean | undefined {
  if (!enabled || !hint) return undefined;
  if (hint.confidence < minConfidence) return undefined;
  switch (hint.state) {
    case "em_veiculo":
    case "bicicleta":
    case "a_pe":
      return true;
    case "parado":
      return false;
    default:
      return undefined;
  }
}
