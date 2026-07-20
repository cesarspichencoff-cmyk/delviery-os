import { CONTRACT_VERSION_FULL } from "./contract";
import type { InternalRiderActorId } from "./brands";
import type { PilotPolicy } from "./policy";
import type { InMemoryEventLog } from "./event-log";
import {
  activeDeliveriesResolved,
  applyG3OnReturnStarted,
  removeDelivery,
} from "./delivery-rules";
import type { Delivery, DomainEvent, Trip } from "./types";
import { DomainError, type ApplyResult } from "./types";
import type { TripState } from "./enums";

export interface CreateTripInput {
  trip_id: string;
  unit_id: string;
  /** Motoboy da casa — InternalRiderActorId somente */
  courier_actor_id: InternalRiderActorId;
  created_by: string;
  occurred_at: string;
  policy: PilotPolicy;
  initial_deliveries: Array<{
    delivery_id: string;
    order_ref: string;
    channel?: Delivery["channel"];
  }>;
}

export interface TripAggregate {
  trip: Trip;
  deliveries: Map<string, Delivery>;
}

function logEvent(
  log: InMemoryEventLog,
  partial: Parameters<InMemoryEventLog["append"]>[0],
): DomainEvent {
  return log.append(partial).event;
}

export function createTrip(
  log: InMemoryEventLog,
  input: CreateTripInput,
): ApplyResult<TripAggregate> {
  const { policy } = input;
  if (input.initial_deliveries.length > policy.max_stops) {
    return {
      ok: false,
      error: new DomainError(
        "MAX_STOPS_EXCEEDED",
        `Máximo de paradas do piloto: ${policy.max_stops} (configurável; não hardcoded no schema)`,
      ),
    };
  }
  if (input.initial_deliveries.length < 1) {
    return {
      ok: false,
      error: new DomainError(
        "PRECONDITION_FAILED",
        "Trip requer ao menos um delivery na formação (ou formação em curso — F0 exige ≥1)",
      ),
    };
  }

  const deliveries = new Map<string, Delivery>();
  const delivery_ids: string[] = [];
  input.initial_deliveries.forEach((d, i) => {
    delivery_ids.push(d.delivery_id);
    deliveries.set(d.delivery_id, {
      delivery_id: d.delivery_id,
      trip_id: input.trip_id,
      order_ref: d.order_ref,
      channel: d.channel ?? "proprio",
      planned_stop_order: i + 1,
      state: "aguardando_saida",
      active: true,
    });
  });

  const ev = logEvent(log, {
    object_type: "trip",
    object_id: input.trip_id,
    event_type: "trip_created",
    occurred_at: input.occurred_at,
    origin: "ops_console",
    actor_id: input.created_by,
    idempotency_key: `trip_created:${input.trip_id}`,
    payload: {
      unit_id: input.unit_id,
      courier_actor_id: input.courier_actor_id,
      delivery_ids,
    },
  });

  for (const id of delivery_ids) {
    logEvent(log, {
      object_type: "delivery",
      object_id: id,
      event_type: "delivery_added",
      occurred_at: input.occurred_at,
      origin: "ops_console",
      actor_id: input.created_by,
      idempotency_key: `delivery_added:${input.trip_id}:${id}`,
      payload: { trip_id: input.trip_id },
    });
  }

  const trip: Trip = {
    trip_id: input.trip_id,
    unit_id: input.unit_id,
    courier_actor_id: input.courier_actor_id,
    created_by: input.created_by,
    state: "preparando_saida",
    delivery_ids,
    created_at: input.occurred_at,
    last_event_id: ev.event_id,
    contract_version: CONTRACT_VERSION_FULL,
    policy_bundle_id: policy.policy_bundle_id,
  };

  return { ok: true, state: { trip, deliveries }, events: log.forObject("trip", input.trip_id) };
}

