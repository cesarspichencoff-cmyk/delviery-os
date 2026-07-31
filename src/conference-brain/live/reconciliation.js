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

/* ============================================================================
 * Sprint 2.1 — reconciliação MULTIDIMENSIONAL (Fase 16).
 * ----------------------------------------------------------------------------
 * `reconcileOrder` acima resolve o modelo unidimensional do Sprint 2 (mantido
 * por compatibilidade). A partir daqui, cada dimensão de
 * `live/multidimensional-observation.js` é reconciliada de forma
 * INDEPENDENTE — nenhuma "vence" as outras, e nenhuma observação mais
 * compacta (ex.: cartão do modo Expedição) apaga um dado mais detalhado que
 * já foi visto (ex.: courier_state visto nos detalhes do pedido).
 *
 * Regra operacional: um valor "vazio" de uma dimensão (unknown/not_applicable)
 * significa "esta leitura não mostrou essa informação", não "essa informação
 * deixou de existir" — por isso ele NUNCA entra como candidato a "atual".
 * ==========================================================================*/
const M = require("./multidimensional-observation");
const { ORDER_STATE, ORDER_STATE_RANK } = require("../contracts/live-states");
const Grouping = require("./grouping");

const EMPTY_DIMENSION_VALUES = Object.freeze({
  order_state: ["unknown"],
  visual: ["unknown"],
  layout: ["unknown"],
  readiness: ["unknown"],
  courier: ["not_applicable", "unknown"],
  dispatch: ["not_applicable", "unknown"],
  completion: ["unknown"],
  fulfillment: ["unknown"],
  store: ["unknown"]
});

/**
 * Reconcilia uma dimensão ESCALAR (um valor canônico por leitura) preservando
 * todo o histórico e escolhendo como "atual" a leitura REAL mais recente —
 * leituras vazias (a dimensão não apareceu naquele modo/tela) são ignoradas
 * como candidatas, mas continuam no histórico bruto se presentes.
 */
function reconcileScalarDimension(observations, dimKey, valueField) {
  valueField = valueField || "value";
  const empties = EMPTY_DIMENSION_VALUES[dimKey] || [];
  const raw = [];
  const candidates = [];
  for (const o of observations) {
    const dim = o && o[dimKey];
    if (!dim) continue;
    const value = dim[valueField];
    if (value == null) continue;
    const entry = {
      value, observed_at: dim.observed_at || o.observed_at || null,
      confidence: dim.confidence || "media",
      raw_text: dim.raw_text || dim.raw_mode_name || dim.raw_section || null
    };
    raw.push(entry);
    if (!empties.includes(value)) candidates.push(entry);
  }
  if (!candidates.length) {
    return { value: empties[0] || "unknown", changed_at: null, history: raw, regressions: [] };
  }
  candidates.sort((a, b) => String(a.observed_at || "").localeCompare(String(b.observed_at || "")));

  // regressão só é avaliada para dimensões com progressão natural conhecida
  // (order_state) — as demais (courier/dispatch/...) não têm ordem estrita
  // o bastante para acusar regressão sem risco de falso positivo.
  const regressions = [];
  if (dimKey === "order_state") {
    let lastRank = -1;
    for (const c of candidates) {
      const r = ORDER_STATE_RANK.indexOf(c.value);
      if (r === -1) continue;
      if (lastRank !== -1 && r < lastRank) {
        regressions.push({
          type: "regressao_de_order_state_inesperada",
          from: ORDER_STATE_RANK[lastRank], to: c.value, observed_at: c.observed_at
        });
      }
      lastRank = Math.max(lastRank, r);
    }
  }

  const current = candidates[candidates.length - 1];
  return { value: current.value, changed_at: current.observed_at, history: raw, regressions };
}

/**
 * Reconcilia `readiness.available_actions[]` — versionado como os itens:
 * dedup de leituras idênticas consecutivas, nunca converte ação disponível em
 * evento (isso é papel do relógio, nunca desta reconciliação).
 */
/**
 * Bloqueador 7 da rechecagem: a versão anterior só considerava leituras com
 * `available_actions.length > 0` — uma leitura completa mostrando "a ação
 * sumiu" (`actions_observed:true`, lista vazia) era invisível, e a ação
 * antiga continuava "atual" para sempre. Agora TODA leitura que checou a
 * área de ações entra na versão (mesmo vazia); só leituras que NUNCA
 * checaram essa área (`actions_observed` ausente/false — cartão compacto)
 * são ignoradas, sem apagar o que já se sabia.
 */
