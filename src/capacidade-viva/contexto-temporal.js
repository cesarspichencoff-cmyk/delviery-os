/* ============================================================================
 * Contexto temporal provisório (dia/hora) — não verdade absoluta.
 * ==========================================================================*/
"use strict";

function fatorTemporal(config, when) {
  const d = when instanceof Date ? when : new Date(when || Date.now());
  const cfg = (config && config.contexto_temporal) || {};
  const dow = d.getDay();
  const hour = d.getHours();
  const dia = (cfg.dia && cfg.dia[String(dow)]) || { fator: 1, label: "dia" };
  let fator = Number(dia.fator) || 1;
  let tags = [dia.label || `dow_${dow}`];
  let incerteza = dia.incerteza || "media";

  const sens = cfg.hora_sensivel || { inicio: 19, fim: 21, fator: 1.15 };
  if (hour >= sens.inicio && hour < sens.fim) {
    fator *= Number(sens.fator) || 1.15;
    tags.push("janela_19_21");
  }
  const prep = cfg.preparacao_pico || { inicio: 17, fim: 19, fator: 1.05 };
  if (hour >= prep.inicio && hour < prep.fim) {
    fator *= Number(prep.fator) || 1.05;
    tags.push("preparacao_pico");
  }

  return {
    fator: round2(fator),
    dow,
    hour,
    tags,
    incerteza,
    provisional: true,
    explanation: `fator temporal ${round2(fator)} (${tags.join(", ")}) — provisório`
  };
}

/**
 * Volume global apenas como contexto — NÃO esconde praça crítica.
 */
function leituraVolumeGlobal(nPedidos, config) {
  const v = (config && config.volume_global_provisorio) || {};
  const n = Number(nPedidos) || 0;
  let band = "controlavel";
  if (n >= (v.dificuldade_min || 70)) band = "dificuldade";
  else if (n >= (v.atencao_max || 60)) band = "atencao_alta";
  else if (n > (v.controlavel_max || 50)) band = "atencao";
  return {
    pedidos: n,
    band,
    provisional: true,
    note: v.note || "Não é verdade absoluta",
    does_not_override_praca_critica: true
  };
}

function round2(x) {
  return Math.round(Number(x) * 100) / 100;
}

module.exports = { fatorTemporal, leituraVolumeGlobal };