export function startTrip(
  log: InMemoryEventLog,
  agg: TripAggregate,
  occurred_at: string,
  actor_id: string,
): ApplyResult<TripAggregate> {
  if (agg.trip.state !== "preparando_saida") {
    return {
      ok: false,
      error: new DomainError(
        "INVALID_TRANSITION",
        `trip_started de ${agg.trip.state}`,
      ),
    };
  }
  const active = [...agg.deliveries.values()].filter((d) => d.active);
  if (active.length === 0) {
    return {
      ok: false,
      error: new DomainError("NO_ACTIVE_DELIVERIES", "Sem deliveries ativos"),
    };
  }

  const ev = logEvent(log, {
    object_type: "trip",
    object_id: agg.trip.trip_id,
    event_type: "trip_started",
    occurred_at,
    origin: "device",
    actor_id,
    idempotency_key: `trip_started:${agg.trip.trip_id}`,
  });

  const deliveries = new Map(agg.deliveries);
  for (const d of active) {
    deliveries.set(d.delivery_id, { ...d, state: "em_rota" });
    logEvent(log, {
      object_type: "delivery",
      object_id: d.delivery_id,
      event_type: "delivery_departed",
      occurred_at,
      origin: "system",
      idempotency_key: `delivery_departed:${d.delivery_id}:${agg.trip.trip_id}`,
      payload: { via: "trip_started" },
    });
  }

  return {
    ok: true,
    state: {
      trip: {
        ...agg.trip,
        state: "em_rota",
        started_at: occurred_at,
        last_event_id: ev.event_id,
      },
      deliveries,
    },
    events: [ev],
  };
}

/**
 * trip_return_started: em_rota → retornando
 * NÃO exige require_all_active_stops_resolved (COR D-301).
 * G3: pode gerar entrega_sem_confirmacao em active sem desfecho.
 */
export function startReturn(
  log: InMemoryEventLog,
  agg: TripAggregate,
  occurred_at: string,
  actor_id: string,
  policy: PilotPolicy,
): ApplyResult<TripAggregate> {
  void policy; // policy.require_all_active_stops_resolved NÃO se aplica aqui
  if (agg.trip.state !== "em_rota") {
    return {
      ok: false,
      error: new DomainError(
        "INVALID_TRANSITION",
        `trip_return_started de ${agg.trip.state}`,
      ),
    };
  }

  const ev = logEvent(log, {
    object_type: "trip",
    object_id: agg.trip.trip_id,
    event_type: "trip_return_started",
    occurred_at,
    origin: "device",
    actor_id,
    idempotency_key: `trip_return_started:${agg.trip.trip_id}`,
    payload: {
      require_all_active_stops_resolved: false,
      note: "COR: não exige stops resolvidos para iniciar retorno",
    },
  });

  let list = [...agg.deliveries.values()];
  list = applyG3OnReturnStarted(list, occurred_at);
  const deliveries = new Map(list.map((d) => [d.delivery_id, d]));

  for (const d of list) {
    if (d.state === "entrega_sem_confirmacao" && d.unconfirmed_trigger === "G3_trip_returning") {
      logEvent(log, {
        object_type: "delivery",
        object_id: d.delivery_id,
        event_type: "delivery_unconfirmed",
        occurred_at,
        origin: "system",
        idempotency_key: `delivery_unconfirmed:G3:${d.delivery_id}:${agg.trip.trip_id}`,
        payload: { trigger: "G3_trip_returning" },
      });
    }
  }

  return {
    ok: true,
    state: {
      trip: {
        ...agg.trip,
        state: "retornando",
        last_event_id: ev.event_id,
      },
      deliveries,
    },
    events: [ev],
  };
}

/**
 * Fechamento automático após return_detected (F0: condições GPS omitidas —
 * caller só invoca quando evidência cumulativa OK).
 * require_all_active_stops_resolved aplica-se AQUI, não em trip_return_started.
 * entrega_sem_confirmacao NÃO bloqueia o fechamento.
 */
