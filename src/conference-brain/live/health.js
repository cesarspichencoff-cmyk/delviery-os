/* ============================================================================
 * Saúde da fonte AO VIVO (Sprint 2, Fase 8 · evoluído no Sprint 2.1, Fase 15).
 * ----------------------------------------------------------------------------
 * Critérios explicáveis: cada estado nasce de uma condição nomeada, nunca de
 * "parece que". `calmo`/`fluindo`/etc. do estado sombra (Sprint 1) NUNCA
 * aparece quando a saúde aqui não é `available` — essa ponte é feita pelo
 * observador (live/observer.js), nunca por este módulo sozinho.
 *
 * Sprint 2.1: em vez de inventar estado novo para cada situação nova
 * (modo desconhecido, unidade incerta, loja fechada, modal bloqueando...),
 * a maioria vira um FATOR em `reasons[]` sobre os 9 estados já existentes —
 * só quando o fator muda o que pode ser afirmado é que ele também muda o
 * `state`. `reason` (string) continua existindo por compatibilidade; é
 * sempre `reasons[0]`.
 * ==========================================================================*/
"use strict";

const { LIVE_SOURCE_HEALTH, LIVE_HEALTH_REQUIRES_HUMAN, STORE_STATE } = require("../contracts/live-states");

/**
 * Classifica a saúde de um ciclo de observação a partir de sinais explícitos.
 * A ORDEM importa: sinais de bloqueio humano vêm primeiro (nada os sobrepõe).
 *
 * @param {object} signals  (Sprint 2, mantidos)
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
 * @param {object} signals  (Sprint 2.1, novos — todos opcionais)
 *   accountContextBlock    string|null  — ver live/store-state.js#accountContextBlocksConfidentReading
 *   storeState             string|null  — ver live/store-state.js#mapStoreState
 *   modalBlocking           bool — modal cobrindo a lista de pedidos
 *   orderDetailsOpenCoveringList bool — detalhe de pedido aberto no lugar da lista
 *   notificationOverlay     bool — notificação sobreposta à lista
 *   filterActive            bool — filtro ativo pode explicar zero resultados
 *   scheduledOnlyTabSelected bool — aba "Agendados" selecionada (não é a fila ativa)
 *   layoutMode              string — ver contracts/live-states.js#LAYOUT_MODE
 */
function classifyCycleHealth(signals) {
  const s = signals || {};
  const reasons = [];
  const finish = (state, primaryReason) => {
    reasons.unshift(primaryReason);
    return { state, reason: primaryReason, reasons };
  };

  if (s.captchaDetected) return finish(LIVE_SOURCE_HEALTH.CAPTCHA_PRESENT, "captcha_detectado_na_tela");
  if (s.loginPromptDetected) return finish(LIVE_SOURCE_HEALTH.LOGIN_REQUIRED, "tela_de_login_detectada");

  // Contexto de conta/unidade nunca sustenta leitura confiante (regra explícita).
  if (s.accountContextBlock === "multiplas_unidades_detectadas") {
    return finish(LIVE_SOURCE_HEALTH.INCONSISTENT, "multiplas_unidades_detectadas");
  }
  if (s.accountContextBlock === "unidade_nao_confirmada") {
    return finish(LIVE_SOURCE_HEALTH.PARTIAL, "unidade_nao_confirmada");
  }

  if (!s.containerFound) return finish(LIVE_SOURCE_HEALTH.LAYOUT_CHANGED, "conteiner_principal_nao_encontrado");
  if (s.layoutSignatureMatch === false) {
    return finish(LIVE_SOURCE_HEALTH.LAYOUT_CHANGED, "assinatura_estrutural_divergiu_da_conhecida");
  }

  // Estrutura obstruída por algo TEMPORÁRIO na tela — não é mudança de layout.
  if (s.modalBlocking) return finish(LIVE_SOURCE_HEALTH.PARTIAL, "modal_bloqueando_a_lista");
  if (s.orderDetailsOpenCoveringList) {
    return finish(LIVE_SOURCE_HEALTH.PARTIAL, "detalhe_de_pedido_aberto_cobrindo_lista");
  }
  if (s.notificationOverlay) return finish(LIVE_SOURCE_HEALTH.PARTIAL, "notificacao_sobreposta");

  if (typeof s.emptyOrderRatio === "number" && s.emptyOrderRatio > 0.5) {
    return finish(LIVE_SOURCE_HEALTH.LAYOUT_CHANGED, "quantidade_anormal_de_pedidos_vazios");
  }
  if (typeof s.pageAgeMs === "number" && typeof s.staleAfterMs === "number" && s.pageAgeMs > s.staleAfterMs) {
    return finish(LIVE_SOURCE_HEALTH.STALE, `pagina_sem_mudanca_ha_${s.pageAgeMs}ms`);
  }
  if (s.consecutiveFailures > 0 && s.ordersFound >= 0) {
    return finish(LIVE_SOURCE_HEALTH.RECOVERING, `retomando_apos_${s.consecutiveFailures}_falhas`);
  }
  if (Array.isArray(s.criticalFieldsMissing) && s.criticalFieldsMissing.length) {
    return finish(LIVE_SOURCE_HEALTH.PARTIAL, "campos_criticos_ausentes:" + s.criticalFieldsMissing.join(","));
  }

  if (!s.ordersFound) {
    // Loja fechada é um FATO OPERACIONAL, não uma falha técnica: a fonte leu
    // com sucesso e zero pedidos é o valor correto — nunca "indisponível".
    if (s.storeState === STORE_STATE.CLOSED_BY_SCHEDULE || s.storeState === STORE_STATE.CLOSED_MANUALLY) {
      return finish(LIVE_SOURCE_HEALTH.AVAILABLE, "loja_fechada");
    }
    if (s.storeState === STORE_STATE.CLOSED_BY_CONNECTIVITY || s.storeState === STORE_STATE.TEMPORARILY_UNAVAILABLE) {
      return finish(LIVE_SOURCE_HEALTH.UNAVAILABLE, "loja_indisponivel:" + s.storeState);
    }
    if (s.filterActive) return finish(LIVE_SOURCE_HEALTH.PARTIAL, "filtro_ativo_sem_resultado");
    if (s.scheduledOnlyTabSelected) return finish(LIVE_SOURCE_HEALTH.PARTIAL, "somente_agendados_selecionado");
    // tela vazia não é necessariamente falha (pode ser madrugada sem pedido) —
    // mas sem NENHUM sinal de vida na página, o mais honesto é `partial`, não `available`.
    return finish(LIVE_SOURCE_HEALTH.PARTIAL, "nenhum_pedido_encontrado_nesta_leitura");
  }

  // Leitura estruturalmente ok. Sinais auxiliares só reduzem confiança/anotam
  // razão — nunca mudam o estado sozinhos (não são falha, são incerteza).
  if (s.layoutMode === "unknown") reasons.push("modo_de_layout_desconhecido");
  return finish(LIVE_SOURCE_HEALTH.AVAILABLE, "leitura_completa");
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
