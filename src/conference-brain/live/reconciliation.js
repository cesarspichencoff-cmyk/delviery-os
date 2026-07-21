/* ============================================================================
 * Reconciliação incremental POR CAMPO (Sprint 2, Fase 7).
 * ----------------------------------------------------------------------------
 * Corrige a limitação identificada na auditoria do Sprint 1: a deduplicação
 * de lá (`normalize/dedupe.js`) escolhe uma observação INTEIRA como vencedora
 * e a outra só preenche buracos. Isso é suficiente para reconciliar DOIS
 * LOTES históricos, mas não para um observador que lê a mesma tela a cada
 * poucos segundos e precisa acumular verdade aos poucos, campo a campo, sem
 * nunca perder o que uma leitura viu e a seguinte não repetiu.
 *
 * Princípio: toda observação bruta é preservada (nada é substituído em
 * memória, só agregado). O "pedido canônico" é uma PROJEÇÃO sobre o histórico
 * completo, recalculável a qualquer momento — nunca um estado mutável que
 * perde a leitura anterior.
 * ==========================================================================*/
"use strict";

const { LIVE_ORDER_STATUS, LIVE_ORDER_STATUS_LIST } = require("../contracts/live-states");
const { CONFIDENCE } = require("../contracts/states");

/** Ordem de progressão natural do status (não vale para cancelled/unknown). */
const STATUS_RANK = Object.freeze(
  LIVE_ORDER_STATUS_LIST.filter((s) => s !== LIVE_ORDER_STATUS.CANCELLED && s !== LIVE_ORDER_STATUS.UNKNOWN)
);
const rankOf = (s) => STATUS_RANK.indexOf(s);
const CONF_RANK = { [CONFIDENCE.HIGH]: 3, [CONFIDENCE.MEDIUM]: 2, [CONFIDENCE.LOW]: 1 };

/* ---------------------------------------------------------------------------
 * Identidade
 * ------------------------------------------------------------------------- */

/**
 * Agrupa observações por ID externo. Um ID curto do iFood que aparece
 * associado a mais de um ID completo (uuid) é um CONFLITO DE IDENTIDADE —
 * vira anomalia, nunca é resolvido por adivinhação de qual é o "certo".
 */
function detectIdentityConflicts(observations) {
  const shortToFull = new Map();
  const conflicts = [];
  for (const o of observations) {
    if (!o.short_id || !o.external_id) continue;
    if (!shortToFull.has(o.short_id)) shortToFull.set(o.short_id, new Set());
    shortToFull.get(o.short_id).add(o.external_id);
  }
  for (const [shortId, fullIds] of shortToFull) {
    if (fullIds.size > 1) {
      conflicts.push({
        type: "conflito_de_identidade", short_id: shortId, external_ids: Array.from(fullIds),
        description: `ID curto ${shortId} associado a ${fullIds.size} IDs completos diferentes`
      });
    }
  }
  return conflicts;
}

/* ---------------------------------------------------------------------------
 * Datas e horários — nunca substituir um evento mais preciso por um menos
 * preciso; toda divergência fica registrada, nenhuma é descartada.
 * ------------------------------------------------------------------------- */

function reconcileField(fieldName, observations) {
  const candidates = observations
    .filter((o) => o[fieldName] !== null && o[fieldName] !== undefined && o[fieldName] !== "")
    .map((o) => ({
      value: o[fieldName], observed_at: o.observed_at || null,
      confidence: o[fieldName + "_confidence"] || o.confidence || CONFIDENCE.MEDIUM,
      source: o.source || "desconhecida"
    }));
  if (!candidates.length) return { value: null, confidence: null, source: null, history: [], conflict: false };

  // vence a maior confiança; empate -> observação mais antiga (primeira verdade vista)
  const sorted = candidates.slice().sort((a, b) => {
    const c = (CONF_RANK[b.confidence] || 0) - (CONF_RANK[a.confidence] || 0);
    if (c !== 0) return c;
    return String(a.observed_at || "").localeCompare(String(b.observed_at || ""));
  });
  const winner = sorted[0];
  const distinctValues = new Set(candidates.map((c) => String(c.value)));
  return {
    value: winner.value, confidence: winner.confidence, source: winner.source,
    history: candidates, conflict: distinctValues.size > 1
  };
}

