'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CustomerMenuHomologationService } = require('../../tools/conversation-crm/customer-menu/service');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function serviceFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-recommendation-flow-final-'));
  const service = new CustomerMenuHomologationService({
    projectRoot: PROJECT_ROOT,
    menuReviewRoot: path.join(root, 'review')
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return service;
}

function turn(service, conversationId, message) {
  return service.contextForChat({ conversation_id: conversationId, message });
}

test('paráfrases A-C reconhecem recomendação e descobrem gosto antes de roteamento operacional', (t) => {
  const service = serviceFixture(t);
  const phrases = [
    'estou com fome, o que você sugere?',
    'me ajuda a escolher alguma coisa',
    'quero pedir algo gostoso'
  ];
  for (const [index, message] of phrases.entries()) {
    const context = turn(service, `REC-PARAPHRASE-${index}`, message);
    assert.equal(context.conversation_state.active_goal, 'recommendation');
    assert.equal(context.conversation_guidance.mode, 'food_preference_discovery');
    assert.doesNotMatch(context.conversation_guidance.question, /sal[aã]o|ifood|delivery pr[oó]prio/iu);
  }
});

test('D-E-G produzem shortlist ligada às preferências e preservam o canal', (t) => {
  const service = serviceFixture(t);
  const conversationId = 'REC-PREFERENCE-CONTINUITY';
  turn(service, conversationId, 'me ajuda a escolher alguma coisa');
  const channel = turn(service, conversationId, 'vai ser pelo iFood');
  assert.equal(channel.conversation_state.channel, 'ifood');
  assert.equal(channel.conversation_guidance.mode, 'food_preference_discovery');

  const cold = turn(service, conversationId, 'não quero nada quente');
  assert.equal(cold.conversation_guidance.mode, 'temperature_preference_update');
  assert.equal(cold.conversation_state.channel, 'ifood');
  assert.ok(cold.hospitality_context.preparation_preferences.includes('not_hot'));

  const sushi = turn(service, conversationId, 'prefiro sushi');
  assert.equal(sushi.conversation_state.channel, 'ifood');
  assert.equal(sushi.conversation_state.requested_category, 'sushi');
  assert.equal(sushi.menu_context.items.length > 0, true);
  assert.equal(sushi.menu_context.items.every((item) => /^sushis?(?:\s|$)/iu.test(item.category)), true);
  assert.equal(sushi.menu_context.items.every((item) => item.reasons.includes('requested_category:sushi')), true);
  assert.equal(sushi.menu_context.items.every((item) => item.reasons.includes('confirmed_hot_section_excluded')), true);
  assert.match(sushi.conversation_guidance.direct_answers.join(' '), /sushi/iu);
  assert.doesNotMatch(sushi.conversation_guidance.direct_answers.join(' '), /ranking|top-?k|score|algoritmo/iu);
});

test('F explica a recomendação somente por fatos públicos da conversa', (t) => {
  const service = serviceFixture(t);
  const conversationId = 'REC-NATURAL-EXPLANATION';
  turn(service, conversationId, 'quero uma sugestão pelo iFood');
  turn(service, conversationId, 'não quero nada quente');
  const shortlist = turn(service, conversationId, 'prefiro sushi');
  const explanation = turn(service, conversationId, 'por que você sugeriu esses?');
  const answer = explanation.conversation_guidance.direct_answers.join(' ');

  assert.equal(explanation.conversation_guidance.mode, 'recommendation_explanation');
  assert.match(answer, /sushi/iu);
  assert.match(answer, /pratos quentes/iu);
  assert.doesNotMatch(answer, /ranking|top-?k|score|algoritmo|authority|candidate/iu);
  assert.deepEqual(
    explanation.conversation_guidance.candidates_found,
    shortlist.conversation_guidance.candidates_found
  );
});

test('H expande sem repetir a shortlist anterior e mantém os mesmos filtros', (t) => {
  const service = serviceFixture(t);
  const conversationId = 'REC-MORE-OPTIONS';
  turn(service, conversationId, 'quero pedir algo gostoso');
  turn(service, conversationId, 'vai ser pelo iFood');
  turn(service, conversationId, 'não quero nada quente');
  const first = turn(service, conversationId, 'prefiro sushi');
  const more = turn(service, conversationId, 'tem mais opções?');
  const firstIds = new Set(first.conversation_guidance.candidates_found);

  assert.equal(more.conversation_guidance.mode, 'more_recommendation_options');
  assert.equal(more.conversation_state.channel, 'ifood');
  assert.equal(more.conversation_state.requested_category, 'sushi');
  assert.ok(more.hospitality_context.preparation_preferences.includes('not_hot'));
  assert.equal(more.conversation_guidance.candidates_found.some((id) => firstIds.has(id)), false);
});

test('shortlist não nasce apenas de canal e ordem técnica', (t) => {
  const service = serviceFixture(t);
  const conversationId = 'REC-NO-TECHNICAL-TOP-K';
  turn(service, conversationId, 'não sei o que pedir');
  const channelOnly = turn(service, conversationId, 'iFood');

  assert.equal(channelOnly.menu_context.status, 'partial');
  assert.deepEqual(channelOnly.menu_context.items, []);
  assert.equal(channelOnly.conversation_guidance.mode, 'food_preference_discovery');
  assert.deepEqual(channelOnly.conversation_guidance.candidates_found, []);
});

test('preço operacional não reutiliza shortlist anterior como alvo', (t) => {
  const service = serviceFixture(t);
  const conversationId = 'REC-OPERATIONAL-PRICE-BOUNDARY';
  turn(service, conversationId, 'quero uma sugestão pelo iFood');
  turn(service, conversationId, 'não quero nada quente');
  turn(service, conversationId, 'prefiro sushi');
  const operational = turn(service, conversationId, 'qual o preço do rodízio?');

  assert.notEqual(operational.conversation_guidance?.mode, 'concise_price');
  assert.equal(operational.conversation_state.channel, 'ifood');
  assert.equal(operational.conversation_state.requested_category, 'sushi');
});
