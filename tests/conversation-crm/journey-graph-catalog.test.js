'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ACTION_PLAYBOOKS } = require('../../src/conversation-crm/native/action-playbook-catalog');
const {
  JOURNEY_GRAPHS,
  MAX_JOURNEY_STACK_DEPTH,
  journeyForIntent,
  journeyGraph,
  nextJourneyStep,
  validateJourneyGraphs
} = require('../../apps/deliveryos-ai-node');

test('catálogo contém dezesseis jornadas versionadas e playbooks existentes', () => {
  const checked = validateJourneyGraphs(JOURNEY_GRAPHS, ACTION_PLAYBOOKS);
  assert.deepEqual(checked, { passed: true, findings: [], total: 16 });
  assert.equal(MAX_JOURNEY_STACK_DEPTH, 3);
});

test('nenhum nó contém linguagem final', () => {
  for (const graph of Object.values(JOURNEY_GRAPHS)) {
    for (const node of graph.nodes) {
      assert.equal(Object.hasOwn(node, 'text'), false);
      assert.equal(Object.hasOwn(node, 'response'), false);
      assert.equal(typeof node.question_key === 'string' || node.question_key === null, true);
    }
  }
});

test('todos os grafos terminam em nó complete alcançável', () => {
  for (const graph of Object.values(JOURNEY_GRAPHS)) {
    const nodes = new Map(graph.nodes.map((node) => [node.node_id, node]));
    assert.equal(nodes.get('complete').terminal, true);
    assert.ok(graph.edges.some((edge) => edge.to === 'complete'));
  }
});

test('próxima etapa usa a primeira lacuna e não repete fato concluído', () => {
  assert.equal(nextJourneyStep('reservation', {}), 'collect_party_size');
  assert.equal(nextJourneyStep('reservation', { party_size: 4 }), 'collect_date');
  assert.equal(nextJourneyStep('reservation', { party_size: 4, date: 'amanhã' }), 'collect_time');
  assert.equal(nextJourneyStep('reservation', { party_size: 4, date: 'amanhã', time: '20:00' }), 'prepare_action');
});

test('mapeamento de intenções cobre ocorrências separadamente', () => {
  assert.equal(journeyForIntent('occurrence.missing_item'), 'missing_item');
  assert.equal(journeyForIntent('occurrence.wrong_item'), 'wrong_item');
  assert.equal(journeyForIntent('occurrence.wrong_quantity'), 'wrong_quantity');
  assert.equal(journeyForIntent('occurrence.personalization_ignored'), 'personalization');
  assert.equal(journeyForIntent('occurrence.health_symptom'), 'food_safety');
});

test('grafo desconhecido falha conservadoramente sem inventar etapa', () => {
  assert.equal(journeyGraph('unknown'), null);
  assert.equal(nextJourneyStep('unknown', {}), null);
});
