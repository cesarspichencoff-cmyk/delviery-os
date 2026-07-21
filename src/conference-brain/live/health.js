/* ============================================================================
 * Saúde da fonte AO VIVO (Sprint 2, Fase 8).
 * ----------------------------------------------------------------------------
 * Critérios explicáveis: cada estado nasce de uma condição nomeada, nunca de
 * "parece que". `calmo`/`fluindo`/etc. do estado sombra (Sprint 1) NUNCA
 * aparece quando a saúde aqui não é `available` — essa ponte é feita pelo
 * observador (live/observer.js), nunca por este módulo sozinho.
 * ==========================================================================*/
"use strict";

const { LIVE_SOURCE_HEALTH, LIVE_HEALTH_REQUIRES_HUMAN } = require("../contracts/live-states");

/**
 * Classifica a saúde de um ciclo de observação a partir de sinais explícitos.
 * A ORDEM importa: sinais de bloqueio humano vêm primeiro (nada os sobrepõe).
 *
 * @param {object} signals
 *   containerFound        bool  — o contêiner principal da lista de pedidos foi encontrado?
 *   loginPromptDetected    bool
 *   captchaDetected        bool
 *   layoutSignatureMatch   bool|null — null = sem assinatura conhecida ainda (1ª vez)
 *   pageAgeMs              number|null — há quanto tempo a página não muda
 *   staleAfterMs           number — limite configurado para considerar "parada"
 *   ordersFound            number
 *   emptyOrderRatio        number  — fração de "pedidos" extraídos sem campos úteis
 *   criticalFieldsMissing  string[] — campos essenciais ausentes nesta leitura
 *   consecutiveFailures    number
 */
function classifyCycleHealth(signals) {
  const s = signals || {};

  if (s.captchaDetected) {
    return { state: LIVE_SOURCE_HEALTH.CAPTCHA_PRESENT, reason: "captcha_detectado_na_tela" };
  }
  if (s.loginPromptDetected) {
    return { state: LIVE_SOURCE_HEALTH.LOGIN_REQUIRED, reason: "tela_de_login_detectada" };
  }
  if (!s.containerFound) {
    return { state: LIVE_SOURCE_HEALTH.LAYOUT_CHANGED, reason: "conteiner_principal_nao_encontrado" };
  }
  if (s.layoutSignatureMatch === false) {
    return { state: LIVE_SOURCE_HEALTH.LAYOUT_CHANGED, reason: "assinatura_estrutural_divergiu_da_conhecida" };
  }
  if (typeof s.emptyOrderRatio === "number" && s.emptyOrderRatio > 0.5) {
    return { state: LIVE_SOURCE_HEALTH.LAYOUT_CHANGED, reason: "quantidade_anormal_de_pedidos_vazios" };
  }
  if (typeof s.pageAgeMs === "number" && typeof s.staleAfterMs === "number" && s.pageAgeMs > s.staleAfterMs) {
    return { state: LIVE_SOURCE_HEALTH.STALE, reason: `pagina_sem_mudanca_ha_${s.pageAgeMs}ms` };
  }
  if (s.consecutiveFailures > 0 && s.ordersFound >= 0) {
    return { state: LIVE_SOURCE_HEALTH.RECOVERING, reason: `retomando_apos_${s.consecutiveFailures}_falhas` };
  }
  if (Array.isArray(s.criticalFieldsMissing) && s.criticalFieldsMissing.length) {
    return {
      state: LIVE_SOURCE_HEALTH.PARTIAL,
      reason: "campos_criticos_ausentes:" + s.criticalFieldsMissing.join(",")
    };
  }
  if (!s.ordersFound) {
    // tela vazia não é necessariamente falha (pode ser madrugada sem pedido) —
    // mas sem NENHUM sinal de vida na página, o mais honesto é `partial`, não `available`.
    return { state: LIVE_SOURCE_HEALTH.PARTIAL, reason: "nenhum_pedido_encontrado_nesta_leitura" };
  }
  return { state: LIVE_SOURCE_HEALTH.AVAILABLE, reason: "leitura_completa" };
}

/** A coleta deve suspender e pedir intervenção humana? */
function requiresHumanIntervention(state) {
  return LIVE_HEALTH_REQUIRES_HUMAN.includes(state);
}

/** `calmo` (ou qualquer faixa do Sprint 1) só pode aparecer com saúde `available`. */
function mayAffirmOperationalLoad(state) {
  return state === LIVE_SOURCE_HEALTH.AVAILABLE;
}

module.exports = { classifyCycleHealth, requiresHumanIntervention, mayAffirmOperationalLoad };
