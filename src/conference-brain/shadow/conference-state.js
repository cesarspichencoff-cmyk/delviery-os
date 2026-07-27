/* ============================================================================
 * Estado SOMBRA da Conferência.
 * ----------------------------------------------------------------------------
 * SOMENTE sombra: nunca alimenta a interface, nunca decide, nunca move pessoas.
 * A saída é sempre decomponível — estado-base por carga + modificadores
 * observados + razões legíveis + confiança + o que faltou.
 *
 * Decisão de produto aprovada: as faixas 30/50/70 NÃO operam sozinhas.
 * Atenção também pode ocorrer abaixo de 50 quando houver convergência forte,
 * ritmo piorando, entrada > saída, tempo até pronto crescendo ou prontidão
 * reduzida. É exatamente isso que os modificadores fazem — sem pesos, sem score.
 * ==========================================================================*/
"use strict";

const {
  CONFERENCE_STATES, SOURCE_STATES, CONFIDENCE,
  SOURCE_BLOCKS_CONFIDENT_READING, SOURCE_DEGRADES_READING, OPERATIONAL_SEVERITY
} = require("../contracts/states");
const { LOAD_BANDS_V1, CONFERENCE_SHADOW_V1 } = require("../contracts/rule-version");

/** Estado-base apenas pela carga (faixas aprovadas). */
function baseStateFromLoad(activeOrders) {
  if (activeOrders == null) return null;
  const p = LOAD_BANDS_V1.params;
  if (activeOrders < p.calm_below) return CONFERENCE_STATES.CALM;
  if (activeOrders < p.flowing_below) return CONFERENCE_STATES.FLOWING;
  if (activeOrders < p.attention_below) return CONFERENCE_STATES.ATTENTION;
  return CONFERENCE_STATES.URGENCY;
}

const rank = (s) => OPERATIONAL_SEVERITY.indexOf(s);
function escalate(state, to) {
  if (rank(to) > rank(state)) return to;
  return state;
}

/**
 * Avalia o estado sombra para uma janela.
 * @param {object} input
 *   snapshot   — contrato operational_snapshots
 *   rhythm     — saída de computeRhythm (opcional)
 *   readiness  — prontidão do turno (opcional; Sprint 2)
 * @returns {object} contrato conference_state
 */
