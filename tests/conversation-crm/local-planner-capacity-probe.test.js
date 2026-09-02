'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { LOCAL_PLANNER_SCHEMA, buildProbeRequest, validatePlan } = require('../../tools/conversation-crm/cognitive-authority/capacity-probe/contract');
const { CORE_CASES, PARAPHRASE_CASES, PROBE_CASES, runtimeCases } = require('../../tools/conversation-crm/cognitive-authority/capacity-probe/cases');
const { evaluateCase, percentile, summarize } = require('../../tools/conversation-crm/cognitive-authority/capacity-probe/evaluator');

function validPlan(overrides = {}) {
  return {
    relation_to_previous: 'CONTINUE',
    user_goal: 'ver outras opções',
    what_changed: 'pediu maior amplitude',
    what_user_is_asking_now: 'quer outras opções',
    rejected_assumptions: [],
    information_needed: [],
    action: 'EXPAND',
    tool_need: 'menu_search',
    next_best_step: 'buscar opções adicionais sem repetir',
    confidence: 'HIGH',
    uncertainty: '',
    ...overrides
  };
}

test('probe contém os vinte casos A-T e quatro paráfrases independentes', () => {
  assert.equal(CORE_CASES.length, 20);
  assert.deepEqual(CORE_CASES.map((item) => item.case_id), 'ABCDEFGHIJKLMNOPQRST'.split(''));
  assert.equal(PARAPHRASE_CASES.length, 4);
  assert.equal(PROBE_CASES.length, 24);
});

test('entrada de runtime não contém oráculo, classe esperada ou nome de teste', () => {
  const serialized = JSON.stringify(runtimeCases());
  assert.equal(serialized.includes('oracle'), false);
  assert.equal(serialized.includes('expected'), false);
  assert.equal(serialized.includes('paraphrase_of'), false);
  for (const item of runtimeCases()) {
    const request = buildProbeRequest(item.input, { seed: 1 });
    const modelInput = request.messages.map((message) => message.content).join(' ');
    assert.equal(modelInput.includes('"case_id"'), false);
    assert.equal(modelInput.includes('"oracle"'), false);
  }
});

test('contrato estruturado exige somente os campos canônicos do planner', () => {
  assert.equal(LOCAL_PLANNER_SCHEMA.schema.required.length, 11);
  assert.deepEqual(validatePlan(validPlan()), { valid: true, reason: null });
  const extra = { ...validPlan(), expected_action: 'EXPAND' };
  assert.deepEqual(validatePlan(extra), { valid: false, reason: 'PLAN_KEYS_INVALID' });
});

test('evaluator distingue expansão, explicação, correção e troca de fluxo', () => {
  const plans = {
    A: validPlan(),
    B: validPlan({ action: 'EXPLAIN', what_user_is_asking_now: 'quer entender o critério de seleção' }),
    G: validPlan({ relation_to_previous: 'CORRECT', action: 'CLARIFY', user_goal: 'escolher sushi', rejected_assumptions: ['bebidas'] }),
    I: validPlan({ relation_to_previous: 'SWITCH', action: 'SWITCH_FLOW', user_goal: 'reservar para 7 pessoas' })
  };
  for (const id of Object.keys(plans)) {
    const definition = PROBE_CASES.find((item) => item.case_id === id);
    assert.equal(evaluateCase(definition, plans[id]).semantic_correct, true, id);
  }
});

test('safety crítico falho é erro catastrófico', () => {
  const definition = PROBE_CASES.find((item) => item.case_id === 'T');
  const result = evaluateCase(definition, validPlan({ user_goal: 'continuar escolhendo', next_best_step: 'sugerir prato' }));
  assert.equal(result.safety_preservation, false);
  assert.equal(result.catastrophic_semantic_error, true);
});

test('percentis são determinísticos pelo método nearest-rank', () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 0.5), 3);
  assert.equal(percentile([5, 1, 3, 2, 4], 0.95), 5);
});

test('qualificação exige semântica, estrutura, distinções, safety e p95 plausível', () => {
  const rows = PROBE_CASES.map((definition) => ({
    case_id: definition.case_id,
    latency_ms: 1000,
    evaluation: evaluateCase(definition, validPlan({
      relation_to_previous: definition.oracle.relations[0],
      action: definition.oracle.actions[0],
      user_goal: definition.oracle.concepts.join(' '),
      what_user_is_asking_now: definition.oracle.concepts.join(' '),
      rejected_assumptions: definition.oracle.rejected ? ['hipótese anterior'] : [],
      next_best_step: definition.oracle.safety === 'critical' ? 'buscar atendimento de urgência para dificuldade de respirar' : definition.oracle.concepts.join(' ')
    }))
  }));
  assert.equal(summarize(rows).capacity_probe_passed, true);
  rows[0] = { ...rows[0], latency_ms: 21000 };
  rows[1] = { ...rows[1], latency_ms: 21000 };
  assert.equal(summarize(rows).capacity_probe_passed, false);
});
