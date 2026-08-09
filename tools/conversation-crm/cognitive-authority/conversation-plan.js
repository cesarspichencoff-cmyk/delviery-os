'use strict';

const {
  URL_PATTERN,
  NUMBER_PATTERN,
  TECHNICAL_PATTERN,
  CUSTOMER_INTERNAL_LANGUAGE_PATTERN
} = require('../../../apps/deliveryos-ai-node/dialogue/writer-contract');

const MOVES = Object.freeze([
  'continue',
  'expand',
  'explain_selection',
  'replan',
  'compare_reference',
  'switch_direction',
  'repair',
  'answer',
  'clarify'
]);

const SCOPES = Object.freeze(['preserve', 'expand', 'replace', 'reference', 'none']);
const FACT_NEEDS = Object.freeze([
  'none', 'menu_candidates', 'item_details', 'price', 'allergens',
  'channel', 'address', 'reservation', 'operational_policy'
]);
const TOOL_NEEDS = Object.freeze([
  'none', 'get_recommendation_candidates', 'get_menu_item_details',
  'get_item_allergens', 'get_channel_menu'
]);

const CONVERSATION_PLAN_SCHEMA = Object.freeze({
  name: 'deliveryos_cognitive_conversation_plan_v1',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'conversation_move', 'interpreted_goal', 'what_user_is_asking',
      'candidate_scope', 'facts_needed', 'tools_needed',
      'next_best_step', 'response_text'
    ],
    properties: {
      conversation_move: { type: 'string', enum: MOVES },
      interpreted_goal: { type: 'string' },
      what_user_is_asking: { type: 'string' },
      candidate_scope: { type: 'string', enum: SCOPES },
      facts_needed: { type: 'array', items: { type: 'string', enum: FACT_NEEDS } },
      tools_needed: { type: 'array', items: { type: 'string', enum: TOOL_NEEDS } },
      next_best_step: { type: 'string' },
      response_text: { type: 'string' }
    }
  }
});

function shortString(value, maximum = 700) {
  return typeof value === 'string' && value.trim() === value && value.length <= maximum;
}

function arrayFrom(value, allowlist, maximum = 8) {
  return Array.isArray(value) && value.length <= maximum && value.every((item) => allowlist.includes(item));
}

function validateConversationPlan(value) {
  const required = CONVERSATION_PLAN_SCHEMA.schema.required;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { accepted: false, reason: 'COGNITIVE_PLAN_NOT_OBJECT' };
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...required].sort())) return { accepted: false, reason: 'COGNITIVE_PLAN_KEYS_INVALID' };
  if (!MOVES.includes(value.conversation_move) || !SCOPES.includes(value.candidate_scope)) return { accepted: false, reason: 'COGNITIVE_PLAN_MOVE_INVALID' };
  if (!arrayFrom(value.facts_needed, FACT_NEEDS) || !arrayFrom(value.tools_needed, TOOL_NEEDS)) return { accepted: false, reason: 'COGNITIVE_PLAN_TOOL_INVALID' };
  for (const field of ['interpreted_goal', 'what_user_is_asking', 'next_best_step']) {
    if (!shortString(value[field], 220)) return { accepted: false, reason: `COGNITIVE_PLAN_${field.toUpperCase()}_INVALID` };
  }
  if (!shortString(value.response_text, 700) || !value.response_text) return { accepted: false, reason: 'COGNITIVE_PLAN_RESPONSE_INVALID' };
  return { accepted: true, reason: null, plan: Object.freeze({ ...value }) };
}