export function closeTripAutomatic(
  log: InMemoryEventLog,
  agg: TripAggregate,
  occurred_at: string,
  policy: PilotPolicy,
  return_evidence: Record<string, unknown>,
): ApplyResult<TripAggregate> {
  const eligible: TripState[] = ["retornando"];
  if (policy.allow_return_from_em_rota) eligible.push("em_rota");
  if (!eligible.includes(agg.trip.state)) {
    return {
      ok: false,
      error: new DomainError(
        "INVALID_TRANSITION",
        `close automático de ${agg.trip.state}`,
      ),
    };
  }

  if (policy.require_all_active_stops_resolved) {
    if (!activeDeliveriesResolved([...agg.deliveries.values()], policy)) {
      return {
        ok: false,
        error: new DomainError(
          "PRECONDITION_FAILED",
          "require_all_active_stops_resolved: paradas ativas sem desfecho válido",
        ),
      };
    }
  }

  // G4: unconfirmed remaining em_rota/chegada active
  const deliveries = new Map(agg.deliveries);
  for (const d of deliveries.values()) {
    if (
      d.active &&
      (d.state === "em_rota" || d.state === "chegada_detectada")
    ) {
      const u = {
        ...d,
        state: "entrega_sem_confirmacao" as const,
        unconfirmed_at: occurred_at,
        unconfirmed_trigger: "G4_trip_closed" as const,
      };
      deliveries.set(d.delivery_id, u);
      logEvent(log, {
        object_type: "delivery",
        object_id: d.delivery_id,
        event_type: "delivery_unconfirmed",
        occurred_at,
        origin: "system",
        idempotency_key: `delivery_unconfirmed:G4:${d.delivery_id}:${agg.trip.trip_id}`,
        payload: { trigger: "G4_trip_closed" },
      });
    }
  }

  logEvent(log, {
    object_type: "trip",
    object_id: agg.trip.trip_id,
    event_type: "return_detected",
    occurred_at,
    origin: "system",
    idempotency_key: `return_detected:${agg.trip.trip_id}:${occurred_at}`,
    payload: return_evidence,
  });

  const closeEv = logEvent(log, {
    object_type: "trip",
    object_id: agg.trip.trip_id,
    event_type: "trip_closed_automatic",
    occurred_at,
    origin: "system",
    idempotency_key: `trip_closed_automatic:${agg.trip.trip_id}`,
    payload: { close_mode: "automatic" },
  });

  return {
    ok: true,
    state: {
      trip: {
        ...agg.trip,
        state: "encerrada",
        closed_at: occurred_at,
        close_mode: "automatic",
        return_evidence,
        last_event_id: closeEv.event_id,
      },
      deliveries,
    },
    events: [closeEv],
  };
}

export function closeTripManual(
  log: InMemoryEventLog,
  agg: TripAggregate,
  occurred_at: string,
  actor_id: string,
  reason: string,
  authorizedRoles: string[],
  actorRole: string,
): ApplyResult<TripAggregate> {
  // authorizedRoles: papéis COR piloto (lider_delivery | gerente)
  if (!authorizedRoles.includes(actorRole as never) && !authorizedRoles.includes(actorRole)) {
    return {
      ok: false,
      error: new DomainError(
        "PRECONDITION_FAILED",
        "Fechamento manual: papel não autorizado (líder/gerente)",
      ),
    };
  }
  if (agg.trip.state === "encerrada") {
    return {
      ok: false,
      error: new DomainError("TRIP_TERMINAL", "Trip já encerrada"),
    };
  }
  const allowed: TripState[] = ["em_rota", "retornando", "sem_atualizacao"];
  if (!allowed.includes(agg.trip.state)) {
    return {
      ok: false,
      error: new DomainError(
        "INVALID_TRANSITION",
        `close manual de ${agg.trip.state}`,
      ),
    };
  }
  if (!reason.trim()) {
    return {
      ok: false,
      error: new DomainError("PRECONDITION_FAILED", "Motivo obrigatório"),
    };
  }

  const closeEv = logEvent(log, {
    object_type: "trip",
    object_id: agg.trip.trip_id,
    event_type: "trip_closed_manual",
    occurred_at,
    origin: "ops_console",
    actor_id,
    idempotency_key: `trip_closed_manual:${agg.trip.trip_id}`,
    payload: { reason, actorRole, close_mode: "manual" },
  });

  return {
    ok: true,
    state: {
      trip: {
        ...agg.trip,
        state: "encerrada",
        closed_at: occurred_at,
        close_mode: "manual",
        manual_close_reason: reason,
        manual_close_actor: actor_id,
        last_event_id: closeEv.event_id,
      },
      deliveries: agg.deliveries,
    },
    events: [closeEv],
  };
}

