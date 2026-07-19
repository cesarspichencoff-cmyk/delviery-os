/* ============================================================================
 * Capacidade Viva V0.1 — orquestrador.
 * Motor calcula; superfície traduz em Calmo/Ambiente/Foco via adapters.
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const { cargaPonderadaPraca } = require("./carga");
const { classifyItem, pesoComplexidade } = require("./complexidade");
const { capacidadeEquipe } = require("./capacidade-equipe");
const { fatorTemporal, leituraVolumeGlobal } = require("./contexto-temporal");
const { calcularISF } = require("./isf");
const { detectarExcecoes } = require("./excecoes");
const { sugerirMenorIntervencao } = require("./intervencao");
const { classificarRecuperacao } = require("./recuperacao");
const { registrarFeedback } = require("./feedback");
const { createHistory, applyConfigChange } = require("./versionamento");
const { explainable, explainISF, explainIntervencao } = require("./explain");

function loadDefaultConfig() {
  const p = path.join(__dirname, "..", "..", "data", "capacidade-viva", "config.default.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * Avalia operação completa (MVP).
 */
function avaliar(input) {
  const config = (input && input.config) || loadDefaultConfig();
  const isf = calcularISF({
    config,
    turno: input.turno,
    por_praca: input.por_praca,
    n_pedidos: input.n_pedidos,
    when: input.when,
    confianca: input.confianca,
    urgency_by_order: input.urgency_by_order
  });

  const excecoes = detectarExcecoes({
    orders: input.orders || [],
    config,
    source: input.source,
    praca_congestionada_complexa: input.praca_congestionada_complexa
  });

  // exceção crítica eleva atenção mesmo com volume saudável
  let modeHint = "calmo";
  if (isf.insufficient_data) modeHint = "technical_or_unknown";
  else if (excecoes.count > 0) modeHint = "foco";
  else if (isf.estado_geral === "controlavel") modeHint = "calmo";
  else if (isf.estado_geral === "atencao") modeHint = "ambiente";
  else modeHint = "foco";

  const intervencao = sugerirMenorIntervencao({ isf, excecoes, config });

  return {
    schema_version: "0.1",
    isf,
    excecoes,
    intervencao,
    mode_hint: modeHint,
    explain: {
      isf: explainISF(isf),
      intervencao: explainIntervencao(intervencao)
    },
    gates: {
      no_auto_pause: true,
      no_person_tracking: true,
      no_ranking: true,
      volume_without_complexity_forbidden: true
    }
  };
}

/**
 * Adapter → shapes V3.3 (sem redesenhar UI).
 */
function toV33ViewHints(avaliacao) {
  const a = avaliacao || {};
  const isf = a.isf || {};
  const iv = a.intervencao || {};
  const ex = a.excecoes || {};

  if (isf.insufficient_data) {
    return {
      mode_hint: "technical_or_unknown",
      calm_copy: null,
      climate_note: null,
      attention: null,
      forecast: null,
      actionTrack: null,
      message: "Não tenho leitura suficiente para recomendar.",
      simulated: false
    };
  }

  const crit = isf.praca_critica && isf.por_praca ? isf.por_praca[isf.praca_critica] : null;
  let attention = null;
  if (a.mode_hint === "foco" && (crit || ex.count)) {
    const situation = ex.count
      ? (ex.items[0] && ex.items[0].title) || "Exceção crítica"
      : crit
        ? `Praça ${crit.praca} em ${crit.estado.replace(/_/g, " ")}`
        : "Atenção necessária";
    const consequence = iv.reason || "Menor intervenção sugerida para recuperar o fluxo.";
    attention = {
      eyebrow: "Capacidade viva",
      situation,
      consequence,
      evidences: [
        crit ? crit.explanation : null,
        ex.count ? `${ex.count} exceção(ões) crítica(s)` : null,
        iv.label ? `Sugestão: ${iv.label}` : null
      ].filter(Boolean),
      actionLabel: iv.label || "Observar",
      gravity: crit && crit.estado === "acima_capacidade" ? "high" : "elevated",
      pure: false
    };
  }

  return {
    mode_hint: a.mode_hint,
    focus_area: isf.praca_critica,
    climate_note:
      a.mode_hint === "ambiente" && crit
        ? `${crit.praca} em atenção — contexto preservado`
        : null,
    attention,
    actionTrack: {
      simulated: false,
      source: "capacidade-viva",
      stateId: "recomendacao",
      stateLabel: "Recomendação",
      copy: iv.reason || iv.label,
      responsible: {
        role: "Liderança de turno",
        name: "Responsável da função",
        note: "função, não ranking"
      },
      onlyCurrent: true,
      requires_human_confirmation: true
    },
    explain: a.explain,
    not_redesign: true
  };
}

module.exports = {
  loadDefaultConfig,
  avaliar,
  toV33ViewHints,
  cargaPonderadaPraca,
  classifyItem,
  pesoComplexidade,
  capacidadeEquipe,
  fatorTemporal,
  leituraVolumeGlobal,
  calcularISF,
  detectarExcecoes,
  sugerirMenorIntervencao,
  classificarRecuperacao,
  registrarFeedback,
  createHistory,
  applyConfigChange,
  explainable,
  explainISF,
  explainIntervencao
};
