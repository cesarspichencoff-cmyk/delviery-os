'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  availableKnowledgeUnused,
  humanizedButUnhelpful,
  validatePostComposition,
  validateResponsePlan
} = require('../../../src/conversation-crm/native');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const mutationNames = [
  'disable_broad_search',
  'first_fact_only',
  'remove_playbook',
  'remove_direction',
  'empathy_only',
  'invent_action',
  'blame_platform',
  'promise_refund',
  'safety_as_quality',
  'ignore_channel',
  'repeat_question',
  'lose_context',
  'omit_direct_answer',
  'use_unconfirmed_information'
];

function plan(overrides = {}) {
  return {
    version: '2.0.0',
    response_goal: 'guide',
    conversation_stage: 'opening',
    customer_state: 'frustrated',
    gravity: 'operational',
    known_facts: [],
    new_facts: [],
    verified_actions: [],
    pending_actions: [],
    mandatory_questions: [],
    deferred_questions: [],
    optional_information: [],
    prohibited_claims: [],
    length: 'medium',
    emoji_policy: 'none',
    tone_profile: 'tata_warm',
    strategy_id: 'complaint',
    fallback_reason: null,
    intent: 'occurrence.missing_item',
    subintent: 'missing_item',
    result_status: 'unknown',
    handoff_status: null,
    authorized_surface: { text: '', links: [], numbers: [] },
    strategy_contract: { mandatory_components: [] },
    customer_need: 'resolver item faltante',
    direct_answer: [],
    knowledge_candidates: [],
    knowledge_selected: [],
    knowledge_sources_used: [],
    knowledge_rejected: [],
    rejection_reason: {},
    action_playbook: 'missing_item',
    action_available: false,
    action_selected: null,
    action_mode: 'orientation',
    channel_guidance: [],
    explanation_needed: [],
    direction: [],
    optional_enrichment: [],
    humanity_requirements: ['specific_understanding', 'direct_answer_before_question'],
    ...overrides
  };
}

function detectMutation(name) {
  const known = plan({
    direct_answer: ['O TATÁ trabalha à la carte.', 'Há Almoço Executivo e Sugestão Tatá.'],
    knowledge_candidates: [{ knowledge_id: 'restaurant.model' }, { knowledge_id: 'restaurant.experiences' }],
    knowledge_selected: ['restaurant.model', 'restaurant.experiences'],
    knowledge_sources_used: ['TATA_OPERATIONAL_PUBLIC_INFO_V1'],
    authorized_surface: { text: 'O TATÁ trabalha à la carte. Há Almoço Executivo e Sugestão Tatá.', links: [], numbers: [] }
  });
  const guided = plan({
    direct_answer: [],
    direction: ['Registre a solicitação pelo pedido no iFood.'],
    channel_guidance: ['pedido no aplicativo iFood'],
    action_playbook: 'ifood'
  });
  switch (name) {
    case 'disable_broad_search':
      return availableKnowledgeUnused({ text: 'Ainda não tenho essa informação.', plan: known }).passed ? [] : ['AVAILABLE_KNOWLEDGE_UNUSED'];
    case 'first_fact_only':
      return availableKnowledgeUnused({ text: 'O TATÁ trabalha à la carte.', plan: known }).passed ? [] : ['RELATED_KNOWLEDGE_OMITTED'];
    case 'remove_playbook': {
      try {
        validateResponsePlan({ ...known, action_playbook: null });
        return [];
      } catch (error) {
        return [error.code];
      }
    }
    case 'remove_direction':
      return humanizedButUnhelpful({ text: 'Entendi o que aconteceu.', plan: guided }).passed ? [] : ['DIRECTION_MISSING'];
    case 'empathy_only':
      return humanizedButUnhelpful({ text: 'Poxa, sinto muito por isso.', plan: guided }).passed ? [] : ['HUMANIZED_BUT_UNHELPFUL'];
    case 'invent_action':
      return validatePostComposition({ text: 'Sua reserva está confirmada.', plan: known }).finding_codes;
    case 'blame_platform':
      return validatePostComposition({ text: 'A culpa é do iFood.', plan: guided }).finding_codes;
    case 'promise_refund':
      return validatePostComposition({ text: 'Seu reembolso foi confirmado automaticamente.', plan: guided }).finding_codes;
    case 'safety_as_quality': {
      const safety = plan({
        gravity: 'critical',
        direct_answer: ['Procure um serviço de saúde o mais rápido possível.'],
        authorized_surface: { text: 'Procure um serviço de saúde o mais rápido possível.', links: [], numbers: [] }
      });
      return availableKnowledgeUnused({ text: 'Vamos analisar a qualidade do item.', plan: safety }).passed ? [] : ['SAFETY_GUIDANCE_MISSING'];
    }
    case 'ignore_channel':
      return humanizedButUnhelpful({ text: 'Entendi. Vou analisar.', plan: guided }).passed ? [] : ['CHANNEL_IGNORED'];
    case 'repeat_question':
      return validatePostComposition({
        text: 'Qual é o número do pedido?',
        previous_responses: ['Qual é o número do pedido?'],
        plan: plan({ mandatory_questions: ['order_reference'] })
      }).finding_codes;
    case 'lose_context': {
      const contextPlan = plan({
        new_facts: [{ field: 'item_name', value: 'bebida' }],
        strategy_contract: { mandatory_components: ['concrete_item_reference'] }
      });
      return validatePostComposition({ text: 'Entendi o problema.', plan: contextPlan }).finding_codes;
    }
    case 'omit_direct_answer':
      return availableKnowledgeUnused({ text: 'Posso ajudar em algo mais?', plan: known }).passed ? [] : ['DIRECT_ANSWER_MISSING'];
    case 'use_unconfirmed_information':
      return validatePostComposition({ text: 'O valor é R$ 98765,43. Veja https://unsafe.example.test.', plan: known }).finding_codes;
    default:
      return [];
  }
}

function child(name) {
  const findings = detectMutation(name);
  process.stdout.write(`${JSON.stringify({ mutation: name, findings })}\n`);
  process.exitCode = findings.length ? 1 : 0;
}

function parent() {
  const results = mutationNames.map((name) => {
    const run = spawnSync(process.execPath, [__filename, '--mutation', name], {
      cwd: projectRoot,
      encoding: 'utf8',
      windowsHide: true
    });
    return {
      mutation: name,
      expected_exit: 1,
      actual_exit: run.status,
      detector_status: run.status === 1 ? 'failed_as_expected' : 'false_green',
      evidence: run.stdout.trim()
    };
  });
  const falseGreens = results.filter((item) => item.detector_status === 'false_green');
  process.stdout.write(`${JSON.stringify({
    mutations: results.length,
    red: results.length - falseGreens.length,
    false_green: falseGreens.length,
    results
  }, null, 2)}\n`);
  if (falseGreens.length) process.exitCode = 1;
}

const mutationIndex = process.argv.indexOf('--mutation');
if (mutationIndex >= 0) child(process.argv[mutationIndex + 1]);
else parent();