/* ---------------------------------------------------------------------------
 * Status — histórico completo preservado; atual = mais recente; regressão
 * inesperada nunca é silenciada, mesmo que ainda seja aplicada como "atual"
 * (a tela ao vivo é a fonte mais fresca — mas a anomalia fica registrada
 * para investigação humana, nunca escondida).
 * ------------------------------------------------------------------------- */

function reconcileStatus(observations) {
  const withStatus = observations
    .filter((o) => o.status)
    .slice()
    .sort((a, b) => String(a.observed_at || "").localeCompare(String(b.observed_at || "")));
  if (!withStatus.length) {
    return { current: LIVE_ORDER_STATUS.UNKNOWN, history: [], regressions: [] };
  }

  const history = withStatus.map((o) => ({
    status: o.status, observed_at: o.observed_at || null,
    event_time: o.event_time || null, confidence: o.confidence || CONFIDENCE.MEDIUM,
    origin: o.origin || "ifood_screen"
  }));

  const regressions = [];
  let lastRank = -1;
  for (const h of history) {
    const r = rankOf(h.status);
    if (r === -1) continue; // cancelled/unknown não entram na progressão
    if (lastRank !== -1 && r < lastRank) {
      regressions.push({
        type: "regressao_de_status_inesperada",
        from: STATUS_RANK[lastRank], to: h.status, observed_at: h.observed_at,
        description: `Status regrediu de "${STATUS_RANK[lastRank]}" para "${h.status}"`
      });
    }
    if (r !== -1) lastRank = Math.max(lastRank, r);
  }

  const current = history[history.length - 1].status;
  return { current, history, regressions };
}

/* ---------------------------------------------------------------------------
 * Itens — dedup quando idênticos; preserva a versão mais completa; preserva
 * TODAS as versões quando diferem; jamais perde item exclusivo de uma leitura.
 * ------------------------------------------------------------------------- */

function itemsFingerprint(items) {
  return (items || [])
    .map((i) => `${i.normalized_name || i.raw_name}|${i.quantity}|${i.observation || ""}`)
    .sort()
    .join("\n");
}

function reconcileItems(observations) {
  const withItems = observations
    .filter((o) => Array.isArray(o.items) && o.items.length)
    .slice()
    .sort((a, b) => String(a.observed_at || "").localeCompare(String(b.observed_at || "")));
  if (!withItems.length) return { current: [], versions: [], divergences: [] };

  // agrupa leituras consecutivas com o MESMO conteúdo — não duplica no histórico
  const versions = [];
  for (const o of withItems) {
    const fp = itemsFingerprint(o.items);
    const last = versions[versions.length - 1];
    if (last && last.fingerprint === fp) {
      last.observed_at_last = o.observed_at;
      last.seen_count++;
      continue;
    }
    versions.push({
      fingerprint: fp, items: o.items, observed_at_first: o.observed_at,
      observed_at_last: o.observed_at, seen_count: 1
    });
  }

  const divergences = [];
  for (let i = 1; i < versions.length; i++) {
    const prevNames = new Set(versions[i - 1].items.map((x) => x.normalized_name || x.raw_name));
    const currNames = new Set(versions[i].items.map((x) => x.normalized_name || x.raw_name));
    const lostFromPrev = Array.from(prevNames).filter((n) => !currNames.has(n));
    const addedInCurr = Array.from(currNames).filter((n) => !prevNames.has(n));
    if (lostFromPrev.length || addedInCurr.length) {
      divergences.push({
        type: "itens_alterados_entre_observacoes",
        between: [versions[i - 1].observed_at_last, versions[i].observed_at_first],
        removidos: lostFromPrev, adicionados: addedInCurr
      });
    }
  }

  // "current" = a versão mais completa entre a mais recente e a anterior a
  // ela, para não perder itens que a leitura mais nova truncou por acidente
  // (ex.: modal de detalhe ainda carregando no momento do ciclo).
  const latest = versions[versions.length - 1];
  const prior = versions[versions.length - 2];
  let current = latest.items;
  if (prior && prior.items.length > latest.items.length) {
    const latestNames = new Set(latest.items.map((x) => x.normalized_name || x.raw_name));
    const missingFromLatest = prior.items.filter((x) => !latestNames.has(x.normalized_name || x.raw_name));
    if (missingFromLatest.length) current = latest.items.concat(missingFromLatest);
  }

  return { current, versions, divergences };
}

