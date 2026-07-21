/* ============================================================================
 * Pedidos agrupados (Sprint 2.1, Fase 11).
 * ----------------------------------------------------------------------------
 * Puro. Cada pedido mantém identidade própria SEMPRE — um cartão agrupado
 * nunca vira um "pedido único" no modelo. Isto aqui é só a referência ao
 * grupo; os eventos da Conferência continuam por pedido individual.
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");
const { CONFIDENCE } = require("../contracts/states");

/**
 * Quando o Gestor não expõe um ID de grupo explícito, deriva um a partir dos
 * membros ordenados — determinístico (o mesmo conjunto sempre produz o mesmo
 * id), mas com confiança reduzida, porque é inferência, não fato observado.
 */
function deriveGroupId(memberOrderIds) {
  const sorted = (memberOrderIds || []).slice().sort();
  return "derived:" + crypto.createHash("sha256").update(sorted.join("|")).digest("hex").slice(0, 16);
}

/**
 * @param {object} signal
 *   groupId          ID explícito do Gestor, se houver
 *   groupType         ex.: "same_courier"
 *   memberOrderIds[]
 *   courierShared     entregador é o mesmo para todos os membros?
 *   observedAt
 */
function normalizeGrouping(signal) {
  const s = signal || {};
  const members = Array.isArray(s.memberOrderIds) ? s.memberOrderIds.slice() : [];
  if (!members.length) return null; // sem membros, não há grupo — nunca inventa um
  const explicit = Boolean(s.groupId);
  return {
    group_id: s.groupId || deriveGroupId(members),
    group_id_source: explicit ? "observado" : "derivado",
    group_type: s.groupType || "unknown",
    member_order_ids: members,
    courier_shared: s.courierShared === true,
    observed_at: s.observedAt || null,
    confidence: explicit ? (s.confidence || CONFIDENCE.HIGH) : CONFIDENCE.LOW
  };
}

/** Diferença entre duas leituras de agrupamento do mesmo pedido — entrada/saída de membro. */
function groupingChanged(prev, curr) {
  if (!prev && !curr) return { changed: false };
  if (!prev || !curr) return { changed: true, added: curr ? curr.member_order_ids : [], removed: prev ? prev.member_order_ids : [] };
  const prevSet = new Set(prev.member_order_ids);
  const currSet = new Set(curr.member_order_ids);
  const added = curr.member_order_ids.filter((id) => !prevSet.has(id));
  const removed = prev.member_order_ids.filter((id) => !currSet.has(id));
  return { changed: added.length > 0 || removed.length > 0 || prev.group_id !== curr.group_id, added, removed };
}

/**
 * Versiona o histórico de agrupamento de um pedido — nunca substitui a versão
 * anterior, só acrescenta quando algo muda (mesmo padrão de
 * `reconciliation.js#reconcileItems`).
 */
function reconcileGrouping(observations) {
  const withGroup = (observations || [])
    .map((o) => normalizeGrouping(o))
    .filter(Boolean);
  if (!withGroup.length) return { current: null, versions: [] };
  const versions = [];
  for (const g of withGroup) {
    const last = versions[versions.length - 1];
    if (last && !groupingChanged(last, g).changed) continue;
    versions.push(g);
  }
  return { current: versions[versions.length - 1], versions };
}

module.exports = { deriveGroupId, normalizeGrouping, groupingChanged, reconcileGrouping };
