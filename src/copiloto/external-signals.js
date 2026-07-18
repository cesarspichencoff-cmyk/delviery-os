/**
 * Sinais externos — preparação futura. Só usar se necessidade real.
 */
"use strict";

const SIGNAL_CATALOG = [
  {
    signal_id: "weather_rain",
    name: "Chuva",
    sources: ["open-meteo", "inmet"],
    reliability: "media",
    impact: "motoboy_eta_and_wait",
    latency: "5-60min",
    cost: "low",
    privacy: "none",
    real_need: "alta_em_cidades_chuvosas",
    use_when: "chuva moderada/forte no raio de entrega",
    do_not_use_just_because_available: true
  },
  {
    signal_id: "temperature",
    name: "Temperatura",
    sources: ["open-meteo"],
    reliability: "alta",
    impact: "demanda_leve",
    latency: "hourly",
    cost: "low",
    privacy: "none",
    real_need: "baixa",
    use_when: "extremos claros com correlação validada",
    do_not_use_just_because_available: true
  },
  {
    signal_id: "holiday",
    name: "Feriados",
    sources: ["calendario_nacional", "calendario_local"],
    reliability: "alta",
    impact: "volume_pattern",
    latency: "known_ahead",
    cost: "low",
    privacy: "none",
    real_need: "media",
    use_when: "feriado altera padrão de jantar",
    do_not_use_just_because_available: true
  },
  {
    signal_id: "local_events",
    name: "Eventos / jogos",
    sources: ["manual", "feed_eventos"],
    reliability: "baixa_a_media",
    impact: "pico_localizado",
    latency: "variable",
    cost: "medium",
    privacy: "none",
    real_need: "media_se_validado",
    use_when: "evento com histórico de impacto na loja",
    do_not_use_just_because_available: true
  },
  {
    signal_id: "promotions",
    name: "Promoções iFood/loja",
    sources: ["operacao", "portal"],
    reliability: "alta_se_registrado",
    impact: "volume_and_mix",
    latency: "known_ahead",
    cost: "low",
    privacy: "none",
    real_need: "alta",
    use_when: "promoção ativa no turno",
    do_not_use_just_because_available: true
  }
];

function listSignals() {
  return SIGNAL_CATALOG.slice();
}

function shouldUseSignal(signalId, evidenceOfImpact) {
  const s = SIGNAL_CATALOG.find((x) => x.signal_id === signalId);
  if (!s) return { use: false, reason: "desconhecido" };
  if (!evidenceOfImpact || evidenceOfImpact.validated !== true) {
    return { use: false, reason: "sem_necessidade_validada", signal: s };
  }
  return { use: true, reason: "necessidade_real_validada", signal: s };
}

module.exports = {
  SIGNAL_CATALOG,
  listSignals,
  shouldUseSignal
};
