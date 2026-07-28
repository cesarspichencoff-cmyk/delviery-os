'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  availableKnowledgeUnused,
  humanizedButUnhelpful,
  runServiceQualityGates,
  validatePostComposition
} = require('../../src/conversation-crm/native');

function plan(overrides = {}) {
  return {
    direct_answer: ['Aceitamos Ticket Restaurante, Alelo e Pluxee.'],
    direction: [],
    mandatory_questions: [],
    channel_guidance: [],
    action_available: false,
    action_selected: null,
    action_playbook: 'restaurant_information',
    gravity: 'informational',
    known_facts: [],
    new_facts: [],
    verified_actions: [],
    authorized_surface: { text: 'Aceitamos Ticket Restaurante, Alelo e Pluxee.', links: [], numbers: [] },
    strategy_contract: { mandatory_components: [] },
    length: 'short',
    emoji_policy: 'none',
    response_goal: 'inform',
    ...overrides
  };
}

test('available_knowledge_unused reprova fallback quando o fato existe', () => {
  const result = availableKnowledgeUnused({
    text: 'Ainda não tenho essa informação.',
    plan: plan()
  });
  assert.equal(result.passed, false);
  assert.equal(result.false_fallback, true);
  assert.equal(result.missing_count, 1);
});

test('available_knowledge_unused aceita resposta que usa o fato confirmado', () => {
  const result = availableKnowledgeUnused({
    text: 'Aceitamos Ticket Restaurante, Alelo e Pluxee.',
    plan: plan()
  });
  assert.equal(result.passed, true);
});

test('humanized_but_unhelpful reprova acolhimento sem resposta ou direção', () => {
  const result = humanizedButUnhelpful({
    text: 'Poxa, sinto muito por isso.',
    plan: plan({ gravity: 'sensitive', direct_answer: [], direction: ['Oriente o cliente pelo canal do pedido.'] })
  });
  assert.equal(result.passed, false);
  assert.equal(result.human_opening, true);
  assert.equal(result.direction_present, false);
});

test('humanized_but_unhelpful aceita reconhecimento com direção e pergunta mínima', () => {
  const result = humanizedButUnhelpful({
    text: 'Entendi a falta da bebida. Vou orientar pelo canal do pedido. Qual é o número do pedido?',
    plan: plan({
      gravity: 'sensitive',
      direct_answer: [],
      direction: ['Vou orientar pelo canal do pedido.'],
      mandatory_questions: ['order_reference']
    })
  });
  assert.equal(result.passed, true);
});

test('gates combinados preservam informação, direção e canal', () => {
  const selected = plan({
    gravity: 'operational',
    action_playbook: 'ifood',
    channel_guidance: ['pedido no aplicativo iFood'],
    direction: ['Registre a solicitação pelo pedido no iFood.'],
    direct_answer: ['Registre a solicitação pelo pedido no iFood.']
  });
  const good = runServiceQualityGates({ text: 'Entendi. Registre a solicitação pelo pedido no iFood, em Pedidos e Ajuda.', plan: selected });
  const bad = runServiceQualityGates({ text: 'Sinto muito. Vou verificar.', plan: selected });
  assert.equal(good.passed, true);
  assert.equal(bad.passed, false);
});

test('validador detecta culpa atribuída à plataforma', () => {
  const result = validatePostComposition({
    text: 'A culpa é do iFood.',
    plan: plan({ direct_answer: [] })
  });
  assert.equal(result.finding_codes.includes('PLATFORM_BLAME'), true);
});
