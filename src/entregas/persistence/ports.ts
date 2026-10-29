import type { Trip, Delivery, Handoff, DomainEvent } from "../foundation/types";
import type { Occurrence } from "../operational/occurrence";
import type { RiderOperationalState } from "../operational/rider-state";
import type { EntregasPublicEvent } from "../contracts/events/types";
import type { OutboxRecord } from "../integration/outbox";
import type { DurableInboundReceipt } from "./inbound-receipt";

export interface TripRecord {
  trip: Trip;
  deliveries: Delivery[];
  version: number;
}

export interface TripRepository {
  get(trip_id: string): Promise<TripRecord | null>;
  list(): Promise<TripRecord[]>;
  save(record: TripRecord, expectedVersion: number | null): Promise<void>;
}

export interface HandoffRepository {
  get(handoff_id: string): Promise<{ handoff: Handoff; version: number } | null>;
  list(): Promise<Array<{ handoff: Handoff; version: number }>>;
  save(handoff: Handoff, version: number, expectedVersion: number | null): Promise<void>;
}

export interface OccurrenceRepository {
  get(id: string): Promise<Occurrence | null>;
  list(): Promise<Occurrence[]>;
  save(occ: Occurrence, expectedVersion: number | null): Promise<void>;
}

export interface RiderStateRepository {
  get(rider_id: string): Promise<RiderOperationalState | null>;
  list(): Promise<RiderOperationalState[]>;
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

/** A busca pelas TRES chaves nao pode esconder colisao dividida entre linhas. */
export interface InboundReceiptRepository {
  find(eventId: string, idempotencyKey: string, commandId?: string): Promise<DurableInboundReceipt[]>;
  stage(record: DurableInboundReceipt): void;
  /** Detecta ACK preparado fora do turno serializado do comando. */
  hasStaged(): boolean;
}

export interface UnitOfWork {
  inboundReceipts: InboundReceiptRepository;
  trips: TripRepository;
  handoffs: HandoffRepository;
  occurrences: OccurrenceRepository;
  riders: RiderStateRepository;
  events: EventStore;
  outbox: OutboxRepository;
  /** Impede iniciar outro comando com dominio/outbox staged por terceiro. */
  hasPendingWrites(): boolean;
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
