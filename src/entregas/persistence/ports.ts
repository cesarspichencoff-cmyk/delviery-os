import type { Trip, Delivery, Handoff, DomainEvent } from "../foundation/types";
import type { Occurrence } from "../operational/occurrence";
import type { RiderOperationalState } from "../operational/rider-state";
import type { EntregasPublicEvent } from "../contracts/events/types";
import type { OutboxRecord } from "../integration/outbox";

export interface TripRecord {
  trip: Trip;
  deliveries: Delivery[];
  version: number;
}

export interface TripRepository {
  get(trip_id: string): Promise<TripRecord | null>;
  save(record: TripRecord, expectedVersion: number | null): Promise<void>;
}

export interface HandoffRepository {
  get(handoff_id: string): Promise<{ handoff: Handoff; version: number } | null>;
  save(handoff: Handoff, version: number, expectedVersion: number | null): Promise<void>;
}

export interface OccurrenceRepository {
  get(id: string): Promise<Occurrence | null>;
  save(occ: Occurrence, expectedVersion: number | null): Promise<void>;
}

export interface RiderStateRepository {
  get(rider_id: string): Promise<RiderOperationalState | null>;
  save(state: RiderOperationalState, expectedVersion: number | null): Promise<void>;
}

export interface EventStore {
  append(events: readonly DomainEvent[]): Promise<void>;
  listByObject(object_type: string, object_id: string): Promise<DomainEvent[]>;
  listAll(): Promise<DomainEvent[]>;
}

export interface OutboxRepository {
  enqueue(record: OutboxRecord): Promise<{ duplicate: boolean }>;
  listPending(): Promise<OutboxRecord[]>;
  markPublished(outbox_id: string, at: string): Promise<void>;
  markFailed(outbox_id: string, error: string, at: string): Promise<void>;
  all(): Promise<OutboxRecord[]>;
}

export interface UnitOfWork {
  trips: TripRepository;
  handoffs: HandoffRepository;
  occurrences: OccurrenceRepository;
  riders: RiderStateRepository;
  events: EventStore;
  outbox: OutboxRepository;
  /** Commit atômico da unidade (domínio + eventos + outbox) */
  commit(): Promise<void>;
  /** Descarta mudanças não commitadas */
  rollback(): Promise<void>;
}

export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConcurrencyError";
  }
}

export type { EntregasPublicEvent };
