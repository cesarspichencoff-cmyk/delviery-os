/* ============================================================================
 * Reconciliador determinístico — eventos da inbox -> IfoodOrderSnapshot.
 * ----------------------------------------------------------------------------
 * Puro (sem I/O). A MESMA coleção de eventos produz o MESMO snapshot final,
 * independente da ordem de chegada — nunca usa posição no array como
 * causalidade (lição do Sprint 2.4 do conference-brain, reimplementada de
 * forma independente):
 *   1. dedup por `internal_event_id` (idempotência real, não por conteúdo);
 *   2. agrupa por timestamp EFETIVO (`occurred_at` quando o provedor
 *      informa, senão `received_at`);
 *   3. dois eventos de PROGRESSÃO contraditórios no mesmo timestamp, sem
 *      causalidade mais forte, viram `ORDER_STATUS.CONFLICT` explícito —
 *      nunca uma escolha arbitrária;
 *   4. cancelamento é terminal e sempre vence, como fato observado — nunca
 *      inferido;
 *   5. regressão de progresso nunca é escondida (vira anomalia), mas o
 *      evento mais recente ainda é aplicado como estado atual — a mesma
 *      fonte mais fresca decide, a anomalia fica registrada para
 *      investigação humana.
 * ==========================================================================*/
"use strict";

const { EVENT_TYPES, ORDER_PROGRESS_RANK } = require("../contracts/event-types");
const { ORDER_STATUS, EVENT_TO_STATUS, emptyOrderSnapshot } = require("../contracts/order-snapshot");

function effectiveTimestamp(e) {
  return e.occurred_at || e.received_at || null;
}

/**
 * @param {string} orderId
 * @param {object[]} inboxEvents  registros de `ifood_events_inbox` (de
 *   qualquer fonte/mistura de fontes — webhook e polling do mesmo pedido
 *   entram juntos aqui, exatamente como a missão exige)
 */
function reconcileOrder(orderId, inboxEvents) {
  const relevant = (inboxEvents || []).filter((e) => e && e.order_id === orderId);
  const anomalies = [];

  // 1. Dedup por identidade real -- nunca por posição, nunca "a última do array".
  const seen = new Map();
  for (const e of relevant) {
    if (!seen.has(e.internal_event_id)) seen.set(e.internal_event_id, e);
  }
  const unique = Array.from(seen.values());
  const duplicateCount = relevant.length - unique.length;

  if (!unique.length) {
    return { snapshot: emptyOrderSnapshot(orderId), anomalies, duplicate_count: 0 };
  }

  // 2. Agrupa por timestamp efetivo -- construção de Map não depende da
  //    ordem de inserção para o resultado final (mesmo padrão de
  //    grouping.js#reconcileGrouping do conference-brain).
  const byTimestamp = new Map();
  for (const e of unique) {
    const ts = String(effectiveTimestamp(e) || "");
    if (!byTimestamp.has(ts)) byTimestamp.set(ts, []);
    byTimestamp.get(ts).push(e);
  }

  const buckets = Array.from(byTimestamp.entries())
    .map(([ts, events]) => {
      const progressTypes = new Set(events.map((e) => e.event_type).filter((t) => ORDER_PROGRESS_RANK.includes(t)));
      const conflict = progressTypes.size > 1;
      if (conflict) {
        anomalies.push({
          type: "empate_temporal_conflitante", occurred_at: ts,
          event_ids: events.map((e) => e.internal_event_id).sort()
        });
      }
      return { ts, events, conflict };
    })
    .sort((a, b) => a.ts.localeCompare(b.ts));

  let status = ORDER_STATUS.UNKNOWN;
  let lastRank = -1;
  const history = [];
  const provenance = [];
  let cancelledEvent = null;
  let lastEventId = null;

  for (const bucket of buckets) {
    for (const e of bucket.events) {
      provenance.push({ event_id: e.internal_event_id, event_type: e.event_type, occurred_at: bucket.ts, source: e.source });
      if (e.event_type === EVENT_TYPES.ORDER_CANCELLED) cancelledEvent = e;
      lastEventId = e.internal_event_id;
    }

    if (bucket.conflict) {
      history.push({ status: ORDER_STATUS.CONFLICT, occurred_at: bucket.ts, event_ids: bucket.events.map((e) => e.internal_event_id) });
      continue; // um timestamp em conflito nunca decide o status "atual" sozinho
    }

    const e = bucket.events[0];
    const mapped = EVENT_TO_STATUS[e.event_type];
    if (!mapped) continue; // evento paralelo (courier, disputa...) ou desconhecido -- nunca muda order_status

    const rank = ORDER_PROGRESS_RANK.indexOf(e.event_type);
    if (rank !== -1 && lastRank !== -1 && rank < lastRank) {
      anomalies.push({ type: "regressao_de_progresso", from: status, to: mapped, event_id: e.internal_event_id, occurred_at: bucket.ts });
    }
    if (rank !== -1) lastRank = Math.max(lastRank, rank);
    status = mapped;
    history.push({ status, occurred_at: bucket.ts, event_id: e.internal_event_id });
  }

  if (cancelledEvent) status = ORDER_STATUS.CANCELLED; // terminal, sempre vence -- fato observado, nunca suposto

  const snapshot = Object.assign(emptyOrderSnapshot(orderId), {
    order_status: status,
    order_status_history: history,
    last_event_id: lastEventId,
    last_reconciled_at: new Date().toISOString(),
    provenance
  });

  return { snapshot, anomalies, duplicate_count: duplicateCount };
}

module.exports = { reconcileOrder, effectiveTimestamp };
