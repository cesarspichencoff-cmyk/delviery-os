/**
 * Microcoaching sem vigilância — processo, nunca pessoa.
 */
"use strict";

const ALLOWED = [
  "revisar_procedimento",
  "sugerir_treinamento",
  "mostrar_padrao_recorrente",
  "orientar_preparacao_turno"
];

const FORBIDDEN = [
  "ranking_individual",
  "analise_de_voz",
  "inferencia_de_emocao",
  "julgamento_de_personalidade",
  "monitoramento_permanente",
  "culpa_automatica"
];

function buildCoaching(insight) {
  const i = insight || {};
  if (i.target_person || i.rank_people) {
    return {
      ok: false,
      reason: "proibido_foco_em_pessoa",
      forbidden: FORBIDDEN
    };
  }
  return {
    ok: true,
    type: i.type || "mostrar_padrao_recorrente",
    allowed: ALLOWED.includes(i.type || "mostrar_padrao_recorrente"),
    message: i.message || "Há um padrão recorrente no processo que vale treino de procedimento.",
    process_focus: true,
    person_focus: false,
    forbidden_guarantees: FORBIDDEN
  };
}

module.exports = { ALLOWED, FORBIDDEN, buildCoaching };
