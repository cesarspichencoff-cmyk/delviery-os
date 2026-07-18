/**
 * Copiloto Delivery — configuração canônica (referência)
 * Tudo configurável. Nada hard-coded sem rótulo.
 * Alinha áreas de produto (Sushi/Quentes/…) com praças do motor DeliveryOS.
 */
"use strict";

const AREAS = Object.freeze({
  sushi: {
    id: "sushi",
    label: "Sushi",
    pracas: ["combinados", "duplas", "enrolados"],
    role: "producao"
  },
  quentes: {
    id: "quentes",
    label: "Quentes",
    pracas: ["enrolados_quentes", "cozinha_quentes"],
    role: "producao"
  },
  cozinha: {
    id: "cozinha",
    label: "Cozinha",
    pracas: ["cozinha_quentes"],
    role: "producao"
  },
  conferencia: {
    id: "conferencia",
    label: "Conferência",
    pracas: ["sobremesa", "bar_bebidas", "montagem_outros"],
    role: "conferencia"
  },
  motoboy: {
    id: "motoboy",
    label: "Motoboy",
    pracas: [],
    role: "saida"
  },
  caixa: {
    id: "caixa",
    label: "Caixa",
    pracas: [],
    role: "caixa"
  }
});

/** Mapeamento kind do motor.js → área de produto */
const KIND_TO_AREA = Object.freeze({
  praca: null, // depende de sit.praca
  saida: "motoboy",
  conferencia: "conferencia",
  fechamento: "conferencia",
  order: null
});

const PRACA_TO_AREA = Object.freeze({
  combinados: "sushi",
  duplas: "sushi",
  enrolados: "sushi",
  enrolados_quentes: "quentes",
  cozinha_quentes: "quentes",
  sobremesa: "conferencia",
  bar_bebidas: "conferencia",
  montagem_outros: "conferencia"
});

/**
 * Limiares iniciais por área — derivados de FLOORS/TEMPO_PRACA do motor +
 * auditorias documentadas (p99 produção ~71, expedição ~57).
 * PROVISÓRIO até calibração com dados brutos no worktree.
 */
const DEFAULT_THRESHOLDS = Object.freeze({
  sushi: {
    normal_queue: 8,
    attention_queue: 12,
    pressure_queue: 16,
    critical_queue: 22,
    normal_min: 12,
    attention_min: 18,
    pressure_min: 25,
    critical_min: 35,
    min_persistence_min: 3,
    recovery_below_queue: 10,
    recovery_below_min: 15,
    min_confidence: "media"
  },
  quentes: {
    normal_queue: 4,
    attention_queue: 7,
    pressure_queue: 10,
    critical_queue: 14,
    normal_min: 12,
    attention_min: 18,
    pressure_min: 24,
    critical_min: 32,
    min_persistence_min: 3,
    recovery_below_queue: 5,
    recovery_below_min: 14,
    min_confidence: "media"
  },
  cozinha: {
    normal_queue: 3,
    attention_queue: 5,
    pressure_queue: 8,
    critical_min: 12,
    normal_min: 12,
    attention_min: 16,
    pressure_min: 22,
    critical_queue: 12,
    min_persistence_min: 3,
    recovery_below_queue: 4,
    recovery_below_min: 14,
    min_confidence: "media"
  },
  conferencia: {
    normal_queue: 3,
    attention_queue: 5,
    pressure_queue: 8,
    critical_queue: 12,
    normal_min: 8,
    attention_min: 15,
    pressure_min: 22,
    critical_min: 30,
    min_persistence_min: 2,
    recovery_below_queue: 3,
    recovery_below_min: 10,
    min_confidence: "media"
  },
  motoboy: {
    normal_queue: 2,
    attention_queue: 4,
    pressure_queue: 6,
    critical_queue: 9,
    normal_min: 15,
    attention_min: 25,
    pressure_min: 35,
    critical_min: 45,
    min_persistence_min: 2,
    recovery_below_queue: 2,
    recovery_below_min: 18,
    min_confidence: "alta"
  },
  caixa: {
    normal_queue: 0,
    attention_queue: 2,
    pressure_queue: 4,
    critical_queue: 6,
    normal_min: 5,
    attention_min: 10,
    pressure_min: 15,
    critical_min: 25,
    min_persistence_min: 5,
    recovery_below_queue: 1,
    recovery_below_min: 8,
    min_confidence: "baixa"
  }
});

const FOCUS_STABILITY = Object.freeze({
  min_persistence_updates: 2,
  switch_margin: 1.25,
  cooldown_min: 8,
  max_focus_min: 12,
  hysteresis_ratio: 0.85,
  critical_override_severity: 3,
  min_confidence_to_focus: "media"
});

const FORECAST_HORIZONS = Object.freeze([10, 15, 30]);

const SILENCE = Object.freeze({
  silent: { max_per_hour: 999, notify: false },
  discreet: { max_per_hour: 6, cooldown_min: 5, notify: "subtle" },
  intervention: {
    max_per_hour: 3,
    cooldown_min: 8,
    min_severity: 2,
    min_confidence: "media",
    notify: "interrupt"
  }
});

const CLOSING = Object.freeze({
  ideal_seconds: 60,
  max_seconds: 120,
  max_questions: 3,
  min_info_gain: 0.4
});

const BRIEFING = Object.freeze({
  max_audio_seconds: 45
});

const AUDIO = Object.freeze({
  short_max_seconds: 8,
  normal_max_seconds: 20,
  detailed_on_request: true
});

const CONFIDENCE_ORDER = Object.freeze({ baixa: 0, media: 1, alta: 2 });

function confidenceAtLeast(actual, required) {
  return (CONFIDENCE_ORDER[actual] ?? 0) >= (CONFIDENCE_ORDER[required] ?? 0);
}

function resolveAreaFromSit(sit) {
  if (!sit) return null;
  if (sit.kind === "praca" && sit.praca) return PRACA_TO_AREA[sit.praca] || null;
  if (sit.kind && KIND_TO_AREA[sit.kind]) return KIND_TO_AREA[sit.kind];
  if (sit.area) return sit.area;
  return null;
}

module.exports = {
  AREAS,
  KIND_TO_AREA,
  PRACA_TO_AREA,
  DEFAULT_THRESHOLDS,
  FOCUS_STABILITY,
  FORECAST_HORIZONS,
  SILENCE,
  CLOSING,
  BRIEFING,
  AUDIO,
  CONFIDENCE_ORDER,
  confidenceAtLeast,
  resolveAreaFromSit
};
