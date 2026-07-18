/**
 * Motor do Foco — escolha determinística e auditável da prioridade principal.
 * Separação: gravidade, urgência, alcance, confiança, capacidade de intervenção.
 * Confiança baixa ≠ gravidade baixa.
 */
"use strict";

const { resolveAreaFromSit, confidenceAtLeast, FOCUS_STABILITY } = require("./config");

const CONF_W = { baixa: 0.55, media: 0.85, alta: 1.0 };

/**
 * Candidato a foco.
 * @typedef {Object} FocusCandidate
 * @property {string} key
 * @property {string} area
 * @property {string} title
 * @property {number} severity - 0..3 gravidade
 * @property {number} urgency - 0..3
 * @property {number} reach - pedidos afetados
 * @property {string} confidence
 * @property {boolean} intervenable
 * @property {number} [minutes_open]
 * @property {string} [trend] - improving|stable|worsening
 * @property {number} [chain_effect] - 0..1
 * @property {number} [customer_impact] - 0..1
 * @property {number} [recovery_chance] - 0..1
 * @property {object} [sit] - sit original do motor se houver
 * @property {object[]} [evidence]
 * @property {object[]} [affected_orders]
 */

function scoreCandidate(c) {
  const conf = CONF_W[c.confidence] || 0.7;
  const trendBoost = c.trend === "worsening" ? 1.15 : c.trend === "improving" ? 0.85 : 1;
  const nonActionCost = (c.severity || 0) * 0.4 + (c.urgency || 0) * 0.5 + (c.reach || 0) * 0.15;
  const intervention = c.intervenable === false ? 0.5 : 1;
  const chain = 1 + (c.chain_effect || 0) * 0.4;
  const customer = 1 + (c.customer_impact || 0) * 0.3;
  const recoveryPenalty = 1 - Math.min(0.4, (c.recovery_chance || 0) * 0.3);

  // score de prioridade NÃO multiplica gravidade por confiança de forma a esconder risco:
  // confiança entra como fator de "capacidade de afirmar", separado
  const priority_score =
    ((c.severity || 0) * 3 +
      (c.urgency || 0) * 2.5 +
      Math.min(10, c.reach || 0) * 0.8 +
      nonActionCost) *
    trendBoost *
    intervention *
    chain *
    customer *
    recoveryPenalty;

  return {
    priority_score: round2(priority_score),
    assertion_strength: conf,
    dimensions: {
      severity: c.severity || 0,
      urgency: c.urgency || 0,
      reach: c.reach || 0,
      confidence: c.confidence || "media",
      intervenable: c.intervenable !== false,
      confidence_sufficient: confidenceAtLeast(c.confidence || "media", FOCUS_STABILITY.min_confidence_to_focus)
    }
  };
}

/**
 * Escolhe o foco principal entre candidatos.
 * Não aplica estabilidade (isso é focus-stability.js).
 */
function selectFocus(candidates, opts) {
  const list = (candidates || []).map((c) => {
    const scored = scoreCandidate(c);
    return { ...c, ...scored };
  });
  if (!list.length) {
    return {
      status: "none",
      focus: null,
      reason: "sem_candidatos",
      technical_state: (opts && opts.technical_state) || "healthy"
    };
  }

  // Filtra só por capacidade mínima de afirmar se exigido — NÃO remove grave com conf baixa
  // mas marca como "precisa verificação"
  list.sort((a, b) => b.priority_score - a.priority_score || b.severity - a.severity);
  const best = list[0];
  const area = best.area || resolveAreaFromSit(best.sit);

  const focus = {
    focus_id: best.key || `focus_${area}_${Date.now()}`,
    status: "active",
    area,
    title: best.title || defaultTitle(area, best),
    summary: best.summary || buildSummary(best),
    why_it_matters: best.why_it_matters || buildWhy(best),
    evidence: best.evidence || [],
    affected_orders: best.affected_orders || [],
    severity: best.severity,
    urgency: best.urgency,
    reach: best.reach,
    confidence: best.confidence,
    dimensions: best.dimensions,
    priority_score: best.priority_score,
    assertion_strength: best.assertion_strength,
    forecast: best.forecast || null,
    recommended_action: best.recommended_action || null,
    alternatives: list.slice(1, 4).map(altBrief),
    responsible_role: best.responsible_role || roleForArea(area),
    follow_up: best.follow_up || defaultFollowUp(),
    technical_state: (opts && opts.technical_state) || "healthy",
    needs_verification: !best.dimensions.confidence_sufficient,
    epistemic: "inference",
    selected_at: (opts && opts.now) || new Date().toISOString()
  };

  return {
    status: "active",
    focus,
    ranking: list.map((c) => ({
      key: c.key,
      area: c.area,
      priority_score: c.priority_score,
      severity: c.severity,
      confidence: c.confidence
    })),
    reason: "maior_prioridade_auditavel"
  };
}

