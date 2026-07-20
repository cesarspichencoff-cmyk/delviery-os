import type { EntregasPublicEvent } from "../contracts/events/types";
import type { EntregasOperationalEventAdapter } from "../contracts/EntregasEventFeed";
import { validatePublicEvent } from "../contracts/events/validate";

export type OutboxStatus =
  | "pending"
  | "published"
  | "failed"
  | "dead_letter";

export interface OutboxRecord {
  outbox_id: string;
  event: EntregasPublicEvent;
  status: OutboxStatus;
  attempts: number;
  created_at: string;
  last_attempt_at?: string;
  last_error?: string;
  published_at?: string;
}

/**
 * Transactional Outbox (F0: memória).
 * Domínio enfileira; publicação assíncrona; falha do consumidor não reverte domínio.
 */
export class InMemoryTransactionalOutbox {
  private readonly records: OutboxRecord[] = [];
  private readonly byEventId = new Map<string, OutboxRecord>();
  private readonly byIdempotency = new Map<string, OutboxRecord>();
  private seq = 0;

  /** Enfileira após validação. Idempotente por event_id e idempotency_key. */
  enqueue(event: EntregasPublicEvent): {
    record: OutboxRecord;
    duplicate: boolean;
  } {
    const v = validatePublicEvent(event);
    if (!v.ok) {
      throw new Error(
        `Outbox recusou evento inválido: ${v.issues.map((i) => i.message).join("; ")}`,
      );
    }
    const existingId = this.byEventId.get(event.event_id);
    if (existingId) return { record: existingId, duplicate: true };
    const existingKey = this.byIdempotency.get(event.idempotency_key);
    if (existingKey) return { record: existingKey, duplicate: true };

    const record: OutboxRecord = {
      outbox_id: `obx_${++this.seq}`,
      event: v.event,
      status: "pending",
      attempts: 0,
      created_at: new Date().toISOString(),
    };
    this.records.push(record);
    this.byEventId.set(event.event_id, record);
    this.byIdempotency.set(event.idempotency_key, record);
    return { record, duplicate: false };
  }

  pending(): OutboxRecord[] {
    return this.records.filter((r) => r.status === "pending" || r.status === "failed");
  }

  all(): readonly OutboxRecord[] {
    return this.records;
  }

  /**
   * Entrega pendentes ao adapter. Falha NÃO remove o registro (permanece failed/pending).
   * Reprocessamento idempotente no adapter.
   */
  async flush(
    adapter: EntregasOperationalEventAdapter,
    options?: { max_attempts?: number },
  ): Promise<{ published: number; failed: number; skipped: number }> {
    const max = options?.max_attempts ?? 5;
    let published = 0;
    let failed = 0;
    let skipped = 0;

    const available = await adapter.isAvailable();
    for (const rec of this.pending()) {
      if (rec.attempts >= max) {
        rec.status = "dead_letter";
        skipped++;
        continue;
      }
      rec.attempts += 1;
      rec.last_attempt_at = new Date().toISOString();
      if (!available) {
        rec.status = "failed";
        rec.last_error = "adapter_unavailable";
        failed++;
        continue;
      }
      try {
        const res = await adapter.publish(rec.event);
        if (res.accepted) {
          rec.status = "published";
          rec.published_at = new Date().toISOString();
          rec.last_error = res.reason;
          published++;
        } else {
          rec.status = "failed";
          rec.last_error = res.reason ?? "rejected";
          failed++;
        }
      } catch (err) {
        rec.status = "failed";
        rec.last_error = err instanceof Error ? err.message : String(err);
        failed++;
      }
    }
    return { published, failed, skipped };
  }

  /** Histórico auditável de publicação */
  publicationLog(): Array<{
    outbox_id: string;
    event_id: string;
    event_type: string;
    status: OutboxStatus;
    attempts: number;
    published_at?: string;
    last_error?: string;
  }> {
    return this.records.map((r) => ({
      outbox_id: r.outbox_id,
      event_id: r.event.event_id,
      event_type: r.event.event_type,
      status: r.status,
      attempts: r.attempts,
      published_at: r.published_at,
      last_error: r.last_error,
    }));
  }
}
