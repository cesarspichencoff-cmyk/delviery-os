/**
 * Estabilidade do Foco — anti-oscilação.
 * Linguagem técnica + produto no retorno.
 */
"use strict";

const { FOCUS_STABILITY, confidenceAtLeast } = require("./config");

/**
 * Estado de sessão de estabilidade.
 * @returns {object}
 */
function createFocusSession() {
  return {
    active: null, // focus object
    since: null,
    updates_held: 0,
    last_switch_at: null,
    last_key: null,
    cooldown_until: {}, // key -> timestamp min
    history: []
  };
}

/**
 * Decide se mantém, troca ou encerra o foco.
 * @param {object} session
 * @param {object|null} proposed - resultado de selectFocus().focus
 * @param {object} ctx - { t_min, technical_state, resolved_keys[] }
 */
function stabilize(session, proposed, ctx) {
  const cfg = FOCUS_STABILITY;
  const t = (ctx && ctx.t_min) != null ? ctx.t_min : 0;
  const tech = (ctx && ctx.technical_state) || "healthy";
  const resolved = new Set((ctx && ctx.resolved_keys) || []);

  const product = { keep: "Manter o Foco atual", switch: "Trocar o Foco", clear: "Encerrar o Foco", hold: "Aguardar confirmação" };

  // Dado inválido → limpa foco operacional (não inventa prioridade)
  if (tech === "failed") {
    session.active = null;
    session.updates_held = 0;
    return decision("clear", null, "dados_invalidos", "technical", product.clear, "Os dados ficaram inválidos. O Foco foi encerrado até a leitura voltar.");
  }

  // Sem proposta e sem ativo
  if (!proposed && !session.active) {
    return decision("none", null, "sem_candidato", "none", "Sem Foco", "Nada pede atenção principal agora.");
  }

  // Proposta existe, sem ativo → exige persistência mínima
  if (proposed && !session.active) {
    if (session.last_key === proposed.focus_id || session.last_key === proposed.key) {
      session.updates_held += 1;
    } else {
      session.last_key = proposed.focus_id || proposed.key;
      session.updates_held = 1;
    }
    const confOk = confidenceAtLeast(proposed.confidence, cfg.min_confidence_to_focus) || proposed.severity >= cfg.critical_override_severity;
    if (session.updates_held >= cfg.min_persistence_updates && confOk) {
      const cd = session.cooldown_until[proposed.focus_id || proposed.key];
      if (cd != null && t < cd && proposed.severity < cfg.critical_override_severity) {
        return decision("hold", null, "cooldown", "cooldown", product.hold, "Essa situação já foi foco há pouco. Só volta se piorar de verdade.");
      }
      session.active = proposed;
      session.since = t;
      session.updates_held = 0;
      session.history.push({ at: t, event: "activate", key: proposed.focus_id });
      return decision("activate", proposed, "persistencia_ok", "activate", "Abrir Foco", "A situação se manteve. Vale a pena olhar isso agora.");
    }
    return decision("hold", null, "aguardando_persistencia", "pending", product.hold, "Ainda é cedo para interromper. Confirmando se a situação se sustenta.");
  }

  // Ativo existe
  const active = session.active;
  const activeKey = active.focus_id || active.key;

  // Resolvido
  if (resolved.has(activeKey) || (ctx && ctx.active_resolved)) {
    session.cooldown_until[activeKey] = t + cfg.cooldown_min;
    session.active = null;
    session.updates_held = 0;
    session.history.push({ at: t, event: "resolved", key: activeKey });
    return decision("clear", null, "resolvido", "resolved", product.clear, "O que pedia atenção parece resolvido.");
  }

  // Condição anterior deixou de existir (proposta null ou área normal)
  if (!proposed) {
    // hysteresis: só encerra se já durou um pouco ou se explicitamente sumiu
    const held = t - (session.since || t);
    if (held >= 2) {
      session.cooldown_until[activeKey] = t + cfg.cooldown_min;
      session.active = null;
      return decision("clear", null, "condicao_ausente", "cleared", product.clear, "A condição do Foco deixou de aparecer.");
    }
    return decision("keep", active, "hysteresis_hold", "keep", product.keep, "Ainda mantemos o Foco por segurança, mesmo com alívio inicial.");
  }

  const propKey = proposed.focus_id || proposed.key;

  // Mesmo foco → atualiza
  if (propKey === activeKey || sameSituation(active, proposed)) {
    session.active = { ...active, ...proposed, focus_id: active.focus_id };
    return decision("keep", session.active, "mesmo_foco", "keep", product.keep, "Continuamos no mesmo ponto. Ainda é a prioridade.");
  }

  // Crítico override
  if (proposed.severity >= cfg.critical_override_severity && proposed.severity > (active.severity || 0)) {
    session.cooldown_until[activeKey] = t + cfg.cooldown_min;
    session.active = proposed;
    session.since = t;
    session.last_switch_at = t;
    session.history.push({ at: t, event: "critical_switch", from: activeKey, to: propKey });
    return decision("switch", proposed, "risco_critico", "critical_switch", product.switch, "Surgiu um risco maior. O Foco mudou por isso.");
  }

  // Margem de troca + hysteresis
  const activeScore = active.priority_score || scoreProxy(active);
  const propScore = proposed.priority_score || scoreProxy(proposed);
  if (propScore >= activeScore * cfg.switch_margin) {
    // exige confirmação em múltiplas atualizações
    if (session.last_key === propKey) session.updates_held += 1;
    else {
      session.last_key = propKey;
      session.updates_held = 1;
    }
    if (session.updates_held >= cfg.min_persistence_updates) {
      session.cooldown_until[activeKey] = t + cfg.cooldown_min;
      session.active = proposed;
      session.since = t;
      session.last_switch_at = t;
      session.updates_held = 0;
      session.history.push({ at: t, event: "switch", from: activeKey, to: propKey });
      return decision("switch", proposed, "claramente_mais_importante", "switch", product.switch, "Outra situação ficou claramente mais importante.");
    }
    return decision("keep", active, "aguardando_confirmacao_troca", "keep", product.keep, "Há um concorrente forte, mas ainda confirmando antes de trocar.");
  }

  // Teto de duração
  if (session.since != null && t - session.since >= cfg.max_focus_min) {
    session.cooldown_until[activeKey] = t + cfg.cooldown_min;
    session.active = null;
    return decision("clear", null, "teto_duracao", "max_focus", product.clear, "O Foco durou o tempo máximo. Recalculando a prioridade.");
  }

  return decision("keep", active, "margem_insuficiente", "keep", product.keep, "Mantemos o Foco. A alternativa ainda não é claramente maior.");
}

