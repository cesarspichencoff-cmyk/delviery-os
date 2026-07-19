/**
 * Contrato de toda resposta do Copiloto (texto e áudio).
 */
"use strict";

const { AUDIO } = require("./config");

/**
 * Monta resposta estruturada.
 */
function buildResponse(parts) {
  const p = parts || {};
  const conclusion = p.conclusion || "";
  const evidence = p.evidence || [];
  const impact = p.impact || null;
  const confidence = p.confidence || "media";
  const recommendation = p.recommendation || null;
  const limit = p.limit || p.doubt || null;

  const text = composeText({ conclusion, evidence, impact, confidence, recommendation, limit });
  const audio = composeAudio(text, p.audio_mode || "normal");

  return {
    schema_version: "1.0",
    conclusion,
    evidence,
    impact,
    confidence,
    recommendation,
    limit_or_doubt: limit,
    text_full: text,
    audio: audio,
    style_rules: {
      no_abstract_jargon: true,
      no_false_precision: true,
      no_alarmism: true,
      no_invented_certainty: true,
      max_lists: 3
    },
    epistemic: p.epistemic || "inference"
  };
}

function composeText({ conclusion, evidence, impact, confidence, recommendation, limit }) {
  const bits = [];
  if (conclusion) bits.push(conclusion.endsWith(".") ? conclusion : conclusion + ".");
  if (evidence && evidence.length) {
    const ev = evidence
      .slice(0, 3)
      .map((e) => (typeof e === "string" ? e : e.text || `${e.k || e.type}: ${e.v || e.value}`))
      .join("; ");
    bits.push(ev.endsWith(".") ? ev : ev + ".");
  }
  if (impact) bits.push(typeof impact === "string" ? impact : impact.text || String(impact));
  if (recommendation) {
    const r = typeof recommendation === "string" ? recommendation : recommendation.label || recommendation.text;
    if (r) bits.push(r.startsWith("Recomendo") ? r : `Recomendo ${r.charAt(0).toLowerCase()}${r.slice(1)}`);
  }
  if (confidence && confidence !== "alta") {
    bits.push(confidence === "baixa" ? "Leitura com baixa confiança." : "Leitura com confiança moderada.");
  }
  if (limit) bits.push(limit);
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

function composeAudio(fullText, mode) {
  const sentences = fullText.split(/(?<=\.)\s+/).filter(Boolean);
  let spoken;
  let maxSec;
  if (mode === "short") {
    spoken = sentences.slice(0, 1).join(" ");
    maxSec = AUDIO.short_max_seconds;
  } else if (mode === "detailed") {
    spoken = fullText;
    maxSec = 45;
  } else {
    spoken = sentences.slice(0, 3).join(" ");
    maxSec = AUDIO.normal_max_seconds;
  }
  // Remover códigos e hashes longos para voz
  spoken = spoken.replace(/#[a-f0-9]{8,}/gi, (m) => "#" + m.slice(1, 5)).replace(/\b[a-f0-9]{8}-[a-f0-9-]{27}\b/gi, "pedido");
  return {
    mode,
    spoken_text: spoken,
    max_seconds: maxSec,
    screen_full_text: fullText,
    rules: [
      "conclusao_nos_primeiros_segundos",
      "uma_ideia_principal",
      "numeros_essenciais",
      "acao_final",
      "nao_ler_tabelas"
    ]
  };
}

/** Exemplo canônico de resposta de Conferência */
function exampleConferenceResponse() {
  return buildResponse({
    conclusion: "A Conferência merece atenção",
    evidence: [
      "Cinco pedidos estão aguardando",
      "dois estão próximos do prazo"
    ],
    impact: "Mantido o ritmo atual, outros três podem acumular nos próximos quinze minutos.",
    confidence: "media",
    recommendation: "verificar primeiro os pedidos 184 e 191.",
    limit: "Não há dado de quem está na bancada de conferência."
  });
}

module.exports = {
  buildResponse,
  composeText,
  composeAudio,
  exampleConferenceResponse
};
