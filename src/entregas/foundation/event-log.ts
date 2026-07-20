import { randomUUID } from "node:crypto";
import { CONTRACT_VERSION_FULL } from "./contract";
import type { ClockTrust, EventOrigin, ObjectType } from "./enums";
import type { DomainEvent } from "./types";

export interface NewEventInput {
  object_type: ObjectType;
  object_id: string;
  event_type: string;
  occurred_at: string;
  origin: EventOrigin;
  actor_id?: string;
  device_id?: string;
  idempotency_key: string;
  payload?: Record<string, unknown>;
  clock_trust?: ClockTrust;
  event_id?: string;
  recorded_at?: string;
}

/** Append-only em memória — F0. Idempotência por idempotency_key. */
export class InMemoryEventLog {
  private readonly events: DomainEvent[] = [];
  private readonly byIdempotency = new Map<string, DomainEvent>();

  append(input: NewEventInput): { event: DomainEvent; replayed: boolean } {
    const existing = this.byIdempotency.get(input.idempotency_key);
    if (existing) {
      return { event: existing, replayed: true };
    }
    const recorded_at = input.recorded_at ?? new Date().toISOString();
    const event: DomainEvent = {
      event_id: input.event_id ?? randomUUID(),
      object_type: input.object_type,
      object_id: input.object_id,
      event_type: input.event_type,
      occurred_at: input.occurred_at,
      recorded_at,
      origin: input.origin,
      actor_id: input.actor_id,
      device_id: input.device_id,
      idempotency_key: input.idempotency_key,
      payload: input.payload ?? {},
      clock_trust: input.clock_trust ?? "unknown",
      contract_version: CONTRACT_VERSION_FULL,
    };
    this.events.push(event);
    this.byIdempotency.set(input.idempotency_key, event);
    return { event, replayed: false };
  }

  all(): readonly DomainEvent[] {
    return this.events;
  }

  forObject(object_type: ObjectType, object_id: string): DomainEvent[] {
    return this.events.filter(
      (e) => e.object_type === object_type && e.object_id === object_id,
    );
  }
}
