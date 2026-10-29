import type {
  TripRepository,
  HandoffRepository,
  OccurrenceRepository,
  RiderStateRepository,
  EventStore,
  OutboxRepository,
  TripRecord,
  UnitOfWork,
  InboundReceiptRepository,
} from "./ports";
import { ConcurrencyError } from "./ports";
import { InboundReceiptConflictError, InboundReceiptCommandIdCollisionError, type DurableInboundReceipt } from "./inbound-receipt";
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
  private _inboundReceipts = new Map<string, DurableInboundReceipt>();
  private staged!: {
    trips: Map<string, TripRecord>;
    handoffs: Map<string, { handoff: Handoff; version: number }>;
    occurrences: Map<string, Occurrence>;
    riders: Map<string, RiderOperationalState>;
    events: DomainEvent[];
    outbox: OutboxRecord[];
    receipts: Map<string, DurableInboundReceipt>;
  };
  private finished = false;

  readonly trips: TripRepository;
  readonly handoffs: HandoffRepository;
  readonly occurrences: OccurrenceRepository;
  readonly riders: RiderStateRepository;
  readonly events: EventStore;
  readonly outbox: OutboxRepository;
  readonly inboundReceipts: InboundReceiptRepository;

  constructor() {
    this.resetStage();
    const self = this;
    this.inboundReceipts = {
      hasStaged: () => [...self.staged.receipts.keys()]
        .some((id) => !self._inboundReceipts.has(id)),
      async find(id, key, commandId) {
        // Sem ACK para staged: so ler o estado ja confirmado.
        return [...self._inboundReceipts.values()]
          .filter((r) => r.event_id === id || r.idempotency_key === key ||
            (commandId !== undefined && r.command_id === commandId))
          .map((r) => structuredClone(r));
      },
      stage(r) {
        if ([...self.staged.receipts.values()].some((p) =>
          p.event_id === r.event_id || p.idempotency_key === r.idempotency_key)) {
          throw new InboundReceiptConflictError();
        }
        if ([...self.staged.receipts.values()].some((p) =>
          p.command_id === r.command_id)) {
          throw new InboundReceiptCommandIdCollisionError();
        }
        self.staged.receipts.set(r.event_id, structuredClone(r));
      },
    };
    this.trips = {
      async get(id) {
        return self.staged.trips.get(id) ?? null;
      },
      async list() {
        return [...self.staged.trips.values()].map((x) => structuredClone(x));
      },
      async save(record, expected) {
        const cur = self.staged.trips.get(record.trip.trip_id);
        if (expected !== null && (cur?.version ?? 0) !== expected) {
          throw new ConcurrencyError("Trip version conflict");
        }
        self.staged.trips.set(record.trip.trip_id, {
          trip: structuredClone(record.trip),
          deliveries: structuredClone(record.deliveries),
          version: (cur?.version ?? 0) + 1,
        });
      },
    };
    this.handoffs = {
      async get(id) {
        return self.staged.handoffs.get(id) ?? null;
      },
      async list() {
        return [...self.staged.handoffs.values()].map((x) => structuredClone(x));
      },
      async save(handoff, version, expected) {
        const cur = self.staged.handoffs.get(handoff.handoff_id);
        if (expected !== null && (cur?.version ?? 0) !== expected) {
          throw new ConcurrencyError("Handoff version conflict");
        }
        self.staged.handoffs.set(handoff.handoff_id, { handoff: structuredClone(handoff), version });
      },
    };
    this.occurrences = {
      async get(id) {
        return self.staged.occurrences.get(id) ?? null;
      },
      async list() {
        return [...self.staged.occurrences.values()].map((x) => structuredClone(x));
      },
      async save(occ, expected) {
        const cur = self.staged.occurrences.get(occ.occurrence_id);
        if (expected !== null && cur && cur.version !== expected) {
          throw new ConcurrencyError("Occurrence version conflict");
        }
        self.staged.occurrences.set(occ.occurrence_id, structuredClone(occ));
      },
    };
    this.riders = {
      async get(id) {
        return self.staged.riders.get(id) ?? null;
      },
      async list() {
        return [...self.staged.riders.values()].map((x) => structuredClone(x));
      },
      async save(state, expected) {
        const cur = self.staged.riders.get(state.rider_id);
        if (expected !== null && cur && cur.version !== expected) {
          throw new ConcurrencyError("Rider version conflict");
        }
        self.staged.riders.set(state.rider_id, structuredClone(state));
      },
    };
    this.events = {
      async append(ev) {
        self.staged.events.push(...ev.map((event) => structuredClone(event)));
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
        self.staged.outbox.push(structuredClone(record));
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

  hasPendingWrites(): boolean {
    const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
    const snapshot = (map: Map<string,unknown>) => [...map.entries()];
    return changed(snapshot(this.staged.trips),snapshot(this._trips)) ||
      changed(snapshot(this.staged.handoffs),snapshot(this._handoffs)) ||
      changed(snapshot(this.staged.occurrences),snapshot(this._occurrences)) ||
      changed(snapshot(this.staged.riders),snapshot(this._riders)) ||
      changed(this.staged.events,this._events) ||
      changed(this.staged.outbox,this._outbox) ||
      changed(snapshot(this.staged.receipts),snapshot(this._inboundReceipts));
  }

  private resetStage(): void {
    this.staged = {
      // O estado staged pode ser mutado por repositorios e reducers.
      // NUNCA compartilhar objetos nested com o snapshot ja commitado:
      // rollback deve restaurar inclusive entregas, eventos e ocorrencias.
      trips: new Map([...this._trips].map(([id, rec]) => [id, structuredClone(rec)])),
      handoffs: new Map([...this._handoffs].map(([id, rec]) => [id, structuredClone(rec)])),
      occurrences: new Map([...this._occurrences].map(([id, occ]) => [id, structuredClone(occ)])),
      riders: new Map([...this._riders].map(([id, rider]) => [id, structuredClone(rider)])),
      events: this._events.map((event) => structuredClone(event)),
      receipts: new Map([...this._inboundReceipts].map(([id, rec]) => [id, structuredClone(rec)])),
      outbox: this._outbox.map((rec) => structuredClone(rec)),
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
    this._inboundReceipts = this.staged.receipts;
    // permite sequência de commands na mesma sessão de app
    this.resetStage();
  }

  async rollback(): Promise<void> {
    this.resetStage();
  }

  /** Nova UoW lendo estado commitado (reinício em memória) */
  newUnit(): MemoryUnitOfWork {
    const u = new MemoryUnitOfWork();
    u._trips = new Map([...this._trips].map(([id, rec]) => [id, structuredClone(rec)]));
    u._handoffs = new Map([...this._handoffs].map(([id, rec]) => [id, structuredClone(rec)]));
    u._occurrences = new Map([...this._occurrences].map(([id, occ]) => [id, structuredClone(occ)]));
    u._riders = new Map([...this._riders].map(([id, rider]) => [id, structuredClone(rider)]));
    u._events = this._events.map((event) => structuredClone(event));
    u._inboundReceipts = new Map([...this._inboundReceipts].map(([id, rec]) => [id, structuredClone(rec)]));
    u._outbox = this._outbox.map((rec) => structuredClone(rec));
    u.resetStage();
    return u;
  }
}
