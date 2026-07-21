/* ============================================================================
 * Feature flags do cérebro da Conferência (Sprint 1).
 * ----------------------------------------------------------------------------
 * Regra: desligadas em produção; habilitáveis em teste; quando desligadas, o
 * comportamento existente do Copiloto NÃO muda em nada.
 *
 * Mesmo padrão já validado na Capacidade Viva em sombra
 * (src/capacidade-viva/shadow/flags.js): a flag liga a EXECUÇÃO/observação —
 * nunca liga decisão automática. Não existe flag que promova o estado sombra
 * a estado oficial; isso exige fase própria e decisão humana registrada.
 * ==========================================================================*/
"use strict";

const FLAGS = Object.freeze({
  FOUNDATION: "CONFERENCE_BRAIN_FOUNDATION_V1",
  SHADOW_STATE: "CONFERENCE_SHADOW_STATE_V1",
  COMPOSITION_HINTS: "CONFERENCE_COMPOSITION_HINTS_V1"
});

function readFlag(env, name) {
  const raw = (env || process.env)[name];
  if (raw != null) return raw === "1" || raw === "true";
  const nodeEnv = (env || process.env).NODE_ENV || "development";
  // habilitável em desenvolvimento/teste; desligada em qualquer outro ambiente
  return nodeEnv === "development" || nodeEnv === "test";
}

/** Fundação (ingestão/normalização/snapshots). */
function conferenceBrainFoundationV1(env) { return readFlag(env, FLAGS.FOUNDATION); }

/** Estado sombra da Conferência. Exige a fundação ligada. */
function conferenceShadowStateV1(env) {
  return readFlag(env, FLAGS.SHADOW_STATE) && conferenceBrainFoundationV1(env);
}

/** Sinais pontuais de composição (contexto do pedido). Exige a fundação. */
function conferenceCompositionHintsV1(env) {
  return readFlag(env, FLAGS.COMPOSITION_HINTS) && conferenceBrainFoundationV1(env);
}

/**
 * Decisão automática: SEMPRE false, hardcoded, sem ler ambiente.
 * Existe como ponto único de verdade para o futuro e para travar por teste.
 */
function automaticDecisionsEnabled() { return false; }

/** O estado sombra pode virar estado oficial? Nunca no Sprint 1. */
function shadowStateMayDriveProduct() { return false; }

module.exports = {
  FLAGS,
  conferenceBrainFoundationV1,
  conferenceShadowStateV1,
  conferenceCompositionHintsV1,
  automaticDecisionsEnabled,
  shadowStateMayDriveProduct
};