function reconcileAvailableActions(observations) {
  const checked = observations
    .filter((o) => o.readiness && o.readiness.actions_observed === true)
    .slice()
    .sort((a, b) => String(a.observed_at || "").localeCompare(String(b.observed_at || "")));
  if (!checked.length) return { current: [], versions: [] };

  const fp = (actions) => actions.map((a) => `${a.code}|${a.available}|${a.disabled}`).sort().join("\n");
  const versions = [];
  for (const o of checked) {
    const actions = o.readiness.available_actions || [];
    const f = fp(actions);
    const last = versions[versions.length - 1];
    if (last && last.fingerprint === f) { last.observed_at_last = o.observed_at; continue; }
    const removed = last && last.actions.length && !actions.length;
    versions.push({
      fingerprint: f, actions, observed_at_first: o.observed_at, observed_at_last: o.observed_at,
      removed_at: removed ? o.observed_at : null
    });
  }
  return { current: versions[versions.length - 1].actions, versions };
}

/** Indicadores mudam a cada ciclo por natureza — histórico bruto + snapshot mais recente. */
/**
 * Bloqueador 8 da rechecagem: só entravam leituras com indicadores não
 * vazios — um ciclo posterior com `indicators:[]` (mas que checou de
 * verdade) era ignorado, mantendo um alerta velho como "atual" para sempre.
 * Igual à correção de ações (bloqueador 7): distingue "checou e não achou
 * nada" (`indicatorsObserved:true`, entra e pode ENCERRAR indicadores
 * antigos) de "não checou essa área nesta leitura" (ignorado, nunca apaga).
 */
function reconcileIndicators(observationsWithIndicators) {
  const checked = (observationsWithIndicators || []).filter((o) => o.indicatorsObserved === true);
  if (!checked.length) return { current: [], history: [] };
  const sorted = checked.slice().sort((a, b) => String(a.observed_at || "").localeCompare(String(b.observed_at || "")));

  // marca quando cada indicador do ciclo anterior deixou de aparecer — "encerrado", nunca só sumido.
  const ended = [];
  for (let i = 1; i < sorted.length; i++) {
    const prevCodes = new Set((sorted[i - 1].indicators || []).map((x) => x.code));
    const currCodes = new Set((sorted[i].indicators || []).map((x) => x.code));
    for (const code of prevCodes) {
      if (!currCodes.has(code)) ended.push({ code, ended_at: sorted[i].observed_at });
    }
  }

  return {
    current: sorted[sorted.length - 1].indicators || [],
    history: sorted.map((o) => ({ observed_at: o.observed_at, indicators: o.indicators || [] })),
    ended
  };
}

/** Agendamento: prefere a leitura mais completa (com `scheduled_for`), preserva a primeira ativação observada. */
/**
 * Bloqueador 6 da rechecagem: a versão anterior escolhia "a primeira leitura
 * com `scheduled_for`" como se fosse o estado atual — depois de
 * `is_scheduled:true -> false` (ativação em produção), a saída continuava
 * `is_scheduled:true`. Agora `is_scheduled` segue SEMPRE a leitura mais
 * recente (é um fato que muda no tempo, não uma característica fixa do
 * pedido); `scheduled_for` é preservado como contexto mesmo depois da
 * ativação (só porque o pedido já não está mais agendado não significa que
 * o horário original deixou de ser um fato relevante para auditoria).
 * `versions[]` agora existe de verdade — RECONCILIATION_V1.md já afirmava
 * isso, o código não entregava.
 */
