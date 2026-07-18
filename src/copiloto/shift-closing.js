/**
 * Fechamento de turno — resumo automático + 0 a 3 perguntas de alto ganho.
 */
"use strict";

const { CLOSING } = require("./config");

/**
 * Gera fechamento a partir da memória do turno (fatos já observados).
 */
function buildClosing(shiftMemory) {
  const m = shiftMemory || {};
  const summary = {
    shift_id: m.shift_id,
    volume: m.volume || null,
    main_pressures: (m.pressures || []).slice(0, 5),
    affected_orders_count: (m.affected_orders || []).length,
    forecasts: evaluateForecasts(m.forecasts || []),
    actions_detected: m.actions || [],
    outcomes: m.outcomes || [],
    unexplained: m.unexplained || []
  };

  const questions = selectQuestions(m, summary).slice(0, CLOSING.max_questions);

  return {
    schema_version: "1.0",
    summary,
    questions,
    audio_script: buildClosingAudio(summary, questions),
    constraints: {
      ideal_seconds: CLOSING.ideal_seconds,
      max_seconds: CLOSING.max_seconds,
      max_questions: CLOSING.max_questions,
      allow_skip: true,
      allow_dont_know: true,
      no_emotion_analysis: true,
      no_long_form: true
    },
    flow: [
      "apresentar_resumo",
      "perguntar_se_houver",
      "transcrever_resposta",
      "confirmar_ou_corrigir",
      "proxima_pergunta",
      "resumo_final",
      "salvar"
    ]
  };
}

function evaluateForecasts(forecasts) {
  return forecasts.map((f) => ({
    horizon_min: f.horizon_min,
    area: f.area,
    predicted: f.predicted,
    actual: f.actual,
    correct: f.actual != null && f.predicted != null ? Math.abs(f.predicted - f.actual) <= (f.tolerance || 2) : null,
    epistemic: "fact_vs_inference"
  }));
}

/**
 * Seleciona perguntas: só o que dados NÃO respondem; prioriza ganho de informação.
 */
function selectQuestions(memory, summary) {
  const q = [];
  const unexplained = memory.unexplained || summary.unexplained || [];

  for (const u of unexplained) {
    if (u.already_answered_by_data) continue;
    if ((u.importance || 0) < 0.4) continue;
    q.push({
      question_id: u.id || `q_${q.length + 1}`,
      text: u.question || `O que explica: ${u.observation}?`,
      observed: u.observation,
      unknown: u.unknown,
      why_it_helps: u.why_it_helps || "Fecha a lacuna entre o que medimos e a causa real para o próximo turno.",
      info_gain: u.info_gain || 0.7,
      options_hint: ["não sei", "pular"],
      type: u.type || "unobservable_cause"
    });
  }

  // Ação manual sem registro
  for (const a of memory.actions || []) {
    if (a.registered) continue;
    if (a.suspected_manual && a.effect_seen) {
      q.push({
        question_id: `manual_${a.id || q.length}`,
        text: a.question || "Houve alguma ação de apoio que não ficou registrada?",
        observed: a.observation || "A pressão caiu sem evento automático claro.",
        unknown: "Qual ação humana foi feita e por quem (papel, não vigilância).",
        why_it_helps: "Permite ligar resultado a playbook sem inventar causa.",
        info_gain: 0.75,
        options_hint: ["não sei", "pular"],
        type: "unregistered_manual_action"
      });
    }
  }

  // Equipamento
  if (memory.equipment_suspect) {
    q.push({
      question_id: "equipment",
      text: "Algum equipamento ou estação falhou ou ficou lenta hoje?",
      observed: memory.equipment_suspect.observation,
      unknown: "Falha física não observável pelos eventos de pedido.",
      why_it_helps: "Evita repetir o mesmo erro de leitura no próximo pico.",
      info_gain: 0.8,
      options_hint: ["não sei", "pular"],
      type: "equipment"
    });
  }

  // Sem fato relevante → zero perguntas
  if (!(memory.pressures || []).length && !unexplained.length && !(memory.actions || []).length) {
    return [];
  }

  q.sort((a, b) => (b.info_gain || 0) - (a.info_gain || 0));
  // Dedup por type+text
  const seen = new Set();
  return q.filter((item) => {
    const k = item.type + ":" + item.text;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function buildClosingAudio(summary, questions) {
  const pressures = (summary.main_pressures || []).map((p) => p.area || p).join(", ");
  const head = pressures
    ? `Resumo do turno: principais pressões em ${pressures}.`
    : "Resumo do turno: operação sem pressão principal registrada.";
  const nq = questions.length;
  const ask =
    nq === 0
      ? "Sem perguntas. Podemos salvar."
      : nq === 1
        ? "Tenho uma pergunta rápida."
        : `Tenho ${nq} perguntas rápidas.`;
  return {
    opening: `${head} ${ask}`,
    questions: questions.map((q) => q.text),
    closing: "Obrigado. Salvando o fechamento."
  };
}

/**
 * Avança o fluxo de voz do fechamento.
 */
function advanceClosingFlow(state, event) {
  const s = { ...(state || { step: "resumo", question_index: 0, answers: [] }) };
  const e = event || {};
  if (s.step === "resumo" && e.type === "ack") {
    if (!s.questions || !s.questions.length) {
      s.step = "salvar";
      return s;
    }
    s.step = "pergunta";
    s.question_index = 0;
    return s;
  }
  if (s.step === "pergunta" && (e.type === "answer" || e.type === "skip" || e.type === "dont_know")) {
    s.answers.push({
      question_id: s.questions[s.question_index].question_id,
      type: e.type,
      text: e.text || null,
      confirmed: false
    });
    s.step = "confirmar";
    return s;
  }
  if (s.step === "confirmar" && e.type === "confirm") {
    const last = s.answers[s.answers.length - 1];
    if (last) last.confirmed = true;
    if (e.corrected_text) last.text = e.corrected_text;
    s.question_index += 1;
    if (s.question_index >= s.questions.length) s.step = "resumo_final";
    else s.step = "pergunta";
    return s;
  }
  if (s.step === "resumo_final" && e.type === "ack") {
    s.step = "salvar";
  }
  return s;
}

module.exports = {
  buildClosing,
  selectQuestions,
  advanceClosingFlow,
  evaluateForecasts
};
