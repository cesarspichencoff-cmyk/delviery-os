/**
 * Feed duravel de Entregas sobre a outbox publica commitada.
 *
 * A fronteira le somente OutboxRepository; nao conhece JSON nem agregados.
 * Para FileUnitOfWork, a factory abre uma UoW nova a cada poll.
 */

import type { EntregasEventFeed } from "../contracts/EntregasEventFeed";
import type { EntregasPublicEvent } from "../contracts/events/types";
import type { OutboxRepository } from "../persistence/ports";
import { openFileUnitOfWork } from "../persistence/file-store";

export class EntregasFeedCursorNotFound extends Error {
  constructor(readonly cursor: string) {
    super(
      "cursor " +
        JSON.stringify(cursor) +
        " nao existe no snapshot duravel; recusado para nao pular historico",
    );
    this.name = "EntregasFeedCursorNotFound";
  }
}

export type OutboxReaderFactory =
  () => OutboxRepository | Promise<OutboxRepository>;

export class CommittedOutboxEntregasEventFeed implements EntregasEventFeed {
  constructor(private readonly openOutbox: OutboxReaderFactory) {}

  private async snapshot(): Promise<EntregasPublicEvent[]> {
    const outbox = await this.openOutbox();
    const records = await outbox.all();
    return records.map((r) => structuredClone(r.event));
  }

  async list(options?: {
    after_event_id?: string;
    limit?: number;
  }): Promise<EntregasPublicEvent[]> {
    const all = await this.snapshot();
    let start = 0;

    if (options?.after_event_id) {
      const idx = all.findIndex(
        (e) => e.event_id === options.after_event_id,
      );
      if (idx < 0) {
        throw new EntregasFeedCursorNotFound(options.after_event_id);
      }
      start = idx + 1;
    }

    const rest = all.slice(start);
    if (options?.limit === undefined) return rest;
    if (!Number.isInteger(options.limit) || options.limit <= 0) {
      throw new Error("entregas_feed_limit_invalid");
    }
    return rest.slice(0, options.limit);
  }

  async poll(
    cursor: string | null,
    limit = 50,
  ): Promise<{
    events: EntregasPublicEvent[];
    next_cursor: string | null;
  }> {
    const events = await this.list({
      after_event_id: cursor ?? undefined,
      limit,
    });
    return {
      events,
      next_cursor: events.length
        ? events[events.length - 1].event_id
        : cursor,
    };
  }
}

/**
 * Leitura com atestação, para a fronteira de procedência da plataforma.
 *
 * Mesmo snapshot, mesma ordem e mesmo cursor de `poll`; só acrescenta a
 * atestação e a identidade do registro (`outbox_id`). Nada aqui verifica:
 * quem consome decide.
 */
export interface ItemDoFeedAtestavel {
  readonly source_ref: string;
  readonly event: EntregasPublicEvent;
  readonly attestation: string | null;
}

export class CommittedOutboxAttestableFeed extends CommittedOutboxEntregasEventFeed {
  constructor(private readonly openRecords: OutboxReaderFactory) {
    super(openRecords);
  }

  async pollAtestavel(
    cursor: string | null,
    limit = 50,
  ): Promise<{ itens: ItemDoFeedAtestavel[]; next_cursor: string | null }> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("entregas_feed_limit_invalid");
    }
    const outbox = await this.openRecords();
    const records = (await outbox.all()).map((r) => structuredClone(r));
    let start = 0;
    if (cursor !== null) {
      const idx = records.findIndex((r) => r.event.event_id === cursor);
      if (idx < 0) throw new EntregasFeedCursorNotFound(cursor);
      start = idx + 1;
    }
    const itens = records.slice(start, start + limit).map((r) => ({
      source_ref: r.outbox_id,
      event: r.event,
      attestation: typeof r.attestation === "string" ? r.attestation : null,
    }));
    return {
      itens,
      next_cursor: itens.length ? itens[itens.length - 1].event.event_id : cursor,
    };
  }
}

export function createFileEntregasAttestableFeed(
  dataFile: string,
): CommittedOutboxAttestableFeed {
  return new CommittedOutboxAttestableFeed(
    () => openFileUnitOfWork(dataFile).outbox,
  );
}

export function createFileEntregasEventFeed(
  dataFile: string,
): EntregasEventFeed {
  return new CommittedOutboxEntregasEventFeed(
    () => openFileUnitOfWork(dataFile).outbox,
  );
}
