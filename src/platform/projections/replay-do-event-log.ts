/**
 * A porta de leitura do event log para o replay da Operação Viva (Q-016).
 *
 * Decisão do César: `platform.event_log` é a fonte durável que governa a
 * reconstrução da projeção depois de um reinício. Esta é a MENOR porta que
 * torna isso possível, e ela existe para ler — nada mais.
 *
 * O QUE ELA GARANTE, E POR QUAL MECANISMO
 *
 * - **Nunca escreve.** A leitura roda numa transação `READ ONLY` declarada ao
 *   PostgreSQL. Não é disciplina de quem escreve o código: se alguém um dia
 *   acrescentar um INSERT aqui dentro — numa outbox, num job, no próprio log —,
 *   o banco recusa com erro, e o replay falha alto em vez de emitir efeito.
 *
 * - **Modo preservado, nunca inventado.** Linha sem `source_mode` é histórico
 *   anterior à migration 0003: fica FORA do replay e é CONTADA como
 *   `sem_modo`, que é UNKNOWN. Não vira `real`, não é inferida de unidade, de
 *   origem, de nada. Modo fora de `real|simulated|control` é corrupção, e
 *   também fica fora — contado, com motivo.
 *
 * - **Um reconstrutor só.** O envelope sai de `envelopeDaMensagem`, a MESMA
 *   função que o consumidor vivo aplica à mensagem da outbox, alimentada com os
 *   mesmos campos. Duas reconstruções — uma para o fluxo, outra para o replay —
 *   divergiriam no primeiro campo novo, e o fato relido deixaria de ser
 *   reconhecido como o fato que chegou pela fila.
 *
 * - **Sem dependência de ordem.** Não há `ORDER BY`. `projetar` ordena por
 *   instante, sequência e id por conta própria, e `reconstruirPorReplay`
 *   deduplica por chave de idempotência: a ordem em que o banco devolve as
 *   linhas não pode mudar o resultado, e os testes embaralham para provar.
 *
 * O QUE O LOG PRESERVA E O QUE NÃO PRESERVA — declarado, não escondido
 *
 * `occurred_at` é `timestamptz`: o log guarda o INSTANTE, com precisão de
 * microssegundo, e não o TEXTO que o produtor mandou. `"12:00:00Z"` volta como
 * `"12:00:00.000Z"`, e `"09:00:00-03:00"` volta como `"12:00:00.000Z"`. Mesmo
 * instante, outra grafia. A projeção compara instantes (`Date.parse`), então a
 * equivalência entre projeção viva e reconstruída é de instantes — e é assim
 * que ela é medida. Nenhuma migration pode devolver uma grafia que nunca foi
 * gravada.
 *
 * `sequence_local` é `BIGINT`, e o driver o devolve como TEXTO. Sem a
 * conversão explícita abaixo, `envelopeDaMensagem` descartaria a sequência
 * (ela exige `number`) e o envelope relido desempataria diferente do vivo.
 */

import { SOURCE_MODES, type EventEnvelope, type SourceMode } from "../contracts/event-catalog";
import type { TransactionalSqlClient } from "../persistence/sql-client";
import { envelopeDaMensagem } from "./consumidor";

export const PORTA_DE_REPLAY_VERSION = "replay-do-event-log@1.0.0";

export interface LinhaFora {
  event_id: string;
  motivo: string;
}

export interface LeituraParaReplay {
  /** Fatos aptos: tipo da Operação Viva, modo presente e dentro do contrato. */
  aptos: EventEnvelope[];
  /** Linhas dos tipos certos SEM modo — histórico anterior à 0003. UNKNOWN. */
  sem_modo: number;
  /** Linhas que não viram envelope, com o motivo. Nunca corrigidas aqui. */
  corrompidas: LinhaFora[];
  /** Linhas dos tipos pedidos que o banco devolveu, aptas ou não. */
  lidas: number;
}

/**
 * Lê do event log os fatos que a Operação Viva sabe projetar.
 *
 * `tipos` vem de quem monta o consumidor — `TIPOS_DA_OPERACAO_VIVA`, a fonte
 * única de registro e roteamento. A porta não mantém uma terceira lista.
 */
export async function lerFatosParaReplay(
  cliente: TransactionalSqlClient,
  tipos: readonly string[],
): Promise<LeituraParaReplay> {
  return cliente.transaction(async (tx) => {
    // Primeiro comando da transação. Depois dele, qualquer escrita nesta
    // conexão é recusada pelo PostgreSQL.
    await tx.query("SET TRANSACTION READ ONLY");

    const linhas = await tx.query(
      `SELECT event_id, unit_id, object_type, object_id, event_type, occurred_at, origin,
              device_id, sequence_local, idempotency_key, contract_version, source_mode,
              recorded_at, clock_trust
         FROM platform.event_log
        WHERE event_type = ANY($1)`,
      [tipos],
    );

    const aptos: EventEnvelope[] = [];
    const corrompidas: LinhaFora[] = [];
    let sem_modo = 0;

    for (const l of linhas) {
      const event_id = String(l.event_id);
      const modo = l.source_mode;

      if (modo === null || modo === undefined) {
        sem_modo += 1;
        continue;
      }
      if (!SOURCE_MODES.includes(modo as SourceMode)) {
        corrompidas.push({ event_id, motivo: `source_mode fora do contrato: ${JSON.stringify(modo)}` });
        continue;
      }

      let sequence: number | undefined;
      if (l.sequence_local !== null && l.sequence_local !== undefined) {
        const n = Number(l.sequence_local);
        if (!Number.isSafeInteger(n) || n < 0) {
          corrompidas.push({ event_id, motivo: `sequence_local ilegível: ${String(l.sequence_local)}` });
          continue;
        }
        sequence = n;
      }

      const instante = l.occurred_at instanceof Date ? l.occurred_at : new Date(String(l.occurred_at));
      if (Number.isNaN(instante.getTime())) {
        corrompidas.push({ event_id, motivo: `occurred_at ilegível: ${String(l.occurred_at)}` });
        continue;
      }

      const envelope = envelopeDaMensagem({
        outbox_id: `replay:${event_id}`,
        kind: String(l.event_type),
        idempotency_key: String(l.idempotency_key),
        payload: {
          event_id,
          event_type: l.event_type,
          event_version: l.contract_version,
          unit_id: l.unit_id,
          // `objetoDe` na ingestão dá precedência à viagem: se o fato tinha
          // `trip_id`, o objeto é `trip` e o id é ele. A volta é exata.
          trip_id: l.object_type === "trip" ? l.object_id : undefined,
          device_id: l.device_id ?? undefined,
          occurred_at: instante.toISOString(),
          // Os dois carimbos do servidor, como a mensagem da outbox os leva.
          // `clock_trust` vem cru: o do histórico é o padrão `trusted` da 0001,
          // e quem decide o que ele vale é `relogioEfetivo`, contra `recorded_at`.
          received_at: l.recorded_at instanceof Date ? l.recorded_at.toISOString() : l.recorded_at ?? undefined,
          clock_trust: l.clock_trust ?? undefined,
          origin: l.origin,
          source_mode: modo,
          sequence,
        },
      });
      if (!envelope) {
        corrompidas.push({ event_id, motivo: "campos mínimos ausentes para reconstruir o envelope" });
        continue;
      }
      aptos.push(envelope);
    }

    return { aptos, sem_modo, corrompidas, lidas: linhas.length };
  });
}
