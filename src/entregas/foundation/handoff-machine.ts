import { CONTRACT_VERSION_FULL } from "./contract";
import type { ExternalCourierRef } from "./brands";
import type { InMemoryEventLog } from "./event-log";
import type { Handoff, HandoffVolumes } from "./types";
import { DomainError, type ApplyResult } from "./types";

/**
 * Expedição iFood / Handoff.
 * Courier externo NÃO é usuário: sem conta, app, Trip, GPS, rota.
 * UI: EXPEDIÇÃO IFOOD / HANDOFF IFOOD — foco no pedido.
 */

export interface CreateHandoffInput {
  handoff_id: string;
  unit_id: string;
  external_order_ref: string;
  occurred_at: string;
  created_by: string;
}

export function createHandoff(
  log: InMemoryEventLog,
  input: CreateHandoffInput,
): ApplyResult<Handoff> {
  const ev = log.append({
    object_type: "handoff",
    object_id: input.handoff_id,
    event_type: "handoff_created",
    occurred_at: input.occurred_at,
    origin: "ops_console",
    actor_id: input.created_by,
    idempotency_key: `handoff_created:${input.handoff_id}`,
    payload: { external_order_ref: input.external_order_ref },
  }).event;

  void ev;
  return {
    ok: true,
    state: {
      handoff_id: input.handoff_id,
      unit_id: input.unit_id,
      external_order_ref: input.external_order_ref,
      state: "aguardando_courier",
      courier_verified: false,
      confirmed: false,
      contract_version: CONTRACT_VERSION_FULL,
    },
    events: [ev],
  };
}

export function markCourierArrived(
  log: InMemoryEventLog,
  h: Handoff,
  occurred_at: string,
  actor_id: string,
  external_courier_ref?: ExternalCourierRef,
): ApplyResult<Handoff> {
  if (h.state !== "aguardando_courier" && h.state !== "em_conferencia") {
    return {
      ok: false,
      error: new DomainError(
        "INVALID_TRANSITION",
        `handoff_courier_arrived de ${h.state}`,
      ),
    };
  }
  const ev = log.append({
    object_type: "handoff",
    object_id: h.handoff_id,
    event_type: "handoff_courier_arrived",
    occurred_at,
    origin: "ops_console",
    actor_id,
    idempotency_key: `handoff_courier_arrived:${h.handoff_id}`,
    payload: {
      external_courier_ref: external_courier_ref ?? null,
      note: "ref mínima; courier não é usuário do módulo",
    },
  }).event;

  return {
    ok: true,
    state: {
      ...h,
      state: "em_conferencia",
      arrived_at: occurred_at,
      external_courier_ref: external_courier_ref ?? h.external_courier_ref,
    },
    events: [ev],
  };
}

export interface ConfirmHandoffInput {
  occurred_at: string;
  /** Funcionário interno — verificação */
  conference_actor: string;
  /** Funcionário interno — repasse físico */
  handoff_actor: string;
  courier_verified: boolean;
  courier_verification_method: string;
  external_courier_ref?: ExternalCourierRef;
  volumes: HandoffVolumes;
  order_identified: boolean;
}

/**
 * Confirma handoff. NÃO cria trip_id.
 * Exige: pedido identificado, courier verificado, volumes esperados=entregues, atores internos.
 */
export function confirmHandoff(
  log: InMemoryEventLog,
  h: Handoff,
  input: ConfirmHandoffInput,
): ApplyResult<Handoff> {
  if (h.state === "repassado" || h.state === "cancelado") {
    return {
      ok: false,
      error: new DomainError(
        "INVALID_TRANSITION",
        `Handoff já terminal: ${h.state}`,
      ),
    };
  }
  if (!input.order_identified) {
    return {
      ok: false,
      error: new DomainError(
        "PRECONDITION_FAILED",
        "Pedido deve estar identificado",
      ),
    };
  }
  if (!input.courier_verified || !input.courier_verification_method?.trim()) {
    return {
      ok: false,
      error: new DomainError(
        "HANDOFF_NOT_VERIFIED",
        "Courier externo deve ser verificado por método operacional (ato do interno)",
      ),
    };
  }
  if (
    input.volumes.expected < 1 ||
    input.volumes.delivered !== input.volumes.expected
  ) {
    return {
      ok: false,
      error: new DomainError(
        "HANDOFF_VOLUMES_MISMATCH",
        "Volumes esperados e entregues devem coincidir e ser ≥ 1",
      ),
    };
  }
  if (!input.conference_actor?.trim() || !input.handoff_actor?.trim()) {
    return {
      ok: false,
      error: new DomainError(
        "PRECONDITION_FAILED",
        "conference_actor e handoff_actor (internos) obrigatórios",
      ),
    };
  }

  log.append({
    object_type: "handoff",
    object_id: h.handoff_id,
    event_type: "handoff_conference_done",
    occurred_at: input.occurred_at,
    origin: "ops_console",
    actor_id: input.conference_actor,
    idempotency_key: `handoff_conference_done:${h.handoff_id}`,
    payload: { volumes: input.volumes },
  });

  const ev = log.append({
    object_type: "handoff",
    object_id: h.handoff_id,
    event_type: "handoff_transferred",
    occurred_at: input.occurred_at,
    origin: "ops_console",
    actor_id: input.handoff_actor,
    idempotency_key: `handoff_transferred:${h.handoff_id}`,
    payload: {
      courier_verified: true,
      courier_verification_method: input.courier_verification_method,
      external_courier_ref: input.external_courier_ref ?? null,
      creates_trip: false,
      store_physical_responsibility: "ended",
    },
  }).event;

  return {
    ok: true,
    state: {
      ...h,
      state: "repassado",
      courier_verified: true,
      courier_verification_method: input.courier_verification_method,
      external_courier_ref:
        input.external_courier_ref ?? h.external_courier_ref,
      volumes: input.volumes,
      integrity_ok: true,
      conference_actor: input.conference_actor,
      handoff_actor: input.handoff_actor,
      handoff_at: input.occurred_at,
      confirmed: true,
    },
    events: [ev],
  };
}

export function handoffException(
  log: InMemoryEventLog,
  h: Handoff,
  occurred_at: string,
  actor_id: string,
  exception: string,
): ApplyResult<Handoff> {
  const ev = log.append({
    object_type: "handoff",
    object_id: h.handoff_id,
    event_type: "handoff_exception",
    occurred_at,
    origin: "ops_console",
    actor_id,
    idempotency_key: `handoff_exception:${h.handoff_id}:${occurred_at}`,
    payload: { exception },
  }).event;

  return {
    ok: true,
    state: {
      ...h,
      state: "excecao",
      exception,
      confirmed: false,
    },
    events: [ev],
  };
}

/** Invariante: handoff nunca produz trip_id */
export function assertHandoffDoesNotCreateTrip(
  payload: Record<string, unknown>,
): void {
  if (payload.trip_id || payload.creates_trip === true) {
    throw new DomainError(
      "FORBIDDEN_ACTOR_MIX",
      "Handoff iFood não pode criar Trip",
    );
  }
}
