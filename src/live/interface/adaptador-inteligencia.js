/* ============================================================================
 * Adapters: motores do pacote copiloto → shapes da superfície V3.3.
 * A UI NUNCA conhece formatos internos dos engines.
 * simulated: false quando o motor calculou; true só se faltar dado e houver fallback.
 * ==========================================================================*/
"use strict";

const forecastEngine = require("../../copiloto/forecast");
const anomaliesEngine = require("../../copiloto/anomalies");
const closingEngine = require("../../copiloto/shift-closing");
const memoryEngine = require("../../copiloto/shift-memory");
const voiceEngine = require("../../copiloto/voice-intents");
const responseEngine = require("../../copiloto/response-contract");
const playbooksEngine = require("../../copiloto/playbooks");
const thresholdsEngine = require("../../copiloto/thresholds");
const { mapearEstadoFonteV33 } = require("./adaptador-v33");

const CONF_DOTS = { alta: "●●●", media: "●●○", baixa: "●○○", moderada: "●●○" };

function confLabel(c) {
  if (c === "alta") return "alta";
  if (c === "baixa") return "baixa";
  return "moderada";
}

/**
 * Previsão → bloco forecast da UI V3.3
 */
function adaptForecast(engineResult, opts) {
  const f = engineResult || {};
  const conf = confLabel(f.confidence || "media");
  const area = f.area || (opts && opts.areaLabel) || "área";
  const low = f.range && f.range.low != null ? f.range.low : f.value;
  const high = f.range && f.range.high != null ? f.range.high : f.value;
  const hz = f.horizon_min || 15;
  return {
    simulated: false,
    source: "copiloto.forecast",
    demoLabel: opts && opts.demo ? "demonstração" : null,
    horizon: `próximos ${hz === 10 ? "10" : hz === 30 ? "30" : "10 a 15"} min`,
    conditional: "se nada mudar",
    confidence: {
      level: conf,
      dots: CONF_DOTS[conf] || "●●○",
      visual: "confidence"
    },
    text:
      f.conclusion ||
      `A ${area} deve ficar entre ${low} e ${high} ${f.unit || "pedidos"} se nada mudar.`,
    note: "estimativa, não certeza · motor de previsão · " + (f.model || "ensemble"),
    expanded: !!(opts && opts.expanded),
    raw: {
      value: f.value,
      range: f.range,
      confidence: f.confidence,
      missing_data: f.missing_data || [],
      epistemic: f.epistemic || "inference",
      factors: f.factors || []
    }
  };
}

/**
 * Constrói forecast a partir de histórico simples (API / testes).
 */
function buildForecastForArea(input) {
  const hist = (input && input.queue_history) || [];
  if (hist.length < 2) {
    return {
      simulated: true,
      demoLabel: "demonstração",
      horizon: "próximos 10 a 15 min",
      conditional: "se nada mudar",
      confidence: { level: "baixa", dots: "●○○", visual: "confidence" },
      text: "Não tenho leitura suficiente para recomendar.",
      note: "estimativa indisponível · dado insuficiente · não é certeza",
      expanded: false,
      raw: { missing_data: ["queue_history"], epistemic: "absent" }
    };
  }
  const f = forecastEngine.forecastArea({
    area: input.area || "conferencia",
    queue_history: hist,
    dwell_history: input.dwell_history,
    baselines: input.baselines,
    dow: input.dow != null ? input.dow : new Date().getDay(),
    hour: input.hour != null ? input.hour : new Date().getHours(),
    horizon_min: input.horizon_min || 15,
    model: input.model || "ensemble",
    upstream_pressure: input.upstream_pressure,
    at_risk_orders: input.at_risk_orders
  });
  return adaptForecast(f, { demo: !!input.demo, expanded: !!input.expanded, areaLabel: input.areaLabel });
}