export function removeDeliveryFromTrip(
  log: InMemoryEventLog,
  agg: TripAggregate,
  delivery_id: string,
  occurred_at: string,
  reason: string,
  removed_by: string,
  policy: PilotPolicy,
): ApplyResult<TripAggregate> {
  const d = agg.deliveries.get(delivery_id);
  if (!d) {
    return {
      ok: false,
      error: new DomainError("PRECONDITION_FAILED", "Delivery não encontrada"),
    };
  }
  if (agg.trip.state === "encerrada") {
    return {
      ok: false,
      error: new DomainError("TRIP_TERMINAL", "Trip encerrada"),
    };
  }

  const updated = removeDelivery(d, occurred_at, reason, removed_by);
  const deliveries = new Map(agg.deliveries);
  deliveries.set(delivery_id, updated);

  logEvent(log, {
    object_type: "delivery",
    object_id: delivery_id,
    event_type: "delivery_removed",
    occurred_at,
    origin: "ops_console",
    actor_id: removed_by,
    idempotency_key: `delivery_removed:${delivery_id}:${occurred_at}`,
    payload: { reason, removed_by, active: false },
  });

  // se ainda em preparando e zero ativos — ok, mas startTrip falhará
  void policy;
  return {
    ok: true,
    state: { trip: agg.trip, deliveries },
    events: [],
  };
}

export function addDeliveryToTrip(
  log: InMemoryEventLog,
  agg: TripAggregate,
  delivery: Omit<Delivery, "trip_id" | "state" | "active"> & {
    channel?: Delivery["channel"];
  },
  occurred_at: string,
  actor_id: string,
  policy: PilotPolicy,
): ApplyResult<TripAggregate> {
  const activeCount = [...agg.deliveries.values()].filter((d) => d.active).length;
  if (activeCount >= policy.max_stops) {
    return {
      ok: false,
      error: new DomainError(
        "MAX_STOPS_EXCEEDED",
        `Limite piloto max_stops=${policy.max_stops}`,
      ),
    };
  }
  if (agg.trip.state === "encerrada") {
    return {
      ok: false,
      error: new DomainError("TRIP_TERMINAL", "Trip encerrada"),
    };
  }

  const state =
    agg.trip.state === "preparando_saida" ? "aguardando_saida" : "em_rota";

  const full: Delivery = {
    delivery_id: delivery.delivery_id,
    trip_id: agg.trip.trip_id,
    order_ref: delivery.order_ref,
    channel: delivery.channel ?? "proprio",
    planned_stop_order: delivery.planned_stop_order,
    state,
    active: true,
  };

  const deliveries = new Map(agg.deliveries);
  deliveries.set(full.delivery_id, full);
  const delivery_ids = [...agg.trip.delivery_ids, full.delivery_id];

  logEvent(log, {
    object_type: "delivery",
    object_id: full.delivery_id,
    event_type: "delivery_added",
    occurred_at,
    origin: "ops_console",
    actor_id,
    idempotency_key: `delivery_added:${agg.trip.trip_id}:${full.delivery_id}`,
    payload: { state },
  });

  return {
    ok: true,
    state: {
      trip: { ...agg.trip, delivery_ids },
      deliveries,
    },
    events: [],
  };
}
