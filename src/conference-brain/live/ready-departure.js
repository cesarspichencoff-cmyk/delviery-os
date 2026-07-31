/* ============================================================================
 * Detecção de PRONTO e SAÍDA (Sprint 2, Fase 6).
 * ----------------------------------------------------------------------------
 * Regra central: "concluído" na tela do iFood NUNCA vira "saiu da loja" por
 * suposição. São eventos diferentes — o pedido pode aparecer como concluído
 * na visão do iFood (ex.: modalidade retirada, ou o app fecha o ciclo antes
 * da saída física) sem que ninguém tenha observado a saída real da loja.
 * ==========================================================================*/
"use strict";

const { LIVE_ORDER_STATUS } = require("../contracts/live-states");

/** Estados que representam o pedido PRONTO (a partir daqui, entra em Conferência). */
const READY_MILESTONE_STATUSES = Object.freeze([
  LIVE_ORDER_STATUS.READY,
  LIVE_ORDER_STATUS.AWAITING_PICKUP
]);

/**
 * Estados que representam SAÍDA REAL observada. Note que `COMPLETED` está
 * DELIBERADAMENTE fora desta lista — ver cabeçalho do arquivo.
 */
const DEPARTURE_MILESTONE_STATUSES = Object.freeze([
  LIVE_ORDER_STATUS.DEPARTED
]);

/** Estados que apenas indicam entrega física ao entregador — não é saída da loja. */
const HANDOFF_ONLY_STATUSES = Object.freeze([LIVE_ORDER_STATUS.PICKED_UP]);

function isReadyMilestone(status) { return READY_MILESTONE_STATUSES.includes(status); }
function isDepartureMilestone(status) { return DEPARTURE_MILESTONE_STATUSES.includes(status); }

/**
 * Avalia, sobre o HISTÓRICO de status observados de um pedido, se a saída real
 * foi comprovada. Nunca infere saída a partir de `completed` sozinho.
 * @param {string[]} statusHistory  status canônicos na ordem observada
 * @returns {{observed:boolean, status:string|null, reason:string}}
 */
function departureEvidence(statusHistory) {
  const list = Array.isArray(statusHistory) ? statusHistory : [];
  const departed = list.find((s) => isDepartureMilestone(s));
  if (departed) return { observed: true, status: departed, reason: "status_departed_observado_na_tela" };

  const completedOnly = list.includes(LIVE_ORDER_STATUS.COMPLETED) &&
    !list.some((s) => isDepartureMilestone(s));
  if (completedOnly) {
    return {
      observed: false, status: null,
      reason: "tela_marcou_concluido_mas_nao_expoe_saida_real;aguardando_evento_manual"
    };
  }

  const pickedUpOnly = list.includes(LIVE_ORDER_STATUS.PICKED_UP) &&
    !list.some((s) => isDepartureMilestone(s));
  if (pickedUpOnly) {
    return {
      observed: false, status: null,
      reason: "entregador_retirou_na_loja_mas_saida_fisica_nao_confirmada;aguardando_evento_manual"
    };
  }

  return { observed: false, status: null, reason: "nenhum_sinal_de_saida_observado" };
}

module.exports = {
  READY_MILESTONE_STATUSES, DEPARTURE_MILESTONE_STATUSES, HANDOFF_ONLY_STATUSES,
  isReadyMilestone, isDepartureMilestone, departureEvidence
};