/** Estados de ação acompanhada → UI */
const ACTION_STATE_COPY = {
  recomendacao: "Há uma ação sugerida para esta atenção.",
  aceita: "A recomendação foi aceita.",
  assumiu: "Alguém da função assumiu o acompanhamento.",
  andamento: "A ação está em curso na operação.",
  melhora: "A pressão na área cedeu.",
  parcial: "Melhorou em parte; ainda há resíduo.",
  sem_resultado: "A ação não produziu o efeito esperado.",
  colateral: "Outra área começou a pressionar.",
  encerramento: "A atenção se encerra. O organismo volta ao ritmo."
};

const ACTION_STATE_LABEL = {
  recomendacao: "Recomendação",
  aceita: "Aceita",
  assumiu: "Responsável assumiu",
  andamento: "Em andamento",
  melhora: "Melhora",
  parcial: "Melhora parcial",
  sem_resultado: "Sem resultado",
  colateral: "Efeito colateral",
  encerramento: "Encerramento"
};

/**
 * Ação acompanhada a partir de playbook + estado.
 * responsible = papel funcional, NUNCA ranking individual.
 */
function adaptActionTrack(input) {
  const stateId = (input && input.stateId) || "recomendacao";
  const pb = input.playbook || null;
  const role =
    (pb && pb.responsible_role) ||
    (input.responsible_role) ||
    "lider_turno";
  const roleLabel = roleLabelPt(role);
  return {
    simulated: !(input && input.from_engine),
    demoLabel: input && input.from_engine ? null : "demonstração",
    source: input && input.from_engine ? "copiloto.playbooks" : "mock",
    stateId,
    stateLabel: ACTION_STATE_LABEL[stateId] || stateId,
    copy: (input && input.copy) || ACTION_STATE_COPY[stateId] || "",
    responsible: {
      role: roleLabel,
      name: "Responsável da função",
      note: "função, não ranking"
    },
    onlyCurrent: true,
    tense: stateId === "colateral" || stateId === "sem_resultado",
    playbook_id: pb && pb.playbook_id,
    expected_result: pb && pb.expected_result
  };
}

function roleLabelPt(role) {
  const m = {
    lider_turno: "Liderança de turno",
    lider_producao: "Produção",
    lider_entrega: "Expedição / entrega",
    conferente: "Conferência",
    caixa: "Caixa"
  };
  return m[role] || String(role).replace(/_/g, " ");
}

function suggestPlaybookForArea(areaId) {
  const seeds = playbooksEngine.SEED_PLAYBOOKS || [];
  const area = (areaId || "").toLowerCase();
  if (area.indexOf("confer") >= 0) return seeds.find((p) => p.playbook_id === "pb_conference_buildup") || seeds[0];
  if (area.indexOf("moto") >= 0 || area.indexOf("saida") >= 0) return seeds.find((p) => p.playbook_id === "pb_motoboy_surge");
  if (area.indexOf("quente") >= 0) return seeds.find((p) => p.playbook_id === "pb_quentes_pressure");
  if (area.indexOf("sushi") >= 0) return seeds.find((p) => p.playbook_id === "pb_sushi_attention");
  return seeds[0] || null;
}

/**
 * Fechamento de turno → painel V3.3
 */
function adaptClosing(shiftMemory, step) {
  const built = closingEngine.buildClosing(shiftMemory || {});
  const questions = built.questions || [];
  const s = step == null ? 0 : step;
  let question = null;
  if (s === 1 && questions[0]) question = { n: "1 de " + Math.min(2, questions.length || 1), text: questions[0].text };
  if (s === 2 && questions[1]) question = { n: "2 de " + Math.min(2, questions.length), text: questions[1].text };
  else if (s === 2 && questions[0] && questions.length === 1) question = null;

  const pressures = (built.summary && built.summary.main_pressures) || [];
  const summaryText =
    pressures.length === 0
      ? "Turno estável na leitura disponível. Até dois minutos."
      : "Pressões observadas: " +
        pressures
          .slice(0, 3)
          .map((p) => p.area || p.label || "área")
          .join(", ") +
        ". Até dois minutos.";

  return {
    simulated: !(shiftMemory && shiftMemory.from_engine),
    demoLabel: shiftMemory && shiftMemory.from_engine ? null : "demonstração",
    source: "copiloto.shift-closing",
    step: s,
    summaryReady: true,
    timeHint: "até dois minutos",
    summaryText,
    question,
    transcript: s >= 2 ? null : null,
    confirmed: s >= 3,
    options: ["Não sei", "Pular"],
    constraints: built.constraints,
    raw_questions: questions,
    audio_script: built.audio_script
  };
}

