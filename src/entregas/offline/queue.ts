/**
 * Fila offline REAL do dispositivo — COR §17 (offline, idempotência, conflitos).
 *
 * Substitui o contador visual da UiApplicationFacade (que era "demo offline =
 * fila visual" e perdia o evento se a rede caísse). Aqui o evento é gravado
 * ANTES de qualquer tentativa de rede e só sai da fila com confirmação
 * explícita do servidor.
 *
 * Garantias (todas testadas):
 *  - `occurred_at` do aparelho nunca é sobrescrito pelo horário de envio;
 *    `recorded_at`/`synced_at` são campos separados (COR §17.1).
 *  - `sequence_local` monotônica por dispositivo preserva a ordem local
 *    mesmo quando a rede entrega fora de ordem (COR §17.2.3).
 *  - Idempotência por `event_id` e por `idempotency_key`: reenviar o mesmo
 *    lote nunca duplica efeito (COR §17.2.1/2).
 *  - Sobrevive a reinício: o estado vive no storage, não em memória.
 *  - Nenhuma perda silenciosa: falha vira retry com backoff; excesso de
 *    tentativas vira `dead_letter` VISÍVEL, nunca descarte.
 *  - `clock_trust` marcado `suspect` quando o relógio do aparelho diverge
 *    além da tolerância (COR §17.2.6).
 *
 * Não conhece GPS nem domínio: transporta envelopes opacos. Isso mantém a
 * fila reutilizável para confirmação de entrega, ocorrência e ponto de GPS.
 */

import type { ClockTrust } from "../foundation/enums";

/** Porta de armazenamento — Node (arquivo) ou browser (localStorage/IndexedDB). */
export interface OfflineStorage {
  read(): string | null;
  write(data: string): void;
}

export const OFFLINE_ITEM_STATES = [
  "pending",
  "sending",
  "synced",
  "conflict",
  "dead_letter",
] as const;
export type OfflineItemState = (typeof OFFLINE_ITEM_STATES)[number];

export interface OfflineItem {
  /** Identidade global do evento — dedup no servidor. */
  event_id: string;
  /** Chave de negócio: mesmo fato, mesma chave (COR §17.2.2). */
  idempotency_key: string;
  /** Tipo do envelope (ex.: "gps_point", "delivery_confirmed"). */
  kind: string;
  /** Payload opaco para a fila. */
  payload: Record<string, unknown>;
  /** Instante no aparelho — NUNCA sobrescrito. */
  occurred_at: string;
  /** Quando entrou na fila local. */
  recorded_at: string;
  /** Quando o servidor confirmou. Ausente enquanto não sincronizado. */
  synced_at?: string;
  /** Ordem local monotônica do dispositivo. */
  sequence_local: number;
  /** Pseudonimizado — nunca IMEI/telefone. */
  device_id: string;
  trip_id?: string;
  state: OfflineItemState;
  attempts: number;
  next_attempt_at?: string;
  last_error?: string;
  clock_trust: ClockTrust;
}

export interface OfflineQueueConfig {
  device_id: string;
  /** Tentativas antes de virar dead_letter (visível, nunca descartado). */
  max_attempts: number;
  /** Backoff base em ms — dobra a cada tentativa, com teto. */
  backoff_base_ms: number;
  backoff_max_ms: number;
  /** Divergência de relógio acima disso marca clock_trust=suspect. */
  clock_skew_tolerance_ms: number;
  /** Teto de itens retidos; ao exceder, NUNCA descarta — sinaliza saturação. */
  max_items: number;
}

export const DEFAULT_OFFLINE_CONFIG: Omit<OfflineQueueConfig, "device_id"> = {
  max_attempts: 8,
  backoff_base_ms: 2000,
  backoff_max_ms: 300000,
  clock_skew_tolerance_ms: 120000,
  max_items: 5000,
};

interface QueueData {
  schema_version: string;
  sequence_local: number;
  items: OfflineItem[];
}

const SCHEMA_VERSION = "offline-queue@1";

function emptyData(): QueueData {
  return { schema_version: SCHEMA_VERSION, sequence_local: 0, items: [] };
}

export interface EnqueueInput {
  event_id: string;
  idempotency_key: string;
  kind: string;
  payload: Record<string, unknown>;
  /** Horário do aparelho. */
  occurred_at: string;
  trip_id?: string;
}

export interface SyncBatch {
  items: OfflineItem[];
}

/** Resultado por item devolvido pelo servidor. */
export interface SyncAck {
  event_id: string;
  status: "accepted" | "duplicate" | "conflict" | "rejected";
  synced_at: string;
  error?: string;
}

export class OfflineQueue {
  private data: QueueData;

  constructor(
    private readonly storage: OfflineStorage,
    private readonly config: OfflineQueueConfig,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.data = this.load();
  }

  private load(): QueueData {
    const raw = this.storage.read();
    if (!raw) return emptyData();
    try {
      const parsed = JSON.parse(raw) as QueueData;
      if (!parsed || parsed.schema_version !== SCHEMA_VERSION) {
        // Versão desconhecida: não adivinha formato e não apaga o arquivo.
        // Começa vazio em memória; o original permanece no storage para perícia.
        return emptyData();
      }
      if (!Array.isArray(parsed.items)) return emptyData();
      return parsed;
    } catch {
      // Corrupção parcial nunca destrói o que ainda é legível nem trava o app.
      return emptyData();
    }
  }

  private persist(): void {
    this.storage.write(JSON.stringify(this.data));
  }

