'use strict';

const { canonicalHash } = require('./contract');
const { validateWriterOutput } = require('../../../../apps/deliveryos-ai-node/dialogue/writer-contract');
const { semanticAnchors, validateCommitments } = require('./commitments');

const UNAUTHORIZED_PRICE_PATTERN = /R\$\s*\d+(?:[.,]\d+)?/iu;
const UNEXECUTED_FUTURE_PROMISE_PATTERN = /\b(?:vou|vamos|iremos)\s+(?:conferir|verificar|consultar|buscar|confirmar|avisar|retornar)\b/iu;
const REDUNDANT_COMMITMENT_ACK_PATTERN = /^(?:certo|entendi|perfeito|[oó]timo)?\s*[—,:-]*\s*(?:vou|vamos)\s+(?:considerar|levar em conta|usar)\b/iu;

function factValues(plan) {
  return (plan.approved_facts || [])
    .map((fact) => String(fact.value || '').trim())
    .filter((value) => value && !/\b(?:fixture|sint[eé]tic[oa]s?|fonte sint[eé]tica|prova|oracle|gold)\b/iu.test(value));
}

function knowledgeValues(plan) {
  return (Array.isArray(plan.approved_tool_result?.knowledge) ? plan.approved_tool_result.knowledge : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function composableKnowledgeValues(plan) {
  const commitments = (plan.required_response_commitments || [])
    .filter((item) => !['QUESTION', 'REPAIR'].includes(item.kind));
  const commitmentAnchors = new Set(commitments.flatMap((item) => semanticAnchors(item.content)));
  return knowledgeValues(plan).flatMap((value) => value.split(/(?<=[.!?])\s+/u)).filter((sentence) => {
    if (!commitments.length || !REDUNDANT_COMMITMENT_ACK_PATTERN.test(sentence)) return true;
    return !semanticAnchors(sentence).some((anchor) => commitmentAnchors.has(anchor));
  });
}

function authorizedValues(plan) {
  return [...factValues(plan), ...composableKnowledgeValues(plan)];
}

function commitmentValues(plan) {
  return (plan.required_response_commitments || [])
    .filter((item) => !['QUESTION', 'REPAIR'].includes(item.kind))
    .map((item) => String(item.content || '').replace(/[.;,\s]+$/gu, '').trim())
    .filter(Boolean);
}

function commitmentAcknowledgement(plan) {
  const values = commitmentValues(plan);
  return values.length ? `Entendi: ${values.join('; ')}.` : '';
}

function explicitLimitation(plan) {
  const messages = {
    CATALOG_SEARCH: 'Não consigo consultar o cardápio por aqui agora. Posso deixar seus critérios organizados para você confirmar diretamente com o restaurante.',
    DETAIL_LOOKUP: 'Não consigo consultar os detalhes do item por aqui agora. Posso deixar a informação necessária organizada para você confirmar diretamente com o restaurante.',
    PRICE_LOOKUP: 'Não consigo consultar o preço por aqui agora. Posso deixar a opção e o valor que precisam ser confirmados organizados para você verificar diretamente com o restaurante.',
    RESTAURANT_INFO: 'Não consigo consultar essa informação operacional por aqui agora. Posso deixar o que precisa ser confirmado organizado para você verificar diretamente com o restaurante.',
    RESERVATION_INFO: 'Não consigo consultar a reserva por aqui agora. Posso deixar os dados necessários organizados para você confirmar diretamente com o restaurante.',
    SAFETY_GATE: 'Não consigo verificar ingredientes e contato cruzado por aqui agora. Por segurança, não vou indicar um item; confirme diretamente com a equipe do restaurante antes de escolher.',
    OTHER_ALLOWED_TOOL: 'Não consigo acessar os dados necessários por aqui agora. Posso organizar o que você precisa ter em mãos para falar com o atendimento.'
  };
  return messages[plan.tool_requirement]
    || 'Não consigo consultar essa informação por aqui agora. Posso organizar o que precisa ser confirmado para o próximo contato.';
}

function deterministicText(plan) {
  const commitmentText = commitmentAcknowledgement(plan);
  if (plan.status === 'NEEDS_TOOL') {
    return [plan.repair_acknowledgement, commitmentText, plan.required_question
      ? `Para avançar, preciso de uma informação: ${plan.required_question}`
      : explicitLimitation(plan)]
      .filter(Boolean).join(' ');
  }
  if (plan.status === 'NEEDS_CLARIFICATION') {
    const authorized = authorizedValues(plan);
    const question = String(plan.required_question || '').trim();
    const normalizedQuestion = question.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const questionAlreadyPresent = normalizedQuestion && authorized.some((value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(normalizedQuestion));
    return [plan.repair_acknowledgement, commitmentText, ...authorized, questionAlreadyPresent ? null : question].filter(Boolean).join(' ');
  }
  if (plan.safety_priority === 'URGENT') return String(plan.safety_directive);
  const facts = authorizedValues(plan);
  const repair = [plan.repair_acknowledgement, commitmentText].filter(Boolean).join(' ');
  const prefix = repair ? `${repair} ` : '';
  const question = plan.required_question ? String(plan.required_question) : '';
  const appendQuestion = (text) => [String(text || '').trim(), question].filter(Boolean).join(' ').trim();
  const templates = {
    ANSWER: appendQuestion(`${prefix}${facts.length ? facts.join('; ') : 'Posso ajudar com o próximo passo.'}`),
    EXPAND: appendQuestion(`${prefix}${facts.length ? `Posso considerar ${facts.join(' e ')}.` : 'Posso buscar outras opções.'}`),
    EXPLAIN: appendQuestion(`${prefix}${facts.length ? facts.join('; ') : 'Posso explicar com o que já sabemos.'}`),
    COMPARE: appendQuestion(`${prefix}${facts.length ? facts.join('; ') : 'Preciso de um critério para comparar com segurança.'}`),
    CLARIFY: appendQuestion(`${prefix}${facts.length ? facts.join('; ') : ''}`) || 'Pode me contar um pouco mais?',
    REPAIR: appendQuestion(`${prefix}${facts.length ? facts.join('; ') : 'Vamos corrigir isso antes de continuar.'}`),
    DISCOVER: appendQuestion(`${prefix}${facts.length ? facts.join('; ') : ''}`) || 'O que pesa mais para você nessa escolha?',
    SWITCH_FLOW: appendQuestion(`${prefix}${facts.length ? facts.join('; ') : ''}`) || 'Vamos seguir por esse novo caminho.',
    RESUME_FLOW: appendQuestion(`${prefix}${facts.length ? facts.join('; ') : ''}`) || 'Vamos retomar de onde paramos.'
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
  const priceTokens = [...value.matchAll(new RegExp(UNAUTHORIZED_PRICE_PATTERN.source, 'giu'))].map((match) => match[0]);
  if (priceTokens.length) {
    const authorizedPrices = [
      ...(plan.approved_facts || []).filter((fact) => fact.field === 'price').map((fact) => String(fact.value)),
      ...knowledgeValues(plan),
      ...(plan.required_response_commitments || []).filter((item) => item.kind === 'CONSTRAINT').map((item) => String(item.content))
    ];
    if (priceTokens.some((token) => !authorizedPrices.some((authorized) => authorized.includes(token)))) {
      return { accepted: false, reason: 'B2_WRITER_UNSUPPORTED_PRICE' };
    }
  }
  if (plan.publication_outcome === 'EXPLICIT_LIMITATION' && UNEXECUTED_FUTURE_PROMISE_PATTERN.test(value)) {
    return { accepted: false, reason: 'B2_WRITER_UNEXECUTED_FUTURE_PROMISE' };
  }
  for (const forbidden of plan.prohibited_claims || []) {
    const needle = String(forbidden).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    if (needle && normalized.includes(needle)) return { accepted: false, reason: 'B2_WRITER_PROHIBITED_CLAIM' };
  }
  if (plan.safety_priority === 'URGENT' && value !== String(plan.safety_directive)) {
    return { accepted: false, reason: 'B2_WRITER_CHANGED_URGENT_DIRECTIVE' };
  }
  if (plan.safety_priority === 'URGENT') {
    return { accepted: true, reason: null, text: value, hash: canonicalHash({ text: value, authority: plan.authority_evidence_hash }) };
  }
  const approvedValues = factValues(plan);
  if (plan.status === 'APPROVED' && approvedValues.length) {
    const preservesFacts = approvedValues.every((factValue) => normalized.includes(
      factValue.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    ));
    if (!preservesFacts) return { accepted: false, reason: 'B2_WRITER_DROPPED_APPROVED_FACT' };
  }
  if (plan.required_question && !value.includes('?')) {
    return { accepted: false, reason: 'B2_WRITER_DROPPED_REQUIRED_QUESTION' };
  }
  const commitmentCheck = validateCommitments(value, plan.required_response_commitments || []);
  if (!commitmentCheck.accepted) return commitmentCheck;
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
      `Próximo passo autorizado: ${plan.next_best_step}`,
      ...(plan.required_response_commitments || []).map((item) => `Conteúdo obrigatório (${item.kind}): ${item.content}`)
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

module.exports = {
  DeterministicB2Writer,
  GemmaB2Writer,
  toWriterInput,
  deterministicText,
  explicitLimitation,
  validateWriterText,
  UNAUTHORIZED_PRICE_PATTERN,
  UNEXECUTED_FUTURE_PROMISE_PATTERN,
  REDUNDANT_COMMITMENT_ACK_PATTERN
};

