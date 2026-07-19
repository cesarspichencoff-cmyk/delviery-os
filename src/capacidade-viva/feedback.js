/* ============================================================================
 * Feedback humano — não obrigatório no pico.
 * ==========================================================================*/
"use strict";

const OPTIONS = ["ajudou", "ajudou_parcialmente", "nao_ajudou", "criou_outro_problema", "nao_sei"];

function registrarFeedback(partial) {
  const p = partial || {};
  const choice = p.choice || p.opcao || "nao_sei";
  if (OPTIONS.indexOf(choice) < 0) {
    return { ok: false, error: "opcao_invalida", options: OPTIONS };
  }
  return {
    ok: true,
    feedback: {
      choice,
      observation: p.observation || p.observacao || null,
      voice_transcript: p.voice_transcript || null,
      at: p.at || new Date().toISOString(),
      action_id: p.action_id || null,
      required_during_peak: false,
      not_employee_score: true
    }
  };
}

module.exports = { registrarFeedback, OPTIONS };
