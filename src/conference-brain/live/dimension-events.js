/* ============================================================================
 * Eventos derivados de mudança de dimensão (Sprint 2.2, Fase 5).
 * ----------------------------------------------------------------------------
 * Puro. Compara duas reconciliações sucessivas (`reconcileMultidimensional`)
 * do MESMO pedido e produz uma lista de eventos descritivos — nunca eventos
 * do relógio da Conferência (`clock.js` continua com seu próprio vocabulário
 * fechado, testado, e SEM depender deste módulo — ver Fase 18).
 *
 * Cada evento é idempotente (mesmo par prev/curr produz o mesmo `event_id`) e
 * determinístico. Não decide nada — só relata o que mudou, para quem quiser
 * auditar ou, no futuro, alimentar observabilidade.
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");

const DIMENSION_EVENT_TYPES = Object.freeze({
  ACTION_AVAILABLE: "action_available",
  ACTION_REMOVED: "action_removed",
  INDICATOR_STARTED: "indicator_started",
  INDICATOR_ENDED: "indicator_ended",
  GROUP_JOINED: "group_joined",
  GROUP_LEFT: "group_left",
  SCHEDULED_ORDER_ACTIVATED: "scheduled_order_activated",
  DIMENSION_CONFIDENCE_DEGRADED: "dimension_confidence_degraded"
});

function eventId(orderId, type, key, observedAt) {
  return crypto.createHash("sha256").update(`${orderId}|${type}|${key}|${observedAt}`).digest("hex").slice(0, 24);
}

/**
 * @param {string} orderId
 * @param {object|null} prev  reconciliação anterior (ou null, primeira leitura)
 * @param {object} curr        reconciliação atual
 * @param {string} observedAt
 * @returns {object[]} eventos derivados desta transição
 */
function deriveDimensionEvents(orderId, prev, curr, observedAt) {
  if (!curr) return [];
  const events = [];
  const add = (type, key, extra) => events.push(Object.assign({
    event_id: eventId(orderId, type, key, observedAt),
    order_id: orderId, type, observed_at: observedAt
  }, extra));

  // Ações — comparação por código (não por objeto inteiro, para não gerar
  // "removido+disponível" em falso quando só a confiança/rótulo mudou).
  const prevActionCodes = new Set((prev && prev.available_actions || []).map((a) => a.code));
  const currActionCodes = new Set((curr.available_actions || []).map((a) => a.code));
  for (const code of currActionCodes) if (!prevActionCodes.has(code)) add(DIMENSION_EVENT_TYPES.ACTION_AVAILABLE, code, { code });
  for (const code of prevActionCodes) if (!currActionCodes.has(code)) add(DIMENSION_EVENT_TYPES.ACTION_REMOVED, code, { code });

  // Indicadores — mesma lógica, por código.
  const prevIndCodes = new Set((prev && prev.indicators || []).map((i) => i.code));
  const currIndCodes = new Set((curr.indicators || []).map((i) => i.code));
  for (const code of currIndCodes) if (!prevIndCodes.has(code)) add(DIMENSION_EVENT_TYPES.INDICATOR_STARTED, code, { code });
  for (const code of prevIndCodes) if (!currIndCodes.has(code)) add(DIMENSION_EVENT_TYPES.INDICATOR_ENDED, code, { code });

  // Agrupamento — entrada/saída do PRÓPRIO pedido no grupo (member set do grupo atual).
  const prevGroupMembers = new Set((prev && prev.grouping && prev.grouping.member_order_ids) || []);
  const currGroupMembers = new Set((curr.grouping && curr.grouping.member_order_ids) || []);
  const wasGrouped = prevGroupMembers.size > 0;
  const isGrouped = currGroupMembers.size > 0;
  if (!wasGrouped && isGrouped) add(DIMENSION_EVENT_TYPES.GROUP_JOINED, curr.grouping.group_id || "sem_id", { group_id: curr.grouping.group_id || null });
  if (wasGrouped && !isGrouped) add(DIMENSION_EVENT_TYPES.GROUP_LEFT, (prev.grouping && prev.grouping.group_id) || "sem_id", { group_id: (prev.grouping && prev.grouping.group_id) || null });

  // Agendamento — ativação (true -> false é o único sentido válido; ver schedule.js).
  const wasScheduled = Boolean(prev && prev.schedule && prev.schedule.is_scheduled);
  const isScheduled = Boolean(curr.schedule && curr.schedule.is_scheduled);
  if (wasScheduled && !isScheduled) {
    add(DIMENSION_EVENT_TYPES.SCHEDULED_ORDER_ACTIVATED, "ativado", {
      scheduled_for: curr.schedule.scheduled_for || null
    });
  }

  // Confiança degradada — qualquer dimensão escalar que tinha confiança alta/media
  // e passou a ter baixa (nunca o contrário: subir confiança não é "evento").
  const CONF_RANK = { alta: 3, media: 2, baixa: 1 };
  if (prev && prev.dimension_provenance && curr.dimension_provenance) {
    for (const dim of ["order_state", "courier", "dispatch", "completion", "fulfillment", "store"]) {
      const p = prev.dimension_provenance[dim], c = curr.dimension_provenance[dim];
      const pConf = p && p.history && p.history.length ? p.history[p.history.length - 1].confidence : null;
      const cConf = c && c.history && c.history.length ? c.history[c.history.length - 1].confidence : null;
      if (pConf && cConf && (CONF_RANK[cConf] || 0) < (CONF_RANK[pConf] || 0)) {
        add(DIMENSION_EVENT_TYPES.DIMENSION_CONFIDENCE_DEGRADED, dim, { dimension: dim, from: pConf, to: cConf });
      }
    }
  }

  return events;
}

module.exports = { DIMENSION_EVENT_TYPES, eventId, deriveDimensionEvents };
