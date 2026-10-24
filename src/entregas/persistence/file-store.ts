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
  openSync,
  closeSync,
  fsyncSync,
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
  InboundReceiptRepository,
} from "./ports";
import { ConcurrencyError } from "./ports";
import { InboundReceiptCommandIdCollisionError, type DurableInboundReceipt } from "./inbound-receipt";
import type { Trip, Delivery, Handoff, DomainEvent } from "../foundation/types";
import type { Occurrence } from "../operational/occurrence";
import type { RiderOperationalState } from "../operational/rider-state";
import type { OutboxRecord } from "../integration/outbox";
import { validatePublicEvent } from "../contracts/events/validate";

export interface PilotInboundReceipt {
  event_id: string;
  idempotency_key: string;
  fingerprint: string;
  actor_id: string;
  role: string;
  /** Ausente apenas em recibos legados. Novo contrato exige command_id. */
  command_id?: string;
}

interface StoreData {
  // A partir da versao 1, omitir inbound_receipts e corrupcao, nao legado.
  receipt_schema_version: 1;
  // Recibo de entrada no MESMO arquivo/commit dos fatos de dominio.
  inbound_receipts: Record<string, PilotInboundReceipt>;
  trips: Record<string, TripRecord>;
  handoffs: Record<string, { handoff: Handoff; version: number }>;
  occurrences: Record<string, Occurrence>;
  riders: Record<string, RiderOperationalState>;
  events: DomainEvent[];
  outbox: OutboxRecord[];
}

function emptyData(): StoreData {
  return {
    receipt_schema_version: 1,
    inbound_receipts: {},
    trips: {},
    handoffs: {},
    occurrences: {},
    riders: {},
    events: [],
    outbox: [],
  };
}

function loadData(path: string): StoreData {
  if (!existsSync(path)) {
    if (existsSync(path + ".bak")) {
      // Queda entre duas renomeacoes antigas: NAO iniciar uma loja vazia.
      throw new Error("Armazenamento principal ausente com backup presente: recuperacao humana obrigatoria");
    }
    return emptyData();
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as StoreData;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Formato de armazenamento invalido");
  }
  if (parsed.receipt_schema_version !== undefined && parsed.receipt_schema_version !== 1) {
    throw new Error("Versao de recibos de entrada desconhecida: bloquear abertura");
  }
  const hasReceipts = Object.prototype.hasOwnProperty.call(parsed, "inbound_receipts");
  if (parsed.receipt_schema_version === 1 && !hasReceipts) {
    throw new Error("Recibos de entrada ausentes em arquivo com schema v1");
  }
  const receipts = hasReceipts ? parsed.inbound_receipts : {};
  if (!receipts || typeof receipts !== "object" || Array.isArray(receipts)) {
    throw new Error("Mapa de recibos de entrada invalido");
  }
  return { ...parsed, receipt_schema_version: 1, inbound_receipts: receipts };
}