/* ---------------------------------------------------------------------------
 * Observações do cliente — versionadas, nunca sobrescritas nem concatenadas
 * às cegas.
 * ------------------------------------------------------------------------- */

function reconcileObservationText(observations, fieldName) {
  const texts = observations
    .filter((o) => o[fieldName])
    .map((o) => ({ text: o[fieldName], observed_at: o.observed_at || null }));
  const seen = new Set();
  const versions = [];
  for (const t of texts) {
    if (seen.has(t.text)) continue;
    seen.add(t.text);
    versions.push(t);
  }
  return { current: versions.length ? versions[versions.length - 1].text : null, versions };
}

/* ---------------------------------------------------------------------------
 * Valor — origem, horário e conflito preservados; nunca "a média" nem "o maior".
 * ------------------------------------------------------------------------- */

function reconcileValue(observations) {
  return reconcileField("total_value", observations);
}

/* ---------------------------------------------------------------------------
 * Orquestração — reconcilia UM pedido a partir de todas as observações brutas
 * já feitas dele, em qualquer quantidade de ciclos.
 * ------------------------------------------------------------------------- */

function reconcileOrder(externalId, observations) {
  const list = Array.isArray(observations) ? observations.filter(Boolean) : [];
  if (!list.length) return null;

  const status = reconcileStatus(list);
  const items = reconcileItems(list);
  const value = reconcileValue(list);
  const receivedAt = reconcileField("received_at", list);
  const readyAt = reconcileField("ready_at", list);
  const departedAt = reconcileField("departed_at", list);
  const clientObservation = reconcileObservationText(list, "customer_note");

  const anomalies = []
    .concat(status.regressions)
    .concat(items.divergences)
    .concat(receivedAt.conflict ? [{ type: "conflito_de_valor", field: "received_at" }] : [])
    .concat(readyAt.conflict ? [{ type: "conflito_de_valor", field: "ready_at" }] : [])
    .concat(value.conflict ? [{ type: "conflito_de_valor", field: "total_value" }] : []);

  return {
    external_id: externalId,
    observation_count: list.length,
    status_current: status.current,
    status_history: status.history,
    items_current: items.current,
    items_versions: items.versions,
    customer_note: clientObservation.current,
    customer_note_versions: clientObservation.versions,
    received_at: receivedAt.value, received_at_confidence: receivedAt.confidence,
    ready_at: readyAt.value, ready_at_confidence: readyAt.confidence,
    departed_at: departedAt.value, departed_at_confidence: departedAt.confidence,
    total_value: value.value, total_value_confidence: value.confidence,
    field_provenance: { received_at: receivedAt, ready_at: readyAt, departed_at: departedAt, total_value: value },
    anomalies
  };
}

module.exports = {
  STATUS_RANK, rankOf,
  detectIdentityConflicts, reconcileField, reconcileStatus, reconcileItems,
  reconcileObservationText, reconcileValue, reconcileOrder, itemsFingerprint
};
