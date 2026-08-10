'use strict';

const { canonicalHash } = require('./contract');
const { validateWriterOutput } = require('../../../../apps/deliveryos-ai-node/dialogue/writer-contract');

function factValues(plan) {
  return (plan.approved_facts || []).map((fact) => String(fact.value)).filter(Boolean);
}

function deterministicText(plan) {
  if (plan.status === 'NEEDS_TOOL') return 'Vou conferir essa informação antes de responder.';
  if (plan.status === 'NEEDS_CLARIFICATION') return plan.required_question;
  if (plan.safety_priority === 'URGENT') return String(plan.safety_directive);
  const facts = factValues(plan);
  const unknown = facts.some((value) => /desconhecid|n[aã]o confirmad/iu.test(value));
  const repair = plan.repair_acknowledgement ? `${plan.repair_acknowledgement} ` : '';
  const templates = {
    ANSWER: unknown ? `${repair}Ainda não tenho essa informação confirmada.` : `${repair}${facts.length ? facts.join('; ') : 'Posso ajudar com o próximo passo.'}`,
    EXPAND: `${repair}${facts.length ? `Posso considerar ${facts.join(' e ')}.` : 'Posso buscar outras opções.'}`,
    EXPLAIN: `${repair}${facts.length ? facts.join('; ') : 'Posso explicar com o que já sabemos.'}`,
    COMPARE: `${repair}${facts.length ? facts.join('; ') : 'Preciso de um critério para comparar com segurança.'}`,
    CLARIFY: `${repair}${plan.required_question || 'Pode me contar um pouco mais?'}`,
    REPAIR: `${repair}${plan.required_question || 'Vamos corrigir isso antes de continuar.'}`,
    DISCOVER: `${repair}${plan.required_question || 'O que pesa mais para você nessa escolha?'}`,
    SWITCH_FLOW: `${repair}${plan.required_question || 'Vamos seguir por esse novo caminho.'}`,
    RESUME_FLOW: `${repair}${plan.required_question || 'Vamos retomar de onde paramos.'}`
  };
  return String(templates[plan.conversational_move] || plan.next_best_step).trim();
}

function validateWriterText(text, plan) {
  const value = String(text || '').trim();
  if (!value || value.length > 900) return { accepted: false, reason: 'B2_WRITER_TEXT_INVALID' };
  const normalized = value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (/\b(?:fixture|sintetic[oa]s?|fonte sintetica|busca autorizada|prova)\b/u.test(normalized)) {
    return { accepted: false, reason: 'B2_WRITER_INTERNAL_LANGUAGE' };
  }
  if (/\bdisponive(?:l|is)\b/u.test(normalized)) {
    const availability = (plan.approved_facts || []).find((fact) => fact.field === 'availability')?.value;
    if (!availability || /desconhecid|nao confirmad/iu.test(String(availability))) {
      return { accepted: false, reason: 'B2_WRITER_UNSUPPORTED_AVAILABILITY' };
    }
  }
  for (const forbidden of plan.prohibited_claims || []) {
    const needle = String(forbidden).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    if (needle && normalized.includes(needle)) return { accepted: false, reason: 'B2_WRITER_PROHIBITED_CLAIM' };
  }
  if (plan.safety_priority === 'URGENT' && value !== String(plan.safety_directive)) {
    return { accepted: false, reason: 'B2_WRITER_CHANGED_URGENT_DIRECTIVE' };
  }
  return { accepted: true, reason: null, text: value, hash: canonicalHash({ text: value, authority: plan.authority_evidence_hash }) };
}

class DeterministicB2Writer {
  async write(responsePlan) {
    const text = deterministicText(responsePlan);
    const checked = validateWriterText(text, responsePlan);
    return checked.accepted
      ? { accepted: true, source: 'deterministic_b2_writer', ...checked }
      : { accepted: false, source: 'rejected', ...checked };
  }
}

function toWriterInput(plan) {
  const surface = plan.writer_surface || {};
  return {
    direct_response: [plan.repair_acknowledgement, plan.safety_directive].filter(Boolean),
    authorized_facts: plan.approved_facts || [],
    selected_knowledge: Array.isArray(plan.approved_tool_result?.knowledge) ? plan.approved_tool_result.knowledge : [],
    direction: [
      `Objetivo da pessoa: ${plan.user_goal}`,
      `Movimento conversacional: ${plan.conversational_move}`,
      `Próximo passo autorizado: ${plan.next_best_step}`
    ],
    true_action: null,
    required_question: plan.required_question,
    tone: surface.tone || 'calmo, direto e acolhedor',
    gravity: surface.gravity || 'informational',
    social_context: JSON.stringify({ relation_to_history: plan.relation_to_history, what_changed: plan.what_changed }),
    recent_phrases: surface.recent_phrases || [],
    prohibited_claims: plan.prohibited_claims || [],
    authorized_links: surface.authorized_links || [],
    authorized_numbers: surface.authorized_numbers || [],
    maximum_length: 500
  };
}

class GemmaB2Writer {
  constructor(options = {}) { this.localWriter = options.localWriter; this.seed = Number(options.seed || 6207); }

  async write(responsePlan) {
    if (responsePlan.safety_priority === 'URGENT') return new DeterministicB2Writer().write(responsePlan);
    if (!this.localWriter) return { accepted: false, source: 'rejected', reason: 'B2_GEMMA_WRITER_NOT_CONFIGURED' };
    try {
      const writer = await this.localWriter.ensureReady();
      const input = toWriterInput(responsePlan);
      const generated = await writer.write(input, { seed: this.seed });
      if (!generated.accepted) return generated;
      const checked = validateWriterOutput(generated.output, input);
      if (!checked.accepted) return { accepted: false, source: 'rejected', reason: checked.reason };
      const publication = validateWriterText(checked.output.text, responsePlan);
      return publication.accepted
        ? { accepted: true, source: 'gemma_local_writer', ...publication }
        : { accepted: false, source: 'rejected', ...publication };
    } catch (error) {
      return { accepted: false, source: 'rejected', reason: error.code || 'B2_GEMMA_WRITER_FAILED' };
    }
  }
}

module.exports = { DeterministicB2Writer, GemmaB2Writer, toWriterInput, deterministicText, validateWriterText };
