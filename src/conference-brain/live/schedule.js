/* ============================================================================
 * Pedidos agendados (Sprint 2.1, Fase 10).
 * ----------------------------------------------------------------------------
 * Puro. Só prepara os dados — a previsão de onda na interface fica para uma
 * fase futura (não implementada aqui, por instrução explícita da missão).
 * ==========================================================================*/
"use strict";

const { CONFIDENCE } = require("../contracts/states");

/** Constrói a estrutura de agendamento de UM pedido a partir de sinais observados. */
function buildSchedule(signal) {
  const s = signal || {};
  return {
    is_scheduled: s.isScheduled === true,
    scheduled_for: s.scheduledFor || null,
    activation_observed_at: s.activationObservedAt || null,
    confidence: s.scheduledFor ? (s.confidence || CONFIDENCE.HIGH) : (s.confidence || CONFIDENCE.LOW),
    source: s.source || "ifood_screen"
  };
}

/**
 * Um pedido agendado só deve contar como carga ATIVA quando estiver perto do
 * horário — nunca desde o instante em que aparece na aba de agendados. Sem
 * `scheduled_for`, não há como calcular isso com precisão: o chamador decide
 * (política de produto, não deste módulo) o que fazer com `null`.
 */
function isActiveNow(schedule, now, leadTimeMs) {
  const s = schedule || {};
  if (!s.is_scheduled) return true; // não agendado: sempre ativo, dimensão não se aplica
  if (!s.scheduled_for) return null; // agendado mas sem horário: honesto declarar "não sei"
  const lead = leadTimeMs != null ? leadTimeMs : 30 * 60000; // 30 min antes, padrão conservador
  const t = Date.parse(s.scheduled_for);
  const n = now || Date.now();
  if (Number.isNaN(t)) return null;
  return (t - n) <= lead;
}

/**
 * Detecta a transição agendado -> produção entre duas observações. Não gera
 * evento sozinho (a missão pede só preparar os dados) — devolve o FATO para
 * quem orquestra decidir se e como registrar.
 */
function scheduleTransition(prev, curr) {
  const p = prev || {}, c = curr || {};
  if (p.is_scheduled && !c.is_scheduled) {
    return { transitioned: true, from: "scheduled", to: "production", observed_at: c.activation_observed_at || null };
  }
  return { transitioned: false };
}

module.exports = { buildSchedule, isActiveNow, scheduleTransition };