function sameSituation(a, b) {
  if (a.area && b.area && a.area === b.area && a.title === b.title) return true;
  if (a.area && b.area && a.area === b.area && Math.abs((a.severity || 0) - (b.severity || 0)) <= 0) return true;
  return false;
}

function scoreProxy(f) {
  return (f.severity || 0) * 3 + (f.urgency || 0) * 2 + Math.min(10, f.reach || 0) * 0.5;
}

function decision(action, focus, reason, technical, product_action, product_reason) {
  return {
    action,
    focus,
    reason,
    technical_rule: technical,
    product: {
      action: product_action,
      explanation: product_reason
    }
  };
}

/** Texto de produto das regras de estabilidade */
function productRulesText() {
  return [
    "O Foco só muda quando a situação foi resolvida, quando outra ficou claramente mais importante, quando surge risco crítico, quando os dados ficam inválidos, ou quando a condição anterior some.",
    "Picos de um minuto não interrompem.",
    "Depois de um Foco, a mesma situação espera um tempo antes de voltar — a menos que fique crítica.",
    "Troca exige confirmação em mais de uma atualização e margem clara de prioridade."
  ];
}

function technicalRulesText() {
  return {
    min_persistence_updates: FOCUS_STABILITY.min_persistence_updates,
    switch_margin: FOCUS_STABILITY.switch_margin,
    cooldown_min: FOCUS_STABILITY.cooldown_min,
    max_focus_min: FOCUS_STABILITY.max_focus_min,
    hysteresis_ratio: FOCUS_STABILITY.hysteresis_ratio,
    critical_override_severity: FOCUS_STABILITY.critical_override_severity
  };
}

module.exports = {
  createFocusSession,
  stabilize,
  productRulesText,
  technicalRulesText
};
