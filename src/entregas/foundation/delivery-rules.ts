import type { PilotPolicy } from "./policy";
import type {
  Delivery,
  DomainEvent,
} from "./types";
import { DomainError } from "./types";
import {
  DELIVERY_RESOLVED_STATES,
  type DeliveryState,
  type UnconfirmedTrigger,
} from "./enums";

export function isDeliveryResolved(state: DeliveryState): boolean {
  return DELIVERY_RESOLVED_STATES.includes(state);
}

/**
 * G1–G5: só deliveries active=true.
 * active=false: nunca cria entrega_sem_confirmacao (COR §14.2 / D-302).
 */
export function canApplyUnconfirmedTrigger(delivery: Delivery): boolean {
  if (!delivery.active) return false;
  if (
    delivery.state === "entregue_confirmado" ||
    delivery.state === "cancelada" ||
    delivery.state === "entrega_sem_confirmacao"
  ) {
    return false;
  }
  // G1/G5 exigem chegada; G2–G4 podem em em_rota — caller decide
  return true;
}

export function applyUnconfirmed(
  delivery: Delivery,
  trigger: UnconfirmedTrigger,
  at: string,
): Delivery {
  if (!canApplyUnconfirmedTrigger(delivery)) {
    return delivery;
  }
  if (trigger === "G1_left_destination_area" || trigger === "G5_timeout_after_arrival") {
    if (delivery.state !== "chegada_detectada") {
      return delivery;
    }
  }
  return {
    ...delivery,
    state: "entrega_sem_confirmacao",
    unconfirmed_at: at,
    unconfirmed_trigger: trigger,
  };
}

/**
 * Confirmação humana de entrega.
 * GPS/system sozinho NÃO pode confirmar (COR §11.3).
 */
export function applyDeliveryConfirmed(
  delivery: Delivery,
  event: Pick<DomainEvent, "origin" | "actor_id" | "payload" | "occurred_at">,
): Delivery {
  if (event.origin === "system" && event.payload?.source === "gps") {
    throw new DomainError(
      "GPS_CANNOT_CONFIRM_DELIVERY",
      "GPS/geofence não pode emitir delivery_confirmed",
    );
  }
  if (!event.actor_id && event.origin !== "ops_console") {
    // motoboy device deve ter actor
    if (event.origin === "device" && !event.actor_id) {
      throw new DomainError(
        "PRECONDITION_FAILED",
        "delivery_confirmed exige actor_id (motoboy)",
      );
    }
  }
  // Confirmação tardia permitida a partir de entrega_sem_confirmacao (mesmo se active=false).
  // Delivery removida sem pendência não pode ser confirmada.
  const allowedFrom: DeliveryState[] = [
    "em_rota",
    "chegada_detectada",
    "entrega_sem_confirmacao",
  ];
  if (!allowedFrom.includes(delivery.state)) {
    throw new DomainError(
      "INVALID_TRANSITION",
      `delivery_confirmed inválido de ${delivery.state}`,
    );
  }
  if (!delivery.active && delivery.state !== "entrega_sem_confirmacao") {
    throw new DomainError(
      "PRECONDITION_FAILED",
      "Não confirmar delivery removida sem pendência",
    );
  }
  return {
    ...delivery,
    state: "entregue_confirmado",
    confirmed_at: event.occurred_at,
  };
}

/**
 * Chegada observada pelo SISTEMA (geofence/GPS).
 *
 * Idempotente e comutativa em relação ao relato humano: se o motoboy já
 * apertou "Cheguei", a parada já está em `chegada_detectada` e a detecção
 * apenas acrescenta o carimbo do sistema — não é transição inválida, é a
 * segunda evidência do mesmo fato. O primeiro carimbo nunca é sobrescrito.
 *
 * Não confirma entrega. Nunca.
 */
export function applyArrivalDetected(
  delivery: Delivery,
  at: string,
): Delivery {
  if (!delivery.active) {
    throw new DomainError("PRECONDITION_FAILED", "arrival em delivery inativa");
  }
  if (delivery.state !== "em_rota" && delivery.state !== "chegada_detectada") {
    throw new DomainError(
      "INVALID_TRANSITION",
      `arrival_detected de ${delivery.state}`,
    );
  }
  if (delivery.arrival_detected_at) return delivery; // idempotente
  return {
    ...delivery,
    state: "chegada_detectada",
    arrival_detected_at: at,
  };
}

/**
 * Chegada RELATADA pelo motoboy. Ato humano, não evidência de sensor —
 * por isso carimbo próprio (COR modela `arrival_detected` com ator sistema).
 *
 * Também não confirma entrega: leva a parada para `chegada_detectada`, que é
 * estado de desfecho PENDENTE. Quem entrega é `delivery_confirmed`.
 */
export function applyArrivalReported(
  delivery: Delivery,
  at: string,
): Delivery {
  if (!delivery.active) {
    throw new DomainError("PRECONDITION_FAILED", "arrival em delivery inativa");
  }
  if (delivery.state !== "em_rota" && delivery.state !== "chegada_detectada") {
    throw new DomainError(
      "INVALID_TRANSITION",
      `arrival_reported de ${delivery.state}`,
    );
  }
  if (delivery.arrival_reported_at) return delivery; // idempotente
  return {
    ...delivery,
    state: "chegada_detectada",
    arrival_reported_at: at,
  };
}

/**
 * Como a chegada ficou conhecida. Serve à timeline e à auditoria: o operador
 * precisa saber se foi o sistema, a pessoa, ou os dois.
 */
export type ArrivalProvenance =
  | "nenhuma"
  | "somente_sistema"
  | "somente_relato"
  | "sistema_e_relato";

export function arrivalProvenance(delivery: Delivery): ArrivalProvenance {
  const d = Boolean(delivery.arrival_detected_at);
  const r = Boolean(delivery.arrival_reported_at);
  if (d && r) return "sistema_e_relato";
  if (d) return "somente_sistema";
  if (r) return "somente_relato";
  return "nenhuma";
}

/** G3: ao trip_return_started, marcar active sem desfecho */
export function applyG3OnReturnStarted(
  deliveries: Delivery[],
  at: string,
): Delivery[] {
  return deliveries.map((d) => {
    if (!d.active) return d;
    if (isDeliveryResolved(d.state)) return d;
    if (d.state === "aguardando_saida") return d;
    return applyUnconfirmed(d, "G3_trip_returning", at);
  });
}

export function activeDeliveriesResolved(
  deliveries: Delivery[],
  _policy: PilotPolicy,
): boolean {
  const active = deliveries.filter((d) => d.active);
  if (active.length === 0) return true;
  return active.every((d) => isDeliveryResolved(d.state));
}

export function removeDelivery(
  delivery: Delivery,
  at: string,
  reason: string,
  removed_by: string,
): Delivery {
  return {
    ...delivery,
    active: false,
    removed_at: at,
    removed_reason: reason,
    removed_by,
  };
}
