/**
 * Entregas public contract -> Platform EventEnvelope, SOMENTE em shadow.
 *
 * Esta fronteira é deliberadamente conservadora. Uma Trip pode conter várias
 * Deliveries; portanto fato de uma Delivery não pode, por conveniência, virar
 * estado da Trip inteira na Operação Viva.
 *
 * Equivalências seguras:
 *   trip_created          -> trip_created
 *   trip_started          -> trip_started
 *   trip_return_started   -> trip_return_started
 *   trip_closed_*         -> trip_closed
 *
 * Não equivalentes por desenho:
 *   arrival_detected / delivery_confirmed / delivery_unconfirmed (por stop)
 *   return_detected (evidência de retorno, não "trip_returned")
 *   handoff / occurrence / sinais auxiliares
 *
 * Sem source_mode explícito ou trip_id, não existe adaptação.
 */

import type { EntregasPublicEvent } from "../../entregas/contracts/events/types";
import type { EventEnvelope, EventType } from "../contracts/event-catalog";

const MAPA_SEGURO: Readonly<Record<string, EventType>> = {
  trip_created: "trip_created",
  trip_started: "trip_started",
  trip_return_started: "trip_return_started",
  trip_closed_automatic: "trip_closed",
  trip_closed_manual: "trip_closed",
};

export type MotivoNaoAdaptado =
  | "source_mode_ausente"
  | "trip_id_ausente"
  | "tipo_sem_equivalencia_segura";

export type ResultadoAdaptacaoEntregas =
  | {
      readonly ok: true;
      readonly evento: EventEnvelope;
      readonly source_event_type: string;
    }
  | {
      readonly ok: false;
      readonly event_id: string;
      readonly source_event_type: string;
      readonly motivo: MotivoNaoAdaptado;
    };

export function adaptarEventoPublicoEntregas(
  e: EntregasPublicEvent,
): ResultadoAdaptacaoEntregas {
  const alvo = MAPA_SEGURO[e.event_type];
  if (!alvo) {
    return {
      ok: false,
      event_id: e.event_id,
      source_event_type: e.event_type,
      motivo: "tipo_sem_equivalencia_segura",
    };
  }

  if (!e.source_mode) {
    return {
      ok: false,
      event_id: e.event_id,
      source_event_type: e.event_type,
      motivo: "source_mode_ausente",
    };
  }

  if (!e.trip_id?.trim()) {
    return {
      ok: false,
      event_id: e.event_id,
      source_event_type: e.event_type,
      motivo: "trip_id_ausente",
    };
  }

  const evento: EventEnvelope = {
    event_id: e.event_id,
    event_type: alvo,
    event_version: alvo + "@1.0.0",
    unit_id: e.unit_id,
    trip_id: e.trip_id,
    occurred_at: e.occurred_at,
    origin: "source",
    source_mode: e.source_mode,
    idempotency_key: "entregas-public:" + e.idempotency_key,
    correlation_id: e.correlation_id,
    causation_id: e.causation_id,
    payload: {
      source_event_type: e.event_type,
      public_recorded_at: e.recorded_at,
      ...(e.contract_version
        ? { entregas_contract_version: e.contract_version }
        : {}),
    },
  };

  return {
    ok: true,
    evento,
    source_event_type: e.event_type,
  };
}

export function adaptarLotePublicoEntregas(
  eventos: readonly EntregasPublicEvent[],
): {
  readonly eventos: readonly EventEnvelope[];
  readonly recusados: readonly Exclude<ResultadoAdaptacaoEntregas, { ok: true }>[];
} {
  const adaptados = eventos.map(adaptarEventoPublicoEntregas);
  return {
    eventos: adaptados
      .filter((r): r is Extract<ResultadoAdaptacaoEntregas, { ok: true }> => r.ok)
      .map((r) => r.evento),
    recusados: adaptados.filter(
      (r): r is Exclude<ResultadoAdaptacaoEntregas, { ok: true }> => !r.ok,
    ),
  };
}