function normalized(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function surfaceValues(text, pattern) {
  return [...String(text || '').matchAll(pattern)].map((match) => match[0].replace(/[.!?]+$/u, '').trim());
}

function validatePlannedResponse(plan, context = {}) {
  const response = String(plan?.response_text || '').trim();
  if (!response || response.length > 700) return { accepted: false, reason: 'COGNITIVE_RESPONSE_LENGTH_INVALID' };
  if (TECHNICAL_PATTERN.test(response) || CUSTOMER_INTERNAL_LANGUAGE_PATTERN.test(response)) {
    return { accepted: false, reason: 'COGNITIVE_RESPONSE_INTERNAL_LANGUAGE' };
  }
  const authorizedLinks = new Set(context.authorized_links || []);
  const authorizedNumbers = new Set(context.authorized_numbers || []);
  if (surfaceValues(response, URL_PATTERN).some((item) => !authorizedLinks.has(item))) return { accepted: false, reason: 'COGNITIVE_RESPONSE_UNAUTHORIZED_LINK' };
  if (surfaceValues(response.replace(URL_PATTERN, ' '), NUMBER_PATTERN).some((item) => !authorizedNumbers.has(item))) return { accepted: false, reason: 'COGNITIVE_RESPONSE_UNAUTHORIZED_NUMBER' };
  const responseNormalized = normalized(response);
  const allowedNames = new Set((context.authorized_item_names || []).map(normalized));
  let responseWithoutAuthorizedNames = responseNormalized;
  [...allowedNames].sort((left, right) => right.length - left.length).forEach((name) => {
    responseWithoutAuthorizedNames = responseWithoutAuthorizedNames.split(name).join(' ');
  });
  const leakedKnownItem = (context.catalog_item_names || [])
    .map(normalized)
    .find((name) => name && responseWithoutAuthorizedNames.includes(name) && !allowedNames.has(name));
  if (leakedKnownItem) return { accepted: false, reason: 'COGNITIVE_RESPONSE_UNAUTHORIZED_ITEM' };
  const previous = normalized(context.previous_response);
  if (['expand', 'explain_selection', 'replan', 'compare_reference', 'repair'].includes(plan.conversation_move)
    && previous && responseNormalized === previous) {
    return { accepted: false, reason: 'COGNITIVE_RESPONSE_REPEATED_AFTER_CHANGE' };
  }
  const additionalNames = (context.additional_item_names || []).map(normalized);
  if (plan.conversation_move === 'expand' && additionalNames.length
    && !additionalNames.some((name) => responseNormalized.includes(name))) {
    return { accepted: false, reason: 'COGNITIVE_EXPANSION_UNUSED' };
  }
  return { accepted: true, reason: null, response };
}

function buildConversationPlanPrompt(input = {}, options = {}) {
  return {
    messages: [
      {
        role: 'system',
        content: [
          'Você é a camada experimental de compreensão, condução e expressão do chatbot do TATÁ.',
          'Interprete o turno atual em relação ao histórico sem ficar preso ao estado anterior.',
          'Escolha um movimento conversacional geral; não crie novos intents nem regras por frase.',
          'continue mantém a direção; expand amplia candidatos; explain_selection explica o critério; replan reage a rejeição; compare_reference usa uma referência anterior; switch_direction muda objetivo ou canal; repair corrige um mal-entendido; answer responde; clarify pede somente informação indispensável.',
          'Os fatos em authorized_context são a única verdade disponível.',
          'Você pode conduzir, explicar, ampliar, comparar, reparar ou mudar de direção, mas não pode inventar item, preço, disponibilidade, alergênico, endereço, política ou ação.',
          'Quando additional_candidates existirem e o cliente pedir amplitude, use opções novas em vez de repetir current_candidates.',
          'Quando a pessoa questionar uma seleção, explique honestamente os critérios presentes em selection_criteria.',
          'Preserve limites de segurança e diga que algo é desconhecido quando faltar evidência.',
          'response_text deve ser curto, natural, útil e usar somente nomes, números e links autorizados.',
          'Retorne exclusivamente o JSON solicitado.'
        ].join(' ')
      },
      { role: 'user', content: JSON.stringify(input) }
    ],
    json_schema: CONVERSATION_PLAN_SCHEMA,
    temperature: 0.25,
    max_tokens: 350,
    ...(Number.isInteger(options.seed) ? { seed: options.seed } : {})
  };
}

class LocalCognitivePlanner {
  constructor(options = {}) {
    this.localWriter = options.localWriter;
    this.runtime = options.runtime || null;
    this.seed = Number(options.seed || 9107);
  }

  async plan(input = {}) {
    try {
      if (!this.runtime) {
        if (!this.localWriter) throw Object.assign(new Error('LOCAL_PLANNER_NOT_CONFIGURED'), { code: 'LOCAL_PLANNER_NOT_CONFIGURED' });
        await this.localWriter.ensureReady();
        this.runtime = this.localWriter.runtime;
      }
      const generated = await this.runtime.generateStructured(buildConversationPlanPrompt(input, { seed: this.seed }));
      const validation = validateConversationPlan(generated);
      return validation.accepted
        ? { accepted: true, reason: null, plan: validation.plan }
        : { accepted: false, reason: validation.reason, plan: null };
    } catch (error) {
      return { accepted: false, reason: error.code || 'COGNITIVE_PLANNER_FAILED', plan: null };
    }
  }
}

module.exports = {
  MOVES,
  SCOPES,
  FACT_NEEDS,
  TOOL_NEEDS,
  CONVERSATION_PLAN_SCHEMA,
  validateConversationPlan,
  validatePlannedResponse,
  buildConversationPlanPrompt,
  LocalCognitivePlanner
};
