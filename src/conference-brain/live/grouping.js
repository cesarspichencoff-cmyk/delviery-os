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

/**
 * Vocabulário de presença — nunca `undefined`/`null`/array-vazio usados de
 * forma intercambiável. `CONFLICT` (Sprint 2.4, bloqueador 1) é o estado
 * explícito para quando duas leituras do MESMO `observed_at` discordam sem
 * nenhum metadado causal mais forte para desempatar — nunca uma escolha
 * arbitrária de PRESENT ou REMOVED.
 */
const PRESENCE = Object.freeze({ UNOBSERVED: "unobserved", PRESENT: "present", REMOVED: "removed", CONFLICT: "conflict" });

function sha256(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }

/** Serialização estável (chaves ordenadas) — só para desempate determinístico, nunca para inferir ordem temporal. */
function stableStringify(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

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
 *   sequence          (opcional, Sprint 2.4) metadado causal — posição de
 *                      ingestão monotônica quando a fonte a fornecer; mais
 *                      confiável que `observedAt` para desempate de empate.
 *   version           (opcional, Sprint 2.4) metadado causal alternativo,
 *                      usado quando `sequence` não está disponível.
 * @returns {object|null} `null` só quando a leitura nunca checou agrupamento
 *   (nem membros, nem `observed:true`) — nesse caso não há NADA a reconciliar,
 *   nem "presente" nem "removido".
 */
function normalizeGrouping(signal) {
  const s = signal || {};
  const members = Array.isArray(s.memberOrderIds) ? s.memberOrderIds.slice() : [];
  const causal = {
    sequence: Number.isFinite(s.sequence) ? s.sequence : null,
    version: Number.isFinite(s.version) ? s.version : null
  };

  if (!members.length) {
    if (s.observed !== true) return null; // não checado nesta leitura — não afeta o que já se sabia
    return Object.assign({
      group_id: null, group_id_source: "observado_vazio", group_type: "unknown",
      member_order_ids: [], courier_shared: false,
      presence: PRESENCE.REMOVED,
      observed_at: s.observedAt || null, confidence: CONFIDENCE.HIGH
    }, causal);
  }

  const explicit = Boolean(s.groupId);
  return Object.assign({
    group_id: s.groupId || deriveGroupId(members),
    group_id_source: explicit ? "observado" : "derivado",
    group_type: s.groupType || "unknown",
    member_order_ids: members,
    courier_shared: s.courierShared === true,
    presence: PRESENCE.PRESENT,
    observed_at: s.observedAt || null,
    confidence: explicit ? (s.confidence || CONFIDENCE.HIGH) : CONFIDENCE.LOW
  }, causal);
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
 * Duas leituras normalizadas representam o MESMO fato (ignorando o que não
 * descreve o fato em si — `confidence` pode variar por leitura sem que o
 * fato mude)?
 */
function sameFact(a, b) {
  return a.presence === b.presence && a.group_id === b.group_id &&
    JSON.stringify(a.member_order_ids.slice().sort()) === JSON.stringify(b.member_order_ids.slice().sort());
}

/**
 * Constrói o marcador explícito de CONFLITO — nunca escolhe PRESENT ou
 * REMOVED arbitrariamente quando duas leituras do MESMO `observed_at`
 * discordam sem metadado causal mais forte para desempatar. `member_order_ids`
 * vazio e `group_id` nulo são o default mais seguro (nunca afirmar
 * pertencimento a um grupo que pode não existir mais); os dois candidatos
 * ficam preservados em `conflicting_candidates`, ordenados por um hash de
 * conteúdo — só para tornar a REPRESENTAÇÃO determinística entre replays,
 * nunca para inferir qual leitura "aconteceu depois" (a missão proíbe
 * explicitamente usar hash com essa finalidade).
 */
function buildConflict(candidates) {
  const sorted = candidates.slice().sort((a, b) => sha256(stableStringify(a)).localeCompare(sha256(stableStringify(b))));
  return {
    group_id: null, group_id_source: "conflito_sem_causalidade", group_type: "unknown",
    member_order_ids: [], courier_shared: false,
    presence: PRESENCE.CONFLICT,
    observed_at: sorted[0].observed_at, confidence: CONFIDENCE.LOW,
    sequence: null, version: null,
    conflicting_candidates: sorted.map((c) => ({
      presence: c.presence, group_id: c.group_id, member_order_ids: c.member_order_ids
    }))
  };
}

/**
 * Resolve um grupo de leituras que compartilham o MESMO `observed_at`.
 * Sprint 2.4 (bloqueador 1 da rechecagem relâmpago do 2.3): ordenar por
 * `observed_at` e dobrar sequencialmente resolve empate por ORDEM DE
 * CHEGADA via sort estável — array `[present, removed]` e `[removed,
 * present]` (mesmo timestamp) produziam resultados diferentes. Corrigido:
 * todo empate é resolvido ANTES da dobra sequencial, aqui, de forma
 * simétrica (independente de qual candidato apareceu primeiro no array):
 *   1. leituras idênticas (mesmo fato) colapsam sem ambiguidade;
 *   2. `sequence` (Sprint 2.4, opcional) é o metadado causal mais confiável
 *      quando presente em TODOS os candidatos e os distingue — vence o
 *      maior (posição de ingestão monotônica, não posição no array);
 *   3. na ausência de `sequence`, `version` desempata do mesmo jeito;
 *   4. sem nenhum metadado causal mais forte que `observed_at` e com fatos
 *      genuinamente diferentes, o resultado é um marcador de CONFLITO
 *      explícito — nunca uma escolha arbitrária de PRESENT/REMOVED.
 */
function resolveTie(candidates) {
  const distinct = [];
  for (const c of candidates) {
    if (!distinct.some((d) => sameFact(d, c))) distinct.push(c);
  }
  if (distinct.length === 1) return distinct[0];

  if (distinct.every((c) => c.sequence != null)) {
    const bySeq = distinct.slice().sort((a, b) => b.sequence - a.sequence);
    if (bySeq[0].sequence !== bySeq[1].sequence) return bySeq[0];
  }
  if (distinct.every((c) => c.version != null)) {
    const byVer = distinct.slice().sort((a, b) => b.version - a.version);
    if (byVer[0].version !== byVer[1].version) return byVer[0];
  }
  return buildConflict(distinct);
}

/**
 * Versiona o histórico de agrupamento de um pedido — nunca substitui a versão
 * anterior, só acrescenta quando algo muda (mesmo padrão de
 * `reconciliation.js#reconcileItems`). Uma leitura `unobserved` (ver
 * `normalizeGrouping`) simplesmente não entra aqui — `current` continua a
 * última versão REAL (presente ou removida), nunca regride para "nada".
 *
 * Sprint 2.3 (bloqueador 3 da rechecagem do 2.2): a versão anterior dobrava
 * as leituras na ORDEM DE CHEGADA do array — `current` era "a última do
 * array", não "a última no TEMPO". Uma leitura antiga entregue por último
 * (rede fora de ordem, retry, replay) "ressuscitava" um grupo já encerrado
 * por uma leitura mais nova. Corrigido: ordena por `observed_at` ANTES de
 * dobrar em versões.
 *
 * Sprint 2.4 (bloqueador 1 da rechecagem relâmpago): ordenar sozinho não
 * bastava — um EMPATE de `observed_at` com fatos contraditórios ainda
 * dependia de qual candidato ficava "por último" no sort estável (ordem de
 * chegada do array outra vez, disfarçada). Corrigido: os candidatos são
 * primeiro AGRUPADOS por `observed_at` (uma `Map`, cuja construção não
 * depende de ordem de inserção para o resultado final) e cada grupo é
 * resolvido por `resolveTie` — simétrico, independente de qual candidato
 * chegou primeiro. Só depois o resultado (um candidato por timestamp
 * distinto) é ordenado e dobrado em versões, exatamente como antes.
 */
function reconcileGrouping(observations) {
  const withGroup = (observations || []).map((o) => normalizeGrouping(o)).filter(Boolean);
  if (!withGroup.length) return { current: null, versions: [] };

  const byTimestamp = new Map();
  for (const g of withGroup) {
    const key = String(g.observed_at || "");
    if (!byTimestamp.has(key)) byTimestamp.set(key, []);
    byTimestamp.get(key).push(g);
  }
  const resolved = Array.from(byTimestamp.values())
    .map((candidates) => (candidates.length === 1 ? candidates[0] : resolveTie(candidates)))
    .sort((a, b) => String(a.observed_at || "").localeCompare(String(b.observed_at || "")));

  const versions = [];
  for (const g of resolved) {
    const last = versions[versions.length - 1];
    if (last && !groupingChanged(last, g).changed) continue;
    versions.push(g);
  }
  return { current: versions[versions.length - 1], versions };
}

module.exports = {
  PRESENCE, deriveGroupId, normalizeGrouping, groupingChanged, reconcileGrouping,
  resolveTie, buildConflict
};
