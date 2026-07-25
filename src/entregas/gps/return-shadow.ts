/**
 * Modo SHADOW do retorno automático — primeiro turno.
 *
 * Testes unitários passarem não é prova de que a detecção acerta na rua. No
 * primeiro turno o retorno roda em sombra: calcula QUANDO teria encerrado,
 * registra o diagnóstico, e NÃO encerra a viagem. O encerramento continua
 * manual até alguém comparar sombra × realidade e ligar a flag.
 *
 * Este módulo é puro: decide e descreve, nunca executa o fechamento.
 */

import type { GPSPoint, GeoPoint, GpsPolicy } from "./types";
import { evaluateReturn, type ReturnEvaluation } from "./detection";

export type ReturnMode = "shadow" | "active" | "disabled";

export interface ShadowObservation {
  trip_id: string;
  mode: ReturnMode;
  /** A detecção teria disparado agora? */
  would_close: boolean;
  /** Momento em que a sombra observou. */
  observed_at: string;
  /** Momento em que a detecção teria encerrado (primeira vez que deu positivo). */
  would_close_at?: string;
  reasons: string[];
  samples: number;
  evidence_point_ids: string[];
  /** Preenchido quando o humano encerra: permite comparar sombra × real. */
  actual_close_at?: string;
  /** Diferença em segundos entre sombra e fechamento real. */
  delta_s?: number;
}

export interface ShadowDecision {
  /** Deve encerrar a viagem AGORA? Em shadow, sempre false. */
  shouldClose: boolean;
  /** Evidência pronta para `DetectReturnCmd` — só quando shouldClose. */
  evidence?: ReturnEvaluation["evidence"];
  observation: ShadowObservation;
}

/**
 * Avalia o retorno respeitando o modo.
 *
 *  - `disabled`  → nunca fecha, nem observa detecção (sem geofence válida).
 *  - `shadow`    → observa e registra, NUNCA fecha.
 *  - `active`    → fecha quando a evidência real for cumulativamente válida.
 */
export function evaluateReturnWithMode(args: {
  trip_id: string;
  mode: ReturnMode;
  points: readonly GPSPoint[];
  store: GeoPoint;
  policy: GpsPolicy;
  now: Date;
  blockingException?: boolean;
  /** Primeira vez que a sombra deu positivo nesta viagem, se já houve. */
  firstPositiveAt?: string;
}): ShadowDecision {
  const nowIso = args.now.toISOString();

  if (args.mode === "disabled") {
    return {
      shouldClose: false,
      observation: {
        trip_id: args.trip_id,
        mode: "disabled",
        would_close: false,
        observed_at: nowIso,
        reasons: ["deteccao_desabilitada"],
        samples: 0,
        evidence_point_ids: [],
      },
    };
  }

  const ev = evaluateReturn({
    points: args.points,
    store: args.store,
    policy: args.policy,
    now: args.now,
    blockingException: args.blockingException,
  });

  const observation: ShadowObservation = {
    trip_id: args.trip_id,
    mode: args.mode,
    would_close: ev.detected,
    observed_at: nowIso,
    would_close_at: ev.detected ? (args.firstPositiveAt ?? nowIso) : args.firstPositiveAt,
    reasons: ev.reasons,
    samples: ev.samples,
    evidence_point_ids: ev.evidence_point_ids,
  };

  if (args.mode === "shadow") {
    // Observa, registra — e NÃO encerra. Esta é a única diferença que importa.
    return { shouldClose: false, observation };
  }

  return {
    shouldClose: ev.detected,
    evidence: ev.detected ? ev.evidence : undefined,
    observation,
  };
}

/**
 * Compara a sombra com o fechamento manual real — é isto que sustenta a
 * decisão de ligar a flag depois do primeiro turno.
 */
export function compareShadowToActual(
  obs: ShadowObservation,
  actual_close_at: string,
): ShadowObservation {
  const out: ShadowObservation = { ...obs, actual_close_at };
  if (obs.would_close_at) {
    out.delta_s =
      (Date.parse(actual_close_at) - Date.parse(obs.would_close_at)) / 1000;
  }
  return out;
}

/** Resumo legível para o relatório do turno — sem coordenadas. */
export function summarizeShadow(observations: readonly ShadowObservation[]): {
  total: number;
  would_close: number;
  never_positive: number;
  avg_delta_s: number | null;
  top_reasons: Record<string, number>;
} {
  const withDelta = observations.filter((o) => typeof o.delta_s === "number");
  const reasons: Record<string, number> = {};
  for (const o of observations) {
    for (const r of o.reasons) reasons[r] = (reasons[r] ?? 0) + 1;
  }
  return {
    total: observations.length,
    would_close: observations.filter((o) => o.would_close).length,
    never_positive: observations.filter((o) => !o.would_close_at).length,
    avg_delta_s: withDelta.length
      ? withDelta.reduce((s, o) => s + (o.delta_s ?? 0), 0) / withDelta.length
      : null,
    top_reasons: reasons,
  };
}
