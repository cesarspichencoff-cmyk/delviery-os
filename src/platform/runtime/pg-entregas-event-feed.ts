/**
 * Feed público de Entregas sobre PostgreSQL.
 *
 * Lê SOMENTE a outbox pública commitada. Não conhece agregados, tabelas de
 * domínio ou UI. O cursor é event_id; a ordem durável é o seq global da
 * public_outbox, que atravessa unidades sem colidir.
 */
import type { EntregasEventFeed } from "../../entregas/contracts/EntregasEventFeed";
import type { EntregasPublicEvent } from "../../entregas/contracts/events/types";
import { validatePublicEvent } from "../../entregas/contracts/events/validate";
import { EntregasFeedCursorNotFound } from "../../entregas/integration/durable-event-feed";
import type {
  SqlRow,
  TransactionalSqlClient,
} from "../persistence/sql-client";

interface CursorRow extends SqlRow {
  seq: number | string;
}

interface EventRow extends SqlRow {
  event_id: string;
  event: unknown;
}

export class PgEntregasFeedInvalidEvent extends Error {
  constructor(
    readonly event_id: string,
    readonly issues: readonly { path: string; message: string }[],
  ) {
    super(
      "entregas.public_outbox contém evento público inválido: " +
        JSON.stringify(event_id),
    );
    this.name = "PgEntregasFeedInvalidEvent";
  }
}

export class PgEntregasFeedIdentityMismatch extends Error {
  constructor(
    readonly row_event_id: string,
    readonly payload_event_id: string,
  ) {
    super(
      "entregas.public_outbox diverge event_id relacional vs JSON: " +
        JSON.stringify(row_event_id),
    );
    this.name = "PgEntregasFeedIdentityMismatch";
  }
}

function limitValido(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("entregas_feed_limit_invalid");
  }
  return limit;
}

function validar(rows: readonly EventRow[]): EntregasPublicEvent[] {
  return rows.map((row) => {
    const eventId = String(row.event_id);
    const v = validatePublicEvent(row.event);
    if (!v.ok) {
      throw new PgEntregasFeedInvalidEvent(eventId, v.issues);
    }
    if (v.event.event_id !== eventId) {
      throw new PgEntregasFeedIdentityMismatch(
        eventId,
        v.event.event_id,
      );
    }
    return structuredClone(v.event);
  });
}

export class PgCommittedOutboxEntregasEventFeed
  implements EntregasEventFeed
{
  constructor(private readonly db: TransactionalSqlClient) {}

  async list(options?: {
    after_event_id?: string;
    limit?: number;
  }): Promise<EntregasPublicEvent[]> {
    const limit = limitValido(options?.limit);

    return this.db.transaction(async (tx) => {
      await tx.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );

      let afterSeq: number | null = null;
      if (options?.after_event_id) {
        const cursor = await tx.query<CursorRow>(
          "SELECT seq FROM entregas.public_outbox WHERE event_id=$1",
          [options.after_event_id],
        );
        if (!cursor.length) {
          throw new EntregasFeedCursorNotFound(options.after_event_id);
        }
        afterSeq = Number(cursor[0].seq);
        if (!Number.isSafeInteger(afterSeq) || afterSeq < 1) {
          throw new Error("entregas_pg_feed_seq_invalid");
        }
      }

      const params: unknown[] = [];
      const clauses: string[] = [];
      if (afterSeq !== null) {
        params.push(afterSeq);
        clauses.push("seq > $" + params.length);
      }

      let sql =
        "SELECT event_id,event FROM entregas.public_outbox" +
        (clauses.length ? " WHERE " + clauses.join(" AND ") : "") +
        " ORDER BY seq";

      if (limit !== undefined) {
        params.push(limit);
        sql += " LIMIT $" + params.length;
      }

      return validar(await tx.query<EventRow>(sql, params));
    });
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
