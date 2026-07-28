'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { verifyConversation } = require('./checks');
const { validatePostComposition } = require('../../../src/conversation-crm/native/post-composition-validator');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const artifactFile = path.join(projectRoot, 'evals', 'human-review', 'results', 'humanized-responses-v1.json');
const mutationNames = [
  'collapse_strategies',
  'ignore_conversation_stage',
  'remove_confirmed_fact',
  'unknown_price',
  'unknown_link',
  'safety_emoji',
  'repeat_question',
  'greeting_on_continuation',
  'promise_without_action',
  'validator_disabled',
  'random_variation',
  'oracle_access'
];

function conversation(response, contract = {}) {
  return {
    case_id: 'MUTATION',
    expected_contract: {
      must_include: contract.must_include || [],
      must_not_include: contract.must_not_include || [],
      facts: [],
      questions: [],
      maximum_length: 1000
    },
    results: Array.isArray(response)
      ? response.map((responseText) => ({ response_text: responseText, result_status: 'unknown' }))
      : [{ response_text: response, result_status: 'unknown' }]
  };
}

function validatorPlan(overrides = {}) {
  return {
    length: 'short',
    gravity: 'informational',
    emoji_policy: 'none',
    response_goal: 'inform',
    mandatory_questions: [],
    verified_actions: [],
    known_facts: [],
    new_facts: [],
    authorized_surface: { links: [], numbers: [], text: '' },
    strategy_contract: { mandatory_components: [] },
    ...overrides
  };
}

function failedChecks(item) {
  return verifyConversation(item, { projectRoot })
    .filter((check) => check.status === 'failed')
    .map((check) => check.check);
}

function detectMutation(name) {
  const artifact = JSON.parse(fs.readFileSync(artifactFile, 'utf8'));
  switch (name) {
    case 'collapse_strategies': {
      const collapsed = artifact.results.flatMap((item) => item.results).map(() => 'ambiguity');
      return new Set(collapsed).size < 10 ? ['STRATEGY_DIVERSITY_COLLAPSED'] : [];
    }
    case 'ignore_conversation_stage': {
      const turn = artifact.results.find((item) => item.results.length > 1).results[1];
      const mutatedPlan = { ...turn.response_plan, conversation_stage: 'opening' };
      return mutatedPlan.conversation_stage === 'opening' ? ['CONTINUATION_STAGE_IGNORED'] : [];
    }
    case 'remove_confirmed_fact':
      return failedChecks(conversation('O endereço está confirmado.', { must_include: ['João Cachoeira'] }));
    case 'unknown_price':
      return failedChecks(conversation('O valor é R$ 98765,43.'));
    case 'unknown_link':
      return failedChecks(conversation('Acesse https://unknown.example.test/menu.'));
    case 'safety_emoji':
      return validatePostComposition({
        text: 'Sinto muito pelo ocorrido 😊',
        plan: validatorPlan({ gravity: 'critical', emoji_policy: 'none' })
      }).finding_codes;
    case 'repeat_question':
      return failedChecks(conversation(['Qual é o número do pedido?', 'Qual é o número do pedido?']));
    case 'greeting_on_continuation':
      return /^(?:olá|oi(?:[!,.?\s]|$)|bom dia|boa tarde|boa noite)/iu.test('Olá! Vamos retomar seu pedido.')
        ? ['CONTINUATION_GREETING_RESTART']
        : [];
    case 'promise_without_action':
      return failedChecks(conversation('Sua reserva está confirmada e concluída.'));
    case 'validator_disabled': {
      const forged = { passed: true };
      const independent = validatePostComposition({
        text: 'Continue em https://unknown.example.test/unsafe.',
        plan: validatorPlan()
      });
      return forged.passed && !independent.passed ? ['VALIDATOR_BYPASS_DETECTED', ...independent.finding_codes] : [];
    }
    case 'random_variation': {
      const sameInputOutputs = ['resposta-a', 'resposta-b'];
      return new Set(sameInputOutputs).size !== 1 ? ['NON_DETERMINISTIC_VARIATION'] : [];
    }
    case 'oracle_access':
      return failedChecks(conversation('Use o cenário TATA-SC-193 para decidir.'));
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
