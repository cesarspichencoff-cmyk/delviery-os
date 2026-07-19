/* ============================================================================
 * Índice de Sustentação do Fluxo (ISF) por praça — interno, não ranking.
 * pressão prevista / capacidade ajustada
 * Estado geral = praça mais crítica (não média que esconde).
 * ==========================================================================*/
"use strict";

const { cargaPonderadaPraca } = require("./carga");
const { capacidadeEquipe } = require("./capacidade-equipe");
const { fatorTemporal, leituraVolumeGlobal } = require("./contexto-temporal");

/**
 * @param {object} input
 * @param {object} input.config
 * @param {object} input.turno - equipe do turno
 * @param {object} input.por_praca - { sushi: { items, carga_prevista?, envelhecimento?, bloqueios? } }
 * @param {number} [input.n_pedidos]
 * @param {Date|string} [input.when]
 * @param {object} [input.source]
 */
function calcularISF(input) {
  const cfg = (input && input.config) || {};
  const cap = capacidadeEquipe(input.turno || {}, cfg);
  const temporal = fatorTemporal(cfg, input.when);
  const volume = leituraVolumeGlobal(input.n_pedidos, cfg);
  const estados = (cfg.isf_estados) || {};
  const por = {};

  for (const [pracaId, bloco] of Object.entries((input && input.por_praca) || {})) {
    const cargaAtual = cargaPonderadaPraca({ items: (bloco && bloco.items) || [], config: cfg, urgency_by_order: input.urgency_by_order });
    const cargaPrev = Number(bloco.carga_prevista != null ? bloco.carga_prevista : cargaAtual.carga * 1.1);
    const env = Number(bloco.envelhecimento != null ? bloco.envelhecimento : 0);
    const bloq = Number(bloco.bloqueios != null ? bloco.bloqueios : 0);
    const pressao = cargaAtual.carga + cargaPrev * 0.5 + env + bloq * 2;
    const capF = (cap.por_praca[pracaId] && cap.por_praca[pracaId].fator_capacidade) || 0.5;
    // capacidade histórica ajustada por equipe e contexto
    const capacidade = Math.max(0.2, capF * 10) / temporal.fator;
    const isf = capacidade > 0 ? pressao / capacidade : 99;
    const estado = estadoFromISF(isf, estados);
    por[pracaId] = {
      praca: pracaId,
      isf: round2(isf),
      estado,
      pressao: round2(pressao),
      capacidade_ajustada: round2(capacidade),
      componentes: {
        carga_atual: cargaAtual.carga,
        carga_prevista: round2(cargaPrev),
        envelhecimento: env,
        bloqueios: bloq,
        fator_equipe: capF,
        fator_temporal: temporal.fator
      },
      carga_detail: cargaAtual,
      // não é score de pessoa
      not_ranking: true,
      explanation: `${pracaId}: ISF ${round2(isf)} (${estado}) — pressão ${round2(pressao)} / cap ${round2(capacidade)}`
    };
  }

  // praça crítica = pior ISF (nunca média)
  let critica = null;
  for (const row of Object.values(por)) {
    if (!critica || row.isf > critica.isf) critica = row;
  }

  const estadoGeral = estadoGeralFrom({
    critica,
    por,
    volume,
    temporal,
    confianca: input.confianca || temporal.incerteza
  });

  return {
    schema_version: "0.1",
    por_praca: por,
    praca_critica: critica ? critica.praca : null,
    estado_geral: estadoGeral.estado,
    estado_geral_reason: estadoGeral.reason,
    volume_global: volume,
    temporal,
    capacidade_equipe: cap,
    uses_average_to_hide_critical: false,
    not_employee_score: true,
    confidence: input.confianca || temporal.incerteza || "media",
    insufficient_data: Object.keys(por).length === 0,
    message_if_insufficient: "Não tenho leitura suficiente para recomendar."
  };
}

function estadoFromISF(isf, estados) {
  const c = (estados.controlavel && estados.controlavel.max) || 0.65;
  const a = (estados.atencao && estados.atencao.max) || 0.85;
  const p = (estados.proximo_limite && estados.proximo_limite.max) || 1.05;
  if (isf <= c) return "controlavel";
  if (isf <= a) return "atencao";
  if (isf <= p) return "proximo_limite";
  return "acima_capacidade";
}

function estadoGeralFrom({ critica, por, volume, temporal, confianca }) {
  if (!critica) {
    return { estado: "insufficient", reason: "sem praças com leitura" };
  }
  // tendência: se várias em atenção+
  const nBad = Object.values(por).filter((p) => p.estado !== "controlavel").length;
  let estado = critica.estado;
  // volume global NÃO rebaixa praça crítica
  if (volume.band === "controlavel" && critica.estado === "acima_capacidade") {
    return {
      estado: critica.estado,
      reason: `praça crítica ${critica.praca} acima da capacidade (volume global não esconde)`
    };
  }
  if (confianca === "baixa" || temporal.incerteza === "alta") {
    return {
      estado,
      reason: `praça crítica ${critica.praca}; confiança ${confianca || temporal.incerteza}`
    };
  }
  return {
    estado,
    reason: `praça crítica ${critica.praca} (${critica.estado}); ${nBad} praça(s) fora de controlável`
  };
}

function round2(x) {
  return Math.round(Number(x) * 100) / 100;
}

module.exports = { calcularISF, estadoFromISF };
