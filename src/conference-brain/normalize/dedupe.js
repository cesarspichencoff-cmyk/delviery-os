/* ============================================================================
 * Deduplicação entre lotes — nunca apagar em silêncio.
 * ----------------------------------------------------------------------------
 * Exigência da missão: ao encontrar o mesmo pedido em dois lotes, registrar
 * qual foi preservado, qual foi considerado repetição, SE HAVIA DIVERGÊNCIA e
 * qual regra decidiu. O caso conhecido (IDs presentes em dois arquivos
 * históricos que se sobrepõem) precisa cair aqui, não sumir.
 * ==========================================================================*/
"use strict";

const { ORDER_STATUS, CONFIDENCE, ANOMALY_SEVERITY } = require("../contracts/states");

const DEDUP_RULE = "dedupe-v1:prefer-most-complete-then-earliest-observation";

/** Campos cuja divergência entre duas observações do mesmo pedido importa. */
const COMPARED_FIELDS = Object.freeze([
  "status", "received_at", "total_value", "distinct_items", "total_units"
]);

/** Quanto "conteúdo real" uma observação tem — mais completo vence. */
function completeness(order) {
  let n = 0;
  for (const f of ["received_at", "total_value", "distinct_items", "total_units",
                   "ready_at", "dispatched_at", "concluded_at"]) {
    if (order[f] !== null && order[f] !== undefined) n++;
  }
  if (order.status && order.status !== ORDER_STATUS.UNKNOWN) n++;
  return n;
}

function compare(a, b) {
  const diffs = [];
  for (const f of COMPARED_FIELDS) {
    const va = a[f] === undefined ? null : a[f];
    const vb = b[f] === undefined ? null : b[f];
    if (va !== vb) diffs.push({ field: f, kept: va, discarded: vb });
  }
  return diffs;
}

/**
 * Decide entre a observação já existente e a nova.
 * @returns {{action:'keep_existing'|'replace', winner, loser, divergences, rule, reason}}
 */
function resolve(existing, incoming) {
  const ce = completeness(existing);
  const ci = completeness(incoming);
  let winner, loser, reason;
  if (ci > ce) { winner = incoming; loser = existing; reason = "incoming_mais_completo"; }
  else if (ce > ci) { winner = existing; loser = incoming; reason = "existente_mais_completo"; }
  else {
    // empate em completude: preserva a observação mais antiga (primeira verdade vista)
    const te = Date.parse(existing.first_observed_at || existing.received_at || 0) || 0;
    const ti = Date.parse(incoming.first_observed_at || incoming.received_at || 0) || 0;
    if (ti < te) { winner = incoming; loser = existing; reason = "observacao_mais_antiga"; }
    else { winner = existing; loser = incoming; reason = "empate_preserva_existente"; }
  }
  const divergences = compare(winner, loser);
  return {
    action: winner === incoming ? "replace" : "keep_existing",
    winner, loser, divergences, rule: DEDUP_RULE, reason
  };
}

/**
 * Funde o vencedor com o perdedor sem inventar dado: campos ausentes no
 * vencedor são completados pelo perdedor; janela de observação é ampliada.
 */
function merge(winner, loser) {
  const out = Object.assign({}, winner);
  for (const [k, v] of Object.entries(loser)) {
    if ((out[k] === null || out[k] === undefined) && v !== null && v !== undefined) out[k] = v;
  }
  const firsts = [winner.first_observed_at, loser.first_observed_at].filter(Boolean).sort();
  const lasts = [winner.last_observed_at, loser.last_observed_at].filter(Boolean).sort();
  if (firsts.length) out.first_observed_at = firsts[0];
  if (lasts.length) out.last_observed_at = lasts[lasts.length - 1];
  // divergência real rebaixa a confiança — não silencia
  const d = compare(winner, loser);
  if (d.length) out.confidence = CONFIDENCE.MEDIUM;
  return out;
}

/** Anomalia auditável a partir de uma resolução de duplicidade. */
function toAnomaly(orderId, resolution, runId) {
  const hasDiv = resolution.divergences.length > 0;
  return {
    anomaly_id: "dup:" + orderId,
    type: hasDiv ? "duplicidade_com_divergencia" : "duplicidade_identica",
    severity: hasDiv ? ANOMALY_SEVERITY.WARNING : ANOMALY_SEVERITY.INFO,
    order_id: orderId,
    run_id: runId || null,
    description: hasDiv
      ? `Pedido observado em mais de um lote com divergencia em: ${resolution.divergences.map((x) => x.field).join(", ")}`
      : "Pedido observado em mais de um lote, sem divergencia de conteudo",
    evidence: {
      rule: resolution.rule,
      reason: resolution.reason,
      action: resolution.action,
      divergences: resolution.divergences
    },
    status: hasDiv ? "aberta" : "resolvida",
    resolution: hasDiv ? null : "mantido_registro_unico",
    detected_at: new Date().toISOString()
  };
}

module.exports = { DEDUP_RULE, COMPARED_FIELDS, completeness, compare, resolve, merge, toAnomaly };