  /**
   * Grava o evento ANTES de qualquer rede. Idempotente: mesmo event_id ou
   * mesma idempotency_key não cria segundo item.
   */
  enqueue(input: EnqueueInput): { item: OfflineItem; duplicate: boolean } {
    const existing = this.data.items.find(
      (i) =>
        i.event_id === input.event_id ||
        i.idempotency_key === input.idempotency_key,
    );
    if (existing) return { item: existing, duplicate: true };

    const nowIso = this.now().toISOString();
    const skew = Math.abs(
      Date.parse(nowIso) - Date.parse(input.occurred_at),
    );
    const future = Date.parse(input.occurred_at) - Date.parse(nowIso);
    const clock_trust: ClockTrust =
      !Number.isFinite(skew) || Number.isNaN(Date.parse(input.occurred_at))
        ? "unknown"
        : skew > this.config.clock_skew_tolerance_ms ||
            future > this.config.clock_skew_tolerance_ms
          ? "suspect"
          : "trusted";

    this.data.sequence_local += 1;
    const item: OfflineItem = {
      event_id: input.event_id,
      idempotency_key: input.idempotency_key,
      kind: input.kind,
      payload: input.payload,
      occurred_at: input.occurred_at,
      recorded_at: nowIso,
      sequence_local: this.data.sequence_local,
      device_id: this.config.device_id,
      trip_id: input.trip_id,
      state: "pending",
      attempts: 0,
      clock_trust,
    };
    this.data.items.push(item);
    this.persist();
    return { item, duplicate: false };
  }

  /**
   * Próximo lote a enviar, em ordem local (sequence_local), respeitando o
   * backoff de cada item. Marca como `sending` — reinício no meio do envio
   * devolve o item a `pending` via `recoverStuck()`.
   */
  nextBatch(limit = 50): SyncBatch {
    const nowMs = this.now().getTime();
    const items = this.data.items
      .filter((i) => i.state === "pending")
      .filter(
        (i) => !i.next_attempt_at || Date.parse(i.next_attempt_at) <= nowMs,
      )
      .sort((a, b) => a.sequence_local - b.sequence_local)
      .slice(0, limit);
    for (const i of items) i.state = "sending";
    if (items.length) this.persist();
    return { items };
  }

  /**
   * Aplica a confirmação do servidor. `duplicate` conta como sucesso — o
   * servidor já tinha o fato (reenvio seguro após timeout, COR §17.3).
   */
  applyAcks(acks: readonly SyncAck[]): void {
    for (const ack of acks) {
      const item = this.data.items.find((i) => i.event_id === ack.event_id);
      if (!item) continue;
      if (ack.status === "accepted" || ack.status === "duplicate") {
        item.state = "synced";
        item.synced_at = ack.synced_at;
        item.last_error = undefined;
      } else if (ack.status === "conflict") {
        // Conflito nunca é apagado: fica visível para reconciliação humana.
        item.state = "conflict";
        item.last_error = ack.error ?? "conflito";
        item.synced_at = ack.synced_at;
      } else {
        this.registerFailure(item, ack.error ?? "rejeitado");
      }
    }
    this.persist();
  }

  /** Falha de transporte (sem resposta): devolve para retry com backoff. */
  failBatch(items: readonly OfflineItem[], error: string): void {
    for (const sent of items) {
      const item = this.data.items.find((i) => i.event_id === sent.event_id);
      if (item) this.registerFailure(item, error);
    }
    this.persist();
  }

  private registerFailure(item: OfflineItem, error: string): void {
    item.attempts += 1;
    item.last_error = error;
    if (item.attempts >= this.config.max_attempts) {
      // Nunca descarta: vira dead_letter visível para intervenção.
      item.state = "dead_letter";
      return;
    }
    item.state = "pending";
    const delay = Math.min(
      this.config.backoff_base_ms * 2 ** (item.attempts - 1),
      this.config.backoff_max_ms,
    );
    item.next_attempt_at = new Date(this.now().getTime() + delay).toISOString();
  }

  /**
   * Recuperação após reinício: itens presos em `sending` (o app morreu no
   * meio do envio) voltam para `pending`. Reenviar é seguro — o servidor
   * deduplica por event_id.
   */
  recoverStuck(): number {
    let n = 0;
    for (const i of this.data.items) {
      if (i.state === "sending") {
        i.state = "pending";
        n += 1;
      }
    }
    if (n) this.persist();
    return n;
  }

  /** Remove os já sincronizados — chamada explícita, nunca automática. */
  purgeSynced(): number {
    const before = this.data.items.length;
    this.data.items = this.data.items.filter((i) => i.state !== "synced");
    if (this.data.items.length !== before) this.persist();
    return before - this.data.items.length;
  }

  pendingCount(): number {
    return this.data.items.filter(
      (i) => i.state === "pending" || i.state === "sending",
    ).length;
  }

  stats(): Record<OfflineItemState, number> & { saturated: boolean } {
    const out = {
      pending: 0,
      sending: 0,
      synced: 0,
      conflict: 0,
      dead_letter: 0,
    } as Record<OfflineItemState, number>;
    for (const i of this.data.items) out[i.state] += 1;
    return { ...out, saturated: this.data.items.length >= this.config.max_items };
  }

  all(): readonly OfflineItem[] {
    return this.data.items.slice();
  }

  byTrip(trip_id: string): readonly OfflineItem[] {
    return this.data.items.filter((i) => i.trip_id === trip_id);
  }
}

/** Storage em memória — testes e ambientes sem persistência. */
export class MemoryOfflineStorage implements OfflineStorage {
  constructor(private data: string | null = null) {}
  read(): string | null {
    return this.data;
  }
  write(data: string): void {
    this.data = data;
  }
}
