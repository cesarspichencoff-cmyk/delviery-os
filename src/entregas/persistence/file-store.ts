/**
 * Adapter persistente local: diretório JSON + JSONL.
 * Transação = escrever staging + rename atômico do diretório de commit.
 * NÃO é produção multi-instância.
 */
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  renameSync,
  rmSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
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
import type { Trip, Delivery, Handoff, DomainEvent } from "../foundation/types";
import type { Occurrence } from "../operational/occurrence";
import type { RiderOperationalState } from "../operational/rider-state";
import type { OutboxRecord } from "../integration/outbox";
import { validatePublicEvent } from "../contracts/events/validate";

interface StoreData {
  trips: Record<string, TripRecord>;
  handoffs: Record<string, { handoff: Handoff; version: number }>;
  occurrences: Record<string, Occurrence>;
  riders: Record<string, RiderOperationalState>;
  events: DomainEvent[];
  outbox: OutboxRecord[];
}

function emptyData(): StoreData {
  return {
    trips: {},
    handoffs: {},
    occurrences: {},
    riders: {},
    events: [],
    outbox: [],
  };
}

function loadData(path: string): StoreData {
  if (!existsSync(path)) return emptyData();
  return JSON.parse(readFileSync(path, "utf8")) as StoreData;
}

function saveData(path: string, data: StoreData): void {
  const dir = join(path, "..");
  mkdirSync(dir, { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 0), "utf8");
  // atomic replace
  if (existsSync(path)) {
    const bak = `${path}.bak`;
    try {
      if (existsSync(bak)) rmSync(bak);
      renameSync(path, bak);
    } catch {
      /* ignore */
    }
  }
  renameSync(tmp, path);
}

export class FileUnitOfWork implements UnitOfWork {
  private base: StoreData;
  private dirty: StoreData;
  private committed = false;
  private rolled = false;

  readonly trips: TripRepository;
  readonly handoffs: HandoffRepository;
  readonly occurrences: OccurrenceRepository;
  readonly riders: RiderStateRepository;
  readonly events: EventStore;
  readonly outbox: OutboxRepository;

  constructor(private readonly dataFile: string) {
    mkdirSync(join(dataFile, ".."), { recursive: true });
    this.base = loadData(dataFile);
    this.dirty = structuredClone(this.base);

    const self = this;
    this.trips = {
      async get(id) {
        return self.dirty.trips[id] ?? null;
      },
      async save(record, expected) {
        const cur = self.dirty.trips[record.trip.trip_id];
        if (expected !== null && expected !== undefined) {
          const v = cur?.version ?? 0;
          if (v !== expected) {
            throw new ConcurrencyError(
              `Trip ${record.trip.trip_id} version conflict expected=${expected} actual=${v}`,
            );
          }
        }
        self.dirty.trips[record.trip.trip_id] = {
          ...record,
          version: (cur?.version ?? 0) + 1,
        };
      },
    };
    this.handoffs = {
      async get(id) {
        return self.dirty.handoffs[id] ?? null;
      },
      async save(handoff, version, expected) {
        const cur = self.dirty.handoffs[handoff.handoff_id];
        if (expected !== null && expected !== undefined) {
          const v = cur?.version ?? 0;
          if (v !== expected) {
            throw new ConcurrencyError(`Handoff version conflict`);
          }
        }
        self.dirty.handoffs[handoff.handoff_id] = {
          handoff,
          version: version,
        };
      },
    };
    this.occurrences = {
      async get(id) {
        return self.dirty.occurrences[id] ?? null;
      },
      async save(occ, expected) {
        const cur = self.dirty.occurrences[occ.occurrence_id];
        if (expected !== null && cur && cur.version !== expected) {
          throw new ConcurrencyError(`Occurrence version conflict`);
        }
        self.dirty.occurrences[occ.occurrence_id] = occ;
      },
    };
    this.riders = {
      async get(id) {
        return self.dirty.riders[id] ?? null;
      },
      async save(state, expected) {
        const cur = self.dirty.riders[state.rider_id];
        if (expected !== null && cur && cur.version !== expected) {
          throw new ConcurrencyError(`Rider version conflict`);
        }
        self.dirty.riders[state.rider_id] = state;
      },
    };
    this.events = {
      async append(events) {
        self.dirty.events.push(...events);
      },
      async listByObject(object_type, object_id) {
        return self.dirty.events.filter(
          (e) => e.object_type === object_type && e.object_id === object_id,
        );
      },
      async listAll() {
        return [...self.dirty.events];
      },
    };
    this.outbox = {
      async enqueue(record) {
        if (self.dirty.outbox.some((r) => r.event.event_id === record.event.event_id)) {
          return { duplicate: true };
        }
        if (
          self.dirty.outbox.some(
            (r) => r.event.idempotency_key === record.event.idempotency_key,
          )
        ) {
          return { duplicate: true };
        }
        const v = validatePublicEvent(record.event);
        if (!v.ok) throw new Error("Outbox: evento público inválido");
        self.dirty.outbox.push(record);
        return { duplicate: false };
      },
      async listPending() {
        return self.dirty.outbox.filter(
          (r) => r.status === "pending" || r.status === "failed",
        );
      },
      async markPublished(outbox_id, at) {
        const r = self.dirty.outbox.find((x) => x.outbox_id === outbox_id);
        if (r) {
          r.status = "published";
          r.published_at = at;
        }
      },
      async markFailed(outbox_id, error, at) {
        const r = self.dirty.outbox.find((x) => x.outbox_id === outbox_id);
        if (r) {
          r.status = "failed";
          r.last_error = error;
          r.last_attempt_at = at;
          r.attempts += 1;
        }
      },
      async all() {
        return [...self.dirty.outbox];
      },
    };
  }

  async commit(): Promise<void> {
    if (this.rolled) throw new Error("UoW already rolled back");
    saveData(this.dataFile, this.dirty);
    this.base = structuredClone(this.dirty);
    this.committed = true;
    this.rolled = false;
  }

  async rollback(): Promise<void> {
    this.dirty = structuredClone(this.base);
    this.rolled = false;
  }
}

/** Abre nova UoW sobre o mesmo arquivo (simula reinício de processo) */
export function openFileUnitOfWork(dataFile: string): FileUnitOfWork {
  return new FileUnitOfWork(dataFile);
}

export function createTempDataFile(baseDir: string): string {
  mkdirSync(baseDir, { recursive: true });
  return join(baseDir, `entregas-${randomUUID()}.json`);
}
