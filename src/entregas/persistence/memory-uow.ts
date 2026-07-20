import type {
  TripRepository,
  HandoffRepository,
  OccurrenceRepository,
  RiderStateRepository,
  EventStore,
  OutboxRepository,
  TripRecord,
  UnitOfWork,
} from "./ports";
import { ConcurrencyError } from "./ports";
import type { Handoff, DomainEvent } from "../foundation/types";
import type { Occurrence } from "../operational/occurrence";
import type { RiderOperationalState } from "../operational/rider-state";
import type { OutboxRecord } from "../integration/outbox";
import { validatePublicEvent } from "../contracts/events/validate";

export class MemoryUnitOfWork implements UnitOfWork {
  private _trips = new Map<string, TripRecord>();
  private _handoffs = new Map<string, { handoff: Handoff; version: number }>();
  private _occurrences = new Map<string, Occurrence>();
  private _riders = new Map<string, RiderOperationalState>();
  private _events: DomainEvent[] = [];
  private _outbox: OutboxRecord[] = [];
  private staged!: {
    trips: Map<string, TripRecord>;
    handoffs: Map<string, { handoff: Handoff; version: number }>;
    occurrences: Map<string, Occurrence>;
    riders: Map<string, RiderOperationalState>;
    events: DomainEvent[];
    outbox: OutboxRecord[];
  };
  private finished = false;

  readonly trips: TripRepository;
  readonly handoffs: HandoffRepository;
  readonly occurrences: OccurrenceRepository;
  readonly riders: RiderStateRepository;
  readonly events: EventStore;
  readonly outbox: OutboxRepository;

  constructor() {
    this.resetStage();
    const self = this;
    this.trips = {
      async get(id) {
        return self.staged.trips.get(id) ?? null;
      },
      async save(record, expected) {
        const cur = self.staged.trips.get(record.trip.trip_id);
        if (expected !== null && (cur?.version ?? 0) !== expected) {
          throw new ConcurrencyError("Trip version conflict");
        }
        self.staged.trips.set(record.trip.trip_id, {
          trip: record.trip,
          deliveries: record.deliveries,
          version: (cur?.version ?? 0) + 1,
        });
      },
    };
    this.handoffs = {
      async get(id) {
        return self.staged.handoffs.get(id) ?? null;
      },
      async save(handoff, version, expected) {
        const cur = self.staged.handoffs.get(handoff.handoff_id);
        if (expected !== null && (cur?.version ?? 0) !== expected) {
          throw new ConcurrencyError("Handoff version conflict");
        }
        self.staged.handoffs.set(handoff.handoff_id, { handoff, version });
      },
    };
    this.occurrences = {
      async get(id) {
        return self.staged.occurrences.get(id) ?? null;
      },
      async save(occ, expected) {
        const cur = self.staged.occurrences.get(occ.occurrence_id);
        if (expected !== null && cur && cur.version !== expected) {
          throw new ConcurrencyError("Occurrence version conflict");
        }
        self.staged.occurrences.set(occ.occurrence_id, occ);
      },
    };
    this.riders = {
      async get(id) {
        return self.staged.riders.get(id) ?? null;
      },
      async save(state, expected) {
        const cur = self.staged.riders.get(state.rider_id);
        if (expected !== null && cur && cur.version !== expected) {
          throw new ConcurrencyError("Rider version conflict");
        }
        self.staged.riders.set(state.rider_id, state);
      },
    };
    this.events = {
      async append(ev) {
        self.staged.events.push(...ev);
      },
      async listByObject(t, id) {
        return self.staged.events.filter(
          (e) => e.object_type === t && e.object_id === id,
        );
      },
      async listAll() {
        return [...self.staged.events];
      },
    };
    this.outbox = {
      async enqueue(record) {
        if (
          self.staged.outbox.some(
            (r) =>
              r.event.event_id === record.event.event_id ||
              r.event.idempotency_key === record.event.idempotency_key,
          )
        ) {
          return { duplicate: true };
        }
        const v = validatePublicEvent(record.event);
        if (!v.ok) throw new Error("invalid public event");
        self.staged.outbox.push({ ...record });
        return { duplicate: false };
      },
      async listPending() {
        return self.staged.outbox.filter(
          (r) => r.status === "pending" || r.status === "failed",
        );
      },
      async markPublished(id, at) {
        const r = self.staged.outbox.find((x) => x.outbox_id === id);
        if (r) {
          r.status = "published";
          r.published_at = at;
        }
      },
      async markFailed(id, error, at) {
        const r = self.staged.outbox.find((x) => x.outbox_id === id);
        if (r) {
          r.status = "failed";
          r.last_error = error;
          r.last_attempt_at = at;
          r.attempts += 1;
        }
      },
      async all() {
        return [...self.staged.outbox];
      },
    };
  }

  private resetStage(): void {
    this.staged = {
      trips: new Map(this._trips),
      handoffs: new Map(this._handoffs),
      occurrences: new Map(this._occurrences),
      riders: new Map(this._riders),
      events: [...this._events],
      outbox: this._outbox.map((r) => ({
        ...r,
        event: { ...r.event, payload: { ...r.event.payload } },
      })),
    };
    this.finished = false;
  }

  async commit(): Promise<void> {
    if (this.finished) throw new Error("UoW already finished");
    this._trips = this.staged.trips;
    this._handoffs = this.staged.handoffs;
    this._occurrences = this.staged.occurrences;
    this._riders = this.staged.riders;
    this._events = this.staged.events;
    this._outbox = this.staged.outbox;
    // permite sequência de commands na mesma sessão de app
    this.resetStage();
  }

  async rollback(): Promise<void> {
    this.resetStage();
  }

  /** Nova UoW lendo estado commitado (reinício em memória) */
  newUnit(): MemoryUnitOfWork {
    const u = new MemoryUnitOfWork();
    u._trips = new Map(this._trips);
    u._handoffs = new Map(this._handoffs);
    u._occurrences = new Map(this._occurrences);
    u._riders = new Map(this._riders);
    u._events = [...this._events];
    u._outbox = this._outbox.map((r) => ({
      ...r,
      event: { ...r.event, payload: { ...r.event.payload } },
    }));
    u.resetStage();
    return u;
  }
}