function evaluateShadowState(input) {
  const o = input || {};
  const snap = o.snapshot || {};
  const rhythm = o.rhythm || null;
  const readiness = o.readiness || null;
  const P = CONFERENCE_SHADOW_V1.params;

  const reasons = [];
  const modifiers = [];
  const missing = [];

  const active = snap.active_orders == null ? null : snap.active_orders;
  const sourceState = snap.source_state || SOURCE_STATES.UNAVAILABLE;

  /* --- 1. Fonte manda: nunca afirmar estado confiante sobre fonte quebrada -- */
  if (sourceState === SOURCE_STATES.UNAVAILABLE) {
    return build({
      snap, base: null, suggested: CONFERENCE_STATES.SOURCE_UNAVAILABLE, active,
      reasons: [{ code: "SOURCE_UNAVAILABLE", message: "Nao foi possivel observar a operacao nesta janela." }],
      modifiers, missing: ["fonte"], confidence: CONFIDENCE.LOW, sourceState
    });
  }

  if (active == null) missing.push("pedidos_ativos");
  if (snap.convergence == null) missing.push("convergencia");
  if (snap.avg_ready_minutes == null) missing.push("tempo_ate_pronto");
  if (!readiness) missing.push("prontidao_da_abertura");

  // Sem carga observável não há estado operacional — é leitura parcial, não "calmo".
  if (active == null) {
    reasons.push({
      code: "NO_ACTIVE_SIGNAL",
      message: "A fonte nao observa o carimbo de pronto; pedidos ativos e convergencia nao sao afirmaveis."
    });
    return build({
      snap, base: null, suggested: CONFERENCE_STATES.PARTIAL_READING, active,
      reasons, modifiers, missing, confidence: CONFIDENCE.LOW, sourceState
    });
  }

  /* --- 2. Estado-base por carga ------------------------------------------- */
  const base = baseStateFromLoad(active);
  let suggested = base;
  reasons.push({
    code: "LOAD_BAND",
    message: `${active} pedidos ativos na janela (faixa base: ${base}).`
  });

  /* --- 3. Modificadores observáveis (transparentes, sem pesos) ------------- */
  const floorOk = active >= P.attention_floor_active;

  // convergência forte: muitos ficaram prontos JUNTOS
  if (snap.convergence != null && snap.convergence >= P.high_convergence_ready_in_window) {
    modifiers.push("HIGH_CONVERGENCE");
    reasons.push({
      code: "HIGH_CONVERGENCE",
      message: `${snap.convergence} pedidos ficaram prontos na janela atual.`
    });
    if (floorOk) suggested = escalate(suggested, CONFERENCE_STATES.ATTENTION);
  }

  // fila crescendo: entrada acima da conclusão em janelas seguidas
  if (rhythm && rhythm.growing_windows >= P.queue_growing_consecutive_windows) {
    modifiers.push("QUEUE_GROWING");
    reasons.push({
      code: "QUEUE_GROWING",
      message: `A entrada permaneceu acima da conclusao em ${rhythm.growing_windows} janelas.`
    });
    if (floorOk) suggested = escalate(suggested, CONFERENCE_STATES.ATTENTION);
  }

  // tempo até pronto crescendo em relação à própria média recente
  if (rhythm && rhythm.ready_growth_ratio != null && rhythm.ready_growth_ratio >= P.ready_time_growth_ratio) {
    modifiers.push("READY_TIME_GROWING");
    reasons.push({
      code: "READY_TIME_GROWING",
      message: `Tempo ate pronto em ${rhythm.avg_ready_minutes} min, ${rhythm.ready_growth_ratio}x a media recente.`
    });
    if (floorOk) suggested = escalate(suggested, CONFERENCE_STATES.ATTENTION);
  }

  // entrada maior que saída nesta janela
  if (rhythm && rhythm.inflow_over_outflow) {
    modifiers.push("INFLOW_OVER_OUTFLOW");
    reasons.push({
      code: "INFLOW_OVER_OUTFLOW",
      message: `Entraram ${rhythm.inflow} e sairam ${rhythm.outflow} nesta janela.`
    });
  }

  // prontidão reduzida (Sprint 2 — entra como contexto quando existir)
  if (readiness && readiness.reduced) {
    modifiers.push("READINESS_REDUCED");
    reasons.push({
      code: "READINESS_REDUCED",
      message: readiness.reason || "A abertura registrou condicao reduzida para a etapa final."
    });
    if (floorOk) suggested = escalate(suggested, CONFERENCE_STATES.ATTENTION);
  }

  /* --- 4. Fonte degradada rebaixa a confiança e pode virar leitura parcial -- */
  let confidence = CONFIDENCE.HIGH;
  if (SOURCE_DEGRADES_READING.includes(sourceState)) {
    confidence = CONFIDENCE.MEDIUM;
    reasons.push({ code: "SOURCE_DEGRADED", message: `Fonte em estado "${sourceState}".` });
  }
  if (SOURCE_BLOCKS_CONFIDENT_READING.includes(sourceState)) {
    reasons.push({
      code: "SOURCE_INCONSISTENT",
      message: "Observacoes conflitantes nesta janela; estado operacional nao e afirmavel."
    });
    return build({
      snap, base, suggested: CONFERENCE_STATES.PARTIAL_READING, active,
      reasons, modifiers, missing, confidence: CONFIDENCE.LOW, sourceState
    });
  }
  if (missing.length >= 3) confidence = CONFIDENCE.LOW;

  return build({ snap, base, suggested, active, reasons, modifiers, missing, confidence, sourceState });
}

function build(x) {
  return {
    snapshot_at: x.snap.snapshot_at,
    window_minutes: x.snap.window_minutes,
    mode: "shadow",                       // travado: Sprint 1 é só sombra
    base_state: x.base,
    suggested_state: x.suggested,
    active_orders: x.active,
    reasons: x.reasons,
    modifiers: x.modifiers,
    source_health: x.sourceState,
    confidence: x.confidence,
    missing_data: x.missing,
    rule_version: CONFERENCE_SHADOW_V1.ref
  };
}

module.exports = { evaluateShadowState, baseStateFromLoad };
