import type {
  EntregasEventFeed,
  EntregasOperationalEventAdapter,
  MockCopilotoConsumer,
} from "../contracts/EntregasEventFeed";
import type { EntregasPublicEvent } from "../contracts/events/types";
import type { InMemoryTransactionalOutbox } from "./outbox";

export class InMemoryEntregasEventFeed implements EntregasEventFeed {
  constructor(private readonly outbox: InMemoryTransactionalOutbox) {}

  async list(options?: {
    after_event_id?: string;
    limit?: number;
  }): Promise<EntregasPublicEvent[]> {
    const published = this.outbox
      .all()
      .filter((r) => r.status === "published")
      .map((r) => r.event);
    let start = 0;
    if (options?.after_event_id) {
      const idx = published.findIndex((e) => e.event_id === options.after_event_id);
      start = idx >= 0 ? idx + 1 : published.length;
    }
    const slice = published.slice(start);
    return options?.limit ? slice.slice(0, options.limit) : slice;
  }

  async poll(
    cursor: string | null,
    limit = 50,
  ): Promise<{ events: EntregasPublicEvent[]; next_cursor: string | null }> {
    const events = await this.list({
      after_event_id: cursor ?? undefined,
      limit,
    });
    const next =
      events.length > 0 ? events[events.length - 1].event_id : cursor;
    return { events, next_cursor: next };
  }
}

/** Adapter que encaminha ao mock consumer — substituível */
export class MockCopilotoAdapter implements EntregasOperationalEventAdapter {
  readonly name = "mock-copiloto-adapter";

  constructor(private readonly consumer: MockCopilotoConsumer) {}

  async isAvailable(): Promise<boolean> {
    return this.consumer.available;
  }

  async publish(
    event: EntregasPublicEvent,
  ): Promise<{ accepted: boolean; reason?: string }> {
    return this.consumer.accept(event);
  }
}

/** Adapter que sempre falha — para testes de falha segura */
export class UnavailableCopilotoAdapter implements EntregasOperationalEventAdapter {
  readonly name = "unavailable-copiloto-adapter";

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async publish(): Promise<{ accepted: boolean; reason?: string }> {
    return { accepted: false, reason: "copiloto_unavailable" };
  }
}