function saveData(path: string, data: StoreData): void {
  const dir = join(path, "..");
  mkdirSync(dir, { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  // Sincroniza bytes do temporario ANTES de publicar o novo principal.
  // Nao prova sincronizacao da entrada de diretorio apos rename (SO/FS).
  const fd = openSync(tmp, "wx");
  try {
    writeFileSync(fd, JSON.stringify(data, null, 0), "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  // A copia de seguranca NUNCA remove o principal. Antes, mover o
  // principal para .bak criava uma janela de arquivo inexistente no boot.
  if (existsSync(path)) copyFileSync(path, `${path}.bak`);
  renameSync(tmp, path);
}

export class FileUnitOfWork implements UnitOfWork {
  private base: StoreData;
  private dirty: StoreData;
  private committed = false;
  private rolled = false;
  /** Snapshot bruto usado SOMENTE quando uma transacao grava recibo novo. */
  private diskImageAtOpen: string | null;

  readonly trips: TripRepository;
  readonly handoffs: HandoffRepository;
  readonly occurrences: OccurrenceRepository;
  readonly riders: RiderStateRepository;
  readonly events: EventStore;
  readonly outbox: OutboxRepository;
  readonly inboundReceipts: InboundReceiptRepository;

  /** Sem recibo nao existe ACK confiavel apos perda da resposta HTTP. */
  findInboundReceipt(eventId: string, key: string): PilotInboundReceipt | null {
    const byId = Object.prototype.hasOwnProperty.call(this.dirty.inbound_receipts, eventId)
      ? this.dirty.inbound_receipts[eventId] : undefined;
    return byId ?? Object.values(this.dirty.inbound_receipts)
      .find((r) => r.idempotency_key === key) ?? null;
  }

  /** Estagio transacional: domain service faz commit de ambos ou rollback de ambos. */
  stageInboundReceipt(record: PilotInboundReceipt): void {
    // Nunca deixar chaves de Object.prototype participar de recibos.
    // O contrato HTTP devera validar UUID antes de chamar esta camada.
    if (!record.event_id || /^(?:__proto__|prototype|constructor|toString|valueOf|hasOwnProperty|isPrototypeOf|propertyIsEnumerable|toLocaleString|__defineGetter__|__defineSetter__|__lookupGetter__|__lookupSetter__)$/i.test(record.event_id)) {
      throw new Error("event_id reservado ou vazio");
    }
    if (this.findInboundReceipt(record.event_id, record.idempotency_key)) {
      throw new ConcurrencyError("Recibo de evento ja registrado");
    }
    if (record.command_id?.trim() && Object.values(this.dirty.inbound_receipts)
      .some((p) => p.command_id === record.command_id)) {
      throw new InboundReceiptCommandIdCollisionError();
    }
    this.dirty.inbound_receipts[record.event_id] = structuredClone(record);
  }

  constructor(private readonly dataFile: string) {
    mkdirSync(join(dataFile, ".."), { recursive: true });
    this.diskImageAtOpen = existsSync(dataFile) ? readFileSync(dataFile, "utf8") : null;
    this.base = loadData(dataFile);
    this.dirty = structuredClone(this.base);

    const self = this;
    this.inboundReceipts = {
      hasStaged: () => Object.keys(self.dirty.inbound_receipts)
        .some((id) => !Object.prototype.hasOwnProperty.call(self.base.inbound_receipts, id)),
      async find(id, key, commandId) {
        // Recibo em staging NAO e evidencia de commit.
        const matched = Object.values(self.base.inbound_receipts)
          .filter((r) => r.event_id === id || r.idempotency_key === key ||
            (commandId !== undefined && r.command_id === commandId));
        return matched.map((r) => {
          // Recibos do antigo scaffold sem escopo/resultado nao sao ACK.
          // Nunca supor que o registro incompleto prova um replay.
          if (!["unit_id","outcome","recorded_at","actor_role",
                "device_id","command_id","command_type","code"]
              .every((k) => Object.prototype.hasOwnProperty.call(r, k))) {
            throw new Error("Recibo legado sem contrato autenticado: recuperacao assistida");
          }
          return structuredClone(r as unknown as DurableInboundReceipt);
        });
      },
      stage(r) { self.stageInboundReceipt({ ...r, role: r.actor_role }); }
    };
    this.trips = {
      async get(id) {
        return self.dirty.trips[id] ?? null;
      },
      async list() {
        return Object.values(self.dirty.trips).map((x) => structuredClone(x));
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
      async list() {
        return Object.values(self.dirty.handoffs).map((x) => structuredClone(x));
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
      async list() {
        return Object.values(self.dirty.occurrences).map((x) => structuredClone(x));
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
      async list() {
        return Object.values(self.dirty.riders).map((x) => structuredClone(x));
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

  hasPendingWrites(): boolean {
    // Compara a imagem operacional corrente com a ultima confirmada.
    // Nao confundir com lock entre processos.
    return JSON.stringify(this.dirty) !== JSON.stringify(this.base);
  }

  async commit(): Promise<void> {
    if (this.rolled) throw new Error("UoW already rolled back");
    // Toda transacao que TENHA OU ENCONTRE recibos deve falhar fechada
    // se a imagem do disco mudou. Evita tambem que escritor legado aberto
    // antes de um ACK apague o novo recibo (lost update sequencial).
    // NAO e lock multi-processo nem fsync de diretorio.
    const newReceipt = Object.keys(this.dirty.inbound_receipts)
      .some((id) => !Object.prototype.hasOwnProperty.call(this.base.inbound_receipts, id));
    const baseHasReceipts = Object.keys(this.base.inbound_receipts).length > 0;
    const current = existsSync(this.dataFile) ? readFileSync(this.dataFile, "utf8") : null;
    const parsedDisk = current === null ? null : JSON.parse(current) as unknown;
    if (current !== null && (!parsedDisk || typeof parsedDisk !== "object" || Array.isArray(parsedDisk))) {
      throw new Error("Estado persistido corrompido: commit bloqueado");
    }
    const disk = parsedDisk as { inbound_receipts?: Record<string, unknown> } | null;
    const diskHasReceipts = !!disk && !!disk.inbound_receipts &&
      typeof disk.inbound_receipts === "object" && !Array.isArray(disk.inbound_receipts) &&
      Object.keys(disk.inbound_receipts).length > 0;
    if ((newReceipt || baseHasReceipts || diskHasReceipts) &&
        current !== this.diskImageAtOpen) {
      throw new ConcurrencyError("Recibo presente em snapshot obsoleto: reabrir UoW");
    }
    saveData(this.dataFile, this.dirty);
    this.diskImageAtOpen = JSON.stringify(this.dirty, null, 0);
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
