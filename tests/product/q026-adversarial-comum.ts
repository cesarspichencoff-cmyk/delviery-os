/**
 * Q-026 SHADOW — pecas comuns as duas suites adversariais de instantaneo e
 * cursor. Somente teste: nao muda o que o leitor envia ao banco, so decide
 * QUANDO uma escrita concorrente confirma, ou EM QUAL transacao ele corre.
 */

import type { SqlClient, SqlRow, TransactionalSqlClient } from "../../src/platform/persistence/sql-client";

export interface Ganchos {
  /** Depois que a n-esima transacao do leitor confirmou. */
  depoisDaTransacao?: (n: number) => Promise<void>;
  /** Antes da q-esima consulta da n-esima transacao do leitor. */
  antesDaConsulta?: (sql: string, n: number, q: number) => Promise<void>;
}

/**
 * O cliente do leitor, intacto, com dois pontos de interceptacao. Nao muda o
 * que o leitor envia ao banco: so DECIDE QUANDO o escritor confirma.
 */
export function comGanchos(base: TransactionalSqlClient, g: Ganchos): TransactionalSqlClient {
  let nTx = 0;
  return {
    query: <T extends SqlRow = SqlRow>(s: string, p?: readonly unknown[]) => base.query<T>(s, p),
    close: () => base.close(),
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
      nTx += 1;
      const n = nTx;
      const r = await base.transaction(async (tx) => {
        let q = 0;
        const interceptado: SqlClient = {
          query: async <R extends SqlRow = SqlRow>(s: string, p?: readonly unknown[]) => {
            q += 1;
            await g.antesDaConsulta?.(s, n, q);
            return tx.query<R>(s, p);
          },
        };
        return fn(interceptado);
      });
      await g.depoisDaTransacao?.(n);
      return r;
    },
  };
}

/**
 * A ALTERNATIVA SEGURA, sem tocar a porta: UMA transacao `REPEATABLE READ,
 * READ ONLY` e todas as transacoes que a porta abre correm DENTRO dela. O
 * nivel de isolamento vai antes de qualquer consulta; o `SET TRANSACTION READ
 * ONLY` que a porta repete depois e aceito pelo PostgreSQL.
 */
export async function numSoInstantaneo<T>(
  base: TransactionalSqlClient,
  corpo: (c: TransactionalSqlClient) => Promise<T>,
): Promise<T> {
  return base.transaction(async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const preso: TransactionalSqlClient = {
      query: <R extends SqlRow = SqlRow>(s: string, p?: readonly unknown[]) => tx.query<R>(s, p),
      transaction: <R>(fn: (t: SqlClient) => Promise<R>) => fn(tx),
      close: async () => undefined,
    };
    return corpo(preso);
  });
}