/**
 * Constrói candidatos a partir de pressões de área + anomalias.
 */
function candidatesFromSnapshot(snapshot) {
  const s = snapshot || {};
  const cands = [];
  for (const [areaId, a] of Object.entries(s.areas || {})) {
    if (!a.pressure_level || a.pressure_level === "normal" || a.pressure_level === "oscillation") continue;
    const sev = { attention: 1, pressure: 2, critical: 3 }[a.pressure_level] || 1;
    cands.push({
      key: `area:${areaId}:${a.pressure_level}`,
      area: areaId,
      title: `${a.label || areaId} em ${labelPt(a.pressure_level)}`,
      summary: a.summary || `${a.queue_depth || 0} pedidos · tempo ~${a.median_dwell_min || "?"} min`,
      severity: sev,
      urgency: a.trend === "worsening" ? Math.min(3, sev + 1) : sev,
      reach: a.queue_depth || a.affected_count || 0,
      confidence: a.confidence || "media",
      intervenable: areaId !== "caixa",
      trend: a.trend,
      chain_effect: a.chain_effect || 0.2,
      customer_impact: a.pressure_level === "critical" ? 0.8 : 0.4,
      recovery_chance: a.trend === "improving" ? 0.6 : 0.3,
      evidence: a.evidence || [
        { type: "queue_depth", value: a.queue_depth },
        { type: "median_dwell_min", value: a.median_dwell_min }
      ],
      affected_orders: a.open_orders || [],
      recommended_action: a.recommended_action || suggestAction(areaId, a),
      forecast: a.forecast || null
    });
  }
  for (const an of s.anomalies || []) {
    if (an.kind === "technical") continue;
    cands.push({
      key: `anomaly:${an.anomaly_id}`,
      area: an.area,
      title: an.title,
      summary: an.what_changed,
      severity: 1,
      urgency: 1,
      reach: 1,
      confidence: an.confidence || "media",
      intervenable: true,
      evidence: an.evidence,
      recommended_action: {
        type: "verify",
        label: an.verify_action,
        confidence: an.confidence
      }
    });
  }
  return cands;
}

function suggestAction(area, a) {
  const map = {
    sushi: "Priorizar bancada de Sushi nos pedidos que liberam saída",
    quentes: "Priorizar Quentes e checar itens quentes dos pedidos âncora",
    cozinha: "Olhar Cozinha e liberar pedidos dependentes",
    conferencia: "Conferir primeiro os pedidos com prazo mais próximo e 2ª sacola",
    motoboy: "Chamar motoboy / liberar saída dos prontos mais antigos",
    caixa: "Verificar fila de caixa se estiver impactando liberação"
  };
  return {
    type: "recommend",
    label: map[area] || "Verificar a área com maior impacto",
    confidence: a.confidence || "media"
  };
}

function roleForArea(area) {
  const map = {
    sushi: "lider_producao",
    quentes: "lider_producao",
    cozinha: "lider_producao",
    conferencia: "conferente",
    motoboy: "lider_entrega",
    caixa: "caixa"
  };
  return map[area] || "lider_turno";
}

function defaultFollowUp() {
  return {
    check_after_min: 5,
    success_if: "pressao_da_area_cai_um_nivel",
    fail_if: "pressao_sobe_ou_pedidos_atrasam"
  };
}

function defaultTitle(area, c) {
  return `${area || "Operação"} precisa de atenção`;
}

function buildSummary(c) {
  return `${c.reach || 0} pedido(s) afetado(s) · gravidade ${c.severity} · confiança ${c.confidence}`;
}

function buildWhy(c) {
  return `Gravidade ${c.severity}, urgência ${c.urgency}, alcance ${c.reach}. Custo de não agir sobe se a tendência for de piora.`;
}

function altBrief(c) {
  return {
    key: c.key,
    area: c.area,
    title: c.title,
    priority_score: c.priority_score,
    severity: c.severity,
    confidence: c.confidence
  };
}

function labelPt(level) {
  return { attention: "atenção", pressure: "pressão", critical: "crítico" }[level] || level;
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

module.exports = {
  scoreCandidate,
  selectFocus,
  candidatesFromSnapshot
};