function reconcileSchedule(observationsWithSchedule) {
  const withSched = (observationsWithSchedule || [])
    .filter((o) => o.schedule)
    .map((o) => Object.assign({}, o.schedule, { _observed_at: o.observed_at || o.schedule.activation_observed_at || null }))
    .sort((a, b) => String(a._observed_at || "").localeCompare(String(b._observed_at || "")));
  if (!withSched.length) return null;

  const versions = [];
  for (const s of withSched) {
    const last = versions[versions.length - 1];
    if (last && last.is_scheduled === s.is_scheduled && last.scheduled_for === s.scheduled_for) {
      if (s.activation_observed_at && !last.activation_observed_at) last.activation_observed_at = s.activation_observed_at;
      continue;
    }
    versions.push(Object.assign({}, s));
  }

  const latest = versions[versions.length - 1];
  const priorWithTime = versions.slice().reverse().find((v) => v.scheduled_for);
  const firstActivation = versions.find((v) => v.activation_observed_at);

  return {
    is_scheduled: latest.is_scheduled,
    scheduled_for: latest.scheduled_for || (priorWithTime && priorWithTime.scheduled_for) || null,
    activation_observed_at: latest.activation_observed_at || (firstActivation && firstActivation.activation_observed_at) || null,
    confidence: latest.confidence,
    source: latest.source,
    versions: versions.map((v) => ({
      is_scheduled: v.is_scheduled, scheduled_for: v.scheduled_for,
      activation_observed_at: v.activation_observed_at, observed_at: v._observed_at
    }))
  };
}

/**
 * Reconcilia TODAS as dimensões de um pedido a partir de uma lista de
 * observações multidimensionais (`buildOrderObservation()`), em qualquer
 * modo/ciclo. Alternar Expedição <-> Quadros nunca cria um pedido novo — é
 * responsabilidade de quem chama agrupar por `external_id`, exatamente como
 * `reconcileOrder` já faz para o modelo antigo.
 */
function reconcileMultidimensional(externalId, observations) {
  const list = Array.isArray(observations) ? observations.filter(Boolean) : [];
  if (!list.length) return null;

  const layout = reconcileScalarDimension(list, "layout", "mode");
  const visual = reconcileScalarDimension(list, "visual", "location");
  const orderState = reconcileScalarDimension(list, "order_state", "value");
  const readinessState = reconcileScalarDimension(list, "readiness", "state");
  const actions = reconcileAvailableActions(list);
  const courier = reconcileScalarDimension(list, "courier", "state");
  const dispatch = reconcileScalarDimension(list, "dispatch", "value");
  const completion = reconcileScalarDimension(list, "completion", "value");
  const fulfillment = reconcileScalarDimension(list, "fulfillment", "value");
  const grouping = Grouping.reconcileGrouping(list.map((o) => o.grouping).filter(Boolean));
  const schedule = reconcileSchedule(list);
  const indicators = reconcileIndicators(list);
  const store = reconcileScalarDimension(list, "store", "value");

  // Sprint 2.2 — a rechecagem provou que itens, observação e valor ficavam
  // fora da observação multidimensional. Reaproveita as MESMAS funções do
  // reconciliador legado (reconcileItems/reconcileObservationText/reconcileField)
  // — `buildOrderObservation` já expõe `items`/`customer_note`/`total_value`
  // no nível raiz de cada observação, no mesmo formato que essas funções esperam.
  const items = reconcileItems(list);
  const customerNote = reconcileObservationText(list, "customer_note");
  const totalValue = reconcileField("total_value", list);

  // layout/visual "unknown" nunca vira anomalia aqui: é falta de evidência,
  // não conflito — só regressão de order_state (progressão real conhecida)
  // é anomalia neste nível multidimensional.
  const anomalies = orderState.regressions.slice();

  return {
    external_id: externalId,
    observation_count: list.length,

    layout_mode: layout.value,
    visual_location: visual.value,
    order_state: orderState.value,
    readiness_state: readinessState.value,
    available_actions: actions.current,
    courier_state: courier.value,
    dispatch_state: dispatch.value,
    completion_state: completion.value,
    fulfillment_mode: fulfillment.value,
    store_state: store.value,
    grouping: grouping.current,
    schedule,
    indicators: indicators.current,
    items_current: items.current,
    items_versions: items.versions,
    customer_note: customerNote.current,
    total_value: totalValue.value,

    dimension_provenance: {
      layout, visual, order_state: orderState, readiness: readinessState,
      available_actions: actions, courier, dispatch, completion, fulfillment, store,
      grouping, indicators, items, customer_note: customerNote, total_value: totalValue
    },
    anomalies
  };
}

module.exports = {
  STATUS_RANK, rankOf,
  detectIdentityConflicts, reconcileField, reconcileStatus, reconcileItems,
  reconcileObservationText, reconcileValue, reconcileOrder, itemsFingerprint,
  // Sprint 2.1
  EMPTY_DIMENSION_VALUES, reconcileScalarDimension, reconcileAvailableActions,
  reconcileIndicators, reconcileSchedule, reconcileMultidimensional
};
