import type { EntregasPublicEvent } from "./events/types";

/**
 * Interface pública para o DELIVERYOS Copiloto consumir fatos do Entregas
 * sem conhecer domínio interno, tabelas ou UI.
 *
 * Nesta fase: implementação in-memory + mock consumer.
 * NÃO conectar ao Copiloto congelado.
 */
export interface EntregasEventFeed {
  /** Lê eventos publicados (ordem de publicação) */
  list(options?: {
    after_event_id?: string;
    limit?: number;
  }): Promise<EntregasPublicEvent[]>;

  /** Polling simples por cursor */
  poll(
    cursor: string | null,
    limit?: number,
  ): Promise<{ events: EntregasPublicEvent[]; next_cursor: string | null }>;
}

/**
 * Adapter operacional — porta de saída substituível.
 * Entregas publica; consumidor externo (futuro Copiloto) subscreve.
 */
export interface EntregasOperationalEventAdapter {
  readonly name: string;
  publish(event: EntregasPublicEvent): Promise<{ accepted: boolean; reason?: string }>;
  /** Health do lado consumidor — falha NÃO bloqueia domínio */
  isAvailable(): Promise<boolean>;
}

/** Consumidor de teste / mock — não é o Copiloto real */
export interface MockCopilotoConsumer {
  readonly received: EntregasPublicEvent[];
  readonly rejected: Array<{ event: EntregasPublicEvent; reason: string }>;
  available: boolean;
  accept(event: EntregasPublicEvent): { accepted: boolean; reason?: string };
  reset(): void;
}

export function createMockCopilotoConsumer(
  initiallyAvailable = true,
): MockCopilotoConsumer {
  const received: EntregasPublicEvent[] = [];
  const rejected: Array<{ event: EntregasPublicEvent; reason: string }> = [];
  return {
    received,
    rejected,
    available: initiallyAvailable,
    accept(event) {
      if (!this.available) {
        const reason = "copiloto_unavailable";
        rejected.push({ event, reason });
        return { accepted: false, reason };
      }
      // idempotência no consumer mock
      if (received.some((e) => e.event_id === event.event_id)) {
        return { accepted: true, reason: "duplicate_ignored" };
      }
      if (received.some((e) => e.idempotency_key === event.idempotency_key)) {
        return { accepted: true, reason: "duplicate_idempotency_ignored" };
      }
      received.push(event);
      return { accepted: true };
    },
    reset() {
      received.length = 0;
      rejected.length = 0;
      this.available = true;
    },
  };
}
