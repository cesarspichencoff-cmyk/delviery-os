/**
 * Unidade de trabalho F0: mudança de domínio + enqueue outbox na mesma operação lógica.
 * Publicação ao Copiloto é assíncrona (flush) e nunca bloqueia o domínio.
 */
import { InMemoryEventLog } from "../foundation/event-log";
import type { PilotPolicy } from "../foundation/policy";
import {
  createTrip,
  startTrip,
  startReturn,
  closeTripAutomatic,
  type CreateTripInput,
  type TripAggregate,
} from "../foundation/trip-machine";
import {
  confirmHandoff,
  createHandoff,
  type ConfirmHandoffInput,
  type CreateHandoffInput,
} from "../foundation/handoff-machine";
import type { ApplyResult, Handoff } from "../foundation/types";
import { InMemoryTransactionalOutbox } from "./outbox";
import { domainEventToPublic } from "./public-event-builder";
import type { EntregasOperationalEventAdapter } from "../contracts/EntregasEventFeed";
import type { EntregasPublicEvent } from "../contracts/events/types";

export class EntregasSession {
  readonly log = new InMemoryEventLog();
  readonly outbox = new InMemoryTransactionalOutbox();

  constructor(private readonly defaultUnitId: string) {}

  private enqueueFromDomainLog(
    unit_id: string,
    correlation_id?: string,
  ): EntregasPublicEvent[] {
    const enqueued: EntregasPublicEvent[] = [];
    for (const de of this.log.all()) {
      const pub = domainEventToPublic(de, {
        unit_id,
        correlation_id,
      });
      if (!pub) continue;
      const { record, duplicate } = this.outbox.enqueue(pub);
      if (!duplicate) enqueued.push(record.event);
    }
    return enqueued;
  }

  createTripWithEvents(
    input: CreateTripInput,
  ): ApplyResult<TripAggregate> & { public_events: EntregasPublicEvent[] } {
    const result = createTrip(this.log, input);
    if (!result.ok) return { ...result, public_events: [] };
    const public_events = this.enqueueFromDomainLog(
      input.unit_id,
      input.trip_id,
    );
    return { ...result, public_events };
  }

  startTripWithEvents(
    agg: TripAggregate,
    occurred_at: string,
    actor_id: string,
  ): ApplyResult<TripAggregate> & { public_events: EntregasPublicEvent[] } {
    const before = this.log.all().length;
    const result = startTrip(this.log, agg, occurred_at, actor_id);
    if (!result.ok) return { ...result, public_events: [] };
    const public_events = this.enqueueNewSince(before, agg.trip.unit_id, agg.trip.trip_id);
    return { ...result, public_events };
  }

  startReturnWithEvents(
    agg: TripAggregate,
    occurred_at: string,
    actor_id: string,
    policy: PilotPolicy,
  ): ApplyResult<TripAggregate> & { public_events: EntregasPublicEvent[] } {
    const before = this.log.all().length;
    const result = startReturn(this.log, agg, occurred_at, actor_id, policy);
    if (!result.ok) return { ...result, public_events: [] };
    const public_events = this.enqueueNewSince(before, agg.trip.unit_id, agg.trip.trip_id);
    return { ...result, public_events };
  }

  closeTripAutomaticWithEvents(
    agg: TripAggregate,
    occurred_at: string,
    policy: PilotPolicy,
    evidence: Record<string, unknown>,
  ): ApplyResult<TripAggregate> & { public_events: EntregasPublicEvent[] } {
    const before = this.log.all().length;
    const result = closeTripAutomatic(
      this.log,
      agg,
      occurred_at,
      policy,
      evidence,
    );
    if (!result.ok) return { ...result, public_events: [] };
    const public_events = this.enqueueNewSince(before, agg.trip.unit_id, agg.trip.trip_id);
    return { ...result, public_events };
  }

  createHandoffWithEvents(
    input: CreateHandoffInput,
  ): ApplyResult<Handoff> & { public_events: EntregasPublicEvent[] } {
    const before = this.log.all().length;
    const result = createHandoff(this.log, input);
    if (!result.ok) return { ...result, public_events: [] };
    const public_events = this.enqueueNewSince(
      before,
      input.unit_id,
      input.handoff_id,
    );
    return { ...result, public_events };
  }

  confirmHandoffWithEvents(
    h: Handoff,
    input: ConfirmHandoffInput,
  ): ApplyResult<Handoff> & { public_events: EntregasPublicEvent[] } {
    const before = this.log.all().length;
    const result = confirmHandoff(this.log, h, input);
    if (!result.ok) return { ...result, public_events: [] };
    const public_events = this.enqueueNewSince(
      before,
      h.unit_id,
      h.handoff_id,
    );
    return { ...result, public_events };
  }

  private enqueueNewSince(
    beforeCount: number,
    unit_id: string,
    correlation_id: string,
  ): EntregasPublicEvent[] {
    const enqueued: EntregasPublicEvent[] = [];
    const all = this.log.all();
    for (let i = beforeCount; i < all.length; i++) {
      const pub = domainEventToPublic(all[i], {
        unit_id,
        correlation_id,
      });
      if (!pub) continue;
      const { record, duplicate } = this.outbox.enqueue(pub);
      if (!duplicate) enqueued.push(record.event);
    }
    return enqueued;
  }

  /** Nunca bloqueia domínio — só tenta publicar pendências */
  async tryPublish(
    adapter: EntregasOperationalEventAdapter,
  ): Promise<{ published: number; failed: number }> {
    return this.outbox.flush(adapter);
  }

  get defaultUnit(): string {
    return this.defaultUnitId;
  }
}
