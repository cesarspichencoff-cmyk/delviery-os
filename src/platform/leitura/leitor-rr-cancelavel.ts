/**
 * Q-026 guarded RR adapter (CANDIDATE ONLY).
 * A request-specific PostgreSQL transaction uses a deadline from HTTP
 * admission and an AbortSignal from either deadline or socket disconnect.
 *
 * Every statement after SET TRANSACTION gets SET LOCAL statement_timeout
 * equal to the remaining global budget. Cancellation uses a separate
 * restricted-in-scope PostgreSQL pool, not the reader's borrowed connection.
 *
 * IMPORTANT: No guarantee for CPU-only synchronous work after the transaction
 * and no strict guarantee for pool.connect() waiting. Candidate is opt-in
 * from a research-only Product System branch. Not promoted or deployed.
 */
import type { SqlClient, SqlRow, TransactionalSqlClient } from "../persistence/sql-client";

export interface ProtecaoRr {
  readonly signal: AbortSignal;
  readonly prazoAbsolutoMs: number;
  readonly cancelador: SqlClient;
}

export function leitorRrCancelavel(
  base: TransactionalSqlClient,
  protecao: ProtecaoRr,
): TransactionalSqlClient {
  const { signal, prazoAbsolutoMs, cancelador } = protecao;
  if (!Number.isFinite(prazoAbsolutoMs)) throw Error("Q026_INVALID_DEADLINE");
  function garantirPrazo(): number {
    if (signal.aborted) throw Error("Q026_READ_ABORTED");
    const restante = Math.ceil(prazoAbsolutoMs - Date.now());
    if (restante <= 0) throw Error("Q026_READ_DEADLINE_EXCEEDED");
    return restante;
  }
  return {
    query: <R extends SqlRow = SqlRow>(sql: string, args?: readonly unknown[]) =>
      base.query<R>(sql, args),
    close: () => Promise.resolve(),
    transaction: <T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> =>
      base.transaction(async tx => {
        let pid: number | null = null;
        const cancelamentos: Promise<unknown>[] = [];
        // Crucial: we will not release the original DB connection until each
        // requested cancel has settled. Otherwise it could hit a reused PID.
        const cancelar = () => {
          if (pid === null) return;
          const target = pid;
          const task = cancelador.query(
            "SELECT pg_cancel_backend($1::int) AS cancelled", [target],
          );
          cancelamentos.push(task);
          // An isolated failed cancel must never be an unhandled rejection:
          // the per-statement server timeout still bounds active statements.
          void task.catch(() => undefined);
        };
        signal.addEventListener("abort", cancelar, { once: true });
        try {
          garantirPrazo();
          let iniciou = false;
          const proxied: SqlClient = {
            query: async <R extends SqlRow = SqlRow>(
              sql: string, args: readonly unknown[] = [],
            ): Promise<R[]> => {
              garantirPrazo();
              if (!iniciou) {
                if (!/SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY/i.test(sql))
                  throw Error("Q026_FIRST_COMMAND_MUST_BE_RR_READ_ONLY");
                const result = await tx.query<R>(sql, args);
                iniciou = true;
                // Must come AFTER SET TRANSACTION, otherwise the isolation
                // level cannot be changed.
                pid = Number((await tx.query("SELECT pg_backend_pid()::int AS pid"))[0]?.pid);
                if (!Number.isInteger(pid) || pid <= 0) throw Error("Q026_BACKEND_PID_MISSING");
                if (signal.aborted) cancelar();
                garantirPrazo();
                return result;
              }
              // Conservative integer literal from local clock; cannot contain
              // user data or SQL syntax. Both cancel signal and PG statement
              // timeout can interrupt an active SQL operation.
              const ms = Math.min(15_000, garantirPrazo());
              await tx.query(`SET LOCAL statement_timeout = '${ms}ms'`);
              garantirPrazo();
              const result = await tx.query<R>(sql, args);
              garantirPrazo();
              return result;
            },
          };
          const result = await fn(proxied);
          garantirPrazo();
          return result;
        } finally {
          signal.removeEventListener("abort", cancelar);
          await Promise.allSettled(cancelamentos);
        }
      }),
  };
}
