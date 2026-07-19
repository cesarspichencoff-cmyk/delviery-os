/* ============================================================================
 * Capacidade da equipe por turno — papéis/ contagens, sem rastrear pessoas.
 * ==========================================================================*/
"use strict";

/**
 * @param {object} turno
 * @param {object} turno.equipe - { sushi: n, conferencia: n, ... flutuantes: n }
 * @param {object} config
 */
function capacidadeEquipe(turno, config) {
  const t = turno || {};
  const eq = t.equipe || {};
  const pracas = (config && config.pracas) || {};
  const out = {};
  const flutuantes = Number(eq.flutuantes || eq.floating || 0) || 0;

  for (const [id, meta] of Object.entries(pracas)) {
    const n = Number(eq[id] != null ? eq[id] : eq[meta.label] != null ? eq[meta.label] : 0) || 0;
    const ref = Number(meta.capacidade_base_pessoas_ref) || 1;
    const limitacao = (t.limitacoes && t.limitacoes[id]) || null;
    let fator = n / ref;
    if (limitacao) fator *= 0.7;
    // flutuantes diluídos levemente
    if (flutuantes > 0) fator += (flutuantes * 0.15) / Object.keys(pracas).length;
    out[id] = {
      praca: id,
      pessoas: n,
      referencia: ref,
      fator_capacidade: round2(Math.max(0.15, fator)),
      limitacao: limitacao,
      note: meta.capacidade_base_note || null,
      // honestidade
      tracks_individuals: false,
      explanation: `${n} pessoas vs ref ${ref}` + (limitacao ? " (limitação excepcional)" : "")
    };
  }

  return {
    por_praca: out,
    flutuantes,
    observacao: t.observacao || null,
    tracks_individuals: false,
    epistemic: "fact_or_report"
  };
}

function round2(x) {
  return Math.round(Number(x) * 100) / 100;
}

module.exports = { capacidadeEquipe };
