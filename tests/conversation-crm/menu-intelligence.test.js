'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  MenuCatalog,
  createSyntheticCatalog,
  inventoryOperationalSeed,
  allergenDecision,
  recommend,
  approvedPairings
} = require('../../src/conversation-crm/menu-intelligence');

test('salão e iFood permanecem variantes distintas', () => {
  const catalog = createSyntheticCatalog();
  const comparison = catalog.compare('SIM-SALMON-LIGHT');
  assert.equal(comparison.variants.length, 2);
  assert.deepEqual(new Set(comparison.variants.map((item) => item.channel)), new Set(['dining_room', 'ifood']));
  assert.notEqual(comparison.variants[0].price, comparison.variants[1].price);
});

test('busca por canal não vaza preço de outro canal', () => {
  const catalog = createSyntheticCatalog();
  const ifood = catalog.search({ channel: 'ifood', unit_id: 'SIM-UNIT-ITAIM' });
  assert.equal(ifood.length, 1);
  assert.equal(ifood[0].price, 78);
  assert.equal(ifood.some((item) => item.price === 72), false);
});

test('item indisponível não entra em recomendação', () => {
  const result = recommend(createSyntheticCatalog(), {
    channel: 'dining_room', unit_id: 'SIM-UNIT-ITAIM', cream_cheese: 'without'
  });
  assert.equal(result.candidates.some((item) => item.item_id === 'SIM-MENU-UNAVAILABLE'), false);
});

test('alergênico declarado bloqueia item incompatível', () => {
  const catalog = createSyntheticCatalog();
  const item = catalog.get('SIM-MENU-ALLERGEN');
  assert.equal(allergenDecision(item, ['crustacean']).allowed, false);
  const result = recommend(catalog, {
    channel: 'dining_room', unit_id: 'SIM-UNIT-ITAIM', allergies: ['crustacean']
  });
  assert.equal(result.candidates.some((candidate) => candidate.item_id === item.item_id), false);
});

test('alergênico ausente não vira garantia', () => {
  const item = createSyntheticCatalog().get('SIM-MENU-SALMON-LIGHT-DINING');
  const decision = allergenDecision(item, ['gluten']);
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes('ALLERGEN_UNCONFIRMED:gluten'));
});

test('não consta na receita não é tratado como seguro', () => {
  const catalog = new MenuCatalog();
  catalog.registerSource({ source_id: 'SIM-SOURCE', title: 'Synthetic', review_status: 'confirmed' });
  const item = catalog.addItem({
    item_id: 'SIM-ITEM-NOT-LISTED',
    commercial_identity: 'SIM-NOT-LISTED',
    name: 'Item Sintético',
    channel: 'dining_room',
    unit_id: 'SIM-UNIT',
    review_status: 'confirmed',
    availability: { state: 'available', source_id: 'SIM-SOURCE' },
    source_records: ['SIM-SOURCE'],
    allergens: [{ allergen: 'gluten', assertion: 'not_listed_in_recipe', source_id: 'SIM-SOURCE' }]
  });
  assert.equal(allergenDecision(item, ['gluten']).allowed, false);
});

test('customização ausente permanece desconhecida', () => {
  const item = createSyntheticCatalog().get('SIM-MENU-SALMON-LIGHT-DINING');
  assert.deepEqual(item.customizations, []);
});

test('harmonização somente aparece quando aprovada', () => {
  const catalog = createSyntheticCatalog();
  const pairings = approvedPairings(catalog, 'SIM-MENU-SALMON-LIGHT-DINING', {
    channel: 'dining_room', unit_id: 'SIM-UNIT-ITAIM'
  });
  assert.equal(pairings.length, 1);
  assert.equal(pairings[0].beverage_item_id, 'SIM-BEVERAGE-DRY');
});

test('harmonização não aprovada é bloqueada', () => {
  const catalog = createSyntheticCatalog();
  catalog.registerPairing({
    pairing_id: 'SIM-PAIR-UNCONFIRMED',
    menu_item_id: 'SIM-MENU-SALMON-LIGHT-DINING',
    beverage_item_id: 'SIM-BEVERAGE-DRY',
    rationale: 'Hipótese sintética ainda não aprovada.',
    channel: 'dining_room',
    unit_id: 'SIM-UNIT-ITAIM',
    source_id: 'SIM-SOURCE-MENU-V1',
    approval_status: 'unconfirmed'
  });
  const pairings = approvedPairings(catalog, 'SIM-MENU-SALMON-LIGHT-DINING', {
    channel: 'dining_room', unit_id: 'SIM-UNIT-ITAIM'
  });
  assert.equal(pairings.some((item) => item.pairing_id === 'SIM-PAIR-UNCONFIRMED'), false);
});

test('restrições obrigatórias são aplicadas antes do ranking', () => {
  const result = recommend(createSyntheticCatalog(), {
    channel: 'dining_room',
    unit_id: 'SIM-UNIT-ITAIM',
    raw_or_cooked: 'cooked',
    preferred_ingredients: ['salmon']
  });
  assert.equal(result.candidates.some((item) => item.item_id === 'SIM-MENU-SALMON-LIGHT-DINING'), false);
});

test('preferência confirmada pesa mais que inferida', () => {
  const catalog = createSyntheticCatalog();
  const confirmed = recommend(catalog, {
    channel: 'dining_room', unit_id: 'SIM-UNIT-ITAIM'
  }, { confirmed_facts: [{ field: 'preferred_item', value: 'SIM-SALMON-LIGHT' }], inferred_facts: [] });
  const inferred = recommend(catalog, {
    channel: 'dining_room', unit_id: 'SIM-UNIT-ITAIM'
  }, { confirmed_facts: [], inferred_facts: [{ field: 'preferred_item', value: 'SIM-SALMON-LIGHT' }] });
  assert.ok(confirmed.candidates.find((item) => item.item_id === 'SIM-MENU-SALMON-LIGHT-DINING').score
    > inferred.candidates.find((item) => item.item_id === 'SIM-MENU-SALMON-LIGHT-DINING').score);
});

test('resultado apresenta no máximo três opções e explica razões', () => {
  const result = recommend(createSyntheticCatalog(), {
    channel: 'dining_room', unit_id: 'SIM-UNIT-ITAIM', flavor_profile: 'light'
  });
  assert.ok(result.candidates.length <= 3);
  assert.equal(result.explanation.length, result.candidates.length);
});

test('item de outra unidade não é recomendado', () => {
  const result = recommend(createSyntheticCatalog(), {
    channel: 'dining_room', unit_id: 'SIM-UNIT-OTHER'
  });
  assert.equal(result.candidates.length, 0);
});

test('preço acima da faixa é bloqueado', () => {
  const result = recommend(createSyntheticCatalog(), {
    channel: 'dining_room', unit_id: 'SIM-UNIT-ITAIM', price_range: { maximum: 60 }
  });
  assert.equal(result.candidates.some((item) => item.price > 60), false);
});

test('seed operacional é inventariada sem virar catálogo comercial', () => {
  const file = path.resolve(__dirname, '..', '..', 'data', 'cardapio_knowledge_seed.json');
  const inventory = inventoryOperationalSeed(file);
  assert.equal(inventory.source_records.length, 199);
  assert.equal(inventory.importable_as_commercial_catalog, false);
  assert.ok(inventory.reasons.includes('CHANNEL_UNKNOWN'));
});
