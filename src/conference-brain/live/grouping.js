/* ============================================================================
 * Pedidos agrupados (Sprint 2.1, Fase 11 · semântica de ausência no Sprint 2.2, Fase 4).
 * ----------------------------------------------------------------------------
 * Puro. Cada pedido mantém identidade própria SEMPRE — um cartão agrupado
 * nunca vira um "pedido único" no modelo. Isto aqui é só a referência ao
 * grupo; os eventos da Conferência continuam por pedido individual.
 *
 * Bloqueador 5 da rechecagem: uma leitura com `memberOrderIds: []` era
 * silenciosamente descartada (convertida em `null`, filtrada) — idêntica a
 * "esta leitura não checou agrupamento". Isso fazia o pedido continuar
 * "atualmente" no grupo antigo mesmo depois de sair dele de verdade. A
 * correção exige que quem observa declare a diferença: `observed:true`
 * numa leitura vazia significa "eu OLHEI e não há grupo agora" (o pedido
 * pode ter saído); ausência de `observed` significa "esta leitura não
 * checou essa dimensão" (cartão compacto, por exemplo) — nunca apaga o que
 * já se sabia.
 * ==========================================================================*/
"use strict";

const crypto = require("crypto");
const { CONFIDENCE } = require("../contracts/states");

/** Vocabulário de presença — nunca `undefined`/`null`/array-vazio usados de forma intercambiável. */
const PRESENCE = Object.freeze({ UNOBSERVED: "unobserved", PRESENT: "present", REMOVED: "removed" });

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
 *   observed          true = esta leitura CHECOU a área de agrupamento (mesmo
 *                      que tenha achado vazio); ausente/false = a leitura não
 *                      olhou essa dimensão (ex.: cartão compacto sem esse dado)
 *   observedAt
 * @returns {object|null} `null` só quando a leitura nunca checou agrupamento
 *   (nem membros, nem `observed:true`) — nesse caso não há NADA a reconciliar,
 *   nem "presente" nem "removido".
 */
function normalizeGrouping(signal) {
  const s = signal || {};
  const members = Array.isArray(s.memberOrderIds) ? s.memberOrderIds.slice() : [];

  if (!members.length) {
    if (s.observed !== true) return null; // não checado nesta leitura — não afeta o que já se sabia
    return {
      group_id: null, group_id_source: "observado_vazio", group_type: "unknown",
      member_order_ids: [], courier_shared: false,
      presence: PRESENCE.REMOVED,
      observed_at: s.observedAt || null, confidence: CONFIDENCE.HIGH
    };
  }

  const explicit = Boolean(s.groupId);
  return {
    group_id: s.groupId || deriveGroupId(members),
    group_id_source: explicit ? "observado" : "derivado",
    group_type: s.groupType || "unknown",
    member_order_ids: members,
    courier_shared: s.courierShared === true,
    presence: PRESENCE.PRESENT,
    observed_at: s.observedAt || null,
    confidence: explicit ? (s.confidence || CONFIDENCE.HIGH) : CONFIDENCE.LOW
  };
}

/** Diferença entre duas leituras de agrupamento do mesmo pedido — entrada/saída de membro. */
function groupingChanged(prev, curr) {
  if (!prev && !curr) return { changed: false };
  if (!prev || !curr) return { changed: true, added: curr ? curr.member_order_ids : [], removed: prev ? prev.member_order_ids : [] };
  if (prev.presence !== curr.presence) return { changed: true, added: curr.member_order_ids, removed: prev.member_order_ids };
  const prevSet = new Set(prev.member_order_ids);
  const currSet = new Set(curr.member_order_ids);
  const added = curr.member_order_ids.filter((id) => !prevSet.has(id));
  const removed = prev.member_order_ids.filter((id) => !currSet.has(id));
  return { changed: added.length > 0 || removed.length > 0 || prev.group_id !== curr.group_id, added, removed };
}

/**
 * Versiona o histórico de agrupamento de um pedido — nunca substitui a versão
 * anterior, só acrescenta quando algo muda (mesmo padrão de
 * `reconciliation.js#reconcileItems`). Uma leitura `unobserved` (ver
 * `normalizeGrouping`) simplesmente não entra aqui — `current` continua a
 * última versão REAL (presente ou removida), nunca regride para "nada".
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

module.exports = { PRESENCE, deriveGroupId, normalizeGrouping, groupingChanged, reconcileGrouping };
