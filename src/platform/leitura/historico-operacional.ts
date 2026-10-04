/**
 * Janela histórica para superfície humana.
 *
 * Não é replay: lê uma unidade, com limite duro, por índice de unidade+tempo.
 * Não seleciona payload e roda em transação READ ONLY.
 */
import { SOURCE_MODES, type SourceMode } from "../contracts/event-catalog";
import type { TransactionalSqlClient } from "../persistence/sql-client";

export const HISTORICO_OPERACIONAL_LIMITE_PADRAO = 200;
export const HISTORICO_OPERACIONAL_LIMITE_MAXIMO = 500;

export interface FatoHistoricoOperacional {
  readonly event_id: string;
  readonly event_type: string;
  readonly occurred_at: string;
  readonly unit_id: string;
  readonly trip_id?: string;
  readonly device_id?: string;
  readonly source_mode: SourceMode;
  readonly origin: string;
  readonly sequence?: number;
}

export interface HistoricoOperacionalLimitado {
  readonly eventos: readonly FatoHistoricoOperacional[];
  readonly sem_modo: number;
  readonly corrompidas: readonly { event_id: string; motivo: string }[];
  readonly limite: number;
  readonly unit_id: string;
}

export async function lerHistoricoOperacional(
  cliente: TransactionalSqlClient,
  opcoes: { unit_id: string; tipos: readonly string[]; limite?: number },
): Promise<HistoricoOperacionalLimitado> {
  const unit_id = opcoes.unit_id.trim();
  if (!unit_id) throw new Error("unit_id_obrigatorio");

  const solicitado = opcoes.limite ?? HISTORICO_OPERACIONAL_LIMITE_PADRAO;
  if (!Number.isInteger(solicitado) || solicitado < 1) throw new Error("limite_invalido");
  const limite = Math.min(solicitado, HISTORICO_OPERACIONAL_LIMITE_MAXIMO);

  return cliente.transaction(async (tx) => {
    await tx.query("SET TRANSACTION READ ONLY");
    const linhas = await tx.query(
      `SELECT event_id, unit_id, object_type, object_id, event_type, occurred_at,
              origin, device_id, sequence_local, source_mode
         FROM platform.event_log
        WHERE unit_id = $1 AND event_type = ANY($2)
        ORDER BY unit_id, occurred_at DESC, event_id DESC
        LIMIT $3`,
      [unit_id, opcoes.tipos, limite],
    );

    const eventos: FatoHistoricoOperacional[] = [];
    const corrompidas: { event_id: string; motivo: string }[] = [];
    let sem_modo = 0;

    for (const l of linhas) {
      const event_id = String(l.event_id);
      const modo = l.source_mode;
      if (modo === null || modo === undefined) {
        sem_modo += 1;
        continue;
      }
      if (!SOURCE_MODES.includes(modo as SourceMode)) {
        corrompidas.push({ event_id, motivo: "source_mode_fora_do_contrato" });
        continue;
      }

      const instante = l.occurred_at instanceof Date ? l.occurred_at : new Date(String(l.occurred_at));
      if (Number.isNaN(instante.getTime())) {
        corrompidas.push({ event_id, motivo: "occurred_at_ilegivel" });
        continue;
      }

      let sequence: number | undefined;
      if (l.sequence_local !== null && l.sequence_local !== undefined) {
        const n = Number(l.sequence_local);
        if (!Number.isSafeInteger(n) || n < 0) {
          corrompidas.push({ event_id, motivo: "sequence_local_ilegivel" });
          continue;
        }
        sequence = n;
      }

      eventos.push({
        event_id,
        event_type: String(l.event_type),
        occurred_at: instante.toISOString(),
        unit_id: String(l.unit_id),
        trip_id: l.object_type === "trip" ? String(l.object_id) : undefined,
        device_id: l.device_id === null || l.device_id === undefined ? undefined : String(l.device_id),
        source_mode: modo as SourceMode,
        origin: String(l.origin),
        sequence,
      });
    }

    return { eventos, sem_modo, corrompidas, limite, unit_id };
  });
}
