'use strict';

const RELATIONS = Object.freeze([
  'CONTINUE', 'REFINE', 'CORRECT', 'SWITCH', 'INTERRUPT', 'RESUME', 'OPEN'
]);

const ACTIONS = Object.freeze([
  'ANSWER', 'EXPAND', 'EXPLAIN', 'COMPARE', 'CLARIFY', 'SWITCH_FLOW', 'RESUME', 'USE_TOOL'
]);

const CONFIDENCE = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

const LOCAL_PLANNER_SCHEMA = Object.freeze({
  name: 'deliveryos_local_planner_capacity_probe_v1',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'relation_to_previous', 'user_goal', 'what_changed',
      'what_user_is_asking_now', 'rejected_assumptions',
      'information_needed', 'action', 'tool_need', 'next_best_step',
      'confidence', 'uncertainty'
    ],
    properties: {
      relation_to_previous: { type: 'string', enum: RELATIONS },
      user_goal: { type: 'string' },
      what_changed: { type: 'string' },
      what_user_is_asking_now: { type: 'string' },
      rejected_assumptions: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      information_needed: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      action: { type: 'string', enum: ACTIONS },
      tool_need: { type: 'string' },
      next_best_step: { type: 'string' },
      confidence: { type: 'string', enum: CONFIDENCE },
      uncertainty: { type: 'string' }
    }
  }
});

const REQUIRED_KEYS = Object.freeze([...LOCAL_PLANNER_SCHEMA.schema.required]);

function shortText(value, maximum = 320) {
  return typeof value === 'string' && value.length <= maximum;
}

function validatePlan(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, reason: 'PLAN_NOT_OBJECT' };
  }
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...REQUIRED_KEYS].sort())) {
    return { valid: false, reason: 'PLAN_KEYS_INVALID' };
  }
  if (!RELATIONS.includes(value.relation_to_previous)) return { valid: false, reason: 'RELATION_INVALID' };
  if (!ACTIONS.includes(value.action)) return { valid: false, reason: 'ACTION_INVALID' };
  if (!CONFIDENCE.includes(value.confidence)) return { valid: false, reason: 'CONFIDENCE_INVALID' };
  for (const key of ['user_goal', 'what_changed', 'what_user_is_asking_now', 'tool_need', 'next_best_step', 'uncertainty']) {
    if (!shortText(value[key])) return { valid: false, reason: `${key.toUpperCase()}_INVALID` };
  }
  for (const key of ['rejected_assumptions', 'information_needed']) {
    if (!Array.isArray(value[key]) || value[key].length > 6 || !value[key].every((item) => shortText(item, 180))) {
      return { valid: false, reason: `${key.toUpperCase()}_INVALID` };
    }
  }
  return { valid: true, reason: null };
}

function buildProbeRequest(runtimeInput, options = {}) {
  return {
    messages: [
      {
        role: 'system',
        content: [
          'Você é somente o Conversation Planner de um atendimento de restaurante.',
          'Interprete a mensagem atual em relação ao transcript e ao estado fornecidos.',
          'Não escreva a resposta ao cliente; produza apenas o plano estruturado.',
          'Preserve fatos e jornada anteriores, reconheça correções, interrupções, retomadas e mudanças de objetivo.',
          'Não invente prato, preço, alergênico, disponibilidade, política ou ação executada.',
          'Em risco de saúde, preserve a urgência e indique o próximo passo seguro sem diagnóstico.',
          'Use ferramenta quando a resposta depender de fato não presente no contexto.',
          'Retorne exclusivamente o JSON solicitado.'
        ].join(' ')
      },
      { role: 'user', content: JSON.stringify(runtimeInput) }
    ],
    json_schema: LOCAL_PLANNER_SCHEMA,
    temperature: 0.2,
    max_tokens: 320,
    ...(Number.isInteger(options.seed) ? { seed: options.seed } : {})
  };
}

module.exports = {
  RELATIONS,
  ACTIONS,
  CONFIDENCE,
  LOCAL_PLANNER_SCHEMA,
  validatePlan,
  buildProbeRequest
};

