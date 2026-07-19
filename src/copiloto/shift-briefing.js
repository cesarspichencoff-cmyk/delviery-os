/**
 * Briefing antes do turno — áudio ≤ 45s.
 */
"use strict";

const { BRIEFING } = require("./config");
const { forecastArea } = require("./forecast");

function buildBriefing(input) {
  const i = input || {};
  const dow = i.dow != null ? i.dow : new Date().getDay();
  const hour = i.hour != null ? i.hour : 17;
  const areas = i.areas_history || {};

  const risks = [];
  const preparations = [];

  // Heurística a partir de histórico recente e baselines
  if (i.expected_peak_hour) {
    risks.push({
      area: i.primary_risk_area || "sushi",
      text: `Maior atenção por volta de ${i.expected_peak_hour}h`,
      confidence: i.confidence || "media"
    });
  } else if (dow === 5 || dow === 6 || dow === 0) {
    risks.push({
      area: "sushi",
      text: "Fins de semana e sexta costumam concentrar jantar",
      confidence: "media"
    });
  }

  if (i.recent_occurrences && i.recent_occurrences.length) {
    for (const o of i.recent_occurrences.slice(0, 2)) {
      risks.push({ area: o.area, text: o.text, confidence: o.confidence || "media" });
    }
  }

  if (i.external_signals && i.external_signals.rain) {
    risks.push({
      area: "motoboy",
      text: "Chuva pode alongar espera e saída",
      confidence: i.external_signals.confidence || "baixa"
    });
    preparations.push("Antecipar motoboys no início do pico se a chuva se confirmar");
  }

  const forecast =
    i.queue_history && i.queue_history.length
      ? forecastArea({
          area: i.primary_risk_area || "conferencia",
          queue_history: i.queue_history,
          baselines: i.baselines,
          dow,
          hour,
          horizon_min: 30
        })
      : null;

  if (forecast && forecast.value >= 6) {
    preparations.push("Preparar Conferência e saída antes do acúmulo");
  }

  const learning = (i.learnings || []).slice(0, 2);

  const scenario = {
    expected: i.expected_scenario || "jantar com volume moderado a alto",
    peak_window: i.expected_peak_hour ? `${i.expected_peak_hour}:00–${i.expected_peak_hour + 2}:00` : "19:00–21:00",
    primary_risk: risks[0] || { text: "Sem risco principal claro", confidence: "baixa" },
    preparation: preparations.length ? preparations : ["Manter bancadas abastecidas e conferir equipe de saída"],
    recent_learning: learning,
    forecast_limit: "Previsão baseada em padrão histórico e sinais parciais — não é certeza."
  };

  const audio = buildBriefingAudio(scenario);

  return {
    schema_version: "1.0",
    scenario,
    forecast_30m: forecast,
    data_quality: i.data_quality || "partial",
    audio,
    max_audio_seconds: BRIEFING.max_audio_seconds
  };
}

function buildBriefingAudio(scenario) {
  const parts = [];
  parts.push(`Cenário esperado: ${scenario.expected}.`);
  parts.push(`Janela de maior atenção: ${scenario.peak_window}.`);
  parts.push(`Risco principal: ${scenario.primary_risk.text}.`);
  if (scenario.preparation[0]) parts.push(`Preparação: ${scenario.preparation[0]}.`);
  if (scenario.recent_learning[0]) {
    const L = scenario.recent_learning[0];
    parts.push(`Aprendizado recente: ${typeof L === "string" ? L : L.text}.`);
  }
  parts.push(scenario.forecast_limit);
  const spoken = parts.join(" ");
  return {
    spoken_text: spoken,
    max_seconds: BRIEFING.max_audio_seconds,
    screen_full_text: spoken
  };
}

module.exports = { buildBriefing, buildBriefingAudio };
