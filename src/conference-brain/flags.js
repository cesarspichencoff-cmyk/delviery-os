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
  COMPOSITION_HINTS: "CONFERENCE_COMPOSITION_HINTS_V1",
  // Sprint 2
  LIVE_OBSERVER: "CONFERENCE_LIVE_OBSERVER_V1",
  CLOCK: "CONFERENCE_CLOCK_V1",
  OPERATOR_PANEL: "CONFERENCE_OPERATOR_PANEL_V1",
  IFOOD_MAPPING_MODE: "CONFERENCE_IFOOD_MAPPING_MODE_V1"
});

function readFlag(env, name) {
  const raw = (env || process.env)[name];
  if (raw != null) return raw === "1" || raw === "true";
  const nodeEnv = (env || process.env).NODE_ENV || "development";
  // habilitável em desenvolvimento/teste; desligada em qualquer outro ambiente
  return nodeEnv === "development" || nodeEnv === "test";
}

/**
 * Leitura ESTRITA: só liga com "1"/"true" explícito, em QUALQUER ambiente —
 * inclusive desenvolvimento e teste. Reservada para o que toca uma sessão de
 * navegador real (Fase 15: "o coletor real não deve ligar apenas porque a
 * variável está ausente"). Nunca herda o padrão permissivo de `readFlag`.
 */
function readStrictFlag(env, name) {
  const raw = (env || process.env)[name];
  return raw === "1" || raw === "true";
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
 * Coletor ao vivo do iFood — TOCA UMA SESSÃO DE NAVEGADOR REAL. Leitura
 * estrita: nunca liga sozinho por a variável estar ausente, nem em
 * desenvolvimento/teste. Exige a fundação.
 */
function conferenceLiveObserverV1(env) {
  return readStrictFlag(env, FLAGS.LIVE_OBSERVER) && conferenceBrainFoundationV1(env);
}

/** Relógio mínimo da Conferência — lógica local, sem navegador. Exige a fundação. */
function conferenceClockV1(env) {
  return readFlag(env, FLAGS.CLOCK) && conferenceBrainFoundationV1(env);
}

/** Painel interno mínimo — servidor local separado, nunca ligado à interface pública. */
function conferenceOperatorPanelV1(env) {
  return readFlag(env, FLAGS.OPERATOR_PANEL) && conferenceClockV1(env);
}

/**
 * Modo de Mapeamento — pode observar a sessão real para descobrir seletores.
 * Leitura estrita, igual ao coletor ao vivo: padrão sempre desligada.
 */
function conferenceIfoodMappingModeV1(env) {
  return readStrictFlag(env, FLAGS.IFOOD_MAPPING_MODE) && conferenceBrainFoundationV1(env);
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
  conferenceLiveObserverV1,
  conferenceClockV1,
  conferenceOperatorPanelV1,
  conferenceIfoodMappingModeV1,
  automaticDecisionsEnabled,
  shadowStateMayDriveProduct
};