/**
 * Voz: intents reais + resposta estruturada (ASR continua simulado).
 */
function adaptVoiceIntent(transcript, context) {
  const match = voiceEngine.matchIntentByExample
    ? voiceEngine.matchIntentByExample(transcript || "")
    : { intent_id: null };
  const ctx = context || {};
  const intentId = match && match.intent_id;
  if (!intentId) {
    return {
      simulated: true,
      demoLabel: "demonstração",
      phase: "ambiguity",
      message: "Não ficou claro. Pode repetir com a área ou o pedido?",
      source: "copiloto.voice-intents"
    };
  }

  const intent = voiceEngine.getIntent(intentId) || { intent_id: intentId, confirmation: false, executable: false };
  let conclusion = "";
  let detail = "";
  let areaCite = null;

  if (intentId === "state.overview" || intentId === "state.biggest_problem") {
    conclusion = ctx.focus_conclusion || "Operação sob leitura atual.";
    detail = ctx.focus_detail || "Verifique o Foco no organismo.";
    areaCite = ctx.focus_area || null;
  } else if (String(intentId).indexOf("area.") === 0) {
    areaCite = (match.entities && match.entities.area) || ctx.area || "Conferência";
    conclusion = ctx.area_conclusion || areaCite + " sob leitura atual.";
    detail = ctx.area_detail || "Sinais da área no organismo.";
  } else if (intentId === "state.anomaly") {
    conclusion = ctx.anomaly_conclusion || "Sem anomalia com confiança suficiente.";
    detail = ctx.anomaly_detail || "";
  } else {
    const resp = responseEngine.buildResponse({
      conclusion: ctx.conclusion || "Leitura disponível no organismo.",
      evidence: ctx.evidence || [],
      confidence: ctx.confidence || match.confidence || "media",
      limit: "Voz em demonstração — ASR não é produção."
    });
    conclusion = resp.conclusion;
    detail = resp.text_full;
  }

  return {
    simulated: true, // ASR/TTS ainda demo
    demoLabel: "demonstração",
    phase: "answer",
    conclusion,
    detail,
    needsConfirm: !!(intent.confirmation || intent.executable),
    areaCite,
    intent_id: intentId,
    source: "copiloto.voice-intents",
    asr_simulated: true
  };
}

/**
 * Anomalias → lista curta para QA / Foco
 */
function adaptAnomalies(snapshot) {
  const list = anomaliesEngine.detectAnomalies(snapshot || {});
  return {
    simulated: false,
    source: "copiloto.anomalies",
    items: list.map((a) => ({
      id: a.id,
      area: a.area,
      title: a.title,
      confidence: a.confidence,
      hypothesis: a.hypothesis,
      verify_action: a.verify_action,
      // nunca acusação de pessoa
      no_person_blame: true
    }))
  };
}

/**
 * Estado técnico D4A → UI (reutiliza adaptador-v33)
 */
function adaptTechState(sourceStatus, motivo) {
  const t = mapearEstadoFonteV33(sourceStatus, motivo);
  return Object.assign({ simulated: false, source: "d4a.source" }, t);
}

/**
 * Memória de turno nova (ephemeral — não persistência de produção)
 */
function newShiftMemory(partial) {
  const m = memoryEngine.createShiftMemory(partial || {});
  m.from_engine = true;
  m.persistence = "ephemeral_session"; // honestidade: não é produção
  return m;
}

function classifyPressure(area, metrics) {
  return thresholdsEngine.classifyPressure(area, metrics || {});
}

module.exports = {
  adaptForecast,
  buildForecastForArea,
  adaptActionTrack,
  suggestPlaybookForArea,
  adaptClosing,
  adaptVoiceIntent,
  adaptAnomalies,
  adaptTechState,
  newShiftMemory,
  classifyPressure,
  ACTION_STATE_COPY,
  ACTION_STATE_LABEL,
  confLabel
};
