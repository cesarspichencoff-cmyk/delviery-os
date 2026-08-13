'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  MenuCatalog,
  hospitalityRequest,
  initialHospitalityContext,
  recommend,
  updateHospitalityContext
} = require('../../src/conversation-crm/menu-intelligence');
const { CustomerMenuHomologationService } = require('../../tools/conversation-crm/customer-menu/service');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function serviceFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-human-reality-recommendation-'));
  const service = new CustomerMenuHomologationService({
    projectRoot: PROJECT_ROOT,
    menuReviewRoot: path.join(root, 'review')
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return service;
}

function addMenuItem(catalog, input) {
  return catalog.addItem({
    commercial_identity: input.item_id,
    item_id: input.item_id,
    name: input.name,
    category: input.category,
    channel: 'ifood',
    unit_id: 'UNIT-TEST',
    review_status: 'confirmed',
    availability: { state: 'available', source_id: 'SOURCE-TEST' },
    source_records: ['SOURCE-TEST']
  });
}

test('fome é intenção de escolha e inicia descoberta antes de pedir o canal', (t) => {
  const service = serviceFixture(t);
  const context = service.contextForChat({
    conversation_id: 'HUNGER-DISCOVERY',
    message: 'Oi, estou com fome. O que você sugere?'
  });

  assert.equal(context.conversation_state.turn_analysis.food_choice_signal, true);
  assert.equal(context.conversation_state.active_goal, 'recommendation');
  assert.equal(context.conversation_state.pending_question, 'food_preference');
  assert.equal(context.conversation_guidance.mode, 'food_preference_discovery');
  assert.doesNotMatch(context.conversation_guidance.question, /sal[aã]o|iFood|delivery pr[oó]prio/iu);
});

test('canal sem preferência não fabrica um top 3 arbitrário', (t) => {
  const service = serviceFixture(t);
  service.contextForChat({ conversation_id: 'NO-ARBITRARY-TOP-K', message: 'Estou com fome, me ajuda a escolher?' });
  const context = service.contextForChat({ conversation_id: 'NO-ARBITRARY-TOP-K', message: 'iFood' });

  assert.equal(context.conversation_guidance.mode, 'food_preference_discovery');
  assert.deepEqual(context.menu_context.items, []);
  assert.ok(context.menu_context.unknowns.includes('recommendation_preference_missing'));
  assert.deepEqual(context.conversation_guidance.candidates_found, []);
});

test('insistência por ajuda avança a descoberta sem repetir a mesma pergunta', (t) => {
  const service = serviceFixture(t);
  const first = service.contextForChat({ conversation_id: 'DISCOVERY-PROGRESS', message: 'Estou com fome' });
  const second = service.contextForChat({ conversation_id: 'DISCOVERY-PROGRESS', message: 'Quero uma sugestão para comer' });
  const third = service.contextForChat({ conversation_id: 'DISCOVERY-PROGRESS', message: 'iFood' });

  assert.equal(first.conversation_guidance.mode, 'food_preference_discovery');
  assert.equal(second.conversation_guidance.mode, 'food_preference_discovery');
  assert.equal(third.conversation_guidance.mode, 'food_preference_discovery');
  assert.equal(new Set([
    first.conversation_guidance.question,
    second.conversation_guidance.question,
    third.conversation_guidance.question
  ]).size, 3);
});

test('pedido direto de menu preserva o canal já informado e publica um único link oficial', (t) => {
  const service = serviceFixture(t);
  service.contextForChat({ conversation_id: 'DIRECT-CHANNEL-MENU', message: 'Quero escolher algo pelo iFood' });
  const context = service.contextForChat({ conversation_id: 'DIRECT-CHANNEL-MENU', message: 'Pode compartilhar o menu?' });
  const answer = context.conversation_guidance.direct_answers.join(' ');

  assert.equal(context.conversation_guidance.mode, 'direct_menu_link');
  assert.match(answer, /card[aá]pio do iFood/iu);
  assert.equal((answer.match(/https:\/\//gu) || []).length, 1);
  assert.match(answer, /ifood\.com\.br/iu);
});

test('nada quente não vira cru e exclui somente a seção explicitamente quente', () => {
  const hospitality = updateHospitalityContext(initialHospitalityContext(), {
    normalized_text: 'nao quero nada quente'
  });
  const request = hospitalityRequest(hospitality);
  assert.equal(request.temperature_preference, 'not_hot');
  assert.equal(request.raw_or_cooked, null);

  const catalog = new MenuCatalog();
  catalog.registerSource({ source_id: 'SOURCE-TEST', title: 'Fonte de teste', review_status: 'confirmed' });
  addMenuItem(catalog, { item_id: 'HOT-ITEM', name: 'Item Quente', category: 'Pratos Quentes' });
  addMenuItem(catalog, { item_id: 'SUSHI-UNKNOWN-TEMP', name: 'Sushi sem temperatura declarada', category: 'Sushis' });
  const result = recommend(catalog, {
    channel: 'ifood', unit_id: 'UNIT-TEST', temperature_preference: 'not_hot'
  });

  assert.deepEqual(result.candidates.map((item) => item.item_id), ['SUSHI-UNKNOWN-TEMP']);
  assert.ok(result.candidates[0].warnings.includes('temperature_status_unknown'));
  assert.ok(result.unknowns.includes('temperature_status_unknown'));
});

test('refino frio progride e reparo para sushi reconsulta a categoria sem herdar cooked', (t) => {
  const service = serviceFixture(t);
  service.contextForChat({ conversation_id: 'COLD-THEN-SUSHI', message: 'Quero uma sugestão pelo iFood' });
  const cold = service.contextForChat({ conversation_id: 'COLD-THEN-SUSHI', message: 'Não quero nada quente' });

  assert.equal(cold.conversation_guidance.mode, 'temperature_preference_update');
  assert.ok(cold.conversation_guidance.candidates_found.length > 0);
  assert.ok(cold.hospitality_context.preparation_preferences.includes('not_hot'));
  assert.equal(cold.hospitality_context.preparation_preferences.includes('cooked'), false);
  assert.match(cold.conversation_guidance.direct_answers.join(' '), /temperatura.*n[aã]o confirma|n[aã]o confirma a temperatura/iu);

  const repaired = service.contextForChat({ conversation_id: 'COLD-THEN-SUSHI', message: 'Eu gosto de sushi, entendeu?' });
  assert.equal(repaired.conversation_state.semantic_transition, 'CORRECT');
  assert.equal(repaired.conversation_state.requested_category, 'sushi');
  assert.equal(repaired.conversation_guidance.mode, 'category_correction');
  assert.ok(repaired.menu_context.items.length > 0);
  assert.equal(repaired.menu_context.items.every((item) => /^sushis?(?:\s|$)/iu.test(item.category)), true);
  assert.equal(repaired.hospitality_context.preparation_preferences.includes('cooked'), false);
  assert.match(repaired.conversation_guidance.direct_answers.join(' '), /n[aã]o confirma a temperatura/iu);
});
