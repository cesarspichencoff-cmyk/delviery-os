/**
 * Lista mínima de unidades operacionais para superfícies de leitura.
 *
 * A fonte é identity.unit. Só unidades ativas entram; nenhuma inferência a
 * partir de device/event_log cria unidade. A transação é READ ONLY.
 */

import type { TransactionalSqlClient } from "../persistence/sql-client";

export interface UnidadeOperacionalLida {
  readonly unit_id: string;
  readonly display_name: string;
  readonly timezone: string;
}

export const UNIDADES_OPERACIONAIS_VERSION = "unidades-operacionais@1.0.0";

export async function lerUnidadesOperacionais(
  cliente: TransactionalSqlClient,
): Promise<readonly UnidadeOperacionalLida[]> {
  return cliente.transaction(async (tx) => {
    await tx.query("SET TRANSACTION READ ONLY");
    const rows = await tx.query(
      `SELECT unit_id, display_name, timezone
         FROM identity.unit
        WHERE active = TRUE
        ORDER BY display_name, unit_id`,
    );
    return rows.map((r) => ({
      unit_id: String(r.unit_id),
      display_name: String(r.display_name),
      timezone: String(r.timezone),
    }));
  });
}
